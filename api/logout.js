const { clearedCookie, send, route } = require('./_lib');

module.exports = route(['POST'], async (req, res) => {
  res.setHeader('Set-Cookie', clearedCookie());
  send(res, 200, { ok: true });
});
