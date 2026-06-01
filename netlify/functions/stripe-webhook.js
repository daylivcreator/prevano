const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig           = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('[webhook] STRIPE_WEBHOOK_SECRET non configuré — webhook ignoré');
    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  }

  let stripeEvent;
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('[webhook] Signature invalide :', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session  = stripeEvent.data.object;
    const email    = session.customer_email;
    const planName = session.metadata?.planName || 'Prevano';

    if (email) {
      await Promise.all([
        sendWelcomeEmail(email, planName),
        addToBrevoContact(email),
      ]);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

/* ── Email de bienvenue via Brevo ── */
async function sendWelcomeEmail(email, planName) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('[webhook] BREVO_API_KEY manquant — email non envoyé');
    return;
  }

  const senderEmail = process.env.SENDER_EMAIL || 'daylivcontact@gmail.com';

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender:  { name: 'Prevano', email: senderEmail },
        to:      [{ email }],
        subject: `Bienvenue sur Prevano ${planName} 🎉`,
        htmlContent: `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
            <h2 style="color:#E24B4A;margin-bottom:8px">Ton accès Prevano ${planName} est activé !</h2>
            <p style="color:#555;line-height:1.7">Merci pour ton abonnement. Ton plan retraite personnalisé est en cours de préparation — on revient vers toi très prochainement avec ton accès complet.</p>
            <p style="color:#555;line-height:1.7">En attendant, tu peux continuer à simuler et affiner ta projection sur <a href="${process.env.URL || 'https://daylivcreator.github.io/prevano'}" style="color:#E24B4A">Prevano</a>.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
            <p style="color:#999;font-size:13px">Des questions ? Réponds directement à cet email — on te répond rapidement.</p>
            <p style="color:#999;font-size:13px">— L'équipe Prevano</p>
          </div>
        `,
      }),
    });
    if (!res.ok) console.error('[webhook] Brevo SMTP error:', await res.text());
  } catch (err) {
    console.error('[webhook] sendWelcomeEmail :', err.message);
  }
}

/* ── Ajout du contact dans Brevo ── */
async function addToBrevoContact(email) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return;

  try {
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({ email, updateEnabled: true }),
    });
  } catch (err) {
    console.error('[webhook] addToBrevoContact :', err.message);
  }
}
