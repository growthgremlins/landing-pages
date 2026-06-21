const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const CONDITION_LABELS = {
  'stains':          'Stains',
  'pet-hair':        'Pet Hair',
  'odors':           'Odors',
  'water-spots':     'Water Spots / Contamination',
  'last-wash':       'Last Wash/Wax',
  'swirl-severity':  'Swirl/Scratch Severity',
  'vehicle-color':   'Vehicle Color',
  'parking':         'Parking Situation',
  'paint-first':     'Needs Paint Correction First'
};

function buildNotesString(data) {
  const lines = [];

  if (data.vehicleType) lines.push(`Vehicle Type: ${data.vehicleType}`);
  if (data.selectedServices && data.selectedServices.length) {
    lines.push(`Services: ${data.selectedServices.join(', ')}`);
  }

  const vehicleParts = [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean);
  if (vehicleParts.length) lines.push(`Vehicle: ${vehicleParts.join(' ')}`);

  if (data.conditionAnswers && Object.keys(data.conditionAnswers).length) {
    lines.push('--- Condition Details ---');
    for (const [key, value] of Object.entries(data.conditionAnswers)) {
      const label = CONDITION_LABELS[key] || key;
      lines.push(`${label}: ${value}`);
    }
  }

  if (data.additionalInfo) lines.push(`Additional Info: ${data.additionalInfo}`);

  return lines.join('\n');
}

exports.handler = async function(event) {
  // Preflight
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

  // Parse body
  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Invalid JSON' })
    };
  }

  const { firstName, lastName, phone, email,
          vehicleType, selectedServices, conditionAnswers,
          vehicleYear, vehicleMake, vehicleModel, additionalInfo } = data;

  // Required field validation
  if (!firstName || !lastName || !phone) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'firstName, lastName, and phone are required' })
    };
  }

  const locationId = process.env.GHL_LOCATION_ID;
  const pitToken   = process.env.GHL_PIT_TOKEN;

  if (!locationId || !pitToken) {
    console.error('Missing GHL env vars: GHL_LOCATION_ID or GHL_PIT_TOKEN');
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Server configuration error' })
    };
  }

  const notesString = buildNotesString(data);
  const tags = ['google-ads', 'landing-v2', ...(Array.isArray(selectedServices) ? selectedServices : [])];

  const ghlPayload = {
    locationId,
    firstName,
    lastName,
    phone,
    ...(email ? { email } : {}),
    source: 'Google Ads — Variant B',
    tags,
    customFields: [
      // TODO: Replace each 'TODO_FIELD_ID_*' with the actual GHL custom field ID
      // Find field IDs in GHL → Settings → Custom Fields
      { id: 'TODO_FIELD_ID_VEHICLE_TYPE',  value: vehicleType || '' },
      { id: 'TODO_FIELD_ID_SERVICES',      value: (selectedServices || []).join(', ') },
      { id: 'TODO_FIELD_ID_VEHICLE_YEAR',  value: vehicleYear || '' },
      { id: 'TODO_FIELD_ID_VEHICLE_MAKE',  value: vehicleMake || '' },
      { id: 'TODO_FIELD_ID_VEHICLE_MODEL', value: vehicleModel || '' },
      { id: 'TODO_FIELD_ID_LEAD_NOTES',    value: notesString }
    ]
  };

  try {
    const res = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pitToken}`,
        'Version':        '2021-07-28',
        'Content-Type':   'application/json',
        'Accept':         'application/json'
      },
      body: JSON.stringify(ghlPayload)
    });

    let responseData;
    try { responseData = await res.json(); } catch (e) { responseData = {}; }

    if (!res.ok) {
      console.error('GHL upsert failed:', res.status, JSON.stringify(responseData));
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: 'CRM update failed' })
      };
    }

    const contactId = (responseData.contact && responseData.contact.id) || responseData.id || null;
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, contactId })
    };

  } catch (err) {
    console.error('Network error calling GHL:', err.message);
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Network error' })
    };
  }
};
