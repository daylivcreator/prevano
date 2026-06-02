'use strict';
const { rateLimit, tooManyRequests } = require('./_lib/rate-limit');

const ALLOWED_STATUTS = ['prive', 'fonctionnaire', 'independant'];
const API_MODEL = 'claude-sonnet-4-20250514';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const rl = rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'plan:' });
  if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

  const { age, sal, pension, gap, ep, annees, statut } = req.body ?? {};

  // Validation stricte de tous les inputs
  if (
    !Number.isInteger(age)    || age < 18    || age > 64     ||
    !Number.isFinite(sal)     || sal < 500   || sal > 100_000 ||
    !Number.isFinite(pension) || pension < 0                   ||
    !Number.isFinite(gap)     || gap < 0                       ||
    !Number.isFinite(ep)      || ep < 0      || ep > 20_000   ||
    !Number.isInteger(annees) || annees < 1  || annees > 50   ||
    !ALLOWED_STATUTS.includes(statut)
  ) {
    return res.status(400).json({ error: 'Paramètres invalides.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Service temporairement indisponible.' });
  }

  const STATUS_LABELS = {
    prive:         'salarié du privé',
    fonctionnaire: 'fonctionnaire',
    independant:   'indépendant/freelance',
  };

  const prompt = `Tu es expert retraite France. Un(e) ${STATUS_LABELS[statut]} de ${age} ans, ${sal}€ nets/mois, épargne ${ep}€/mois, touchera ~${pension}€/mois à la retraite (manque: ${gap}€/mois, ${annees} ans devant lui/elle). Génère EXACTEMENT 3 actions concrètes et chiffrées. JSON uniquement:\n{"steps":[{"title":"Titre court","desc":"1-2 phrases concrètes chiffrées."},{"title":"...","desc":"..."},{"title":"...","desc":"..."}]}`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      API_MODEL,
        max_tokens: 600,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('[plan] Anthropic error:', upstream.status, errText.slice(0, 200));
      return res.status(502).json({ error: 'Erreur lors de la génération du plan.' });
    }

    const data   = await upstream.json();
    const text   = data.content?.find(c => c.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    if (!Array.isArray(parsed?.steps) || parsed.steps.length !== 3) {
      throw new Error('Format de réponse inattendu');
    }

    // Sanitise les champs avant de les renvoyer
    const steps = parsed.steps.map(s => ({
      title: String(s.title ?? '').slice(0, 120),
      desc:  String(s.desc  ?? '').slice(0, 500),
    }));

    return res.status(200).json({ steps });
  } catch (err) {
    console.error('[plan]', err.message);
    return res.status(502).json({ error: 'Impossible de générer le plan pour le moment.' });
  }
};
