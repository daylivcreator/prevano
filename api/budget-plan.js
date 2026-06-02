'use strict';
const { rateLimit, tooManyRequests } = require('./_lib/rate-limit');
const { requireSession }             = require('./_lib/auth');
const { sql }                        = require('./_lib/db');

const PAID_PLANS = new Set(['starter', 'pro', 'premium']);
const API_MODEL  = 'claude-haiku-4-5-20251001';

function sanitizeAmounts(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).replace(/[^a-z_]/gi, '').slice(0, 40);
    const val = Number(v);
    if (key && Number.isFinite(val) && val >= 0 && val <= 50_000) out[key] = val;
  }
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const rl = rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'budget-plan:' });
  if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

  const session = requireSession(req, res);
  if (!session) return;

  try {
    const userResult = await sql`SELECT plan FROM users WHERE id = ${session.userId}`;
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
    if (!PAID_PLANS.has(user.plan)) {
      return res.status(403).json({ error: 'Accès réservé aux abonnés Starter, Coach Pro et Daily Finance.' });
    }

    const body = req.body ?? {};
    const revenus   = sanitizeAmounts(body.revenus);
    const depenses  = sanitizeAmounts(body.depenses);
    const epargne   = Number(body.epargne);
    const objectif  = Number(body.objectif);

    if (
      Object.keys(revenus).length === 0 ||
      !Number.isFinite(epargne) || epargne < 0 || epargne > 50_000 ||
      !Number.isFinite(objectif) || objectif < 0 || objectif > 50_000
    ) {
      return res.status(400).json({ error: 'Données invalides.' });
    }

    const revTotal = Object.values(revenus).reduce((a, v) => a + v, 0);
    const depTotal = Object.values(depenses).reduce((a, v) => a + v, 0);
    const gap      = Math.max(0, objectif - epargne);
    const score    = objectif > 0
      ? Math.min(100, Math.round((epargne / objectif) * 100))
      : (epargne > 0 ? 100 : 0);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Service temporairement indisponible.' });

    const revLines = Object.entries(revenus).map(([k, v]) => `  ${k}: ${v}€`).join('\n');
    const depLines = Object.entries(depenses).map(([k, v]) => `  ${k}: ${v}€`).join('\n');

    const prompt = `Tu es expert finance personnelle France.
Budget mensuel :
REVENUS (total ${revTotal}€) :
${revLines || '  (non renseigné)'}
DÉPENSES (total ${depTotal}€) :
${depLines || '  (non renseigné)'}
Épargne actuelle : ${epargne}€/mois | Objectif : ${objectif}€/mois | Écart : ${gap > 0 ? gap + '€/mois à combler' : 'objectif atteint'}

Génère EXACTEMENT 5 actions concrètes et chiffrées pour optimiser ce budget. Chaque action doit inclure un montant précis en €/mois ou en %.
JSON uniquement, aucun texte hors JSON :
{"steps":[{"title":"Titre court (max 55 car.)","desc":"1-2 phrases avec montant précis"},{"title":"...","desc":"..."},{"title":"...","desc":"..."},{"title":"...","desc":"..."},{"title":"...","desc":"..."}]}`;

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      API_MODEL,
        max_tokens: 900,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('[budget-plan] Anthropic error:', upstream.status, errText.slice(0, 200));
      return res.status(502).json({ error: 'Erreur lors de la génération du plan.' });
    }

    const data   = await upstream.json();
    const text   = data.content?.find(c => c.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    if (!Array.isArray(parsed?.steps)) throw new Error('Format inattendu');

    const steps = parsed.steps.slice(0, 5).map(s => ({
      title: String(s.title ?? '').slice(0, 120),
      desc:  String(s.desc  ?? '').slice(0, 500),
    }));

    // Persister l'entrée du mois
    const month    = new Date().toISOString().slice(0, 7);
    const dataJson = JSON.stringify({ revenus, depenses, epargne, objectif });
    await sql`
      INSERT INTO budget_entries (user_id, month, data)
      VALUES (${session.userId}, ${month}, ${dataJson})
      ON CONFLICT (user_id, month) DO UPDATE SET data = EXCLUDED.data
    `;

    return res.status(200).json({ steps, score, savings_gap: gap });
  } catch (err) {
    console.error('[budget-plan]', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
};
