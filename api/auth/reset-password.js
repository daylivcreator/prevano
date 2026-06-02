'use strict';
const crypto    = require('crypto');
const bcrypt    = require('bcryptjs');
const { sql }   = require('../_lib/db');
const { rateLimit, tooManyRequests } = require('../_lib/rate-limit');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const rl = rateLimit(req, { limit: 5, windowMs: 300_000, prefix: 'reset:' });
  if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

  const { token, password } = req.body ?? {};

  if (!token || typeof token !== 'string' || token.length !== 64) {
    return res.status(400).json({ error: 'Lien de réinitialisation invalide.' });
  }
  if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await sql`
      SELECT id FROM users
      WHERE reset_token_hash = ${tokenHash}
        AND reset_token_expires > NOW()
    `;

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Lien expiré ou invalide. Fais une nouvelle demande.' });
    }

    const userId      = result.rows[0].id;
    const passwordHash = await bcrypt.hash(password, 12);

    await sql`
      UPDATE users
      SET password_hash = ${passwordHash},
          reset_token_hash = NULL,
          reset_token_expires = NULL
      WHERE id = ${userId}
    `;

    return res.status(200).json({ ok: true, message: 'Mot de passe mis à jour avec succès.' });
  } catch (err) {
    console.error('[reset-password]', err.message);
    return res.status(500).json({ error: 'Erreur serveur. Réessaie dans un moment.' });
  }
};
