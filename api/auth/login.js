'use strict';
const bcrypt        = require('bcryptjs');
const { sql }       = require('../_lib/db');
const { setSessionCookie } = require('../_lib/auth');
const { rateLimit, tooManyRequests } = require('../_lib/rate-limit');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  // Limite stricte : 10 tentatives / minute par IP
  const rl = rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'login:' });
  if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

  const { email, password } = req.body ?? {};

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const result = await sql`
      SELECT id, email, first_name, password_hash, plan
      FROM users WHERE email = ${normalizedEmail}
    `;

    // Toujours comparer (timing-safe) même si l'utilisateur n'existe pas
    const user         = result.rows[0];
    const hashToCheck  = user?.password_hash ?? '$2a$12$invaliddummyhashtopreventtimingattack';
    const valid        = await bcrypt.compare(password, hashToCheck);

    if (!user || !valid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    // Mise à jour last_login (fire-and-forget, non bloquant)
    sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`.catch(() => {});

    setSessionCookie(res, { userId: user.id, email: user.email });

    return res.status(200).json({
      user: { id: user.id, email: user.email, firstName: user.first_name, plan: user.plan },
    });
  } catch (err) {
    console.error('[login]', err.message);
    return res.status(500).json({ error: 'Erreur serveur. Réessaie dans un moment.' });
  }
};
