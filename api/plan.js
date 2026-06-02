'use strict';
const { rateLimit, tooManyRequests } = require('./_lib/rate-limit');
const { getSession }                  = require('./_lib/auth');
const { sql }                         = require('./_lib/db');

const ALLOWED_STATUTS = ['prive', 'fonctionnaire', 'independant'];
const API_MODEL       = 'claude-sonnet-4-6';

const STATUS_LABELS = {
  prive:         'salarié du privé',
  fonctionnaire: 'fonctionnaire',
  independant:   'indépendant/freelance',
};

// Prompt adapté à chaque niveau de plan
function buildPrompt(plan, ctx) {
  const { statut, age, sal, pension, gap, ep, annees } = ctx;
  const who = `${STATUS_LABELS[statut]} de ${age} ans, ${sal}€ nets/mois, épargne actuelle ${ep}€/mois, pension estimée ${pension}€/mois (manque ${gap}€/mois, ${annees} ans pour préparer)`;

  if (plan === 'starter') {
    return `Tu es expert retraite France. Profil : ${who}.
Génère EXACTEMENT 3 actions concrètes et chiffrées pour améliorer sa retraite. Chaque action doit mentionner un montant précis (€/mois ou % d'économie).
JSON uniquement, aucun texte hors JSON :
{"steps":[{"title":"Titre court","desc":"1-2 phrases avec montants précis."},{"title":"...","desc":"..."},{"title":"...","desc":"..."}]}`;
  }

  if (plan === 'pro') {
    return `Tu es expert retraite et patrimoine France. Profil : ${who}.
Génère un plan structuré en JSON UNIQUEMENT, aucun texte hors JSON :
{
  "steps": [
    5 objets {"title":"...","desc":"phrase concrète chiffrée en €"} — actions prioritaires classées par impact
  ],
  "scenarios": [
    {"label":"Scénario prudent","pension_estimee":NOMBRE,"epargne_mensuelle_cible":NOMBRE,"commentaire":"1 phrase"},
    {"label":"Scénario équilibré","pension_estimee":NOMBRE,"epargne_mensuelle_cible":NOMBRE,"commentaire":"1 phrase"},
    {"label":"Scénario ambitieux","pension_estimee":NOMBRE,"epargne_mensuelle_cible":NOMBRE,"commentaire":"1 phrase"}
  ],
  "enveloppes": [
    {"nom":"PER","montant_mensuel_recommande":NOMBRE,"avantage":"1 phrase"},
    {"nom":"PEA","montant_mensuel_recommande":NOMBRE,"avantage":"1 phrase"},
    {"nom":"Assurance-vie","montant_mensuel_recommande":NOMBRE,"avantage":"1 phrase"}
  ]
}`;
  }

  // premium
  return `Tu es expert retraite, patrimoine et optimisation fiscale France. Profil : ${who}.
Génère un rapport complet en JSON UNIQUEMENT, aucun texte hors JSON :
{
  "steps": [
    7 objets {"title":"...","desc":"phrase ultra-précise chiffrée en €"} — stratégie complète classée par priorité
  ],
  "scenarios": [
    {"label":"Scénario prudent","pension_estimee":NOMBRE,"epargne_mensuelle_cible":NOMBRE,"patrimoine_10ans":NOMBRE,"patrimoine_20ans":NOMBRE,"commentaire":"1 phrase"},
    {"label":"Scénario équilibré","pension_estimee":NOMBRE,"epargne_mensuelle_cible":NOMBRE,"patrimoine_10ans":NOMBRE,"patrimoine_20ans":NOMBRE,"commentaire":"1 phrase"},
    {"label":"Scénario ambitieux","pension_estimee":NOMBRE,"epargne_mensuelle_cible":NOMBRE,"patrimoine_10ans":NOMBRE,"patrimoine_20ans":NOMBRE,"commentaire":"1 phrase"}
  ],
  "enveloppes": [
    {"nom":"PER","montant_mensuel_recommande":NOMBRE,"economie_impot_annuelle":NOMBRE,"avantage":"1 phrase"},
    {"nom":"PEA","montant_mensuel_recommande":NOMBRE,"economie_impot_annuelle":NOMBRE,"avantage":"1 phrase"},
    {"nom":"Assurance-vie","montant_mensuel_recommande":NOMBRE,"economie_impot_annuelle":NOMBRE,"avantage":"1 phrase"}
  ],
  "succession": {"conseil":"1 phrase sur transmission du patrimoine","dispositif_recommande":"nom du dispositif"},
  "resume_fiscal": "1-2 phrases sur l'économie fiscale totale possible"
}`;
}

function maxTokens(plan) {
  if (plan === 'pro')     return 1200;
  if (plan === 'premium') return 2000;
  return 600;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const rl = rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'plan:' });
  if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

  const { age, sal, pension, gap, ep, annees, statut } = req.body ?? {};

  if (
    !Number.isInteger(age)    || age < 18    || age > 64      ||
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
  if (!apiKey) return res.status(503).json({ error: 'Service temporairement indisponible.' });

  // Détecter le plan de l'utilisateur (free si non connecté)
  let userPlan = 'free';
  const session = getSession(req);
  if (session) {
    try {
      const r = await sql`SELECT plan FROM users WHERE id = ${session.userId}`;
      userPlan = r.rows[0]?.plan ?? 'free';
    } catch { /* DB indisponible → on traite comme free */ }
  }

  // Les non-payants reçoivent un teaser (1 conseil générique)
  if (userPlan === 'free') {
    return res.status(200).json({
      plan:   'free',
      teaser: true,
      steps:  [{
        title: 'Augmente ton épargne mensuelle',
        desc:  `En épargnant ${Math.round(gap * 0.1)}€ de plus par mois dès maintenant, tu pourrais réduire ton manque à la retraite de ~10%. Souscris à une offre Prevano pour découvrir les 2 autres actions prioritaires adaptées à ta situation.`,
      }],
    });
  }

  const prompt = buildPrompt(userPlan, { statut, age, sal, pension, gap, ep, annees });

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
        max_tokens: maxTokens(userPlan),
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

    if (!Array.isArray(parsed?.steps)) throw new Error('Format inattendu');

    // Sanitiser steps
    parsed.steps = parsed.steps.slice(0, 7).map(s => ({
      title: String(s.title ?? '').slice(0, 120),
      desc:  String(s.desc  ?? '').slice(0, 600),
    }));

    return res.status(200).json({ plan: userPlan, ...parsed });
  } catch (err) {
    console.error('[plan]', err.message);
    return res.status(502).json({ error: 'Impossible de générer le plan pour le moment.' });
  }
};
