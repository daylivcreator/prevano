'use strict';
const Stripe  = require('stripe');
const { sql } = require('../_lib/db');
const { requireSession } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const session = requireSession(req, res);
  if (!session) return;

  const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  const siteUrl  = process.env.SITE_URL ?? 'https://prevano.vercel.app';

  try {
    const result = await sql`SELECT stripe_customer_id FROM users WHERE id = ${session.userId}`;
    const user   = result.rows[0];

    if (!user?.stripe_customer_id) {
      return res.status(400).json({ error: 'Aucun abonnement actif.' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   user.stripe_customer_id,
      return_url: `${siteUrl}/profil.html`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error('[portal]', err.message);
    return res.status(500).json({ error: 'Impossible d\'accéder au portail de facturation.' });
  }
};
