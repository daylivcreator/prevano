'use strict';
const jwt = require('jsonwebtoken');

const COOKIE = 'pv_session';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 jours en secondes

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET manquant');
  return s;
}

function sign(payload) {
  return jwt.sign(payload, secret(), { expiresIn: '7d', algorithm: 'HS256' });
}

function verify(token) {
  return jwt.verify(token, secret(), { algorithms: ['HS256'] });
}

function parseCookies(req) {
  const raw = req.headers['cookie'] ?? '';
  const result = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try { result[k] = decodeURIComponent(v); } catch { result[k] = v; }
  }
  return result;
}

function getSession(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  try { return verify(token); }
  catch { return null; }
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Non authentifié.' });
    return null;
  }
  return session;
}

function setSessionCookie(res, payload) {
  const token = sign(payload);
  res.setHeader('Set-Cookie', [
    `${COOKIE}=${encodeURIComponent(token)}`,
    `Max-Age=${MAX_AGE}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

module.exports = { getSession, requireSession, setSessionCookie, clearSessionCookie };
