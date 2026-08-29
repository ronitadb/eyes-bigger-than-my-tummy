const crypto = require('crypto');

// `attachments` is an optional array of { filename, path } where path is a
// public URL. Resend fetches it server-side — the only workable route from a
// serverless function, which has no local disk to read a file from.
async function sendEmail({ to, subject, html, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  // Mail clients show the display name if there is one, and fall back to the
  // local part of the address otherwise — which is why a bare address like
  // info@… shows up in the inbox as just "info". RESEND_FROM_EMAIL may already
  // contain a display name, in which case it is used as-is.
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const fromName = process.env.RESEND_FROM_NAME || '';
  const from = (fromName && !fromAddress.includes('<'))
    ? `${fromName} <${fromAddress}>`
    : fromAddress;

  const payload = { from, to: [to], subject, html };
  if (Array.isArray(attachments) && attachments.length) {
    payload.attachments = attachments
      .filter(function (a) { return a && a.filename && a.path; })
      .map(function (a) { return { filename: a.filename, path: a.path }; });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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
      : 'https://www.beityeladim.co.il';
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
      var lines = para.split(/\n/).map(function (line) {
        var escaped = escHtml(line);
        return escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, function (_, linkText, url) {
          return '<a href="' + url + '" style="color: #3D7468; text-decoration: underline;" target="_blank">' + linkText + '</a>';
        });
      }).join('<br>');
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
        'סדרת מפגשי ״בואו נחזור לביתלדים״' +
      '</div>' +
      rowsHtml +
    '</td></tr></table>' +
  '</td></tr></table>';
}

function renderTemplate(templateBody, templateSubject, vars) {
  var replacements = {
    '{{name}}': vars.name || '',
    // Falls back to the full name so a template can use {{first_name}} safely
    // even for someone registered before the column existed.
    '{{first_name}}': vars.first_name || vars.name || '',
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

  var meetingBlock = '';
  if (vars.title && (vars.date || vars.time)) {
    meetingBlock = '\n    <div style="background: #EEF3EF; border: 1px solid rgba(34,48,47,.12); border-radius: 4px; padding: 24px; margin-bottom: 24px; text-align: right; direction: rtl;">' +
      '\n      <div style="font-weight: 700; font-size: 18px; color: #2F5248; margin-bottom: 14px;">' + escHtml(vars.title) + '</div>' +
      '\n      <div style="font-size: 16px; line-height: 1.7; color: #3A4744;">' +
      (vars.date ? '\n        <div>' + escHtml(vars.date) + '</div>' : '') +
      (vars.time ? '\n        <div>' + escHtml(vars.time) + '</div>' : '') +
      (vars.zoom_link ? '\n        <div style="margin-top: 10px;"><a href="' + escHtml(vars.zoom_link) + '" style="color: #3D7468; font-weight: 600;">קישור לזום ←</a></div>' : '') +
      '\n      </div>' +
      (vars.description ? '\n      <p style="font-size: 16px; line-height: 1.7; color: #3A4744; margin: 14px 0 0; text-align: right; direction: rtl;">' + escHtml(vars.description) + '</p>' : '') +
      '\n    </div>';
  }

  var paragraphs = textToHtmlParagraphs(bodyText.trim());
  var bodyHtml;
  if (meetingBlock) {
    var firstClose = paragraphs.indexOf('</p>');
    var secondClose = firstClose !== -1 ? paragraphs.indexOf('</p>', firstClose + 4) : -1;
    var insertAt = secondClose !== -1 ? secondClose : firstClose;
    if (insertAt !== -1) {
      bodyHtml = paragraphs.slice(0, insertAt + 4) + '\n' + meetingBlock + '\n    ' + paragraphs.slice(insertAt + 4).replace(/^\s+/, '');
    } else {
      bodyHtml = paragraphs + '\n' + meetingBlock;
    }
  } else {
    bodyHtml = paragraphs;
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
    '    <div style="font-size: 20px; font-weight: 700; color: #3D7468; margin-bottom: 24px; text-align: right;">בואו נחזור לבֶּיתֶלָדִים</div>\n' +
    '    ' + bodyHtml + '\n' +
    materialsBlock + '\n' +
    (vars.scheduleBlock || '') + '\n' +
    '    <a href="https://www.beityeladim.co.il" style="text-decoration: none; border: 0;"><img src="https://www.beityeladim.co.il/assets/beityeladim-email-banner.jpg" width="520" alt="חדר האוכל, חדר הילדים והמקלחות — איורים מתוך ״עיניים גדולות זה לא טוב״" style="display: block; width: 100%; max-width: 520px; height: auto; border: 0; border-radius: 6px; margin: 34px 0 0;"></a>\n' +
    '    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid rgba(34,48,47,.12); font-size: 13px; color: #8A9692; text-align: right; direction: rtl;">\n' +
    '      <a href="' + escHtml(vars.unsubscribe_url || '') + '" style="color: #8A9692;">להסרה מרשימת התפוצה</a>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '</body>\n' +
    '</html>';

  return { subject, html };
}

module.exports = { sendEmail, unsubscribeToken, unsubscribeUrl, formatDate, formatTime, renderTemplate, renderSeriesScheduleBlock };
