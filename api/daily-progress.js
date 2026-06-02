'use strict';
const { requireSession } = require('./_lib/auth');
const { sql }            = require('./_lib/db');
const { calcStreak }     = require('./_lib/daily-helpers');

function todayLessonIndex() {
  return Math.floor(Date.now() / 86_400_000) % 28;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const session = requireSession(req, res);
  if (!session) return;

  try {
    const userResult = await sql`SELECT plan FROM users WHERE id = ${session.userId}`;
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
    if (user.plan !== 'premium') {
      return res.status(403).json({ error: 'Accès réservé aux abonnés Daily Finance.' });
    }

    const today = new Date().toISOString().slice(0, 10);

    const [streakRows, countRow, themeRows, todayRow] = await Promise.all([
      // LIMIT 366 : suffisant pour un streak maximal de 365 jours consécutifs
      sql`
        SELECT lesson_date FROM daily_progress
        WHERE user_id = ${session.userId} AND completed = true
        ORDER BY lesson_date DESC LIMIT 366
      `,
      // COUNT(*) pour le vrai total, sans troncature
      sql`
        SELECT COUNT(*)::int AS total FROM daily_progress
        WHERE user_id = ${session.userId} AND completed = true
      `,
      sql`
        SELECT
          COALESCE(SUM(CASE WHEN lesson_index BETWEEN 0  AND 6  THEN 1 ELSE 0 END), 0)::int AS investissement,
          COALESCE(SUM(CASE WHEN lesson_index BETWEEN 7  AND 13 THEN 1 ELSE 0 END), 0)::int AS epargne,
          COALESCE(SUM(CASE WHEN lesson_index BETWEEN 14 AND 20 THEN 1 ELSE 0 END), 0)::int AS fiscalite,
          COALESCE(SUM(CASE WHEN lesson_index BETWEEN 21 AND 27 THEN 1 ELSE 0 END), 0)::int AS patrimoine
        FROM daily_progress
        WHERE user_id = ${session.userId} AND completed = true
      `,
      sql`
        SELECT completed, quiz_correct FROM daily_progress
        WHERE user_id = ${session.userId} AND lesson_date = ${today}
        LIMIT 1
      `,
    ]);

    const total_completed = countRow.rows[0]?.total ?? 0;
    const streak          = calcStreak(streakRows.rows, today);
    const lesson_index    = todayLessonIndex();
    const today_done      = todayRow.rows[0]?.completed === true;

    const themes = themeRows.rows[0] ?? { investissement:0, epargne:0, fiscalite:0, patrimoine:0 };
    // best_theme : null si aucune leçon complétée, évite de retourner un faux gagnant à 0
    const best_theme = total_completed > 0
      ? Object.entries(themes).reduce(
          (best, [k, v]) => v > best[1] ? [k, v] : best,
          ['', -1]
        )[0] || null
      : null;

    return res.status(200).json({
      lesson_index,
      today_done,
      streak,
      total_completed,
      themes,
      best_theme,
    });
  } catch (err) {
    console.error('[daily-progress]', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
};
