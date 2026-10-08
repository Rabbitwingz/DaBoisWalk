const { CONFIG, redis, loadAll, requireUser, checkDate, send, readBody, route, HttpError } = require('./_lib');

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

  const field = user + ':' + date;
  const [prevRaw] = await redis([['HGET', 'wc:days', field]]);
  let prev = null;
  try { prev = prevRaw ? JSON.parse(prevRaw) : null; } catch (e) { prev = null; }
  const shotAt = prev && typeof prev.shotAt === 'number' ? prev.shotAt : null;

  const cmds = [];
  if (steps === null && !alcohol && shotAt === null) cmds.push(['HDEL', 'wc:days', field]);
  else cmds.push(['HSET', 'wc:days', field, JSON.stringify({ steps, alcohol, shotAt, updatedAt: Date.now() })]);

  if (CONFIG.weigh.includes(date)) {
    let kg = b.kg;
    if (kg === undefined || kg === '') kg = null;
    if (kg !== null && (typeof kg !== 'number' || !isFinite(kg) || kg < 25 || kg > 300)) {
      throw new HttpError(400, 'Weight must be in kg, between 25 and 300.');
    }
    if (kg === null) cmds.push(['HDEL', 'wc:weigh', field]);
    else cmds.push(['HSET', 'wc:weigh', field, String(Math.round(kg * 10) / 10)]);
  }

  await redis(cmds);
  send(res, 200, await loadAll());
});
