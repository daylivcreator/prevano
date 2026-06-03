'use strict';
const Stripe      = require('stripe');
const { sql }     = require('../_lib/db');
const { requireSession } = require('../_lib/auth');
const { rateLimit, tooManyRequests } = require('../_lib/rate-limit');

const VALID_PRICES = new Set([
  process.env.STRIPE_STARTER_PRICE_ID,
  process.env.STRIPE_PRO_PRICE_ID,
  process.env.STRIPE_PREMIUM_PRICE_ID,
]);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const rl = rateLimit(req, { limit: 10, windowMs: 60_000, prefix: 'checkout:' });
  if (!rl.ok) return tooManyRequests(res, rl.retryAfter);

  const session = requireSession(req, res);
  if (!session) return;

  const { priceId } = req.body ?? {};

  // Whitelist explicite des price IDs Stripe autorisés
  if (!priceId || !VALID_PRICES.has(priceId)) {
    return res.status(400).json({ error: 'Offre invalide.' });
  }

  const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  const siteUrl  = process.env.SITE_URL ?? 'https://prevano.fr';

  try {
    const userResult = await sql`
      SELECT email, stripe_customer_id FROM users WHERE id = ${session.userId}
    `;
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'Compte introuvable.' });

    // Réutiliser ou créer le customer Stripe
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    user.email,
        metadata: { userId: session.userId },
      });
      customerId = customer.id;
      await sql`UPDATE users SET stripe_customer_id = ${customerId} WHERE id = ${session.userId}`;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer:             customerId,
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      ui_mode:    'embedded',
      return_url: `${siteUrl}/profil.html?success=1&session_id={CHECKOUT_SESSION_ID}`,
      allow_promotion_codes:      true,
      billing_address_collection: 'required',
      customer_update:            { address: 'auto' },
      metadata:                   { userId: session.userId },
    });

    return res.status(200).json({ clientSecret: checkoutSession.client_secret });
  } catch (err) {
    console.error('[checkout]', err.message);
    return res.status(500).json({ error: 'Impossible de créer la session de paiement.' });
  }
};
