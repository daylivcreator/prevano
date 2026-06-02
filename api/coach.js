'use strict';
const { rateLimit, tooManyRequests } = require('./_lib/rate-limit');
const { requireSession }             = require('./_lib/auth');
const { sql }                        = require('./_lib/db');

const PRO_PLANS  = new Set(['pro', 'premium']);
const API_MODEL  = 'claude-haiku-4-5-20251001';
const MAX_HIST   = 20;

const STATUS_LABELS = {
  prive:         'salarié du privé',
  fonctionnaire: 'fonctionnaire',
  independant:   'indépendant/freelance',
};

// Rate limit par userId (en mémoire — par instance Lambda chaude)
const userStore = new Map();
function rateLimitUser(userId, limit, windowMs) {
  const key = String(userId);
  const now = Date.now();
  const e   = userStore.get(key);
  if (!e || now > e.resetAt) { userStore.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (e.count >= limit)      return false;
  e.count++;
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  // Limite IP pour éviter les scans
  const rl = rateLimit(req, { limit: 30, windowMs: 3_600_000, prefix: 'coach-ip:' });
  if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

  const session = requireSession(req, res);
  if (!session) return;

  try {
    const userResult = await sql`
      SELECT u.first_name, u.plan, s.data AS sim_data
      FROM users u
      LEFT JOIN user_simulations s ON s.user_id = u.id
      WHERE u.id = ${session.userId}
    `;
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
    if (!PRO_PLANS.has(user.plan)) {
      return res.status(403).json({ error: 'Accès réservé aux abonnés Coach Pro et Daily Finance.' });
    }

    // Limite par userId : 20 messages/heure
    if (!rateLimitUser(session.userId, 20, 3_600_000)) {
      return res.status(429).json({ error: 'Limite de 20 messages par heure atteinte. Reviens plus tard !' });
    }

    const { message, history } = req.body ?? {};
    if (typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message vide.' });
    }
    if (message.length > 2_000) return res.status(400).json({ error: 'Message trop long (2 000 caractères max).' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Service temporairement indisponible.' });

    // Sanitiser l'historique client
    const safeHistory = Array.isArray(history)
      ? history.slice(-MAX_HIST).map(m => ({
          role:    m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content ?? '').slice(0, 2_000),
        }))
      : [];

    const sim = user.sim_data ?? null;
    const profilLines = sim
      ? [
          `- Statut professionnel : ${STATUS_LABELS[sim.statut] ?? sim.statut}`,
          `- Âge : ${sim.age} ans`,
          `- Salaire net : ${sim.sal}€/mois`,
          `- Pension retraite estimée : ${sim.pension}€/mois`,
          `- Manque mensuel à la retraite : ${sim.gap}€/mois`,
          `- Épargne actuelle : ${sim.ep}€/mois`,
          `- Années avant la retraite : ${sim.annees} ans`,
        ].join('\n')
      : '- Aucune simulation effectuée pour l\'instant.';

    const systemPrompt = `Tu es Prevano Coach, un coach financier spécialisé dans la retraite et les investissements en France. Tu conseilles ${String(user.first_name).slice(0, 60)}.

Profil connu de l'utilisateur :
${profilLines}

Utilise systématiquement ces données pour personnaliser tes conseils (montants, horizons, priorités). Si l'utilisateur n'a pas encore de simulation, invite-le à en faire une sur la page d'accueil.

Ton rôle : aider à optimiser l'épargne, choisir les bonnes enveloppes fiscales (PEA, PER, assurance-vie), comprendre la fiscalité française et préparer la retraite.

Règles impératives :
- Réponses courtes et actionnables (3-5 phrases max sauf si plus de détail est demandé)
- Toujours chiffrer tes conseils en te basant sur le profil connu (€, %, durée)
- Mentionner les règles fiscales françaises actuelles
- Ne jamais garantir un rendement précis
- Suggérer de consulter un CGP pour les décisions patrimoniales majeures
- Répondre uniquement en français`;

    const messages = [
      ...safeHistory,
      { role: 'user', content: message.trim() },
    ];

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      API_MODEL,
        max_tokens: 700,
        system:     systemPrompt,
        messages,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('[coach] Anthropic error:', upstream.status, errText.slice(0, 200));
      return res.status(502).json({ error: 'Erreur lors de la génération de la réponse.' });
    }

    const data  = await upstream.json();
    const reply = data.content?.find(c => c.type === 'text')?.text ?? '';
    if (!reply) throw new Error('Réponse vide de l\'API');

    // Persister en DB
    await sql`INSERT INTO coach_messages (user_id, role, content) VALUES (${session.userId}, 'user',      ${message.trim().slice(0, 4_000)})`;
    await sql`INSERT INTO coach_messages (user_id, role, content) VALUES (${session.userId}, 'assistant', ${reply.slice(0, 4_000)})`;

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('[coach]', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
};
