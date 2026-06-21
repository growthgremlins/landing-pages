const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const WEBHOOK_URL =
  'https://services.leadconnectorhq.com/hooks/wHWgaJAD9Np5aOOdgxV5/webhook-trigger/a650d2f0-7c81-4ee5-878c-8247f6b2630a';

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Invalid JSON' })
    };
  }

  if (!payload.firstName || !payload.lastName || !payload.phone) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'firstName, lastName, and phone are required' })
    };
  }

  // Forward the payload as-is to GHL with proper Content-Type
  // (the frontend already built the correctly shaped GHL payload)
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('GHL webhook failed:', res.status, body);
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: 'Webhook call failed' })
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    console.error('Network error calling GHL webhook:', err.message);
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Network error' })
    };
  }
};
