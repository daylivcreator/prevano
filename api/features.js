'use strict';
/**
 * Router multi-endpoint pour les features payantes.
 * GET  ?t=budget      → budget entry du mois courant
 * POST type=budget    → plan IA budget (5 actions)
 * GET  ?t=simulation  → dernière simulation retraite de l'user
 * POST type=coach     → message au coach IA
 * GET  ?t=daily       → progression daily finance
 * POST type=daily     → compléter la leçon du jour
 */
const { rateLimit, tooManyRequests } = require('./_lib/rate-limit');
const { requireSession }             = require('./_lib/auth');
const { sql }                        = require('./_lib/db');
const { calcStreak }                 = require('./_lib/daily-helpers');

// Migration automatique : idempotente, une seule exécution par cold start
sql`
  CREATE TABLE IF NOT EXISTS user_simulations (
    user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`.catch(e => console.error('[migrate] user_simulations:', e.message));

const PAID_PLANS = new Set(['starter', 'pro', 'premium']);
const PRO_PLANS  = new Set(['pro', 'premium']);
const HAIKU      = 'claude-haiku-4-5-20251001';

// Rate limit par userId en mémoire (coach)
const coachStore = new Map();
function rateLimitUser(userId, limit, windowMs) {
  const key = String(userId);
  const now = Date.now();
  const e   = coachStore.get(key);
  if (!e || now > e.resetAt) { coachStore.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (e.count >= limit)      return false;
  e.count++;
  return true;
}

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

function fetchDailyProgress(userId) {
  return Promise.all([
    sql`SELECT lesson_date FROM daily_progress WHERE user_id = ${userId} AND completed = true ORDER BY lesson_date DESC LIMIT 366`,
    sql`SELECT COUNT(*)::int AS total FROM daily_progress WHERE user_id = ${userId} AND completed = true`,
  ]);
}

const DAILY_BADGES = [
  { id: 'debutant', label: 'Débutant', minTotal: 1,   minStreak: 0   },
  { id: 'regulier', label: 'Régulier', minTotal: 0,   minStreak: 7   },
  { id: 'assidu',   label: 'Assidu',   minTotal: 0,   minStreak: 30  },
  { id: 'expert',   label: 'Expert',   minTotal: 50,  minStreak: 0   },
  { id: 'maitre',   label: 'Maître',   minTotal: 100, minStreak: 0   },
  { id: 'legende',  label: 'Légende',  minTotal: 0,   minStreak: 365 },
];
function detectNewBadge(total, streak, prevTotal, prevStreak) {
  for (const b of DAILY_BADGES) {
    const now  = (b.minTotal > 0 && total >= b.minTotal) || (b.minStreak > 0 && streak >= b.minStreak);
    const prev = (b.minTotal > 0 && prevTotal >= b.minTotal) || (b.minStreak > 0 && prevStreak >= b.minStreak);
    if (now && !prev) return b.label;
  }
  return null;
}
function todayLessonIndex() {
  return Math.floor(Date.now() / 86_400_000) % 28;
}

const STATUS_LABELS = {
  prive:         'salarié du privé',
  fonctionnaire: 'fonctionnaire',
  independant:   'indépendant/freelance',
};

// ─── Handler principal ──────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  const method = req.method;

  // ── GET routes ────────────────────────────────────────────────────────────
  if (method === 'GET') {
    const t = req.query?.t;

    // GET ?t=budget → entrée budget du mois courant
    if (t === 'budget') {
      const session = requireSession(req, res);
      if (!session) return;
      try {
        const userResult = await sql`SELECT plan FROM users WHERE id = ${session.userId}`;
        const user = userResult.rows[0];
        if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
        if (!PAID_PLANS.has(user.plan)) return res.status(403).json({ error: 'Accès réservé aux abonnés.' });
        const month = new Date().toISOString().slice(0, 7);
        const result = await sql`SELECT data FROM budget_entries WHERE user_id = ${session.userId} AND month = ${month} LIMIT 1`;
        return res.status(200).json({ entry: result.rows[0] ? result.rows[0].data : null, month });
      } catch (err) { console.error('[features/budget-entry]', err.message); return res.status(500).json({ error: 'Erreur serveur.' }); }
    }

    // GET ?t=simulation → dernière simulation retraite
    if (t === 'simulation') {
      const session = requireSession(req, res);
      if (!session) return;
      try {
        const result = await sql`SELECT data, updated_at FROM user_simulations WHERE user_id = ${session.userId}`;
        if (result.rows.length === 0) return res.status(200).json({ simulation: null });
        return res.status(200).json({ simulation: result.rows[0].data, updated_at: result.rows[0].updated_at });
      } catch (err) { console.error('[features/simulation]', err.message); return res.status(500).json({ error: 'Erreur serveur.' }); }
    }

    // GET ?t=daily → progression daily finance
    if (t === 'daily') {
      const session = requireSession(req, res);
      if (!session) return;
      try {
        const userResult = await sql`SELECT plan FROM users WHERE id = ${session.userId}`;
        const user = userResult.rows[0];
        if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
        if (user.plan !== 'premium') return res.status(403).json({ error: 'Accès réservé aux abonnés Daily Finance.' });

        const today = new Date().toISOString().slice(0, 10);
        const [streakRows, countRow, themeRows, todayRow] = await Promise.all([
          sql`SELECT lesson_date FROM daily_progress WHERE user_id = ${session.userId} AND completed = true ORDER BY lesson_date DESC LIMIT 366`,
          sql`SELECT COUNT(*)::int AS total FROM daily_progress WHERE user_id = ${session.userId} AND completed = true`,
          sql`SELECT
            COALESCE(SUM(CASE WHEN lesson_index BETWEEN 0  AND 6  THEN 1 ELSE 0 END),0)::int AS investissement,
            COALESCE(SUM(CASE WHEN lesson_index BETWEEN 7  AND 13 THEN 1 ELSE 0 END),0)::int AS epargne,
            COALESCE(SUM(CASE WHEN lesson_index BETWEEN 14 AND 20 THEN 1 ELSE 0 END),0)::int AS fiscalite,
            COALESCE(SUM(CASE WHEN lesson_index BETWEEN 21 AND 27 THEN 1 ELSE 0 END),0)::int AS patrimoine
            FROM daily_progress WHERE user_id = ${session.userId} AND completed = true`,
          sql`SELECT completed, quiz_correct FROM daily_progress WHERE user_id = ${session.userId} AND lesson_date = ${today} LIMIT 1`,
        ]);
        const total_completed = countRow.rows[0]?.total ?? 0;
        const streak          = calcStreak(streakRows.rows, today);
        const lesson_index    = todayLessonIndex();
        const today_done      = todayRow.rows[0]?.completed === true;
        const themes = themeRows.rows[0] ?? { investissement:0, epargne:0, fiscalite:0, patrimoine:0 };
        const best_theme = total_completed > 0
          ? Object.entries(themes).reduce((best,[k,v]) => v > best[1] ? [k,v] : best, ['', -1])[0] || null
          : null;
        return res.status(200).json({ lesson_index, today_done, streak, total_completed, themes, best_theme });
      } catch (err) { console.error('[features/daily-progress]', err.message); return res.status(500).json({ error: 'Erreur serveur.' }); }
    }

    // GET ?t=cron-reminder → rappel mensuel email (appelé par Vercel Cron, protégé)
    if (t === 'cron-reminder') {
      const auth = req.headers['authorization'] ?? '';
      if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Non autorisé.' });
      }
      const resendKey = process.env.RESEND_API_KEY;
      const emailFrom = process.env.EMAIL_FROM ?? 'noreply@prevano.fr';
      if (!resendKey) return res.status(503).json({ error: 'Resend non configuré.' });

      try {
        // Récupérer tous les abonnés actifs
        const users = await sql`
          SELECT email, first_name, plan FROM users
          WHERE plan IN ('starter','pro','premium')
          AND subscription_status = 'active'
          LIMIT 500
        `;
        const month = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        let sent = 0;
        for (const u of users.rows) {
          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: emailFrom,
                to: u.email,
                subject: `Prevano — Bilan de ${month} : mets à jour ton plan`,
                html: `<p>Bonjour ${u.first_name ?? 'là'} 👋</p>
                  <p>C'est le début du mois — le bon moment pour <strong>mettre à jour ton budget et relancer une simulation</strong> avec les données de ${month}.</p>
                  <p><a href="https://prevano.vercel.app/profil.html" style="display:inline-block;background:#E24B4A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Accéder à mon espace →</a></p>
                  <p style="font-size:12px;color:#888">Désabonnement : <a href="https://prevano.vercel.app/contact.html">contacter le support</a></p>`,
              }),
            });
            sent++;
          } catch (e) { console.error('[cron-reminder] email:', u.email, e.message); }
        }
        return res.status(200).json({ ok: true, sent });
      } catch (err) { console.error('[cron-reminder]', err.message); return res.status(500).json({ error: 'Erreur serveur.' }); }
    }

    return res.status(400).json({ error: 'Paramètre ?t manquant. Valeurs : budget, simulation, daily.' });
  }

  // ── POST routes ───────────────────────────────────────────────────────────
  if (method === 'POST') {
    const type = (req.body ?? {}).type;

    // POST type=budget → plan IA d'optimisation budget
    if (type === 'budget') {
      const rl = rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'budget-plan:' });
      if (!rl.ok) return tooManyRequests(res, rl.retryAfter);
      const session = requireSession(req, res);
      if (!session) return;
      try {
        const userResult = await sql`SELECT plan FROM users WHERE id = ${session.userId}`;
        const user = userResult.rows[0];
        if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
        if (!PAID_PLANS.has(user.plan)) return res.status(403).json({ error: 'Accès réservé aux abonnés Starter, Coach Pro et Daily Finance.' });

        const body     = req.body ?? {};
        const revenus  = sanitizeAmounts(body.revenus);
        const depenses = sanitizeAmounts(body.depenses);
        const epargne  = Number(body.epargne);
        const objectif = Number(body.objectif);
        if (Object.keys(revenus).length === 0 || !Number.isFinite(epargne) || epargne < 0 || epargne > 50_000 || !Number.isFinite(objectif) || objectif < 0 || objectif > 50_000) {
          return res.status(400).json({ error: 'Données invalides.' });
        }
        const revTotal = Object.values(revenus).reduce((a,v) => a+v, 0);
        const depTotal = Object.values(depenses).reduce((a,v) => a+v, 0);
        const gap   = Math.max(0, objectif - epargne);
        const score = objectif > 0 ? Math.min(100, Math.round((epargne/objectif)*100)) : (epargne > 0 ? 100 : 0);
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return res.status(503).json({ error: 'Service temporairement indisponible.' });
        const revLines = Object.entries(revenus).map(([k,v]) => `  ${k}: ${v}€`).join('\n');
        const depLines = Object.entries(depenses).map(([k,v]) => `  ${k}: ${v}€`).join('\n');
        const prompt = `Tu es expert finance personnelle France.\nBudget mensuel :\nREVENUS (total ${revTotal}€) :\n${revLines || '  (non renseigné)'}\nDÉPENSES (total ${depTotal}€) :\n${depLines || '  (non renseigné)'}\nÉpargne actuelle : ${epargne}€/mois | Objectif : ${objectif}€/mois | Écart : ${gap > 0 ? gap+'€/mois à combler' : 'objectif atteint'}\n\nGénère EXACTEMENT 5 actions concrètes et chiffrées pour optimiser ce budget. Chaque action doit inclure un montant précis en €/mois ou en %.\nJSON uniquement, aucun texte hors JSON :\n{"steps":[{"title":"Titre court (max 55 car.)","desc":"1-2 phrases avec montant précis"},{"title":"...","desc":"..."},{"title":"...","desc":"..."},{"title":"...","desc":"..."},{"title":"...","desc":"..."}]}`;
        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: HAIKU, max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
        });
        if (!upstream.ok) { console.error('[features/budget-plan] Anthropic:', upstream.status); return res.status(502).json({ error: 'Erreur lors de la génération du plan.' }); }
        const data   = await upstream.json();
        const text   = data.content?.find(c => c.type === 'text')?.text ?? '';
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        if (!Array.isArray(parsed?.steps)) throw new Error('Format inattendu');
        const steps = parsed.steps.slice(0, 5).map(s => ({ title: String(s.title??'').slice(0,120), desc: String(s.desc??'').slice(0,500) }));
        const month    = new Date().toISOString().slice(0, 7);
        const dataJson = JSON.stringify({ revenus, depenses, epargne, objectif });
        await sql`INSERT INTO budget_entries (user_id, month, data) VALUES (${session.userId}, ${month}, ${dataJson}) ON CONFLICT (user_id, month) DO UPDATE SET data = EXCLUDED.data`;
        return res.status(200).json({ steps, score, savings_gap: gap });
      } catch (err) { console.error('[features/budget-plan]', err.message); return res.status(500).json({ error: 'Erreur serveur.' }); }
    }

    // POST type=coach → message coach IA
    if (type === 'coach') {
      const rl = rateLimit(req, { limit: 30, windowMs: 3_600_000, prefix: 'coach-ip:' });
      if (!rl.ok) return tooManyRequests(res, rl.retryAfter);
      const session = requireSession(req, res);
      if (!session) return;
      try {
        const userResult = await sql`SELECT u.first_name, u.plan, s.data AS sim_data FROM users u LEFT JOIN user_simulations s ON s.user_id = u.id WHERE u.id = ${session.userId}`;
        const user = userResult.rows[0];
        if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
        if (!PRO_PLANS.has(user.plan)) return res.status(403).json({ error: 'Accès réservé aux abonnés Coach Pro et Daily Finance.' });
        if (!rateLimitUser(session.userId, 20, 3_600_000)) return res.status(429).json({ error: 'Limite de 20 messages par heure atteinte. Reviens plus tard !' });

        const { message, history } = req.body ?? {};
        if (typeof message !== 'string' || message.trim().length === 0) return res.status(400).json({ error: 'Message vide.' });
        if (message.length > 2_000) return res.status(400).json({ error: 'Message trop long (2 000 caractères max).' });

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return res.status(503).json({ error: 'Service temporairement indisponible.' });

        const safeHistory = Array.isArray(history)
          ? history.slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content??'').slice(0, 2_000) }))
          : [];

        const sim = user.sim_data ?? null;
        const profilLines = sim
          ? [`- Statut professionnel : ${STATUS_LABELS[sim.statut]??sim.statut}`,`- Âge : ${sim.age} ans`,`- Salaire net : ${sim.sal}€/mois`,`- Pension retraite estimée : ${sim.pension}€/mois`,`- Manque mensuel à la retraite : ${sim.gap}€/mois`,`- Épargne actuelle : ${sim.ep}€/mois`,`- Années avant la retraite : ${sim.annees} ans`].join('\n')
          : "- Aucune simulation effectuée pour l'instant.";

        const systemPrompt = `Tu es Prevano Coach, un coach financier spécialisé dans la retraite et les investissements en France. Tu conseilles ${String(user.first_name).slice(0,60)}.\n\nProfil connu de l'utilisateur :\n${profilLines}\n\nUtilise systématiquement ces données pour personnaliser tes conseils. Si l'utilisateur n'a pas encore de simulation, invite-le à en faire une sur la page d'accueil.\n\nTon rôle : aider à optimiser l'épargne, choisir les bonnes enveloppes fiscales (PEA, PER, assurance-vie), comprendre la fiscalité française et préparer la retraite.\n\nRègles impératives :\n- Réponses courtes et actionnables (3-5 phrases max sauf si plus de détail est demandé)\n- Toujours chiffrer tes conseils en te basant sur le profil connu (€, %, durée)\n- Mentionner les règles fiscales françaises actuelles\n- Ne jamais garantir un rendement précis\n- Suggérer de consulter un CGP pour les décisions patrimoniales majeures\n- Répondre uniquement en français`;

        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: HAIKU, max_tokens: 700, system: systemPrompt, messages: [...safeHistory, { role: 'user', content: message.trim() }] }),
        });
        if (!upstream.ok) { console.error('[features/coach] Anthropic:', upstream.status); return res.status(502).json({ error: 'Erreur lors de la génération de la réponse.' }); }
        const data  = await upstream.json();
        const reply = data.content?.find(c => c.type === 'text')?.text ?? '';
        if (!reply) throw new Error('Réponse vide');
        await sql`INSERT INTO coach_messages (user_id, role, content) VALUES (${session.userId}, 'user', ${message.trim().slice(0,4_000)})`;
        await sql`INSERT INTO coach_messages (user_id, role, content) VALUES (${session.userId}, 'assistant', ${reply.slice(0,4_000)})`;
        return res.status(200).json({ reply });
      } catch (err) { console.error('[features/coach]', err.message); return res.status(500).json({ error: 'Erreur serveur.' }); }
    }

    // POST type=daily → compléter la leçon du jour
    if (type === 'daily') {
      const rl = rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'daily:' });
      if (!rl.ok) return tooManyRequests(res, rl.retryAfter);
      const session = requireSession(req, res);
      if (!session) return;
      try {
        const userResult = await sql`SELECT plan FROM users WHERE id = ${session.userId}`;
        const user = userResult.rows[0];
        if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
        if (user.plan !== 'premium') return res.status(403).json({ error: 'Accès réservé aux abonnés Daily Finance.' });

        const { lesson_index, quiz_correct } = req.body ?? {};
        if (!Number.isInteger(lesson_index) || lesson_index < 0 || lesson_index > 27) return res.status(400).json({ error: 'Index de leçon invalide.' });
        if (typeof quiz_correct !== 'boolean') return res.status(400).json({ error: 'quiz_correct doit être un booléen.' });

        const today = new Date().toISOString().slice(0, 10);
        const [prevStreakRows, prevCountRow] = await fetchDailyProgress(session.userId);
        const prevTotal  = prevCountRow.rows[0]?.total ?? 0;
        const prevStreak = calcStreak(prevStreakRows.rows, today);

        await sql`INSERT INTO daily_progress (user_id, lesson_date, lesson_index, completed, quiz_correct) VALUES (${session.userId}, ${today}, ${lesson_index}, true, ${quiz_correct}) ON CONFLICT (user_id, lesson_date) DO UPDATE SET completed = true, quiz_correct = EXCLUDED.quiz_correct, lesson_index = EXCLUDED.lesson_index`;

        const [streakRows, countRow] = await fetchDailyProgress(session.userId);
        const total_completed = countRow.rows[0]?.total ?? 0;
        const streak          = calcStreak(streakRows.rows, today);
        const new_badge       = detectNewBadge(total_completed, streak, prevTotal, prevStreak);
        return res.status(200).json({ streak, total_completed, new_badge });
      } catch (err) { console.error('[features/daily-complete]', err.message); return res.status(500).json({ error: 'Erreur serveur.' }); }
    }

    // POST type=simulation → sauvegarder la simulation retraite
    if (type === 'simulation') {
      const session = requireSession(req, res);
      if (!session) return;
      const { age, sal, pension, gap, ep, annees, statut, score } = req.body ?? {};
      if (!age || !sal || !statut) return res.status(400).json({ error: 'Données manquantes.' });
      const data = JSON.stringify({ age, sal, pension, gap, ep, annees, statut, score });
      try {
        await sql`
          INSERT INTO user_simulations (user_id, data, updated_at)
          VALUES (${session.userId}, ${data}, NOW())
          ON CONFLICT (user_id) DO UPDATE SET data = ${data}, updated_at = NOW()
        `;
        return res.status(200).json({ ok: true });
      } catch (err) { console.error('[features/simulation-save]', err.message); return res.status(500).json({ error: 'Erreur serveur.' }); }
    }

    return res.status(400).json({ error: 'Paramètre type manquant. Valeurs : budget, coach, daily, simulation.' });
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
};
