const { USERS, KEYS, redis, sessionCookie, safeEqual, send, readBody, route, HttpError } = require('./_lib');

const MAX_FAILS = 8;
const LOCK_SECONDS = 15 * 60;

module.exports = route(['POST'], async (req, res) => {
  const { user, password } = readBody(req);
  const u = Object.hasOwn(USERS, user) ? USERS[user] : null;
  if (!u) throw new HttpError(400, 'Choose Manan or Mathew.');
  if (typeof password !== 'string' || !password) throw new HttpError(400, 'Enter your password.');

  const key = KEYS.fails(user);
  const [fails] = await redis([['GET', key]]);
  if (Number(fails) >= MAX_FAILS) throw new HttpError(429, 'Too many wrong passwords. Try again in 15 minutes.');

  if (!safeEqual(password, u.password())) {
    await redis([['INCR', key], ['EXPIRE', key, LOCK_SECONDS]]);
    throw new HttpError(401, 'That password is not right for ' + u.name + '.');
  }
  await redis([['DEL', key]]);
  res.setHeader('Set-Cookie', sessionCookie(user));
  send(res, 200, { user, name: u.name });
});
