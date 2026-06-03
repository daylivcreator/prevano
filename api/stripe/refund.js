'use strict';
const Stripe = require('stripe');
const { sql } = require('../_lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || req.headers['x-admin-secret'] !== adminSecret) {
    return res.status(401).json({ error: 'Non autorisé.' });
  }

  const { email, userId, amount } = req.body ?? {};
  if (!email && !userId) return res.status(400).json({ error: 'email ou userId requis.' });

  try {
    const result = email
      ? await sql`SELECT id, email, stripe_customer_id FROM users WHERE email = ${email}`
      : await sql`SELECT id, email, stripe_customer_id FROM users WHERE id = ${userId}`;

    const user = result.rows[0];
    if (!user)                    return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (!user.stripe_customer_id) return res.status(404).json({ error: 'Aucun abonnement Stripe trouvé.' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    const invoices = await stripe.invoices.list({
      customer: user.stripe_customer_id,
      status:   'paid',
      limit:    1,
    });

    const invoice = invoices.data[0];
    if (!invoice?.charge) return res.status(404).json({ error: 'Aucun paiement trouvé pour cet utilisateur.' });

    const refundParams = { charge: invoice.charge };
    if (amount) refundParams.amount = Math.round(Number(amount) * 100);

    const refund = await stripe.refunds.create(refundParams);
    console.log(`[refund] ${user.email} — ${refund.id} — ${refund.amount / 100} €`);

    return res.status(200).json({
      success:  true,
      refundId: refund.id,
      amount:   refund.amount / 100,
      email:    user.email,
      message:  `Remboursement de ${refund.amount / 100} € émis pour ${user.email}.`,
    });
  } catch (err) {
    console.error('[refund]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
