exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { email } = JSON.parse(event.body || '{}');
  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email manquant' }) };
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('[save-email] BREVO_API_KEY manquant');
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }

  try {
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({ email, updateEnabled: true }),
    });
  } catch (err) {
    console.error('[save-email]', err.message);
  }

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
