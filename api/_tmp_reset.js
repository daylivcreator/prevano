'use strict';
// Endpoint temporaire — supprimé après usage
const crypto  = require('crypto');
const { sql } = require('./_lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-admin-secret'] !== process.env.JWT_SECRET?.slice(0, 16)) {
    return res.status(403).json({ error: 'Accès refusé.' });
  }

  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'Email requis.' });

  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await sql`UPDATE users SET reset_token_hash = ${tokenHash}, reset_token_expires = ${expiresAt} WHERE email = ${email.toLowerCase()}`;

  const siteUrl = process.env.SITE_URL ?? 'https://prevano.vercel.app';
  return res.status(200).json({ url: `${siteUrl}/reset-password.html?token=${rawToken}` });
};
