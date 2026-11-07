// "Add to calendar" for a meeting: a Google Calendar link, and an .ics file
// for Apple Calendar, Outlook and the rest.
//
// Times are stored as a local date and time plus the meeting's timezone
// (Asia/Jerusalem). Both links carry the start and end in UTC, so a reader in
// New Zealand sees 06:00 the next morning, and Israel's DST changes are taken
// from the timezone database rather than from a fixed offset.
//
// The .ics URL carries the Zoom link, so it is signed: /cal/<id>/<token>, where
// the token is an HMAC of the id. Guessing ids gets nothing.

const crypto = require('crypto');

const SITE = 'https://www.beityeladim.co.il';
const DURATION_MIN = 90;
const TAGLINE = 'בואו נחזור לבֶּיתֶלָדִים · beityeladim.co.il';

// CALENDAR_SECRET if set in Vercel; otherwise the admin password, which is
// already secret there. Changing whichever is used makes calendar links in
// emails already sent stop working (the meeting still shows in the email).
function secret() {
  return process.env.CALENDAR_SECRET || process.env.ADMIN_PASSWORD || '';
}

function calendarToken(id) {
  const s = secret();
  if (!s) return '';
  return crypto.createHmac('sha256', s).update('calendar:' + id).digest('hex').slice(0, 24);
}

function validToken(id, token) {
  const want = calendarToken(id);
  if (!want || typeof token !== 'string' || token.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(token));
}

// Minutes the zone is ahead of UTC at a given instant.
function zoneOffset(ms, tz) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms)).forEach(function (p) { parts[p.type] = p.value; });
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - ms) / 60000);
}

function ymd(d) {
  if (d instanceof Date) return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  return m ? [+m[1], +m[2], +m[3]] : null;
}

// The meeting's start and end as UTC Dates, or null without a date and time.
function meetingTimes(meeting) {
  const day = ymd(meeting.meeting_date);
  const t = /^(\d{1,2}):(\d{2})/.exec(String(meeting.meeting_time || ''));
  if (!day || !t) return null;
  const tz = meeting.timezone || 'Asia/Jerusalem';
  const wall = Date.UTC(day[0], day[1] - 1, day[2], +t[1], +t[2]);
  // Take the offset at the guessed instant, then once more at the corrected
  // one, so a time near a DST change lands on the right side of it.
  let start = wall - zoneOffset(wall, tz) * 60000;
  start = wall - zoneOffset(start, tz) * 60000;
  const minutes = parseInt(meeting.duration_minutes, 10) > 0 ? parseInt(meeting.duration_minutes, 10) : DURATION_MIN;
  return { start: new Date(start), end: new Date(start + minutes * 60000) };
}

function utcStamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function description(meeting) {
  return (meeting.zoom_link ? meeting.zoom_link + '\n\n' : '') + TAGLINE;
}

function googleUrl(meeting) {
  const times = meetingTimes(meeting);
  if (!times) return '';
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: meeting.title || 'מפגש זום',
    dates: utcStamp(times.start) + '/' + utcStamp(times.end),
    details: description(meeting),
  });
  if (meeting.zoom_link) q.set('location', meeting.zoom_link);
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

function icsUrl(meeting) {
  const token = calendarToken(meeting.id);
  return token && meetingTimes(meeting) ? SITE + '/cal/' + meeting.id + '/' + token : '';
}

// Both links for the email's meeting box, or null when there is nothing to add.
function calendarLinks(meeting) {
  if (!meeting) return null;
  const google = googleUrl(meeting);
  if (!google) return null;
  return { google: google, ics: icsUrl(meeting) };
}

function icsText(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545 lines are at most 75 octets; Hebrew is two bytes a letter, so fold
// by bytes and never inside a character.
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function icsFile(meeting) {
  const times = meetingTimes(meeting);
  if (!times) return null;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//beityeladim.co.il//meetings//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:meeting-' + meeting.id + '@beityeladim.co.il',
    'DTSTAMP:' + utcStamp(new Date()),
    'DTSTART:' + utcStamp(times.start),
    'DTEND:' + utcStamp(times.end),
    'SUMMARY:' + icsText(meeting.title || 'מפגש זום'),
    'DESCRIPTION:' + icsText(description(meeting)),
  ];
  if (meeting.zoom_link) {
    lines.push('LOCATION:' + icsText(meeting.zoom_link));
    lines.push('URL:' + meeting.zoom_link);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { calendarLinks, calendarToken, validToken, meetingTimes, googleUrl, icsUrl, icsFile };
