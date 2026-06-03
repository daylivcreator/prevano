'use strict';
const Stripe  = require('stripe');
const { sql } = require('../_lib/db');

const CREDIT_ALLOWANCES = { starter: 100, pro: 300, premium: 600 };
async function grantMonthlyCredits(userId, plan) {
  const allowance = CREDIT_ALLOWANCES[plan] ?? 0;
  if (!allowance) return;
  await sql`
    UPDATE users SET
      credits_balance  = ${allowance},
      credits_reset_at = (NOW() + INTERVAL '1 month')
    WHERE id = ${userId}
  `;
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Map price_id → nom du plan
function planFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return 'starter';
  if (priceId === process.env.STRIPE_PRO_PRICE_ID)     return 'pro';
  if (priceId === process.env.STRIPE_PREMIUM_PRICE_ID) return 'premium';
  return 'free';
}

// Vercel : désactiver le body parser pour lire le raw body (nécessaire pour la signature Stripe)
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  const sig       = req.headers['stripe-signature'];
  const rawBody   = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Signature invalide:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;

        const sub    = await stripe.subscriptions.retrieve(session.subscription);
        const plan   = planFromPriceId(sub.items.data[0]?.price?.id);
        const periodEnd = new Date(sub.current_period_end * 1000);

        const updatedUser = await sql`
          UPDATE users SET
            stripe_subscription_id          = ${sub.id},
            plan                            = ${plan},
            subscription_status             = ${sub.status},
            subscription_current_period_end = ${periodEnd}
          WHERE stripe_customer_id = ${session.customer}
          RETURNING id
        `;
        if (updatedUser.rows[0]) await grantMonthlyCredits(updatedUser.rows[0].id, plan);
        break;
      }

      case 'customer.subscription.updated': {
        const sub       = event.data.object;
        const newPlan   = planFromPriceId(sub.items.data[0]?.price?.id);
        const periodEnd = new Date(sub.current_period_end * 1000);
        // Si annulation planifiée, on garde le plan jusqu'à la fin de période
        const planToSet = sub.cancel_at_period_end ? undefined : newPlan;

        if (planToSet) {
          await sql`
            UPDATE users SET
              plan                            = ${planToSet},
              subscription_status             = ${sub.status},
              subscription_current_period_end = ${periodEnd}
            WHERE stripe_subscription_id = ${sub.id}
          `;
        } else {
          await sql`
            UPDATE users SET
              subscription_status             = ${sub.status},
              subscription_current_period_end = ${periodEnd}
            WHERE stripe_subscription_id = ${sub.id}
          `;
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await sql`
          UPDATE users SET
            plan                            = 'free',
            subscription_status             = 'canceled',
            subscription_current_period_end = NULL,
            stripe_subscription_id          = NULL
          WHERE stripe_subscription_id = ${sub.id}
        `;
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.billing_reason !== 'subscription_cycle') break; // seulement les renouvellements
        const subRenew = await stripe.subscriptions.retrieve(invoice.subscription);
        const planRenew = planFromPriceId(subRenew.items.data[0]?.price?.id);
        const renewUser = await sql`SELECT id FROM users WHERE stripe_customer_id = ${invoice.customer}`;
        if (renewUser.rows[0] && planRenew !== 'free') {
          await grantMonthlyCredits(renewUser.rows[0].id, planRenew);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await sql`
          UPDATE users SET subscription_status = 'past_due'
          WHERE stripe_customer_id = ${invoice.customer}
        `;
        break;
      }

      default:
        // Ignorer les events non gérés
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] Erreur handler:', err.message);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
