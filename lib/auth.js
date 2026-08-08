function checkAdmin(req) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const header = req.headers['x-admin-password'] || '';
  return header === password;
}

module.exports = { checkAdmin };
