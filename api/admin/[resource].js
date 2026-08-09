// Single dynamic route for all admin endpoints, kept as ONE serverless function
// to stay within the Vercel Hobby 12-function limit. Vercel maps the path segment
// to req.query.resource, e.g. /api/admin/meetings -> resource === 'meetings'.
// The actual handlers live in /lib/admin (outside /api, so they aren't counted
// as functions) and are unchanged — each still does its own auth check.

const handlers = {
  'content': require('../../lib/admin/content'),
  'meetings': require('../../lib/admin/meetings'),
  'participants': require('../../lib/admin/participants'),
  'send-email': require('../../lib/admin/send-email'),
  'stories': require('../../lib/admin/stories'),
  'templates': require('../../lib/admin/templates'),
};

module.exports = async (req, res) => {
  const handler = handlers[req.query.resource];
  if (!handler) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  return handler(req, res);
};
