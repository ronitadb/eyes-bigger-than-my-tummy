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
var DAYS_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
var ORDINALS_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שביעי','שמיני'];

function toLocalDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  return new Date(String(val).slice(0, 10) + 'T00:00:00');
}

function formatDate(val) {
  var d = toLocalDate(val);
  if (!d || isNaN(d.getTime())) return '';
  return d.getDate() + ' ב' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

function formatDayName(val) {
  var d = toLocalDate(val);
  if (!d || isNaN(d.getTime())) return '';
  return 'יום ' + DAYS_HE[d.getDay()];
}

function formatTime(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return String(val.getHours()).padStart(2, '0') + ':' + String(val.getMinutes()).padStart(2, '0');
  }
  return String(val).slice(0, 5);
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function textToHtmlParagraphs(text) {
  return text
    .split(/\n\n+/)
    .map(function (para) {
      var lines = para.split(/\n/).map(escHtml).join('<br>');
      return '<p style="font-size: 17px; line-height: 1.8; margin: 0 0 16px; text-align: right; direction: rtl;">' + lines + '</p>';
    })
    .join('\n    ');
}

function renderSeriesScheduleBlock(meetings) {
  if (!meetings || !meetings.length) return '';

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var rowsHtml = '';
  for (var i = 0; i < meetings.length; i++) {
    var m = meetings[i];
    var ordinal = ORDINALS_HE[i] || String(i + 1);
    var meetingDate = toLocalDate(m.meeting_date);
    var isPast = meetingDate && meetingDate < today;

    var sep = (i < meetings.length - 1)
      ? '<div style="border-bottom: 1px solid rgba(61,116,104,.06); margin: 10px 0;"></div>'
      : '';

    if (isPast) {
      rowsHtml +=
        '<div style="text-align: right; direction: rtl;">' +
          '<div style="font-size: 12px; color: #B0BAB7;">' +
            '<span style="color: #9AADA6;">מפגש ' + escHtml(ordinal) + '</span> · ' + escHtml(m.title) +
          '</div>' +
          '<div style="font-size: 11px; color: #C0C8C5; margin-top: 1px;">התקיים</div>' +
        '</div>' + sep;
    } else {
      var dayName = formatDayName(m.meeting_date);
      var dateStr = formatDate(m.meeting_date);
      var timeStr = formatTime(m.meeting_time);
      var when = [dayName, dateStr, timeStr].filter(Boolean).join(' · ');

      rowsHtml +=
        '<div style="text-align: right; direction: rtl;">' +
          '<div style="font-size: 12px; color: #3A4744;">' +
            '<span style="color: #3D7468;">מפגש ' + escHtml(ordinal) + '</span> · ' + escHtml(m.title) +
          '</div>' +
          '<div style="font-size: 11px; color: #8A9692; margin-top: 1px;">' + escHtml(when) + '</div>' +
        '</div>' + sep;
    }
  }

  return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 28px;"><tr><td align="center">' +
    '<table cellpadding="0" cellspacing="0" border="0" style="background: #EEF3EF; border-radius: 6px;"><tr><td style="padding: 14px 20px 10px; text-align: right; direction: rtl;">' +
      '<div style="font-size: 11px; font-weight: 500; color: #8A9E98; margin-bottom: 8px;">' +
        'סדרת מפגשי ״בואו נחזור לביתילדים״' +
      '</div>' +
      rowsHtml +
    '</td></tr></table>' +
  '</td></tr></table>';
}

function renderTemplate(templateBody, templateSubject, vars) {
  var replacements = {
    '{{name}}': vars.name || '',
    '{{title}}': vars.title || '',
    '{{date}}': vars.date || '',
    '{{time}}': vars.time || '',
    '{{zoom_link}}': vars.zoom_link || '',
    '{{unsubscribe_url}}': vars.unsubscribe_url || '',
    '{{materials}}': vars.materials || '',
    '{{description}}': vars.description || '',
  };

  var bodyText = templateBody;
  var subject = templateSubject;
  for (var key in replacements) {
    bodyText = bodyText.split(key).join(replacements[key]);
    subject = subject.split(key).join(replacements[key]);
  }

  var bodyHtml = textToHtmlParagraphs(bodyText.trim());

  var meetingBlock = '';
  if (vars.title && (vars.date || vars.time)) {
    meetingBlock = '\n    <div style="background: #EEF3EF; border: 1px solid rgba(34,48,47,.12); border-radius: 4px; padding: 24px; margin-bottom: 24px; text-align: right; direction: rtl;">' +
      '\n      <div style="font-weight: 700; font-size: 18px; color: #2F5248; margin-bottom: 14px;">' + escHtml(vars.title) + '</div>' +
      '\n      <div style="font-size: 16px; line-height: 1.7; color: #3A4744;">' +
      (vars.date ? '\n        <div>📅 ' + escHtml(vars.date) + '</div>' : '') +
      (vars.time ? '\n        <div>🕐 ' + escHtml(vars.time) + '</div>' : '') +
      (vars.zoom_link ? '\n        <div style="margin-top: 10px;"><a href="' + escHtml(vars.zoom_link) + '" style="color: #3D7468; font-weight: 600;">קישור לזום ←</a></div>' : '') +
      '\n      </div>' +
      (vars.description ? '\n      <p style="font-size: 16px; line-height: 1.7; color: #3A4744; margin: 14px 0 0; text-align: right; direction: rtl;">' + escHtml(vars.description) + '</p>' : '') +
      '\n    </div>';
  }

  var materialsBlock = '';
  if (vars.materials) {
    materialsBlock = '\n    <div style="margin: 16px 0; padding: 16px; background: #f5f5f0; border-radius: 4px; font-size: 15px; line-height: 1.7; color: #3A4744; text-align: right; direction: rtl;">' + escHtml(vars.materials) + '</div>';
  }

  var html = '<!DOCTYPE html>\n' +
    '<html dir="rtl" lang="he">\n' +
    '<head><meta charset="utf-8"></head>\n' +
    '<body style="font-family: -apple-system, sans-serif; color: #22302F; background: #FAF8F4; margin: 0; padding: 40px 20px; direction: rtl; text-align: right;">\n' +
    '  <div dir="rtl" style="max-width: 520px; margin: 0 auto; direction: rtl; text-align: right;">\n' +
    '    <div style="font-size: 20px; font-weight: 700; color: #3D7468; margin-bottom: 24px; text-align: right;">עיניים גדולות זה לא טוב</div>\n' +
    '    ' + bodyHtml + '\n' +
    meetingBlock + '\n' +
    materialsBlock + '\n' +
    (vars.scheduleBlock || '') + '\n' +
    '    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid rgba(34,48,47,.12); font-size: 13px; color: #8A9692; text-align: right; direction: rtl;">\n' +
    '      <a href="' + escHtml(vars.unsubscribe_url || '') + '" style="color: #8A9692;">להסרה מרשימת התפוצה</a>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '</body>\n' +
    '</html>';

  return { subject, html };
}

module.exports = { sendEmail, unsubscribeToken, unsubscribeUrl, formatDate, formatTime, renderTemplate, renderSeriesScheduleBlock };
