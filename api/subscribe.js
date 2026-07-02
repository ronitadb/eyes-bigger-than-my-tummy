// Vercel Serverless Function — POST /api/subscribe
// Adds/updates a subscriber in Brevo without exposing the API key to the browser.
//
// Required environment variable (set in Vercel → Project → Settings → Environment Variables):
//   BREVO_API_KEY   – your Brevo (v3) API key
// Optional:
//   BREVO_LIST_ID   – numeric id of the target list (fastest, most reliable)
//   BREVO_LIST_NAME – list name to look up if no id is given
//                     (defaults to "Bigger Eyes Than My Tummy")

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

  // Parse the JSON body (Vercel usually pre-parses it; fall back to raw read).
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

    // 201 = created, 204 = updated (updateEnabled). Both are success.
    if (r.status === 201 || r.status === 204) {
      res.status(200).json({ ok: true });
      return;
    }

    const data = await r.json().catch(() => ({}));
    // Contact already exists — with updateEnabled:true this is still a success.
    if (data && (data.code === 'duplicate_parameter' || data.code === 'contact_already_exist')) {
      res.status(200).json({ ok: true });
      return;
    }

    console.error('Brevo error', r.status, data);
    res.status(502).json({ ok: false, error: 'provider_error' });
  } catch (err) {
    console.error('subscribe error', err);
    res.status(502).json({ ok: false, error: 'network_error' });
  }
};

async function resolveListId(apiKey) {
  if (process.env.BREVO_LIST_ID) {
    const n = Number(process.env.BREVO_LIST_ID);
    if (!Number.isNaN(n)) return n;
  }
  const wanted = String(process.env.BREVO_LIST_NAME || 'Bigger Eyes Than My Tummy')
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
