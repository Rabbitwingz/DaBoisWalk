// Shared helpers for the API routes. Files that start with "_" are not exposed as routes on Vercel.
const crypto = require('crypto');

const CONFIG = {
  start: '2026-10-15',
  days: 30,
  goal: 10000,
  big: 15000,
  weigh: ['2026-10-15', '2026-10-22', '2026-10-29', '2026-11-05', '2026-11-13']
};

const USERS = {
  manan: { name: 'Manan', password: () => process.env.MANAN_PASSWORD || 'manan123' },
  mathew: { name: 'Mathew', password: () => process.env.MATHEW_PASSWORD || 'mathew123' }
};

const COOKIE = 'wc_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const END = addDays(CONFIG.start, CONFIG.days - 1);
const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const deadline = (d) => Date.parse(d + 'T23:55:00+05:30');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- storage: Upstash Redis over REST (no dependencies) ---------- */
function redisEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new HttpError(500, 'Storage is not connected. Add an Upstash Redis database to this Vercel project, then redeploy.');
  return { url: url.replace(/\/$/, ''), token };
}

async function redis(commands) {
  const { url, token } = redisEnv();
  const res = await fetch(url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!res.ok) throw new Error('Redis responded ' + res.status);
  const out = await res.json();
  return out.map((r) => { if (r.error) throw new Error(r.error); return r.result; });
}

function pairs(raw, map) {
  const o = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) { try { o[raw[i]] = map(raw[i + 1]); } catch (e) { /* skip bad row */ } }
  } else if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw)) { try { o[k] = map(raw[k]); } catch (e) { /* skip */ } }
  }
  return o;
}

async function loadAll() {
  const [days, weigh] = await redis([['HGETALL', 'wc:days'], ['HGETALL', 'wc:weigh']]);
  return { days: pairs(days, (v) => JSON.parse(v)), weigh: pairs(weigh, Number), today: todayIST() };
}

/* ---------- sessions: HMAC-signed cookie ---------- */
function secret() {
  const s = process.env.SESSION_SECRET || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!s) throw new HttpError(500, 'Set SESSION_SECRET in the Vercel project settings, then redeploy.');
  return s;
}
const sign = (v) => crypto.createHmac('sha256', secret()).update(v).digest('base64url');
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sessionCookie(user) {
  const value = user + '.' + (Math.floor(Date.now() / 1000) + MAX_AGE);
  return `${COOKIE}=${value}.${sign(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}
const clearedCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function sessionUser(req) {
  const raw = req.headers.cookie || '';
  let val = null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) val = decodeURIComponent(part.slice(i + 1).trim());
  }
  if (!val) return null;
  const [user, exp, sig] = val.split('.');
  if (!user || !exp || !sig || !USERS[user]) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  if (!safeEqual(sig, sign(user + '.' + exp))) return null;
  return user;
}

function requireUser(req) {
  const u = sessionUser(req);
  if (!u) throw new HttpError(401, 'Sign in to continue.');
  return u;
}

/* ---------- validation ---------- */
function checkDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < CONFIG.start || date > END) {
    throw new HttpError(400, 'Pick a day inside the challenge, Oct 15 to Nov 13.');
  }
  if (date > todayIST()) throw new HttpError(400, 'That day has not happened yet.');
  return date;
}

/* ---------- responses ---------- */
function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { /* fall through */ } }
  return {};
}

function route(methods, fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        return send(res, 405, { error: 'Method not allowed.' });
      }
      await fn(req, res);
    } catch (e) {
      if (!e.status) console.error(e);
      send(res, e.status || 500, { error: e.status ? e.message : 'The server hit a problem. Try again in a moment.' });
    }
  };
}

module.exports = {
  CONFIG, USERS, END, todayIST, deadline, HttpError,
  redis, loadAll, sessionCookie, clearedCookie, sessionUser, requireUser, safeEqual,
  checkDate, send, readBody, route
};
