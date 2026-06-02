'use strict';
const { requireSession } = require('./_lib/auth');
const { sql }            = require('./_lib/db');

// Migration automatique : idempotente, s'exécute au cold start Lambda
sql`
  CREATE TABLE IF NOT EXISTS user_simulations (
    user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`.catch(e => console.error('[migrate] user_simulations:', e.message));

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const session = requireSession(req, res);
  if (!session) return;

  try {
    const result = await sql`
      SELECT data, updated_at FROM user_simulations WHERE user_id = ${session.userId}
    `;
    if (result.rows.length === 0) return res.status(200).json({ simulation: null });
    return res.status(200).json({
      simulation: result.rows[0].data,
      updated_at: result.rows[0].updated_at,
    });
  } catch (err) {
    console.error('[simulation]', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
};
