'use strict';
const bcrypt        = require('bcryptjs');
const { sql }       = require('../_lib/db');
const { setSessionCookie } = require('../_lib/auth');
const { rateLimit, tooManyRequests } = require('../_lib/rate-limit');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const rl = rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'signup:' });
  if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

  const { email, password, firstName } = req.body ?? {};

  // Validation des inputs
  if (!email || !password || !firstName) {
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  }
  if (typeof firstName !== 'string' || firstName.trim().length < 2 || firstName.trim().length > 50) {
    return res.status(400).json({ error: 'Prénom invalide.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedName  = firstName.trim();

  try {
    // Vérifier si l'email existe déjà (message générique pour éviter l'énumération d'emails)
    const existing = await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`;
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cette adresse email.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await sql`
      INSERT INTO users (email, password_hash, first_name)
      VALUES (${normalizedEmail}, ${passwordHash}, ${normalizedName})
      RETURNING id, email, first_name, plan
    `;

    const user = result.rows[0];
    setSessionCookie(res, { userId: user.id, email: user.email });

    return res.status(201).json({
      user: { id: user.id, email: user.email, firstName: user.first_name, plan: user.plan },
    });
  } catch (err) {
    console.error('[signup]', err.message);
    return res.status(500).json({ error: 'Erreur serveur. Réessaie dans un moment.' });
  }
};
