const { redis, loadAll, requireUser, checkDate, send, readBody, route, HttpError, USERS } = require('./_lib');

const MAX_CHARS = 1500000; // about 1.1 MB of image data after base64
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

async function readDay(field) {
  const [raw] = await redis([['HGET', 'wc:days', field]]);
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

module.exports = route(['GET', 'POST'], async (req, res) => {
  const user = requireUser(req);

  if (req.method === 'GET') {
    // Either person can view either screenshot.
    const q = new URL(req.url, 'http://x').searchParams;
    const who = q.get('u'), date = q.get('d');
    if (!USERS[who] || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new HttpError(400, 'Unknown screenshot.');
    const [img] = await redis([['GET', 'wc:shot:' + who + ':' + date]]);
    const m = typeof img === 'string' ? img.match(DATA_URL) : null;
    if (!m) throw new HttpError(404, 'No screenshot for that day.');
    res.statusCode = 200;
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return res.end(Buffer.from(m[2], 'base64'));
  }

  // POST: add, replace or remove the signed-in person's own screenshot.
  const b = readBody(req);
  const date = checkDate(b.date);
  const field = user + ':' + date;
  const shotKey = 'wc:shot:' + field;
  const prev = await readDay(field) || { steps: null, alcohol: null };

  if (b.remove === true) {
    const next = Object.assign({}, prev, { shotAt: null, updatedAt: Date.now() });
    const empty = next.steps == null && !next.alcohol;
    await redis([['DEL', shotKey], empty ? ['HDEL', 'wc:days', field] : ['HSET', 'wc:days', field, JSON.stringify(next)]]);
    return send(res, 200, await loadAll());
  }

  if (typeof b.image !== 'string' || !DATA_URL.test(b.image)) throw new HttpError(400, 'Send the screenshot as a PNG, JPEG or WebP image.');
  if (b.image.length > MAX_CHARS) throw new HttpError(413, 'That screenshot is too large. Try a smaller image.');

  // The upload time is set here, on the server, so the 11:55 pm deadline check can't be faked.
  const next = Object.assign({}, prev, { shotAt: Date.now(), updatedAt: Date.now() });
  await redis([['SET', shotKey, b.image], ['HSET', 'wc:days', field, JSON.stringify(next)]]);
  send(res, 200, await loadAll());
});
