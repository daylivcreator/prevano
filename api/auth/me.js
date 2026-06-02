'use strict';
const { sql }          = require('../_lib/db');
const { getSession }   = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Non authentifié.' });

  try {
    const result = await sql`
      SELECT id, email, first_name, plan,
             subscription_status, subscription_current_period_end,
             created_at
      FROM users WHERE id = ${session.userId}
    `;

    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Compte introuvable.' });

    return res.status(200).json({
      user: {
        id:                 user.id,
        email:              user.email,
        firstName:          user.first_name,
        plan:               user.plan,
        subscriptionStatus: user.subscription_status,
        periodEnd:          user.subscription_current_period_end,
        createdAt:          user.created_at,
      },
    });
  } catch (err) {
    console.error('[me]', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
};
