'use strict';
const { rateLimit, tooManyRequests } = require('./_lib/rate-limit');
const { requireSession }             = require('./_lib/auth');
const { sql }                        = require('./_lib/db');
const { calcStreak }                 = require('./_lib/daily-helpers');

const BADGES = [
  { id: 'debutant', label: 'Débutant', minTotal: 1,   minStreak: 0   },
  { id: 'regulier', label: 'Régulier', minTotal: 0,   minStreak: 7   },
  { id: 'assidu',   label: 'Assidu',   minTotal: 0,   minStreak: 30  },
  { id: 'expert',   label: 'Expert',   minTotal: 50,  minStreak: 0   },
  { id: 'maitre',   label: 'Maître',   minTotal: 100, minStreak: 0   },
  { id: 'legende',  label: 'Légende',  minTotal: 0,   minStreak: 365 },
];

function detectNewBadge(total, streak, prevTotal, prevStreak) {
  for (const b of BADGES) {
    const now  = (b.minTotal > 0 && total >= b.minTotal) || (b.minStreak > 0 && streak >= b.minStreak);
    const prev = (b.minTotal > 0 && prevTotal >= b.minTotal) || (b.minStreak > 0 && prevStreak >= b.minStreak);
    if (now && !prev) return b.label;
  }
  return null;
}

// Requêtes pour streak (LIMIT 366 suffit : max streak = 365j) + total réel via COUNT
function fetchProgress(userId) {
  return Promise.all([
    sql`
      SELECT lesson_date FROM daily_progress
      WHERE user_id = ${userId} AND completed = true
      ORDER BY lesson_date DESC LIMIT 366
    `,
    sql`
      SELECT COUNT(*)::int AS total FROM daily_progress
      WHERE user_id = ${userId} AND completed = true
    `,
  ]);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const rl = rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'daily:' });
  if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

  const session = requireSession(req, res);
  if (!session) return;

  try {
    const userResult = await sql`SELECT plan FROM users WHERE id = ${session.userId}`;
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
    if (user.plan !== 'premium') {
      return res.status(403).json({ error: 'Accès réservé aux abonnés Daily Finance.' });
    }

    const { lesson_index, quiz_correct } = req.body ?? {};
    if (!Number.isInteger(lesson_index) || lesson_index < 0 || lesson_index > 27) {
      return res.status(400).json({ error: 'Index de leçon invalide.' });
    }
    if (typeof quiz_correct !== 'boolean') {
      return res.status(400).json({ error: 'quiz_correct doit être un booléen.' });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Snapshot avant completion (pour détecter les nouveaux badges)
    const [prevStreakRows, prevCountRow] = await fetchProgress(session.userId);
    const prevTotal  = prevCountRow.rows[0]?.total ?? 0;
    const prevStreak = calcStreak(prevStreakRows.rows, today);

    // Upsert leçon du jour
    await sql`
      INSERT INTO daily_progress (user_id, lesson_date, lesson_index, completed, quiz_correct)
      VALUES (${session.userId}, ${today}, ${lesson_index}, true, ${quiz_correct})
      ON CONFLICT (user_id, lesson_date) DO UPDATE
        SET completed    = true,
            quiz_correct = EXCLUDED.quiz_correct,
            lesson_index = EXCLUDED.lesson_index
    `;

    // Recalcul après insertion
    const [streakRows, countRow] = await fetchProgress(session.userId);
    const total_completed = countRow.rows[0]?.total ?? 0;
    const streak          = calcStreak(streakRows.rows, today);
    const new_badge       = detectNewBadge(total_completed, streak, prevTotal, prevStreak);

    return res.status(200).json({ streak, total_completed, new_badge });
  } catch (err) {
    console.error('[daily-complete]', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
};
