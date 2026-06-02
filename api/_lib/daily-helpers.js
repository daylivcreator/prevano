'use strict';

/**
 * Calcule le streak en jours consécutifs depuis today.
 * @param {Array<{lesson_date: Date|string}>} rows - triés DESC par lesson_date
 * @param {string} today - 'YYYY-MM-DD'
 */
function calcStreak(rows, today) {
  let streak = 0;
  for (let i = 0; i < rows.length; i++) {
    const expected = new Date(today);
    expected.setUTCDate(expected.getUTCDate() - i);
    const exp    = expected.toISOString().slice(0, 10);
    const actual = rows[i].lesson_date instanceof Date
      ? rows[i].lesson_date.toISOString().slice(0, 10)
      : String(rows[i].lesson_date).slice(0, 10);
    if (actual === exp) streak++;
    else break;
  }
  return streak;
}

module.exports = { calcStreak };
