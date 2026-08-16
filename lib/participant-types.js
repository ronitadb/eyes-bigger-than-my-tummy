// The three groups someone can register for.
//
// Single source of truth on purpose: this value decides which reminder emails a
// person receives (lib/admin/send-email.js getRecipients() matches on the
// substrings 'להורים', 'לילדי' and 'שתי הקבוצות'). It is written by the public
// sign-up form via api/join.js and edited by /admin/zoom → משתתפים. If those two
// ever held their own copies and one drifted, a participant could be given a
// group that silently matches no reminder filter.

const PARTICIPANT_TYPES = [
  'מפגש זום ראשון ושני - להורים',
  'מפגש זום ראשון ושני - לילדי ביתלדים',
  'אבקש להצטרף למפגשים של שתי הקבוצות',
];

function isValidType(value) {
  return PARTICIPANT_TYPES.indexOf(value) > -1;
}

module.exports = { PARTICIPANT_TYPES, isValidType };
