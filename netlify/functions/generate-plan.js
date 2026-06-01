const Anthropic = require('@anthropic-ai/sdk');

const API_MODEL = 'claude-3-5-sonnet-20241022';

const STATUS_LABELS = {
  prive:         'salarié du privé',
  fonctionnaire: 'fonctionnaire',
  independant:   'indépendant/freelance',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[generate-plan] ANTHROPIC_API_KEY manquant');
    return {
      statusCode: 503,
      body: JSON.stringify({ error: 'API non configurée' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body invalide' }) };
  }

  const { age, sal, pension, gap, ep, annees, statut } = body;

  const prompt = `Tu es expert retraite France. Un(e) ${STATUS_LABELS[statut] || statut} de ${age} ans, ${sal}€ nets/mois, épargne ${ep}€/mois, touchera ~${pension}€/mois à la retraite (manque: ${gap}€/mois, ${annees} ans devant lui/elle). Génère EXACTEMENT 3 actions concrètes et chiffrées. JSON uniquement:\n{"steps":[{"title":"Titre court","desc":"1-2 phrases concrètes chiffrées."},{"title":"...","desc":"..."},{"title":"...","desc":"..."}]}`;

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model:      API_MODEL,
      max_tokens: 600,
      messages:   [{ role: 'user', content: prompt }],
    });

    const text   = message.content?.find(c => c.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    if (!Array.isArray(parsed?.steps)) throw new Error('Format inattendu');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: parsed.steps }),
    };
  } catch (err) {
    console.error('[generate-plan]', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
