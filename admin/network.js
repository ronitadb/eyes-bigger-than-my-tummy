/* Distribution & outreach network — admin screen logic.
 *
 * Shares the CMS login: the password lives in sessionStorage 'cms-auth' and is
 * sent as the x-admin-password header, exactly like the other admin pages.
 *
 * The whole contact list is loaded once and every search/filter/saved view is
 * evaluated in the browser. This is an internal notebook, not a public site:
 * a few thousand rows filter instantly and the server stays free of dynamic SQL.
 */

var API = '/api/admin';
var PW = '';

/* ------------------------------------------------------------ vocabularies --
 * All of these are SUGGESTIONS, not constraints. The database stores free text
 * and the lists below are merged with whatever values already exist, so Ronit
 * can invent a new category or country without a migration.
 */
var RECORD_TYPES = [
  ['person', 'אדם'], ['group', 'קבוצה'], ['organisation', 'ארגון'],
  ['publication', 'עלון / עיתון / ניוזלטר'], ['kibbutz_role', 'תפקיד בקיבוץ'],
  ['channel', 'ערוץ הפצה']
];
var RT = {};
RECORD_TYPES.forEach(function (p) { RT[p[0]] = p[1]; });

var STATUSES = [
  ['not_contacted', 'לא פנינו'], ['ready', 'מוכן לפנייה'], ['contacted', 'נשלחה פנייה'],
  ['follow_up_needed', 'צריך מעקב'], ['replied', 'התקבלה תשובה'],
  ['agreed_to_share', 'הסכימו להפיץ'], ['shared', 'הופץ'], ['declined', 'סירבו'],
  ['no_response', 'אין תגובה'], ['not_relevant', 'לא רלוונטי'], ['do_not_contact', 'לא לפנות']
];
var ST = {};
STATUSES.forEach(function (p) { ST[p[0]] = p[1]; });

var SUGGEST = {
  category: ['קיבוצים', 'קיבוצניקים בישראל', 'ישראלים בחו״ל', 'ארגונים ומוסדות',
             'בריאות הנפש ואנשי מקצוע', 'מדיה ותוכן', 'אנשים ומקשרים'],
  subcategory_role: ['ועדת תרבות', 'מנהל/ת קהילה', 'מזכירות', 'עלון הקיבוץ', 'ותיקים',
                     'קבוצת פייסבוק', 'קבוצת וואטסאפ', 'עורך/ת', 'מנחה', 'ספרייה'],
  country: ['ישראל', 'ארצות הברית', 'קנדה', 'אנגליה', 'אוסטרליה', 'ניו זילנד',
            'גרמניה', 'צרפת', 'הולנד', 'ברזיל', 'דרום אפריקה'],
  preferred_method: ['אימייל', 'טלפון', 'וואטסאפ', 'פייסבוק', 'טופס באתר', 'פנייה אישית'],
  source: ['היכרות אישית', 'המלצה', 'חיפוש באינטרנט', 'אתר הקיבוץ', 'קבוצת פייסבוק'],
  act_type: ['מייל', 'וואטסאפ', 'טלפון', 'הודעה בפייסבוק', 'פגישה', 'התקבלה תשובה', 'הופץ', 'הערה']
};

var FIELD_LABELS = {
  name: 'שם', record_type: 'סוג רשומה', organisation: 'ארגון', kibbutz: 'קיבוץ',
  country: 'מדינה', city_region: 'אזור / עיר', category: 'קטגוריה',
  subcategory_role: 'תת‑קטגוריה / תפקיד', gatekeeper_name: 'גייטקיפר',
  gatekeeper_position: 'תפקיד הגייטקיפר', email: 'אימייל', phone: 'טלפון',
  whatsapp: 'וואטסאפ', website: 'אתר', facebook_url: 'פייסבוק',
  instagram_url: 'אינסטגרם', other_url: 'קישור נוסף', preferred_method: 'דרך פנייה מועדפת',
  relevance: 'למה רלוונטי', source: 'מקור', source_url: 'קישור למקור',
  source_notes: 'הערות על המקור', notes: 'הערות פרטיות', tags: 'תגיות'
};
var FIELD_ORDER = Object.keys(FIELD_LABELS);

/* --------------------------------------------------------------- app state -- */
var CONTACTS = [], TAGS = [], CAMPAIGNS = [], TEMPLATES = [];
var LOADED = { network: false, campaigns: false, templates: false };
var VIEW = 'all';
var FILTERS = {};
var openContactId = null, actContactId = null, editCampaignId = null, editTemplateId = null;
var IMPORT = null;
var PICK = { campaignId: null, selected: {} };

/* ------------------------------------------------------------------ helpers -- */
function headers() { return { 'Content-Type': 'application/json', 'x-admin-password': PW }; }
function authHeader() { return { 'x-admin-password': PW }; }
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function val(id) { var e = $(id); return e ? e.value.trim() : ''; }
function today() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) {
  if (!d) return '';
  var s = String(d).slice(0, 10);
  var p = s.split('-');
  return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : s;
}
function showMsg(text, ok) {
  var m = $('msg');
  m.innerHTML = '<div class="msg ' + (ok ? 'msg-ok' : 'msg-err') + '">' + esc(text) + '</div>';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(function () { m.innerHTML = ''; }, 4500);
}
function openModal(id) { $(id).classList.add('active'); }
function closeModal(id) {
  $(id).classList.remove('active');
  // Forget which contact card was open, so a later save doesn't re-open it.
  if (id === 'contactOverlay') openContactId = null;
}
function toggleMore(id, btn) {
  var el = $(id);
  el.classList.toggle('open');
  btn.textContent = el.classList.contains('open') ? 'פחות שדות ▴' : 'עוד שדות ▾';
}
function askConfirm(title, text, go) {
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text;
  var btn = $('confirmGo');
  btn.onclick = function () { closeModal('confirmOverlay'); go(); };
  openModal('confirmOverlay');
}
// Turns a failed response into something readable. The migration case is worth
// naming explicitly — it is the state the tool ships in until the SQL is run.
function errText(d, fallback) {
  if (d && d.error === 'migration_needed') {
    $('migrationWarn').style.display = 'block';
    return 'לא נשמר — מסד הנתונים עדיין לא הוכן. יש להריץ את קובץ המיגרציה בקונסולת Neon.';
  }
  return fallback;
}
function jget(url) {
  return fetch(url, { headers: authHeader() }).then(function (r) { return r.json(); });
}
function jsend(url, method, body) {
  return fetch(url, { method: method, headers: headers(), body: JSON.stringify(body) })
    .then(function (r) { return r.json(); });
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { showMsg('הועתק.', true); },
      function () { fallbackCopy(text); });
  } else { fallbackCopy(text); }
}
function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showMsg('הועתק.', true); }
  catch (e) { showMsg('ההעתקה נכשלה — אפשר לסמן ולהעתיק ידנית.', false); }
  document.body.removeChild(ta);
}
function fillSelect(id, pairs, current, placeholder) {
  var el = $(id);
  if (!el) return;
  var html = placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '';
  pairs.forEach(function (p) {
    html += '<option value="' + esc(p[0]) + '"' + (String(current) === String(p[0]) ? ' selected' : '') + '>' + esc(p[1]) + '</option>';
  });
  el.innerHTML = html;
}
function fillDatalist(id, values) {
  var el = $(id);
  if (!el) return;
  el.innerHTML = values.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('');
}
// Merge the suggestion list with values already in the data, so the vocabulary
// grows by itself as contacts are added.
function vocab(field) {
  var seen = {}, out = [];
  (SUGGEST[field] || []).forEach(function (v) { if (!seen[v]) { seen[v] = 1; out.push(v); } });
  CONTACTS.forEach(function (c) {
    var v = c[field];
    if (v && !seen[v]) { seen[v] = 1; out.push(v); }
  });
  return out.sort(function (a, b) { return a.localeCompare(b, 'he'); });
}

/* --------------------------------------------------------------------- auth -- */
function enterApp() {
  $('login').style.display = 'none';
  $('app').style.display = 'block';
  boot();
}
function doLogin() {
  PW = $('pw').value;
  fetch(API + '/dashboard', { headers: authHeader() }).then(function (r) {
    if (r.status === 401) { $('loginErr').textContent = 'סיסמה שגויה'; PW = ''; return; }
    sessionStorage.setItem('cms-auth', PW);
    enterApp();
  }).catch(function () { $('loginErr').textContent = 'שגיאת חיבור'; });
}
function doLogout() {
  PW = ''; sessionStorage.removeItem('cms-auth');
  $('app').style.display = 'none';
  $('login').style.display = 'flex';
  $('pw').value = '';
}
(function () {
  var s = sessionStorage.getItem('cms-auth');
  if (!s) return;
  PW = s;
  fetch(API + '/dashboard', { headers: authHeader() }).then(function (r) {
    if (r.status === 401) {
      sessionStorage.removeItem('cms-auth'); PW = '';
      document.documentElement.removeAttribute('data-authing');
      return;
    }
    enterApp();
  }).catch(function () { document.documentElement.removeAttribute('data-authing'); });
})();
$('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });

/* --------------------------------------------------------------------- boot -- */
function boot() {
  loadDashboard();
  loadNetwork().then(function () {
    var m = /^#c(\d+)$/.exec(location.hash || '');
    if (m) { showTab('network'); openContact(Number(m[1])); }
  });
}

function showTab(name) {
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === name);
  var panels = document.querySelectorAll('.panel');
  for (var j = 0; j < panels.length; j++) panels[j].classList.remove('active');
  $('panel-' + name).classList.add('active');

  if (name === 'dashboard') loadDashboard();
  if (name === 'network' && !LOADED.network) loadNetwork();
  if (name === 'campaigns') loadCampaigns();
  if (name === 'templates' && !LOADED.templates) loadTemplates();
}

function flagMigration(d) {
  if (d && d.migration_needed) $('migrationWarn').style.display = 'block';
}

/* ---------------------------------------------------------------- dashboard -- */
function loadDashboard() {
  jget(API + '/dashboard').then(function (d) {
    if (!d || !d.ok) { $('dashBody').innerHTML = '<div class="empty">שגיאה בטעינה.</div>'; return; }
    flagMigration(d);
    renderDashboard(d);
  });
}

function renderDashboard(d) {
  var camp = d.campaign;
  var na = d.next_actions || { ready: [], follow_up: [], replied: [] };
  var h = '';

  h += '<div class="stat-grid">' +
    stat(d.totals.contacts, 'אנשי קשר וערוצים') +
    stat(d.totals.campaigns, 'קמפיינים פעילים') +
    stat(camp ? (sumCounts(d.campaign_counts)) : 0, 'בקמפיין הנוכחי') +
    stat(d.totals.activities, 'פניות שנרשמו') +
    '</div>';

  h += '<h3 class="section-title">מה כדאי לעשות עכשיו' +
       (camp ? ' <span class="muted" style="font-weight:400">— ' + esc(camp.name) + '</span>' : '') + '</h3>';
  h += '<div class="next-grid">' +
    nextCard('מוכנים לפנייה', na.ready, '', 'אין כרגע אף אחד מסומן כמוכן לפנייה. אפשר לסמן אנשי קשר כ״מוכן לפנייה״ ברשת ההפצה.') +
    nextCard('צריך מעקב', na.follow_up, 'amber', 'אין מעקבים שהגיע זמנם.') +
    nextCard('תשובות שמחכות לך', na.replied, 'blue', 'אין תשובות פתוחות.') +
    '</div>';

  if (camp) {
    h += '<div class="card"><h3>' + esc(camp.name) + '</h3>';
    var cc = d.campaign_counts || {};
    var chips = STATUSES.filter(function (p) { return cc[p[0]]; })
      .map(function (p) { return '<span class="status st-' + p[0] + '" style="margin-left:6px">' + esc(p[1]) + ': ' + cc[p[0]] + '</span>'; })
      .join(' ');
    h += '<div style="line-height:2.2">' + (chips || '<span class="muted">עדיין לא נוספו אנשי קשר לקמפיין הזה.</span>') + '</div>';
    h += '<div class="actions" style="margin-top:12px"><button class="btn btn-small btn-ghost" onclick="showTab(\'campaigns\')">לניהול הקמפיין</button></div>';
    h += '</div>';
  }

  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">';
  h += '<div class="card"><h3>לפי קטגוריה</h3>' + barList(d.by_category) + '</div>';
  h += '<div class="card"><h3>לפי סוג רשומה</h3>' +
       barList((d.by_record_type || []).map(function (r) { return { label: RT[r.label] || r.label, n: r.n }; })) + '</div>';
  if ((d.by_country || []).length) {
    h += '<div class="card"><h3>לפי מדינה</h3>' + barList(d.by_country) + '</div>';
  }
  h += '</div>';

  if ((d.recent || []).length) {
    h += '<div class="card"><h3>נרשם לאחרונה</h3><ul class="next-list">';
    d.recent.forEach(function (a) {
      h += '<li>' + esc(fmtDate(a.activity_date)) + ' · <a onclick="openContact(' + a.contact_id + ')">' + esc(a.contact_name) + '</a>' +
        (a.type ? ' · ' + esc(a.type) : '') +
        (a.note ? ' <span class="muted">— ' + esc(String(a.note).slice(0, 70)) + '</span>' : '') + '</li>';
    });
    h += '</ul></div>';
  }

  $('dashBody').innerHTML = h;
}
function sumCounts(o) { var n = 0; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n += o[k]; return n; }
function stat(n, label) {
  return '<div class="stat-card"><div class="num">' + (n || 0) + '</div><div class="label">' + esc(label) + '</div></div>';
}
function nextCard(title, items, cls, emptyText) {
  var h = '<div class="next-card ' + cls + '"><div class="t">' + esc(title) + '</div><div class="n">' + items.length + '</div>';
  if (!items.length) { h += '<div class="muted" style="font-size:13px;margin-top:8px;line-height:1.7">' + esc(emptyText) + '</div></div>'; return h; }
  h += '<ul class="next-list" style="margin-top:8px">';
  items.slice(0, 40).forEach(function (c) {
    h += '<li><a onclick="openContact(' + c.id + ')">' + esc(c.name) + '</a>' +
      (c.organisation || c.kibbutz ? ' <span class="muted">· ' + esc(c.organisation || c.kibbutz) + '</span>' : '') +
      (c.next_follow_up_date ? ' <span class="muted">· ' + esc(fmtDate(c.next_follow_up_date)) + '</span>' : '') +
      (c.preferred_method ? ' <span class="chip">' + esc(c.preferred_method) + '</span>' : '') +
      '</li>';
  });
  h += '</ul></div>';
  return h;
}
function barList(rows) {
  if (!rows || !rows.length) return '<div class="muted" style="font-size:14px">אין נתונים עדיין.</div>';
  var max = rows.reduce(function (m, r) { return Math.max(m, r.n); }, 1);
  return '<ul class="bars">' + rows.map(function (r) {
    return '<li><span class="bl">' + esc(r.label) + '</span>' +
      '<span class="bb"><span style="width:' + Math.round(r.n / max * 100) + '%"></span></span>' +
      '<span class="bn">' + r.n + '</span></li>';
  }).join('') + '</ul>';
}

/* ------------------------------------------------------------------ network -- */
function loadNetwork() {
  return jget(API + '/contacts').then(function (d) {
    if (!d || !d.ok) { showMsg('שגיאה בטעינת אנשי הקשר.', false); return; }
    flagMigration(d);
    CONTACTS = d.contacts || [];
    TAGS = d.tags || [];
    CAMPAIGNS = d.campaigns || [];
    LOADED.network = true;
    buildVocabUI();
    renderViews();
    renderTable();
  });
}

function buildVocabUI() {
  fillDatalist('dlCategory', vocab('category'));
  fillDatalist('dlSub', vocab('subcategory_role'));
  fillDatalist('dlCountry', vocab('country'));
  fillDatalist('dlKibbutz', vocab('kibbutz'));
  fillDatalist('dlMethod', vocab('preferred_method'));
  fillDatalist('dlSource', vocab('source'));
  fillDatalist('dlActType', SUGGEST.act_type);
  fillDatalist('dlTags', TAGS.map(function (t) { return t.name; }));

  var pairs = function (list) { return list.map(function (v) { return [v, v]; }); };
  fillSelect('fCategory', pairs(vocab('category')), FILTERS.category, 'הכל');
  fillSelect('fSub', pairs(vocab('subcategory_role')), FILTERS.subcategory_role, 'הכל');
  fillSelect('fType', RECORD_TYPES, FILTERS.record_type, 'הכל');
  fillSelect('fCountry', pairs(vocab('country')), FILTERS.country, 'הכל');
  fillSelect('fRegion', pairs(vocab('city_region')), FILTERS.city_region, 'הכל');
  fillSelect('fKibbutz', pairs(vocab('kibbutz')), FILTERS.kibbutz, 'הכל');
  fillSelect('fMethod', pairs(vocab('preferred_method')), FILTERS.preferred_method, 'הכל');
  fillSelect('fTag', TAGS.map(function (t) { return [t.name, t.name]; }), FILTERS.tag, 'הכל');
  fillSelect('fCampaign', CAMPAIGNS.map(function (c) { return [c.id, c.name]; }), FILTERS.campaign, 'הכל');
  fillSelect('fStatus', STATUSES, FILTERS.status, 'הכל');

  fillSelect('aType', RECORD_TYPES, 'person', null);
  fillSelect('aCampaign', CAMPAIGNS.map(function (c) { return [c.id, c.name]; }), '', '— ללא —');
  fillSelect('actStatus', STATUSES, '', '— ללא שינוי —');
  fillSelect('actCampaign', CAMPAIGNS.map(function (c) { return [c.id, c.name]; }), '', '— ללא —');
}

/* Saved views. Each is a predicate over a contact, so a view can express things
 * a single column filter can't (e.g. "abroad" = has a country that isn't Israel).
 */
var VIEWS = [
  ['all', 'הכל', function () { return true; }],
  ['kibbutzim', 'קיבוצים', function (c) { return !!c.kibbutz || c.category === 'קיבוצים' || c.record_type === 'kibbutz_role'; }],
  ['abroad', 'ישראלים בחו״ל', function (c) {
    var co = (c.country || '').trim();
    return (co && co !== 'ישראל' && co.toLowerCase() !== 'israel') || /חו״ל|חו"ל/.test(c.category || '');
  }],
  ['facebook', 'קבוצות פייסבוק', function (c) { return !!c.facebook_url || /פייסבוק/.test(c.subcategory_role || '') || /פייסבוק/.test(c.preferred_method || ''); }],
  ['whatsapp', 'וואטסאפ וקהילה', function (c) { return !!c.whatsapp || /וואטסאפ/.test(c.subcategory_role || '') || c.record_type === 'group'; }],
  ['organisations', 'ארגונים', function (c) { return c.record_type === 'organisation' || c.category === 'ארגונים ומוסדות'; }],
  ['media', 'מדיה', function (c) { return c.record_type === 'publication' || c.category === 'מדיה ותוכן'; }],
  ['people', 'אנשים', function (c) { return c.record_type === 'person'; }],
  ['followup', 'צריך מעקב', function (c) { return needsFollowUp(c); }],
  ['campaign', 'הקמפיין הנוכחי', function (c) {
    if (!CAMPAIGNS.length) return false;
    var id = CAMPAIGNS[0].id;
    return (c.campaigns || []).some(function (x) { return x.campaign_id === id; });
  }]
];

function needsFollowUp(c) {
  var t = today();
  return (c.campaigns || []).some(function (x) {
    return x.status === 'follow_up_needed' ||
      (x.next_follow_up_date && String(x.next_follow_up_date).slice(0, 10) <= t);
  });
}

function renderViews() {
  $('views').innerHTML = VIEWS.map(function (v) {
    return '<button class="view' + (VIEW === v[0] ? ' active' : '') + '" onclick="setView(\'' + v[0] + '\')">' + esc(v[1]) + '</button>';
  }).join('');
}
function setView(v) { VIEW = v; renderViews(); renderTable(); }
function toggleFilters() { $('filters').classList.toggle('open'); }
function clearFilters() {
  ['fCategory', 'fSub', 'fType', 'fCountry', 'fRegion', 'fKibbutz', 'fTag', 'fMethod', 'fCampaign', 'fStatus', 'fLastBefore']
    .forEach(function (id) { if ($(id)) $(id).value = ''; });
  $('fFollowUp').checked = false;
  $('q').value = '';
  readFilters();
  renderTable();
}
function readFilters() {
  FILTERS = {
    q: val('q').toLowerCase(),
    category: val('fCategory'), subcategory_role: val('fSub'), record_type: val('fType'),
    country: val('fCountry'), city_region: val('fRegion'), kibbutz: val('fKibbutz'),
    tag: val('fTag'), preferred_method: val('fMethod'),
    campaign: val('fCampaign'), status: val('fStatus'),
    lastBefore: val('fLastBefore'), followUp: $('fFollowUp').checked
  };
}
['q', 'fCategory', 'fSub', 'fType', 'fCountry', 'fRegion', 'fKibbutz', 'fTag', 'fMethod',
 'fCampaign', 'fStatus', 'fLastBefore', 'fFollowUp'].forEach(function (id) {
  var el = $(id);
  if (el) el.addEventListener(el.tagName === 'INPUT' && el.type !== 'checkbox' ? 'input' : 'change',
    function () { readFilters(); renderTable(); });
});

var SEARCH_FIELDS = ['name', 'organisation', 'kibbutz', 'notes', 'relevance', 'city_region',
                     'country', 'category', 'subcategory_role', 'gatekeeper_name', 'email', 'phone'];

function matches(c) {
  var f = FILTERS;
  if (f.q) {
    var hay = SEARCH_FIELDS.map(function (k) { return c[k] || ''; }).join(' ') + ' ' + (c.tags || []).join(' ');
    if (hay.toLowerCase().indexOf(f.q) < 0) return false;
  }
  if (f.category && c.category !== f.category) return false;
  if (f.subcategory_role && c.subcategory_role !== f.subcategory_role) return false;
  if (f.record_type && c.record_type !== f.record_type) return false;
  if (f.country && c.country !== f.country) return false;
  if (f.city_region && c.city_region !== f.city_region) return false;
  if (f.kibbutz && c.kibbutz !== f.kibbutz) return false;
  if (f.preferred_method && c.preferred_method !== f.preferred_method) return false;
  if (f.tag && (c.tags || []).indexOf(f.tag) < 0) return false;
  if (f.campaign) {
    var link = (c.campaigns || []).filter(function (x) { return String(x.campaign_id) === String(f.campaign); })[0];
    if (!link) return false;
    if (f.status && link.status !== f.status) return false;
  } else if (f.status) {
    if (!(c.campaigns || []).some(function (x) { return x.status === f.status; })) return false;
  }
  if (f.followUp && !needsFollowUp(c)) return false;
  if (f.lastBefore) {
    var la = c.last_activity ? String(c.last_activity).slice(0, 10) : '';
    if (la && la >= f.lastBefore) return false;
  }
  var view = VIEWS.filter(function (v) { return v[0] === VIEW; })[0];
  if (view && !view[2](c)) return false;
  return true;
}

function renderTable() {
  var items = CONTACTS.filter(matches);
  $('countLine').innerHTML = items.length + ' מתוך ' + CONTACTS.length +
    (items.length !== CONTACTS.length ? ' · <a onclick="clearFilters()" style="color:#3D7468;cursor:pointer">ניקוי סינון</a>' : '');

  if (!items.length) {
    $('rows').innerHTML = '';
    $('emptyRows').innerHTML = '<div class="empty">' +
      (CONTACTS.length ? 'אין רשומות שמתאימות לסינון.' : 'הרשת עדיין ריקה. אפשר להתחיל בהוספת איש קשר או בייבוא קובץ CSV.') +
      '</div>';
    return;
  }
  $('emptyRows').innerHTML = '';

  var html = '';
  items.forEach(function (c) {
    var place = [c.kibbutz, c.city_region, c.country].filter(Boolean).join(' · ');
    var tags = (c.tags || []).map(function (t) { return '<span class="chip chip-tag">' + esc(t) + '</span>'; }).join('');
    var camps = (c.campaigns || []).map(function (x) {
      return '<span class="status st-' + esc(x.status) + '" title="' + esc(x.campaign_name) + '">' + esc(ST[x.status] || x.status) + '</span>';
    }).join(' ');
    var contactBits = [c.preferred_method, c.email, c.phone || c.whatsapp].filter(Boolean)[0] || '';

    html += '<tr>' +
      '<td class="name" onclick="openContact(' + c.id + ')">' + esc(c.name) +
        (c.organisation ? '<span class="sub">' + esc(c.organisation) + '</span>' : '') +
        (c.gatekeeper_name ? '<span class="sub">גייטקיפר: ' + esc(c.gatekeeper_name) + '</span>' : '') + '</td>' +
      '<td>' + esc(RT[c.record_type] || c.record_type || '') + '</td>' +
      '<td>' + esc(c.category || '') + (c.subcategory_role ? '<span class="sub">' + esc(c.subcategory_role) + '</span>' : '') + '</td>' +
      '<td>' + esc(place) + '</td>' +
      '<td>' + esc(contactBits) + '</td>' +
      '<td>' + (tags || '') + '</td>' +
      '<td>' + (camps || '<span class="muted">—</span>') + '</td>' +
      '<td>' + (c.last_activity ? esc(fmtDate(c.last_activity)) : '<span class="muted">—</span>') + '</td>' +
      '</tr>';
  });
  $('rows').innerHTML = html;
}

/* ------------------------------------------------------------- add contact -- */
var ADD_FIELDS = {
  aName: 'name', aType: 'record_type', aCategory: 'category', aOrg: 'organisation',
  aKibbutz: 'kibbutz', aRelevance: 'relevance', aSub: 'subcategory_role',
  aMethod: 'preferred_method', aCountry: 'country', aRegion: 'city_region',
  aGkName: 'gatekeeper_name', aGkPos: 'gatekeeper_position', aEmail: 'email',
  aPhone: 'phone', aWhatsapp: 'whatsapp', aWebsite: 'website', aFacebook: 'facebook_url',
  aInstagram: 'instagram_url', aOther: 'other_url', aSource: 'source', aNotes: 'notes'
};

function openAdd() {
  Object.keys(ADD_FIELDS).forEach(function (id) { if ($(id)) $(id).value = ''; });
  $('aTags').value = '';
  $('aType').value = 'person';
  $('aCampaign').value = CAMPAIGNS.length ? CAMPAIGNS[0].id : '';
  $('addMore').classList.remove('open');
  openModal('addOverlay');
  setTimeout(function () { $('aName').focus(); }, 60);
}
function addPayload() {
  var b = {};
  Object.keys(ADD_FIELDS).forEach(function (id) { b[ADD_FIELDS[id]] = val(id); });
  b.tags = val('aTags').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (val('aCampaign')) b.campaign_id = val('aCampaign');
  return b;
}
function saveAdd(confirmDup) {
  var b = addPayload();
  if (!b.name) { showMsg('צריך לפחות שם.', false); $('aName').focus(); return; }
  b.confirm = !!confirmDup;
  $('aSave').disabled = true;
  jsend(API + '/contacts', 'POST', b).then(function (d) {
    $('aSave').disabled = false;
    if (d && d.ok) {
      closeModal('addOverlay'); closeModal('dupOverlay');
      showMsg('נוסף: ' + b.name, true);
      loadNetwork().then(function () { openContact(d.contact.id); });
      return;
    }
    if (d && d.error === 'duplicates') { showDuplicates(d.duplicates); return; }
    showMsg(errText(d, 'שגיאה בשמירה.'), false);
  }).catch(function () { $('aSave').disabled = false; showMsg('שגיאת חיבור.', false); });
}
function showDuplicates(dups) {
  $('dupList').innerHTML = dups.map(function (d) {
    return '<div class="dup-item"><strong>' + esc(d.name) + '</strong>' +
      (d.organisation ? ' · ' + esc(d.organisation) : '') +
      (d.kibbutz ? ' · ' + esc(d.kibbutz) : '') +
      (d.email ? '<br>' + esc(d.email) : '') +
      (d.phone ? ' · ' + esc(d.phone) : '') +
      '<br><span class="muted">התאמה לפי: ' + esc(d.reasons.join(', ')) + '</span>' +
      ' <button class="btn btn-tiny btn-ghost" onclick="closeModal(\'dupOverlay\');closeModal(\'addOverlay\');openContact(' + d.id + ')">פתיחת הרשומה הקיימת</button>' +
      '</div>';
  }).join('');
  openModal('dupOverlay');
}
$('aName').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveAdd(false); });

/* ---------------------------------------------------------- contact detail -- */
function openContact(id) {
  openContactId = id;
  openModal('contactOverlay');
  $('contactBody').innerHTML = '<div class="empty">טוען…</div>';
  jget(API + '/contacts?id=' + id).then(function (d) {
    if (!d || !d.ok) { $('contactBody').innerHTML = '<div class="empty">לא נמצא.</div>'; return; }
    renderContact(d.contact, d.activities || []);
  });
}

function fieldInput(id, label, value, list) {
  return '<div class="field"><label>' + esc(label) + '</label>' +
    '<input id="' + id + '" type="text" value="' + esc(value || '') + '"' + (list ? ' list="' + list + '"' : '') + '></div>';
}

function renderContact(c, activities) {
  var h = '';
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">' +
    '<h2 style="margin:0">' + esc(c.name) + '</h2>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-small" onclick="openActivity(' + c.id + ')">רישום פנייה</button>' +
      '<button class="btn btn-small btn-secondary" onclick="closeModal(\'contactOverlay\')">סגירה</button>' +
    '</div></div>' +
    '<div class="modal-sub">נוסף ' + esc(fmtDate(c.created_at)) + ' · עודכן ' + esc(fmtDate(c.updated_at)) + '</div>';

  h += '<div class="fieldset"><div class="legend">זהות</div><div class="grid2">' +
    fieldInput('dName', 'שם *', c.name) +
    '<div class="field"><label>סוג רשומה</label><select id="dType">' +
      RECORD_TYPES.map(function (p) { return '<option value="' + p[0] + '"' + (c.record_type === p[0] ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('') +
    '</select></div>' +
    fieldInput('dOrg', 'ארגון', c.organisation) +
    fieldInput('dCategory', 'קטגוריה', c.category, 'dlCategory') +
    fieldInput('dSub', 'תת‑קטגוריה / תפקיד', c.subcategory_role, 'dlSub') +
    fieldInput('dKibbutz', 'קיבוץ', c.kibbutz, 'dlKibbutz') +
    fieldInput('dCountry', 'מדינה', c.country, 'dlCountry') +
    fieldInput('dRegion', 'אזור / עיר', c.city_region) +
    fieldInput('dGkName', 'גייטקיפר (מי שולט בערוץ)', c.gatekeeper_name) +
    fieldInput('dGkPos', 'תפקיד הגייטקיפר', c.gatekeeper_position) +
    '</div></div>';

  h += '<div class="fieldset"><div class="legend">דרכי פנייה</div><div class="grid2">' +
    fieldInput('dEmail', 'אימייל', c.email) +
    fieldInput('dPhone', 'טלפון', c.phone) +
    fieldInput('dWhatsapp', 'וואטסאפ', c.whatsapp) +
    fieldInput('dMethod', 'דרך מועדפת', c.preferred_method, 'dlMethod') +
    fieldInput('dWebsite', 'אתר', c.website) +
    fieldInput('dFacebook', 'פייסבוק', c.facebook_url) +
    fieldInput('dInstagram', 'אינסטגרם', c.instagram_url) +
    fieldInput('dOther', 'קישור נוסף', c.other_url) +
    '</div>' + linkRow(c) + '</div>';

  h += '<div class="fieldset"><div class="legend">למה זה רלוונטי</div>' +
    '<div class="field"><textarea id="dRelevance" style="min-height:70px">' + esc(c.relevance || '') + '</textarea></div>' +
    '<div class="field"><label>תגיות</label><input id="dTags" type="text" list="dlTags" value="' + esc((c.tags || []).join(', ')) + '"><div class="hint">מופרדות בפסיק</div></div>' +
    '<div class="grid2">' +
      fieldInput('dSource', 'מקור', c.source, 'dlSource') +
      fieldInput('dSourceUrl', 'קישור למקור', c.source_url) +
    '</div>' +
    '<div class="field"><label>הערות על המקור</label><textarea id="dSourceNotes" style="min-height:50px">' + esc(c.source_notes || '') + '</textarea></div>' +
    '<div class="field"><label>הערות פרטיות</label><textarea id="dNotes" style="min-height:70px">' + esc(c.notes || '') + '</textarea></div>' +
    '</div>';

  // campaigns — per-campaign state, never written back onto the contact record
  h += '<div class="fieldset"><div class="legend">קמפיינים</div>';
  if ((c.campaigns || []).length) {
    h += '<table><thead><tr><th>קמפיין</th><th>סטטוס</th><th>מעקב</th><th></th></tr></thead><tbody>';
    c.campaigns.forEach(function (x) {
      h += '<tr><td>' + esc(x.campaign_name) + '</td>' +
        '<td><select onchange="setCampaignStatus(' + x.campaign_id + ',' + c.id + ',this.value)">' +
          STATUSES.map(function (p) { return '<option value="' + p[0] + '"' + (x.status === p[0] ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('') +
        '</select></td>' +
        '<td><input type="date" value="' + esc(x.next_follow_up_date ? String(x.next_follow_up_date).slice(0, 10) : '') + '" ' +
          'onchange="setCampaignFollowUp(' + x.campaign_id + ',' + c.id + ',this.value)"></td>' +
        '<td><button class="btn btn-tiny btn-secondary" onclick="removeFromCampaign(' + x.campaign_id + ',' + c.id + ')">הסרה</button></td></tr>';
    });
    h += '</tbody></table>';
  } else {
    h += '<div class="muted" style="font-size:14px;margin-bottom:10px">לא משויך לאף קמפיין.</div>';
  }
  var notIn = CAMPAIGNS.filter(function (cp) {
    return !(c.campaigns || []).some(function (x) { return x.campaign_id === cp.id; });
  });
  if (notIn.length) {
    h += '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">' +
      '<select id="dAddCampaign" style="padding:8px;border:1px solid #ccc;border-radius:4px;font-family:inherit">' +
      notIn.map(function (cp) { return '<option value="' + cp.id + '">' + esc(cp.name) + '</option>'; }).join('') +
      '</select><button class="btn btn-small btn-ghost" onclick="addToCampaign(' + c.id + ')">הוספה לקמפיין</button></div>';
  }
  h += '</div>';

  // outreach templates, ready to copy with the name filled in
  if (TEMPLATES.length) {
    h += '<div class="fieldset"><div class="legend">נוסח לפנייה</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<select id="dTemplate" style="padding:8px;border:1px solid #ccc;border-radius:4px;font-family:inherit;flex:1;min-width:200px">' +
      TEMPLATES.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('') +
      '</select><button class="btn btn-small btn-ghost" onclick="copyTemplateFor(' + c.id + ')">העתקה עם השם</button></div></div>';
  }

  h += '<div class="fieldset"><div class="legend">היסטוריית פניות</div>';
  if (activities.length) {
    h += '<ul class="history">' + activities.map(function (a) {
      return '<li><div class="h-top">' + esc(fmtDate(a.activity_date)) +
        (a.type ? ' · ' + esc(a.type) : '') +
        (a.campaign_name ? ' · ' + esc(a.campaign_name) : '') +
        (a.next_follow_up_date ? ' · מעקב ב־' + esc(fmtDate(a.next_follow_up_date)) : '') +
        ' <button class="btn btn-tiny btn-secondary" style="margin-right:6px" onclick="deleteActivity(' + a.id + ',' + c.id + ')">מחיקה</button></div>' +
        (a.note ? '<div class="h-note">' + esc(a.note) + '</div>' : '') + '</li>';
    }).join('') + '</ul>';
  } else {
    h += '<div class="muted" style="font-size:14px">עדיין לא נרשמה פנייה.</div>';
  }
  h += '</div>';

  h += '<div class="modal-actions">' +
    '<button class="btn btn-danger btn-small" onclick="deleteContact(' + c.id + ')">מחיקת הרשומה</button>' +
    '<span style="flex:1"></span>' +
    '<button class="btn btn-secondary" onclick="closeModal(\'contactOverlay\')">סגירה</button>' +
    '<button class="btn" onclick="saveContact(' + c.id + ')">שמירה</button></div>';

  $('contactBody').innerHTML = h;
}

function linkRow(c) {
  var links = [];
  if (c.email) links.push('<a href="mailto:' + esc(c.email) + '" style="color:#3D7468">מייל</a>');
  if (c.whatsapp) links.push('<a href="https://wa.me/' + esc(String(c.whatsapp).replace(/\D/g, '')) + '" target="_blank" rel="noopener" style="color:#3D7468">וואטסאפ</a>');
  if (c.website) links.push('<a href="' + esc(withProto(c.website)) + '" target="_blank" rel="noopener" style="color:#3D7468">אתר</a>');
  if (c.facebook_url) links.push('<a href="' + esc(withProto(c.facebook_url)) + '" target="_blank" rel="noopener" style="color:#3D7468">פייסבוק</a>');
  if (c.instagram_url) links.push('<a href="' + esc(withProto(c.instagram_url)) + '" target="_blank" rel="noopener" style="color:#3D7468">אינסטגרם</a>');
  if (c.other_url) links.push('<a href="' + esc(withProto(c.other_url)) + '" target="_blank" rel="noopener" style="color:#3D7468">קישור</a>');
  return links.length ? '<div style="font-size:14px;display:flex;gap:14px;flex-wrap:wrap">' + links.join('') + '</div>' : '';
}
function withProto(u) { return /^https?:\/\//i.test(u) ? u : 'https://' + u; }

var DETAIL_FIELDS = {
  dName: 'name', dType: 'record_type', dOrg: 'organisation', dCategory: 'category',
  dSub: 'subcategory_role', dKibbutz: 'kibbutz', dCountry: 'country', dRegion: 'city_region',
  dGkName: 'gatekeeper_name', dGkPos: 'gatekeeper_position', dEmail: 'email', dPhone: 'phone',
  dWhatsapp: 'whatsapp', dMethod: 'preferred_method', dWebsite: 'website',
  dFacebook: 'facebook_url', dInstagram: 'instagram_url', dOther: 'other_url',
  dRelevance: 'relevance', dSource: 'source', dSourceUrl: 'source_url',
  dSourceNotes: 'source_notes', dNotes: 'notes'
};

function saveContact(id) {
  var b = { id: id };
  Object.keys(DETAIL_FIELDS).forEach(function (k) { if ($(k)) b[DETAIL_FIELDS[k]] = val(k); });
  b.tags = val('dTags').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (!b.name) { showMsg('צריך שם.', false); return; }
  jsend(API + '/contacts', 'PUT', b).then(function (d) {
    if (d && d.ok) { showMsg('נשמר.', true); loadNetwork(); openContact(id); }
    else showMsg(errText(d, 'שגיאה בשמירה.'), false);
  }).catch(function () { showMsg('שגיאת חיבור.', false); });
}

function deleteContact(id) {
  askConfirm('מחיקת רשומה', 'למחוק את הרשומה לצמיתות, יחד עם ההיסטוריה שלה? לא ניתן לשחזר.', function () {
    jsend(API + '/contacts', 'DELETE', { id: id }).then(function (d) {
      if (d && d.ok) { closeModal('contactOverlay'); showMsg('נמחק.', true); loadNetwork(); loadDashboard(); }
      else showMsg(errText(d, 'שגיאה במחיקה.'), false);
    });
  });
}

function setCampaignStatus(campaignId, contactId, status) {
  jsend(API + '/campaigns', 'POST', { action: 'set_status', campaign_id: campaignId, contact_id: contactId, status: status })
    .then(function (d) {
      if (d && d.ok) { showMsg('הסטטוס עודכן.', true); loadNetwork(); loadDashboard(); }
      else showMsg(errText(d, 'שגיאה בעדכון.'), false);
    });
}
function setCampaignFollowUp(campaignId, contactId, date) {
  var current = null;
  var c = CONTACTS.filter(function (x) { return x.id === contactId; })[0];
  if (c) {
    var link = (c.campaigns || []).filter(function (x) { return x.campaign_id === campaignId; })[0];
    if (link) current = link.status;
  }
  jsend(API + '/campaigns', 'POST', {
    action: 'set_status', campaign_id: campaignId, contact_id: contactId,
    status: current || 'not_contacted', next_follow_up_date: date
  }).then(function (d) {
    if (d && d.ok) { showMsg('תאריך המעקב נשמר.', true); loadNetwork(); loadDashboard(); }
    else showMsg(errText(d, 'שגיאה בעדכון.'), false);
  });
}
function addToCampaign(contactId) {
  var cid = val('dAddCampaign');
  if (!cid) return;
  jsend(API + '/campaigns', 'POST', { action: 'add', campaign_id: cid, contact_ids: [contactId] })
    .then(function (d) {
      if (d && d.ok) { showMsg('נוסף לקמפיין.', true); loadNetwork(); openContact(contactId); }
      else showMsg(errText(d, 'שגיאה בהוספה.'), false);
    });
}
function removeFromCampaign(campaignId, contactId) {
  askConfirm('הסרה מהקמפיין', 'להסיר את איש הקשר מהקמפיין? הרשומה עצמה וההיסטוריה יישארו.', function () {
    jsend(API + '/campaigns', 'POST', { action: 'remove', campaign_id: campaignId, contact_id: contactId })
      .then(function () { loadNetwork(); openContact(contactId); loadDashboard(); });
  });
}
function copyTemplateFor(contactId) {
  var tid = Number(val('dTemplate'));
  var t = TEMPLATES.filter(function (x) { return x.id === tid; })[0];
  if (!t) return;
  var c = CONTACTS.filter(function (x) { return x.id === contactId; })[0] || { name: '' };
  var target = c.gatekeeper_name || c.name || '';
  copyText(String(t.body).replace(/\{\{name\}\}/g, target));
}

/* ----------------------------------------------------------------- activity -- */
function openActivity(contactId) {
  actContactId = contactId;
  $('actDate').value = today();
  $('actType').value = '';
  $('actNote').value = '';
  $('actFollow').value = '';
  $('actStatus').value = '';
  var c = CONTACTS.filter(function (x) { return x.id === contactId; })[0];
  var inCampaign = c && (c.campaigns || []).length ? c.campaigns[0].campaign_id : (CAMPAIGNS.length ? CAMPAIGNS[0].id : '');
  $('actCampaign').value = inCampaign || '';
  $('actTitle').textContent = 'רישום פנייה' + (c ? ' — ' + c.name : '');
  openModal('activityOverlay');
  setTimeout(function () { $('actNote').focus(); }, 60);
}
function saveActivity() {
  if (!actContactId) return;
  var b = {
    contact_id: actContactId,
    campaign_id: val('actCampaign') || null,
    activity_date: val('actDate') || today(),
    type: val('actType'),
    note: val('actNote'),
    next_follow_up_date: val('actFollow') || null
  };
  if (val('actStatus')) b.set_status = val('actStatus');
  jsend(API + '/activities', 'POST', b).then(function (d) {
    if (d && d.ok) {
      closeModal('activityOverlay');
      showMsg('הפנייה נרשמה.', true);
      loadNetwork(); loadDashboard();
      if (openContactId) openContact(openContactId);
    } else showMsg(errText(d, 'שגיאה בשמירה.'), false);
  }).catch(function () { showMsg('שגיאת חיבור.', false); });
}
function deleteActivity(id, contactId) {
  askConfirm('מחיקת רישום', 'למחוק את הרישום מההיסטוריה?', function () {
    jsend(API + '/activities', 'DELETE', { id: id }).then(function () {
      loadNetwork(); loadDashboard(); openContact(contactId);
    });
  });
}

/* ---------------------------------------------------------------- campaigns -- */
function loadCampaigns() {
  jget(API + '/campaigns').then(function (d) {
    if (!d || !d.ok) { showMsg('שגיאה בטעינת הקמפיינים.', false); return; }
    flagMigration(d);
    CAMPAIGNS = d.campaigns || [];
    LOADED.campaigns = true;
    renderCampaigns();
  });
}
function renderCampaigns() {
  $('campaignDetail').style.display = 'none';
  var el = $('campaignsList');
  el.style.display = 'block';
  var h = '<div class="toolbar" style="justify-content:space-between">' +
    '<div class="muted" style="font-size:14px">מצב הפנייה נשמר לכל קמפיין בנפרד — אותו איש קשר יכול להיות ״הופץ״ כאן ו״לא פנינו״ בקמפיין הבא.</div>' +
    '<button class="btn btn-small" onclick="openCampaign(null)">+ קמפיין חדש</button></div>';

  if (!CAMPAIGNS.length) {
    h += '<div class="empty">אין עדיין קמפיינים.</div>';
    el.innerHTML = h;
    return;
  }
  CAMPAIGNS.forEach(function (c) {
    var chips = STATUSES.filter(function (p) { return c.counts && c.counts[p[0]]; })
      .map(function (p) { return '<span class="status st-' + p[0] + '" style="margin-left:6px">' + esc(p[1]) + ': ' + c.counts[p[0]] + '</span>'; })
      .join(' ');
    h += '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
        '<h3>' + esc(c.name) + (c.status === 'archived' ? ' <span class="chip">בארכיון</span>' : '') + '</h3>' +
        '<div class="muted" style="font-size:14px">' + (c.total || 0) + ' אנשי קשר</div></div>' +
      (c.description ? '<div class="meta">' + esc(c.description) + '</div>' : '') +
      (c.main_link ? '<div class="meta"><a href="' + esc(withProto(c.main_link)) + '" target="_blank" rel="noopener" style="color:#3D7468">' + esc(c.main_link) + '</a></div>' : '') +
      '<div style="line-height:2.2;margin-bottom:10px">' + (chips || '<span class="muted">עדיין לא נוספו אנשי קשר.</span>') + '</div>' +
      '<div class="actions">' +
        '<button class="btn btn-small" onclick="openCampaignDetail(' + c.id + ')">פתיחה</button>' +
        '<button class="btn btn-small btn-ghost" onclick="openCampaign(' + c.id + ')">עריכה</button>' +
        '<button class="btn btn-small btn-danger" onclick="deleteCampaign(' + c.id + ')">מחיקה</button>' +
      '</div></div>';
  });
  el.innerHTML = h;
}

function openCampaignDetail(id) {
  jget(API + '/campaigns?id=' + id).then(function (d) {
    if (!d || !d.ok) { showMsg('שגיאה בטעינה.', false); return; }
    $('campaignsList').style.display = 'none';
    var el = $('campaignDetail');
    el.style.display = 'block';
    var c = d.campaign, members = d.members || [];

    var h = '<div class="toolbar" style="justify-content:space-between">' +
      '<button class="btn btn-small btn-ghost" onclick="renderCampaigns()">→ לכל הקמפיינים</button>' +
      '<div style="display:flex;gap:8px"><button class="btn btn-small" onclick="openPick(' + c.id + ')">+ הוספת אנשי קשר</button>' +
      '<button class="btn btn-small btn-ghost" onclick="openCampaign(' + c.id + ')">עריכת הקמפיין</button></div></div>';

    h += '<div class="card"><h3>' + esc(c.name) + '</h3>' +
      (c.description ? '<div class="meta">' + esc(c.description) + '</div>' : '') +
      (c.target_audience ? '<div class="meta"><strong>קהל היעד:</strong> ' + esc(c.target_audience) + '</div>' : '') +
      (c.main_link ? '<div class="meta"><a href="' + esc(withProto(c.main_link)) + '" target="_blank" rel="noopener" style="color:#3D7468">' + esc(c.main_link) + '</a></div>' : '') +
      (c.flyer_ref ? '<div class="meta"><strong>חומר מצורף:</strong> ' + esc(c.flyer_ref) + '</div>' : '') +
      (c.notes ? '<div class="meta">' + esc(c.notes) + '</div>' : '') +
      '</div>';

    if (!members.length) {
      h += '<div class="empty">עדיין לא נוספו אנשי קשר לקמפיין הזה.</div>';
      el.innerHTML = h;
      return;
    }

    h += '<div class="count-line">' + members.length + ' אנשי קשר</div>';
    h += '<div class="table-wrap"><table><thead><tr>' +
      '<th>שם</th><th>מקום</th><th>דרך פנייה</th><th>סטטוס</th><th>מעקב</th><th>פעילות אחרונה</th><th></th>' +
      '</tr></thead><tbody>';
    members.forEach(function (m) {
      var place = [m.kibbutz, m.city_region, m.country].filter(Boolean).join(' · ');
      h += '<tr>' +
        '<td class="name" onclick="openContact(' + m.id + ')">' + esc(m.name) +
          (m.organisation ? '<span class="sub">' + esc(m.organisation) + '</span>' : '') + '</td>' +
        '<td>' + esc(place) + '</td>' +
        '<td>' + esc([m.preferred_method, m.email, m.phone || m.whatsapp].filter(Boolean)[0] || '') + '</td>' +
        '<td><select onchange="setCampaignStatus(' + c.id + ',' + m.id + ',this.value);">' +
          STATUSES.map(function (p) { return '<option value="' + p[0] + '"' + (m.status === p[0] ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('') +
        '</select></td>' +
        '<td><input type="date" value="' + esc(m.next_follow_up_date ? String(m.next_follow_up_date).slice(0, 10) : '') + '" onchange="setCampaignFollowUp(' + c.id + ',' + m.id + ',this.value)"></td>' +
        '<td>' + (m.last_activity ? esc(fmtDate(m.last_activity)) : '<span class="muted">—</span>') + '</td>' +
        '<td><button class="btn btn-tiny btn-ghost" onclick="openActivity(' + m.id + ')">רישום</button></td>' +
        '</tr>';
    });
    h += '</tbody></table></div>';
    el.innerHTML = h;
    el.setAttribute('data-campaign', c.id);
  });
}

function openCampaign(id) {
  editCampaignId = id;
  var c = id ? CAMPAIGNS.filter(function (x) { return x.id === id; })[0] : null;
  $('campTitle').textContent = c ? 'עריכת קמפיין' : 'קמפיין חדש';
  $('cName').value = c ? c.name || '' : '';
  $('cDescription').value = c ? c.description || '' : '';
  $('cStart').value = c && c.start_date ? String(c.start_date).slice(0, 10) : '';
  $('cEnd').value = c && c.end_date ? String(c.end_date).slice(0, 10) : '';
  $('cAudience').value = c ? c.target_audience || '' : '';
  $('cLink').value = c ? c.main_link || '' : 'https://www.beityeladim.co.il';
  $('cFlyer').value = c ? c.flyer_ref || '' : '';
  $('cNotes').value = c ? c.notes || '' : '';
  $('cStatus').value = c ? c.status || 'active' : 'active';
  openModal('campaignOverlay');
}
function saveCampaign() {
  var b = {
    name: val('cName'), description: val('cDescription'),
    start_date: val('cStart'), end_date: val('cEnd'),
    target_audience: val('cAudience'), main_link: val('cLink'),
    flyer_ref: val('cFlyer'), notes: val('cNotes'), status: val('cStatus')
  };
  if (!b.name) { showMsg('צריך שם לקמפיין.', false); return; }
  if (editCampaignId) b.id = editCampaignId;
  jsend(API + '/campaigns', editCampaignId ? 'PUT' : 'POST', b).then(function (d) {
    if (d && d.ok) { closeModal('campaignOverlay'); showMsg('נשמר.', true); loadCampaigns(); loadNetwork(); }
    else showMsg(errText(d, 'שגיאה בשמירה.'), false);
  });
}
function deleteCampaign(id) {
  askConfirm('מחיקת קמפיין', 'למחוק את הקמפיין? אנשי הקשר יישארו ברשת, אבל הסטטוסים שלהם בקמפיין הזה יימחקו.', function () {
    jsend(API + '/campaigns', 'DELETE', { id: id }).then(function () {
      showMsg('נמחק.', true); loadCampaigns(); loadNetwork(); loadDashboard();
    });
  });
}

/* pick contacts to add to a campaign */
function openPick(campaignId) {
  PICK = { campaignId: campaignId, selected: {} };
  $('pickSub').textContent = 'סימון אנשי קשר להוספה. מי שכבר בקמפיין לא מופיע ברשימה.';
  $('pickSearch').value = '';
  renderPick();
  openModal('pickOverlay');
}
function pickCandidates() {
  var q = $('pickSearch').value.trim().toLowerCase();
  return CONTACTS.filter(function (c) {
    if ((c.campaigns || []).some(function (x) { return x.campaign_id === PICK.campaignId; })) return false;
    if (!q) return true;
    var hay = SEARCH_FIELDS.map(function (k) { return c[k] || ''; }).join(' ') + ' ' + (c.tags || []).join(' ');
    return hay.toLowerCase().indexOf(q) > -1;
  });
}
function renderPick() {
  var items = pickCandidates();
  $('pickList').innerHTML = items.length ? items.map(function (c) {
    return '<label style="display:flex;gap:10px;align-items:center;padding:8px 12px;border-bottom:1px solid #f0efea;font-size:14px;cursor:pointer">' +
      '<input type="checkbox" ' + (PICK.selected[c.id] ? 'checked' : '') + ' onchange="togglePick(' + c.id + ',this.checked)">' +
      '<span><strong>' + esc(c.name) + '</strong>' +
      (c.organisation || c.kibbutz ? ' <span class="muted">· ' + esc(c.organisation || c.kibbutz) + '</span>' : '') +
      (c.category ? ' <span class="chip">' + esc(c.category) + '</span>' : '') + '</span></label>';
  }).join('') : '<div class="empty">אין אנשי קשר להוספה.</div>';
  $('pickCount').textContent = Object.keys(PICK.selected).length;
}
function togglePick(id, on) {
  if (on) PICK.selected[id] = 1; else delete PICK.selected[id];
  $('pickCount').textContent = Object.keys(PICK.selected).length;
}
$('pickSearch').addEventListener('input', renderPick);
function confirmPick() {
  var ids = Object.keys(PICK.selected).map(Number);
  if (!ids.length) { closeModal('pickOverlay'); return; }
  jsend(API + '/campaigns', 'POST', { action: 'add', campaign_id: PICK.campaignId, contact_ids: ids })
    .then(function (d) {
      closeModal('pickOverlay');
      if (d && d.ok) {
        showMsg('נוספו ' + d.added + ' אנשי קשר.', true);
        loadNetwork(); loadDashboard(); openCampaignDetail(PICK.campaignId);
      } else showMsg(errText(d, 'שגיאה בהוספה.'), false);
    });
}

/* ---------------------------------------------------------------- templates -- */
function loadTemplates() {
  return jget(API + '/outreach-templates').then(function (d) {
    if (!d || !d.ok) { showMsg('שגיאה בטעינת הנוסחים.', false); return; }
    flagMigration(d);
    TEMPLATES = d.templates || [];
    LOADED.templates = true;
    renderTemplates();
  });
}
function renderTemplates() {
  if (!TEMPLATES.length) { $('templatesList').innerHTML = '<div class="empty">אין עדיין נוסחים.</div>'; return; }
  $('templatesList').innerHTML = TEMPLATES.map(function (t) {
    return '<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">' +
      '<h3>' + esc(t.name) + '</h3>' +
      (t.type ? '<span class="chip">' + esc(t.type) + '</span>' : '') + '</div>' +
      '<div class="tmpl-body" style="margin:10px 0 12px">' + esc(t.body) + '</div>' +
      '<div class="actions">' +
        '<button class="btn btn-small" onclick="copyTemplate(' + t.id + ')">העתקה</button>' +
        '<button class="btn btn-small btn-ghost" onclick="openTemplate(' + t.id + ')">עריכה</button>' +
      '</div></div>';
  }).join('');
}
function copyTemplate(id) {
  var t = TEMPLATES.filter(function (x) { return x.id === id; })[0];
  if (t) copyText(t.body);
}
function openTemplate(id) {
  editTemplateId = id;
  var t = id ? TEMPLATES.filter(function (x) { return x.id === id; })[0] : null;
  $('tmplTitle').textContent = t ? 'עריכת נוסח' : 'נוסח חדש';
  $('tName').value = t ? t.name : '';
  $('tType').value = t ? (t.type || '') : '';
  $('tBody').value = t ? t.body : '';
  $('tDelete').style.display = t ? 'inline-block' : 'none';
  openModal('templateOverlay');
}
function saveTemplate() {
  var b = { name: val('tName'), type: val('tType'), body: $('tBody').value };
  if (!b.name) { showMsg('צריך שם לנוסח.', false); return; }
  if (editTemplateId) b.id = editTemplateId;
  jsend(API + '/outreach-templates', editTemplateId ? 'PUT' : 'POST', b).then(function (d) {
    if (d && d.ok) { closeModal('templateOverlay'); showMsg('נשמר.', true); loadTemplates(); }
    else showMsg(errText(d, 'שגיאה בשמירה.'), false);
  });
}
function deleteTemplate() {
  if (!editTemplateId) return;
  var id = editTemplateId;
  askConfirm('מחיקת נוסח', 'למחוק את הנוסח?', function () {
    jsend(API + '/outreach-templates', 'DELETE', { id: id }).then(function () {
      closeModal('templateOverlay'); showMsg('נמחק.', true); loadTemplates();
    });
  });
}

/* --------------------------------------------------------------------- tags -- */
function openTags() {
  jget(API + '/tags').then(function (d) {
    if (!d || !d.ok) return;
    TAGS = d.tags || [];
    renderTags();
    $('newTag').value = '';
    openModal('tagsOverlay');
  });
}
function renderTags() {
  $('tagsList').innerHTML = TAGS.length ? TAGS.map(function (t) {
    return '<div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #f0efea">' +
      '<input type="text" value="' + esc(t.name) + '" id="tag' + t.id + '" style="flex:1;padding:7px;border:1px solid #ccc;border-radius:4px;font-family:inherit;font-size:14px">' +
      '<span class="muted" style="font-size:13px;min-width:52px">' + t.contact_count + ' רשומות</span>' +
      '<button class="btn btn-tiny btn-ghost" onclick="renameTag(' + t.id + ')">שמירה</button>' +
      '<button class="btn btn-tiny btn-danger" onclick="deleteTag(' + t.id + ')">מחיקה</button></div>';
  }).join('') : '<div class="muted" style="font-size:14px;padding:10px 0">אין עדיין תגיות.</div>';
}
function addTag() {
  var name = val('newTag');
  if (!name) return;
  jsend(API + '/tags', 'POST', { name: name }).then(function (d) {
    if (d && d.ok) { $('newTag').value = ''; openTags(); loadNetwork(); }
    else showMsg(errText(d, 'שגיאה בהוספה.'), false);
  });
}
function renameTag(id) {
  var name = val('tag' + id);
  if (!name) return;
  jsend(API + '/tags', 'PUT', { id: id, name: name }).then(function (d) {
    if (d && d.ok) { showMsg('נשמר.', true); openTags(); loadNetwork(); }
    else showMsg(d && d.error === 'duplicate_name' ? 'כבר קיימת תגית בשם הזה.' : errText(d, 'שגיאה בשמירה.'), false);
  });
}
function deleteTag(id) {
  askConfirm('מחיקת תגית', 'למחוק את התגית? אנשי הקשר יישארו — רק התגית תוסר מהם.', function () {
    jsend(API + '/tags', 'DELETE', { id: id }).then(function () { openTags(); loadNetwork(); });
  });
}

/* ----------------------------------------------------------------- CSV I/O -- */
function exportCsv() {
  fetch(API + '/contacts?format=csv', { headers: authHeader() })
    .then(function (r) { return r.text(); })
    .then(function (text) {
      var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'רשת-הפצה-' + today() + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    })
    .catch(function () { showMsg('שגיאה בייצוא.', false); });
}

// A small RFC-4180-ish parser: handles quoted fields, embedded commas/newlines
// and doubled quotes. Enough for anything Excel or Google Sheets exports.
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  var rows = [], row = [], field = '', inQ = false, i = 0;
  while (i < text.length) {
    var ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
}

// Header guesses, Hebrew and English. Unmatched columns default to "ignore",
// so a wrong guess is never silently imported.
var HEADER_HINTS = {
  name: ['name', 'שם', 'שם מלא', 'contact', 'איש קשר'],
  organisation: ['organisation', 'organization', 'org', 'ארגון', 'מוסד', 'חברה'],
  kibbutz: ['kibbutz', 'קיבוץ'],
  country: ['country', 'מדינה'],
  city_region: ['city', 'region', 'עיר', 'אזור', 'ישוב', 'יישוב'],
  category: ['category', 'קטגוריה', 'סוג'],
  subcategory_role: ['role', 'subcategory', 'תפקיד', 'תת קטגוריה', 'תת־קטגוריה'],
  gatekeeper_name: ['gatekeeper', 'admin', 'גייטקיפר', 'מנהל הקבוצה', 'איש קשר בשער'],
  gatekeeper_position: ['gatekeeper position', 'תפקיד הגייטקיפר'],
  email: ['email', 'e-mail', 'mail', 'מייל', 'אימייל', 'דוא"ל', 'דואל'],
  phone: ['phone', 'tel', 'mobile', 'טלפון', 'נייד'],
  whatsapp: ['whatsapp', 'וואטסאפ', 'ווטסאפ'],
  website: ['website', 'site', 'url', 'אתר'],
  facebook_url: ['facebook', 'fb', 'פייסבוק'],
  instagram_url: ['instagram', 'אינסטגרם'],
  other_url: ['other url', 'link', 'קישור'],
  preferred_method: ['preferred', 'method', 'דרך פנייה', 'ערוץ'],
  relevance: ['relevance', 'why', 'רלוונטי', 'רלוונטיות'],
  source: ['source', 'מקור'],
  source_url: ['source url', 'קישור למקור'],
  source_notes: ['source notes', 'הערות מקור'],
  notes: ['notes', 'note', 'הערות', 'הערה'],
  record_type: ['record type', 'סוג רשומה'],
  tags: ['tags', 'tag', 'תגיות', 'תגית']
};
function guessField(header) {
  var h = String(header || '').trim().toLowerCase();
  if (!h) return '';
  for (var f in HEADER_HINTS) {
    if (HEADER_HINTS[f].some(function (hint) { return h === hint.toLowerCase(); })) return f;
  }
  for (var f2 in HEADER_HINTS) {
    if (HEADER_HINTS[f2].some(function (hint) { return h.indexOf(hint.toLowerCase()) > -1; })) return f2;
  }
  return '';
}

$('csvFile').addEventListener('change', function (e) {
  if (e.target.files && e.target.files[0]) readCsvFile(e.target.files[0]);
});
$('drop').addEventListener('dragover', function (e) { e.preventDefault(); });
$('drop').addEventListener('drop', function (e) {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files[0]) readCsvFile(e.dataTransfer.files[0]);
});

function readCsvFile(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var rows = parseCsv(String(reader.result));
    if (rows.length < 2) { showMsg('הקובץ ריק או שיש בו שורת כותרות בלבד.', false); return; }
    IMPORT = { headers: rows[0], rows: rows.slice(1), map: rows[0].map(guessField), preview: null };
    renderMapping();
  };
  reader.readAsText(file, 'UTF-8');
}

function renderMapping() {
  var opts = '<option value="">— לא לייבא —</option>' +
    FIELD_ORDER.map(function (f) { return '<option value="' + f + '">' + esc(FIELD_LABELS[f]) + '</option>'; }).join('');
  var h = '<h3 class="section-title">התאמת עמודות</h3>' +
    '<div class="muted" style="font-size:13px;margin-bottom:12px">' + IMPORT.rows.length + ' שורות בקובץ. עמודה שלא הותאמה פשוט לא תיובא.</div>';
  h += '<div class="map-row" style="font-weight:600;color:#6E7C78;font-size:13px"><div>עמודה בקובץ</div><div>שדה במערכת</div></div>';
  IMPORT.headers.forEach(function (hd, i) {
    var sample = (IMPORT.rows[0] || [])[i] || '';
    h += '<div class="map-row">' +
      '<div class="src" title="' + esc(sample) + '">' + esc(hd || '(ללא כותרת)') +
        (sample ? ' <span class="muted">— ' + esc(String(sample).slice(0, 30)) + '</span>' : '') + '</div>' +
      '<select onchange="IMPORT.map[' + i + ']=this.value">' + opts + '</select></div>';
  });
  h += '<div class="grid2" style="margin-top:14px">' +
    '<div class="field"><label>הוספה לקמפיין</label><select id="impCampaign"><option value="">— ללא —</option>' +
      CAMPAIGNS.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="field"><label>סטטוס התחלתי בקמפיין</label><select id="impStatus">' +
      STATUSES.map(function (p) { return '<option value="' + p[0] + '">' + esc(p[1]) + '</option>'; }).join('') +
    '</select></div></div>';
  h += '<div class="actions"><button class="btn btn-small" onclick="runPreview()">בדיקת כפילויות</button>' +
       '<button class="btn btn-small btn-secondary" onclick="cancelImport()">ביטול</button></div>';
  h += '<div id="importResult" style="margin-top:16px"></div>';
  $('importArea').innerHTML = h;

  // apply the guessed mapping to the freshly rendered selects
  var sels = $('importArea').querySelectorAll('.map-row select');
  for (var i = 0; i < sels.length; i++) sels[i].value = IMPORT.map[i] || '';
}
function cancelImport() { IMPORT = null; $('importArea').innerHTML = ''; $('csvFile').value = ''; }

function mappedRows() {
  return IMPORT.rows.map(function (r) {
    var o = {};
    IMPORT.map.forEach(function (f, i) {
      if (!f) return;
      var v = (r[i] === undefined ? '' : String(r[i])).trim();
      if (!v) return;
      if (f === 'tags') o.tags = v.split(/[;,|]/).map(function (s) { return s.trim(); }).filter(Boolean);
      else o[f] = v;
    });
    return o;
  });
}

var IMPORT_BATCH = 200; // well under Vercel's ~4.5 MB request-body limit

function runPreview() {
  var rows = mappedRows();
  if (!rows.length) { showMsg('אין שורות לייבוא.', false); return; }
  if (!IMPORT.map.some(function (f) { return f === 'name'; })) {
    showMsg('חייבת להיות עמודה שממופה ל״שם״.', false); return;
  }
  $('importResult').innerHTML = '<div class="muted">בודק כפילויות…</div>';
  batchPost('preview', rows, [], function (results) {
    IMPORT.preview = results;
    renderPreview(rows, results);
  });
}

// Sends the rows in batches, concatenating each response's results.
function batchPost(mode, rows, extraKeys, done) {
  var results = [], i = 0;
  function next() {
    if (i >= rows.length) { done(results); return; }
    var slice = rows.slice(i, i + IMPORT_BATCH);
    var offset = i;
    var body = { mode: mode, rows: slice };
    if (mode === 'commit') {
      if (val('impCampaign')) { body.campaign_id = val('impCampaign'); body.campaign_status = val('impStatus'); }
    }
    jsend(API + '/import', 'POST', body).then(function (d) {
      if (!d || !d.ok) {
        $('importResult').innerHTML = '<div class="msg msg-err">שגיאה בייבוא' +
          (d && d.error === 'migration_needed' ? ' — יש להריץ קודם את קובץ המיגרציה.' : '.') + '</div>';
        return;
      }
      if (mode === 'preview') {
        (d.results || []).forEach(function (r) { r.index += offset; results.push(r); });
      } else {
        (d.created || []).forEach(function (r) { r.index += offset; results.push({ ok: true, row: r }); });
        (d.skipped || []).forEach(function (r) { r.index += offset; results.push({ ok: false, row: r }); });
      }
      i += IMPORT_BATCH;
      next();
    }).catch(function () {
      $('importResult').innerHTML = '<div class="msg msg-err">שגיאת חיבור באמצע הייבוא. אפשר לנסות שוב — שורות שכבר נוצרו יזוהו כפילויות.</div>';
    });
  }
  next();
}

function renderPreview(rows, results) {
  var clean = results.filter(function (r) { return !r.error && !(r.duplicates || []).length; });
  var dupes = results.filter(function (r) { return (r.duplicates || []).length; });
  var bad = results.filter(function (r) { return r.error; });

  var h = '<div class="card"><h3>תוצאות הבדיקה</h3>' +
    '<div class="meta">' + clean.length + ' חדשים · ' + dupes.length + ' עם רשומה דומה קיימת' +
    (bad.length ? ' · ' + bad.length + ' ללא שם (יידלגו)' : '') + '</div>';

  if (dupes.length) {
    h += '<div class="muted" style="font-size:13px;margin-bottom:8px">שום דבר לא אוחד. לסמן מה לייבא בכל זאת:</div>';
    h += '<div style="max-height:300px;overflow-y:auto;border:1px solid #eee;border-radius:6px">';
    dupes.forEach(function (r) {
      h += '<label style="display:flex;gap:10px;padding:9px 12px;border-bottom:1px solid #f0efea;font-size:14px;cursor:pointer">' +
        '<input type="checkbox" class="dupCheck" data-index="' + r.index + '">' +
        '<span><strong>' + esc(r.name) + '</strong><br><span class="muted">דומה ל: ' +
        esc(r.duplicates.map(function (d) { return d.name + ' (' + d.reasons.join(', ') + ')'; }).join(' · ')) +
        '</span></span></label>';
    });
    h += '</div>';
    h += '<div style="margin-top:8px"><button class="btn btn-tiny btn-ghost" onclick="toggleAllDupes(true)">סימון הכל</button> ' +
         '<button class="btn btn-tiny btn-ghost" onclick="toggleAllDupes(false)">ניקוי</button></div>';
  }

  h += '<div class="actions" style="margin-top:14px">' +
    '<button class="btn btn-small" onclick="runCommit()">ייבוא</button>' +
    '<button class="btn btn-small btn-secondary" onclick="cancelImport()">ביטול</button></div></div>';
  $('importResult').innerHTML = h;
}
function toggleAllDupes(on) {
  var boxes = document.querySelectorAll('.dupCheck');
  for (var i = 0; i < boxes.length; i++) boxes[i].checked = on;
}

function runCommit() {
  var rows = mappedRows();
  var forced = {};
  var boxes = document.querySelectorAll('.dupCheck');
  for (var i = 0; i < boxes.length; i++) {
    if (boxes[i].checked) forced[Number(boxes[i].getAttribute('data-index'))] = 1;
  }
  // Rows flagged as duplicates and NOT ticked are dropped before sending.
  var dupIndex = {};
  (IMPORT.preview || []).forEach(function (r) { if ((r.duplicates || []).length) dupIndex[r.index] = 1; });

  var toSend = [];
  rows.forEach(function (r, i) {
    if (dupIndex[i] && !forced[i]) return;
    if (forced[i]) r.force = true;
    toSend.push(r);
  });
  if (!toSend.length) { showMsg('אין שורות לייבוא אחרי הסינון.', false); return; }

  $('importResult').innerHTML = '<div class="muted">מייבא ' + toSend.length + ' שורות…</div>';
  batchPost('commit', toSend, [], function (results) {
    var created = results.filter(function (r) { return r.ok; }).length;
    var skipped = results.filter(function (r) { return !r.ok; }).length;
    $('importResult').innerHTML = '<div class="msg msg-ok">יובאו ' + created + ' אנשי קשר' +
      (skipped ? ' · ' + skipped + ' דולגו' : '') + '.</div>';
    $('csvFile').value = '';
    IMPORT = null;
    loadNetwork(); loadDashboard();
  });
}

/* ------------------------------------------------------------------- wiring -- */
['addOverlay', 'dupOverlay', 'contactOverlay', 'activityOverlay', 'campaignOverlay',
 'templateOverlay', 'tagsOverlay', 'pickOverlay', 'confirmOverlay'].forEach(function (id) {
  var el = $(id);
  if (el) el.addEventListener('click', function (e) { if (e.target === this) closeModal(id); });
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  var open = document.querySelectorAll('.modal-overlay.active');
  if (open.length) closeModal(open[open.length - 1].id);
});
// Templates are needed inside the contact card, so fetch them once up front.
setTimeout(function () { if (PW && !LOADED.templates) loadTemplates(); }, 400);
