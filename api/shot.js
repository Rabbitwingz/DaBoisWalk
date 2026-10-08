const { USERS, KEYS, redis, writeAndLoad, requireUser, checkDate, send, readBody, route, HttpError } = require('./_lib');

const MAX_CHARS = 1500000; // about 1.1 MB of image data after base64
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

module.exports = route(['GET', 'POST'], async (req, res) => {
  const user = requireUser(req);

  if (req.method === 'GET') {
    // Either person can view either screenshot.
    const q = new URL(req.url, 'http://x').searchParams;
    const who = q.get('u'), date = q.get('d');
    if (!Object.hasOwn(USERS, who || '') || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new HttpError(400, 'Unknown screenshot.');
    const [img] = await redis([['GET', KEYS.shot(who + ':' + date)]]);
    const m = typeof img === 'string' ? img.match(DATA_URL) : null;
    if (!m) throw new HttpError(404, 'No screenshot for that day.');
    res.statusCode = 200;
    res.setHeader('Content-Type', m[1]);
    // Safe to cache forever: the page always requests it with ?v=<upload time>.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return res.end(Buffer.from(m[2], 'base64'));
  }

  // POST: add, replace or remove the signed-in person's own screenshot.
  const b = readBody(req);
  const field = user + ':' + checkDate(b.date);

  if (b.remove === true) {
    return send(res, 200, await writeAndLoad([['DEL', KEYS.shot(field)], ['HDEL', KEYS.shots, field]]));
  }

  if (typeof b.image === 'string' && b.image.length > MAX_CHARS) throw new HttpError(413, 'That screenshot is too large. Try a smaller image.');
  if (typeof b.image !== 'string' || !DATA_URL.test(b.image)) throw new HttpError(400, 'Send the screenshot as a PNG, JPEG or WebP image.');

  // The upload time is set here, on the server, so the 11:55 pm deadline check can't be faked.
  send(res, 200, await writeAndLoad([['SET', KEYS.shot(field), b.image], ['HSET', KEYS.shots, field, String(Date.now())]]));
});
