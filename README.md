# Wedding Challenge

Private 30-day tracker for Manan and Mathew: daily steps, alcohol, step screenshots and weekly weigh-ins (Oct 15 to Nov 13, 2026, IST).

## Structure

```
public/        index.html, app.css, app.js   (static site, Material 3 Expressive UI)
api/           login, logout, me, data, shot (Vercel serverless functions, Node 18+)
api/_lib.js    config, sessions, storage helpers (not exposed as a route)
vercel.json    security headers, noindex
```

No npm dependencies. Data is stored in Upstash Redis through its REST API.

## Deploy on Vercel

1. Push this folder to a **private** GitHub repository.
2. In Vercel: **Add New > Project**, import the repo. Framework preset: **Other**. Leave build and output settings empty; Vercel serves `public/` and deploys `api/` as functions.
3. In the project, open **Storage > Create Database > Upstash for Redis** (free tier is enough) and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) automatically.
4. In **Settings > Environment Variables**, add:
   - `MANAN_PASSWORD` = `manan123`
   - `MATHEW_PASSWORD` = `mathew123`
   - `SESSION_SECRET` = any long random string (for example the output of `openssl rand -base64 32`)
5. Redeploy so the new variables take effect.

If the password variables are not set, the code falls back to `manan123` and `mathew123`. Setting them in Vercel lets you change passwords later without touching code.

## How access works

- Passwords are checked on the server. Nothing secret ships to the browser.
- A successful sign-in sets an HttpOnly, signed session cookie for 30 days.
- After 8 wrong passwords for a name, sign-in for that name locks for 15 minutes.
- Every API route rejects requests without a valid session.
- Each person can only write their own log. Both can view everything, including screenshots.
- Screenshot upload time is stamped by the server, so the 11:55 pm deadline can't be backdated.

## Changing the challenge

Dates, step targets and weigh-in days live in `CONFIG` at the top of `api/_lib.js`. The front end reads them from `/api/me`, so that is the only place to edit.

To try logging before Oct 15, temporarily set `start` to today's date and add today to `weigh`, then revert before the challenge starts. Clear test data from the Upstash console (keys `wc:days`, `wc:weigh`, `wc:shot:*`).

## Local development

```
npm i -g vercel
vercel link
vercel env pull .env.local
vercel dev
```
