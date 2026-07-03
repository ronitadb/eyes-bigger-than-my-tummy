// Vercel Serverless Function — POST /api/zoom-join
// Registers someone for the next Zoom meeting by adding them to a dedicated
// Brevo list, reusing the same account as /api/subscribe.
//
// Required environment variable:
//   BREVO_API_KEY        – same key as subscribe.js
// Optional:
//   BREVO_ZOOM_LIST_ID   – numeric id of the "zoom meetings" list (fastest, most reliable)
//   BREVO_ZOOM_LIST_NAME – list name to look up if no id is given
//                          (defaults to "מפגשי זום")

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    res.status(500).json({ ok: false, error: 'not_configured' });
    return;
  }

  let body = req.body;
  if (body == null || typeof body === 'string') {
    try {
      const raw = typeof body === 'string' ? body : await readRawBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch (_) {
      body = {};
    }
  }

  const email = String(body.email || '').trim();
  const firstName = String(body.firstName || body.name || '').trim();

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    res.status(400).json({ ok: false, error: 'invalid_email' });
    return;
  }

  try {
    const listId = await resolveListId(apiKey);

    const attributes = {};
    if (firstName) attributes.FIRSTNAME = firstName;

    const payload = { email, updateEnabled: true };
    if (Object.keys(attributes).length) payload.attributes = attributes;
    if (listId) payload.listIds = [listId];

    const r = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (r.status === 201 || r.status === 204) {
      res.status(200).json({ ok: true });
      return;
    }

    const data = await r.json().catch(() => ({}));
    if (data && (data.code === 'duplicate_parameter' || data.code === 'contact_already_exist')) {
      res.status(200).json({ ok: true });
      return;
    }

    console.error('Brevo error', r.status, data);
    res.status(502).json({ ok: false, error: 'provider_error' });
  } catch (err) {
    console.error('zoom-join error', err);
    res.status(502).json({ ok: false, error: 'network_error' });
  }
};

async function resolveListId(apiKey) {
  if (process.env.BREVO_ZOOM_LIST_ID) {
    const n = Number(process.env.BREVO_ZOOM_LIST_ID);
    if (!Number.isNaN(n)) return n;
  }
  const wanted = String(process.env.BREVO_ZOOM_LIST_NAME || 'מפגשי זום')
    .trim()
    .toLowerCase();
  try {
    const r = await fetch('https://api.brevo.com/v3/contacts/lists?limit=50&offset=0&sort=desc', {
      headers: { 'api-key': apiKey, accept: 'application/json' },
    });
    if (!r.ok) return undefined;
    const data = await r.json().catch(() => ({}));
    const lists = (data && data.lists) || [];
    const found = lists.find(
      (l) => String(l.name || '').trim().toLowerCase() === wanted
    );
    return found ? found.id : undefined;
  } catch (_) {
    return undefined;
  }
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
