'use strict';

// Rate limiter in-process (par instance Lambda chaude).
// Pour du multi-instance, remplacer par Vercel KV (@vercel/kv).
const store = new Map();

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {object} opts
 * @param {number} opts.limit     - max requêtes par fenêtre
 * @param {number} opts.windowMs  - taille de la fenêtre en ms
 * @param {string} [opts.prefix]  - préfixe de clé (pour différencier les endpoints)
 * @returns {{ ok: boolean, retryAfter?: number }}
 */
function rateLimit(req, { limit = 10, windowMs = 60_000, prefix = '' } = {}) {
  const key = prefix + getIp(req);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (entry.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { ok: true };
}

function tooManyRequests(res, retryAfter = 60) {
  res.setHeader('Retry-After', String(retryAfter));
  res.status(429).json({ error: 'Trop de tentatives. Réessaie dans quelques secondes.' });
}

module.exports = { rateLimit, tooManyRequests };
