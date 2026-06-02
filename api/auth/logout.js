'use strict';
const { clearSessionCookie } = require('../_lib/auth');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
};
