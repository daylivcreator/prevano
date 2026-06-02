'use strict';
const { requireSession } = require('./_lib/auth');
const { sql }            = require('./_lib/db');

const PAID_PLANS = new Set(['starter', 'pro', 'premium']);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const session = requireSession(req, res);
  if (!session) return;

  try {
    const userResult = await sql`SELECT plan FROM users WHERE id = ${session.userId}`;
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'Compte introuvable.' });
    if (!PAID_PLANS.has(user.plan)) {
      return res.status(403).json({ error: 'Accès réservé aux abonnés.' });
    }

    const month = new Date().toISOString().slice(0, 7);
    const result = await sql`
      SELECT data FROM budget_entries
      WHERE user_id = ${session.userId} AND month = ${month}
      LIMIT 1
    `;

    const entry = result.rows[0];
    return res.status(200).json({ entry: entry ? entry.data : null, month });
  } catch (err) {
    console.error('[budget-entry]', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
};
