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

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatTime(timeStr) {
  return timeStr.slice(0, 5);
}

function confirmationEmail(meeting, name) {
  const date = formatDate(meeting.meeting_date);
  const time = formatTime(meeting.meeting_time);

  return {
    subject: `אישור הרשמה — ${meeting.title}`,
    html: `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; color: #22302F; background: #FAF8F4; margin: 0; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto;">
    <div style="font-size: 20px; font-weight: 700; color: #3D7468; margin-bottom: 24px;">עיניים גדולות זה לא טוב</div>
    <p style="font-size: 17px; line-height: 1.8; margin: 0 0 16px;">שלום ${name},</p>
    <p style="font-size: 17px; line-height: 1.8; margin: 0 0 24px;">תודה שנרשמת למפגש. שמחה שתהיי/תהיה איתנו.</p>
    <div style="background: #EEF3EF; border: 1px solid rgba(34,48,47,.12); border-radius: 4px; padding: 24px; margin-bottom: 24px;">
      <div style="font-weight: 700; font-size: 18px; color: #2F5248; margin-bottom: 14px;">${meeting.title}</div>
      <div style="font-size: 16px; line-height: 1.7; color: #3A4744;">
        <div>📅 ${date}</div>
        <div>🕐 ${time}</div>
        ${meeting.zoom_link ? `<div style="margin-top: 10px;"><a href="${meeting.zoom_link}" style="color: #3D7468; font-weight: 600;">קישור לזום ←</a></div>` : ''}
      </div>
    </div>
    <p style="font-size: 15px; line-height: 1.7; color: #6E7C78; margin: 0;">נתראה במפגש,<br>רונית</p>
  </div>
</body>
</html>`,
  };
}

function reminderEmail(meeting, name) {
  const date = formatDate(meeting.meeting_date);
  const time = formatTime(meeting.meeting_time);

  return {
    subject: `תזכורת — ${meeting.title}`,
    html: `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; color: #22302F; background: #FAF8F4; margin: 0; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto;">
    <div style="font-size: 20px; font-weight: 700; color: #3D7468; margin-bottom: 24px;">עיניים גדולות זה לא טוב</div>
    <p style="font-size: 17px; line-height: 1.8; margin: 0 0 16px;">שלום ${name},</p>
    <p style="font-size: 17px; line-height: 1.8; margin: 0 0 24px;">תזכורת קטנה — המפגש שלנו מתקרב.</p>
    <div style="background: #EEF3EF; border: 1px solid rgba(34,48,47,.12); border-radius: 4px; padding: 24px; margin-bottom: 24px;">
      <div style="font-weight: 700; font-size: 18px; color: #2F5248; margin-bottom: 14px;">${meeting.title}</div>
      <div style="font-size: 16px; line-height: 1.7; color: #3A4744;">
        <div>📅 ${date}</div>
        <div>🕐 ${time}</div>
        ${meeting.zoom_link ? `<div style="margin-top: 10px;"><a href="${meeting.zoom_link}" style="color: #3D7468; font-weight: 600;">קישור לזום ←</a></div>` : ''}
      </div>
    </div>
    <p style="font-size: 15px; line-height: 1.7; color: #6E7C78; margin: 0;">נתראה,<br>רונית</p>
  </div>
</body>
</html>`,
  };
}

module.exports = { sendEmail, confirmationEmail, reminderEmail };
