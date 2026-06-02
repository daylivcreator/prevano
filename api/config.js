'use strict';

// Endpoint public — renvoie uniquement les identifiants Stripe non-secrets (price IDs)
module.exports = function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée.' });

  return res.status(200).json({
    stripe: {
      starter: process.env.STRIPE_STARTER_PRICE_ID ?? null,
      pro:     process.env.STRIPE_PRO_PRICE_ID     ?? null,
      premium: process.env.STRIPE_PREMIUM_PRICE_ID ?? null,
    },
  });
};
