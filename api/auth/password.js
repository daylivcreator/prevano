'use strict';
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const { sql } = require('../_lib/db');
const { rateLimit, tooManyRequests } = require('../_lib/rate-limit');

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL = 60 * 60 * 1000; // 1 heure

// POST { email }            → envoi du lien de réinitialisation
// POST { token, password }  → application du nouveau mot de passe
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const body = req.body ?? {};

  // ── Forgot password ─────────────────────────────────────────────────────────
  if (body.email !== undefined) {
    const rl = rateLimit(req, { limit: 3, windowMs: 300_000, prefix: 'forgot:' });
    if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

    const { email } = body;
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Adresse email invalide.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const okResponse = () => res.status(200).json({ ok: true, message: "Si ce compte existe, un email a été envoyé." });

    try {
      const result = await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`;
      if (result.rows.length === 0) return okResponse();

      const rawToken  = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + TOKEN_TTL);

      await sql`UPDATE users SET reset_token_hash = ${tokenHash}, reset_token_expires = ${expiresAt} WHERE id = ${result.rows[0].id}`;

      const siteUrl  = process.env.SITE_URL ?? 'https://prevano.fr';
      const resetUrl = `${siteUrl}/reset-password.html?token=${rawToken}`;

      await fetch('https://api.brevo.com/v3/smtp/email', {
        method:  'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender:      { name: process.env.EMAIL_SENDER_NAME ?? 'Prevano', email: process.env.EMAIL_SENDER_EMAIL ?? 'prevano.app@outlook.fr' },
          to:          [{ email: normalizedEmail }],
          subject:     'Réinitialisation de ton mot de passe Prevano',
          htmlContent: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
            <h2 style="color:#E24B4A">Réinitialiser ton mot de passe</h2>
            <p>Tu as demandé la réinitialisation de ton mot de passe Prevano.</p>
            <a href="${resetUrl}" style="display:inline-block;background:#E24B4A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">Réinitialiser mon mot de passe</a>
            <p style="color:#666;font-size:13px">Ce lien est valable 1 heure. Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
            <p style="color:#999;font-size:12px">Prevano · Simulateur de retraite</p>
          </div>`,
        }),
      });

      return okResponse();
    } catch (err) {
      console.error('[password/forgot]', err.message);
      return okResponse();
    }
  }

  // ── Reset password ───────────────────────────────────────────────────────────
  if (body.token !== undefined || body.password !== undefined) {
    const rl = rateLimit(req, { limit: 5, windowMs: 300_000, prefix: 'reset:' });
    if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

    const { token, password } = body;

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
      console.error('[password/reset]', err.message);
      return res.status(500).json({ error: 'Erreur serveur. Réessaie dans un moment.' });
    }
  }

  return res.status(400).json({ error: 'Paramètres manquants.' });
};
