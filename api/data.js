const { CONFIG, KEYS, loadAll, writeAndLoad, requireUser, checkDate, send, readBody, route, HttpError } = require('./_lib');

module.exports = route(['GET', 'POST'], async (req, res) => {
  const user = requireUser(req);
  if (req.method === 'GET') return send(res, 200, await loadAll());

  // POST: save the signed-in person's own day. Nobody can write the other person's log.
  const b = readBody(req);
  const date = checkDate(b.date);

  let steps = b.steps;
  if (steps === undefined || steps === '') steps = null;
  if (steps !== null && (!Number.isInteger(steps) || steps < 0 || steps > 100000)) {
    throw new HttpError(400, 'Steps must be a whole number between 0 and 100,000.');
  }
  const alcohol = b.alcohol === 'dry' || b.alcohol === 'drank' ? b.alcohol : null;

  let kg = null;
  if (CONFIG.weigh.includes(date)) {
    kg = b.kg === undefined || b.kg === '' ? null : b.kg;
    if (kg !== null && (typeof kg !== 'number' || !isFinite(kg) || kg < 25 || kg > 300)) {
      throw new HttpError(400, 'Weight must be in kg, between 25 and 300.');
    }
  }

  // Validate everything before writing anything.
  const field = user + ':' + date;
  const writes = [steps === null && !alcohol
    ? ['HDEL', KEYS.days, field]
    : ['HSET', KEYS.days, field, JSON.stringify({ steps, alcohol, updatedAt: Date.now() })]];
  if (CONFIG.weigh.includes(date)) {
    writes.push(kg === null ? ['HDEL', KEYS.weigh, field] : ['HSET', KEYS.weigh, field, String(Math.round(kg * 10) / 10)]);
  }

  send(res, 200, await writeAndLoad(writes));
});
