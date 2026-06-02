'use strict';
const crypto      = require('crypto');
const { sql }     = require('../_lib/db');
const { rateLimit, tooManyRequests } = require('../_lib/rate-limit');
const { Resend }  = require('resend');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 heure

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const rl = rateLimit(req, { limit: 3, windowMs: 300_000, prefix: 'forgot:' });
  if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Réponse générique toujours identique pour éviter l'énumération d'emails
  const okResponse = () =>
    res.status(200).json({ ok: true, message: "Si ce compte existe, un email a été envoyé." });

  try {
    const result = await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`;
    if (result.rows.length === 0) return okResponse();

    const userId = result.rows[0].id;

    // Token aléatoire sécurisé — on stocke le hash en base
    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await sql`
      UPDATE users
      SET reset_token_hash = ${tokenHash}, reset_token_expires = ${expiresAt}
      WHERE id = ${userId}
    `;

    const siteUrl  = process.env.SITE_URL ?? 'https://prevano.vercel.app';
    const resetUrl = `${siteUrl}/reset-password.html?token=${rawToken}`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from:    process.env.EMAIL_FROM ?? 'noreply@prevano.fr',
      to:      normalizedEmail,
      subject: 'Réinitialisation de ton mot de passe Prevano',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
          <h2 style="color:#E24B4A">Réinitialiser ton mot de passe</h2>
          <p>Tu as demandé la réinitialisation de ton mot de passe Prevano.</p>
          <p>Clique sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
          <a href="${resetUrl}"
             style="display:inline-block;background:#E24B4A;color:#fff;padding:12px 24px;
                    border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0">
            Réinitialiser mon mot de passe
          </a>
          <p style="color:#666;font-size:13px">Ce lien est valable 1 heure. Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="color:#999;font-size:12px">Prevano · Simulateur de retraite</p>
        </div>
      `,
    });

    return okResponse();
  } catch (err) {
    console.error('[forgot-password]', err.message);
    return okResponse(); // Ne pas révéler les erreurs internes
  }
};
