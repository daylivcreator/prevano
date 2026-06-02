'use strict';
const { rateLimit, tooManyRequests } = require('./_lib/rate-limit');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const rl = rateLimit(req, { limit: 5, windowMs: 60_000, prefix: 'subscribe:' });
  if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Email invalide.' });
  }

  const listId = parseInt(process.env.BREVO_LIST_ID ?? '4', 10);

  try {
    const resp = await fetch('https://api.brevo.com/v3/contacts', {
      method:  'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.toLowerCase().trim(), listIds: [listId], updateEnabled: true }),
    });

    // 201 = créé, 204 = mis à jour — les deux sont un succès
    if (resp.status === 201 || resp.status === 204) {
      return res.status(200).json({ ok: true });
    }

    const data = await resp.json();
    // Contact déjà dans la liste = succès silencieux
    if (data.code === 'duplicate_parameter') return res.status(200).json({ ok: true });

    console.error('[subscribe] Brevo error:', data);
    return res.status(200).json({ ok: true }); // Toujours OK côté client
  } catch (err) {
    console.error('[subscribe]', err.message);
    return res.status(200).json({ ok: true });
  }
};
