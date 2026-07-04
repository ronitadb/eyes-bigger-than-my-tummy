const crypto = require('crypto');

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }

  return res.json();
}

function unsubscribeToken(email) {
  const secret = process.env.UNSUBSCRIBE_SECRET || 'fallback-secret';
  return crypto.createHmac('sha256', secret).update(email.toLowerCase()).digest('hex').slice(0, 32);
}

function unsubscribeUrl(email) {
  const base = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://eyes-bigger-than-my-tummy.vercel.app';
  const token = unsubscribeToken(email);
  return `${base}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ב${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
}

function renderTemplate(templateBody, templateSubject, vars) {
  const replacements = {
    '{{name}}': vars.name || '',
    '{{title}}': vars.title || '',
    '{{date}}': vars.date || '',
    '{{time}}': vars.time || '',
    '{{zoom_link}}': vars.zoom_link || '',
    '{{unsubscribe_url}}': vars.unsubscribe_url || '',
    '{{materials}}': vars.materials || '',
    '{{zoom_link_html}}': vars.zoom_link
      ? `<div style="margin-top: 10px;"><a href="${vars.zoom_link}" style="color: #3D7468; font-weight: 600;">קישור לזום ←</a></div>`
      : '',
    '{{description_html}}': vars.description
      ? `<p style="font-size: 16px; line-height: 1.7; color: #3A4744; margin: 14px 0 0;">${vars.description}</p>`
      : '',
    '{{materials_html}}': vars.materials
      ? `<div style="margin: 16px 0; padding: 16px; background: #f5f5f0; border-radius: 4px; font-size: 15px; line-height: 1.7; color: #3A4744;">${vars.materials}</div>`
      : '',
  };

  let html = templateBody;
  let subject = templateSubject;
  for (const [key, val] of Object.entries(replacements)) {
    html = html.split(key).join(val);
    subject = subject.split(key).join(val);
  }
  return { subject, html };
}

module.exports = { sendEmail, unsubscribeToken, unsubscribeUrl, formatDate, formatTime, renderTemplate };
