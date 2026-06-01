const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLAN_NAMES = {
  'price_1TdS3FJdUivM9ZOsgiNgjOnH': 'Starter',
  'price_1TdS2kJdUivM9ZOsrMzP99oy': 'Pro',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { priceId, email } = JSON.parse(event.body || '{}');

    if (!priceId || !PLAN_NAMES[priceId]) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Offre invalide.' }),
      };
    }

    const siteUrl = process.env.URL || 'https://daylivcreator.github.io/prevano';

    const session = await stripe.checkout.sessions.create({
      mode:           'subscription',
      customer_email: email || undefined,
      line_items:     [{ price: priceId, quantity: 1 }],
      success_url:    `${siteUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:     `${siteUrl}/`,
      locale:         'fr',
      allow_promotion_codes: true,
      metadata: {
        planName: PLAN_NAMES[priceId],
      },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('[create-checkout]', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Erreur lors de la création du paiement.' }),
    };
  }
};
