# Da Bois Walk

Private 30-day tracker for Manan and Mathew: daily steps, alcohol, step screenshots and weekly weigh-ins (Oct 15 to Nov 13, 2026, IST).

Live at https://da-bois-walk.vercel.app

## Structure

```
public/        index.html, app.css, app.js   (static site, Material 3 Expressive, light theme)
api/           login, logout, me, data, shot (Vercel serverless functions, Node 18+)
api/_lib.js    config, sessions, storage helpers (not exposed as a route)
vercel.json    security headers (CSP), noindex
```

No npm dependencies. Data is stored in Upstash Redis through its REST API.

## Deploy on Vercel

1. Keep this GitHub repository **private**.
2. In Vercel: **Add New > Project**, import the repo. Framework preset: **Other**. Leave build and output settings empty; Vercel serves `public/` and deploys `api/` as functions.
3. In the project, open **Storage > Create Database > Upstash for Redis** (free tier is enough) and connect it with the env var prefix `KV`. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`. (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work.)
4. In **Settings > Environment Variables**, add:
   - `MANAN_PASSWORD`
   - `MATHEW_PASSWORD`
   - `SESSION_SECRET`: any long random string, for example the output of `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
5. Redeploy so the new variables take effect.

There are no default passwords. If a password variable is missing, sign-in for that person fails with a message saying which variable to set.

## How access works

- Passwords are checked on the server. Nothing secret ships to the browser.
- A successful sign-in sets an HttpOnly, signed session cookie for 30 days. Changing `SESSION_SECRET` signs everyone out.
- After 8 wrong passwords for a name, sign-in for that name locks for 15 minutes.
- Every API route rejects requests without a valid session.
- Each person can only write their own log. Both can view everything, including screenshots.
- Screenshot upload time is stamped by the server, so the 11:55 pm deadline can't be backdated.

## Storage keys

| Key | Type | Contents |
|---|---|---|
| `dbw:days` | hash | `user:date` → `{"steps","alcohol","updatedAt"}` |
| `dbw:weigh` | hash | `user:date` → kg |
| `dbw:shots` | hash | `user:date` → screenshot upload time (ms) |
| `dbw:shot:user:date` | string | screenshot image as a data URL |
| `dbw:fails:user` | string | wrong-password counter, expires after 15 minutes |

Screenshot times are kept apart from the day log so saving a day can never overwrite an upload.

## Changing the challenge

Dates, step targets and weigh-in days live in `CONFIG` at the top of `api/_lib.js`. The front end reads them from `/api/me`, so that is the only place to edit (the Rules tab text is written by hand in `public/index.html`).

To try logging before Oct 15, temporarily set `start` to today's date and add today to `weigh`, then revert before the challenge starts. Clear test data from the Upstash console (keys starting `dbw:`).

## Local development

```
npm i -g vercel
vercel link
vercel env pull .env.local
vercel dev
```
