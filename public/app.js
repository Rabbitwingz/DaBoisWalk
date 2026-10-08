(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const NAMES = { manan: 'Manan', mathew: 'Mathew' };
  const PLAYERS = ['manan', 'mathew'];
  const SHAPES = { manan: [9, 0.07], mathew: [4, 0.15] };      // M3 expressive "cookie" and "clover"
  const TABS = ['today', 'calendar', 'weigh', 'rules'];

  /* ---------- dates and formatting (challenge runs on IST) ---------- */
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const diffDays = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);
  const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const deadline = (d) => Date.parse(d + 'T23:55:00+05:30');
  const dateFmt = (iso, o) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', Object.assign({ timeZone: 'UTC' }, o));
  const fmtDate = (iso) => dateFmt(iso, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtShort = (iso) => dateFmt(iso, { month: 'short', day: 'numeric' });
  const fmtLong = (iso) => dateFmt(iso, { weekday: 'long', month: 'short', day: 'numeric' });
  const fmtNum = (n) => Math.round(n).toLocaleString('en-IN');
  const fmtKg = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const pctText = (p) => (p < 0 ? '+' : '') + Math.abs(p).toFixed(1) + '%';
  const fmtStamp = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const pad = (n) => (n < 10 ? '0' : '') + n;

  /* ---------- state ---------- */
  const S = {
    me: null, cfg: null, start: '', end: '', dates: [], today: todayIST(),
    days: {}, weigh: {}, loaded: false, connErr: false,
    sel: null, alcohol: null, dirty: false, saving: false, uploading: false,
    tab: 'today', poll: null
  };
  const key = (p, d) => p + ':' + d;
  const rec = (p, d) => S.days[key(p, d)] || null;
  const stepsOf = (p, d) => { const r = rec(p, d); return r && typeof r.steps === 'number' ? r.steps : null; };
  const kgOf = (p, d) => { const v = S.weigh[key(p, d)]; return typeof v === 'number' && isFinite(v) && v > 0 ? v : null; };
  const shotOf = (p, d) => { const r = rec(p, d); return r && typeof r.shotAt === 'number' ? r.shotAt : null; };
  const isOpen = () => S.today >= S.start;
  const lastOpen = () => (S.today > S.end ? S.end : S.today);
  const canLog = (d) => isOpen() && d >= S.start && d <= lastOpen();
  const isWeigh = (d) => S.cfg.weigh.includes(d);
  const other = (p) => (p === 'manan' ? 'mathew' : 'manan');
  const order = () => [S.me, other(S.me)];
  const dayLabel = (d) => (d === S.today ? 'Today' : d === addDays(S.today, -1) ? 'Yesterday' : fmtDate(d));

  /* ---------- shapes ---------- */
  function blobPath(n, amp, r = 48) {
    let d = '';
    for (let i = 0; i <= 240; i++) {
      const t = (i / 240) * Math.PI * 2;
      const rr = (r * (1 + amp * Math.cos(n * t))) / (1 + amp);
      const a = t - Math.PI / 2;
      d += (i ? 'L' : 'M') + (50 + rr * Math.cos(a)).toFixed(2) + ' ' + (50 + rr * Math.sin(a)).toFixed(2);
    }
    return d + 'Z';
  }
  const AV = {};
  PLAYERS.forEach((p) => { AV[p] = blobPath(SHAPES[p][0], SHAPES[p][1]); });
  const avatar = (p, size = '') =>
    `<span class="avatar ${size}" data-u="${p}" aria-hidden="true"><svg viewBox="0 0 100 100"><path d="${AV[p]}"/><text x="50" y="52">${NAMES[p][0]}</text></svg></span>`;

  const cookie = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${blobPath(8, 0.075, 50)}"/></svg>`;
  document.documentElement.style.setProperty('--cookie', `url("data:image/svg+xml,${encodeURIComponent(cookie)}")`);

  (function buildRing() {
    let d = '';
    const N = 720, R = 96, amp = 3.6, waves = 15;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2, r = R + amp * Math.sin(waves * t), a = t - Math.PI / 2;
      d += (i ? 'L' : 'M') + (120 + r * Math.cos(a)).toFixed(2) + ' ' + (120 + r * Math.sin(a)).toFixed(2);
    }
    $('ring-ind').setAttribute('d', d);
  })();

  document.querySelectorAll('[data-avatar]').forEach((el) => {
    const p = el.dataset.avatar;
    el.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${AV[p]}"/><text x="50" y="52">${NAMES[p][0]}</text></svg>`;
  });

  /* ---------- network ---------- */
  class ApiError extends Error { constructor(m, s) { super(m); this.status = s; } }
  async function api(path, method = 'GET', body) {
    let res;
    try {
      res = await fetch(path, {
        method, credentials: 'same-origin', cache: 'no-store',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (res.status === 401 && path !== '/api/login') {
      showLogin('Your session ended. Sign in again.');
      throw new ApiError('Signed out.', 401);
    }
    if (!res.ok) throw new ApiError((data && data.error) || 'The server returned an error (' + res.status + '). Try again.', res.status);
    return data;
  }

  /* ---------- snackbar + confirm ---------- */
  let snackTimer = null;
  function snack(msg, err) {
    const el = $('snackbar');
    el.textContent = msg;
    el.classList.toggle('err', !!err);
    el.classList.add('show');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => el.classList.remove('show'), err ? 6000 : 3200);
  }
  function confirmBox(title, text, yes) {
    return new Promise((resolve) => {
      const dlg = $('confirm');
      $('confirm-title').textContent = title;
      $('confirm-text').textContent = text;
      $('confirm-yes').textContent = yes;
      const done = (v) => { dlg.close(); resolve(v); };
      $('confirm-yes').onclick = () => done(true);
      $('confirm-no').onclick = () => done(false);
      dlg.oncancel = (e) => { e.preventDefault(); done(false); };
      dlg.showModal();
      $('confirm-no').focus();
    });
  }

  /* =====================================================================
     Sign in
     ===================================================================== */
  const loginRadios = () => Array.from(document.querySelectorAll('input[name="user"]'));
  const pickedUser = () => { const r = loginRadios().find((x) => x.checked); return r ? r.value : null; };

  function setLoginErr(msg) {
    $('login-err').textContent = msg || '';
    $('pw-tf').classList.toggle('err', !!msg && !!pickedUser());
  }

  function showLogin(msg) {
    stopApp();
    $('boot').hidden = true;
    $('app').hidden = true;
    $('login').hidden = false;
    $('sheet').open && $('sheet').close();
    document.title = 'Sign in to Wedding Challenge';
    let last = null;
    try { last = localStorage.getItem('wc-last-user'); } catch (e) { /* storage off */ }
    loginRadios().forEach((r) => { r.checked = r.value === last; });
    $('login-username').value = last || '';
    $('pw').value = '';
    setLoginErr(msg || '');
    setTimeout(() => (last ? $('pw') : loginRadios()[0]).focus(), 50);
  }

  loginRadios().forEach((r) => r.addEventListener('change', () => {
    $('login-username').value = r.value;
    setLoginErr('');
    $('pw').focus();
  }));
  $('pw').addEventListener('input', () => setLoginErr(''));
  $('pw-toggle').addEventListener('click', () => {
    const show = $('pw').type === 'password';
    $('pw').type = show ? 'text' : 'password';
    $('pw-toggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    $('pw-toggle').firstElementChild.textContent = show ? 'visibility_off' : 'visibility';
  });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = pickedUser(), password = $('pw').value;
    if (!user) { setLoginErr('Choose who is signing in.'); loginRadios()[0].focus(); return; }
    if (!password) { setLoginErr('Enter your password.'); $('pw').focus(); return; }
    const btn = $('login-btn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      await api('/api/login', 'POST', { user, password });
      try { localStorage.setItem('wc-last-user', user); } catch (err) { /* storage off */ }
      const me = await api('/api/me');
      startApp(me);
    } catch (err) {
      setLoginErr(err.message);
      $('pw').select();
    } finally {
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  });

  /* =====================================================================
     App lifecycle
     ===================================================================== */
  function startApp(me) {
    S.me = me.user;
    S.cfg = me.config;
    S.start = me.config.start;
    S.end = me.config.end;
    S.dates = Array.from({ length: me.config.days }, (_, i) => addDays(S.start, i));
    S.today = todayIST();
    S.sel = isOpen() ? lastOpen() : S.start;
    S.days = {}; S.weigh = {}; S.loaded = false; S.connErr = false;
    S.dirty = false; S.alcohol = null; S.saving = false; S.uploading = false;

    $('boot').hidden = true;
    $('login').hidden = true;
    $('app').hidden = false;
    document.title = 'Wedding Challenge';

    buildStatic();
    const fromHash = location.hash.slice(1);
    setTab(TABS.includes(fromHash) ? fromHash : 'today', false);
    renderAll(true);
    tick();
    refresh(false);
    S.poll = setInterval(() => {
      if (document.visibilityState === 'visible' && !S.saving && !S.uploading) refresh(true);
    }, 30000);
  }

  function stopApp() {
    clearInterval(S.poll);
    S.poll = null;
    S.me = null;
  }

  async function refresh(quiet) {
    try {
      apply(await api('/api/data'));
      S.connErr = false;
    } catch (e) {
      if (e.status === 401) return;
      S.connErr = true;
      if (!quiet) snack(e.message, true);
    }
    renderConn();
  }

  function apply(data) {
    S.days = data.days || {};
    S.weigh = data.weigh || {};
    S.loaded = true;
    renderAll(!S.dirty);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.me) refresh(true);
  });

  /* ---------- static scaffolding that depends on who is signed in ---------- */
  function buildStatic() {
    $('me-btn').innerHTML = avatar(S.me);
    $('menu-who').textContent = 'Signed in as ' + NAMES[S.me];
    order().forEach((p, i) => { $('wh-' + i).textContent = NAMES[p]; });
    $('chart-legend').innerHTML = order().map((p) => `<span><i class="c-${p}"></i>${NAMES[p]}</span>`).join('');
  }

  /* ---------- tabs ---------- */
  function setTab(t, remember = true) {
    S.tab = t;
    TABS.forEach((x) => { $('tab-' + x).hidden = x !== t; });
    document.querySelectorAll('.nav-item').forEach((b) => {
      if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (remember) history.replaceState(null, '', '#' + t);
    if (t === 'weigh') renderWeigh();
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  /* ---------- account menu ---------- */
  function closeMenu() { $('menu').hidden = true; $('me-btn').setAttribute('aria-expanded', 'false'); }
  $('me-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = $('menu').hidden;
    $('menu').hidden = !open;
    $('me-btn').setAttribute('aria-expanded', String(open));
    if (open) $('signout').focus();
  });
  document.addEventListener('click', (e) => { if (!$('menu').hidden && !e.target.closest('.menu-wrap')) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('menu').hidden) { closeMenu(); $('me-btn').focus(); } });
  $('signout').addEventListener('click', async () => {
    closeMenu();
    try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* cookie expires anyway */ }
    showLogin('');
  });

  window.addEventListener('scroll', () => { $('topbar').classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });

  /* =====================================================================
     Numbers
     ===================================================================== */
  function stats(p) {
    const s = { elapsed: 0, logged: 0, hit: 0, total: 0, dry: 0, drank: 0, b2b: 0, unlogged: 0, late: 0, noShot: 0,
      hitStreak: 0, dryStreak: 0, todaySteps: null, base: null, latest: null, pct: null };
    const goal = S.cfg.goal, now = Date.now();
    let prevMiss = false;
    for (const d of S.dates) {
      if (d > S.today) break;
      s.elapsed++;
      const r = rec(p, d), st = stepsOf(p, d), at = shotOf(p, d);
      if (st === null) { prevMiss = false; if (d < S.today) s.unlogged++; }
      else {
        s.logged++; s.total += st;
        if (st >= goal) { s.hit++; prevMiss = false; } else { if (prevMiss) s.b2b++; prevMiss = true; }
      }
      if (r && r.alcohol === 'dry') s.dry++;
      else if (r && r.alcohol === 'drank') s.drank++;
      if (at !== null && at > deadline(d)) s.late++;
      if (at === null && now > deadline(d)) s.noShot++;
    }
    for (let i = s.elapsed - 1; i >= 0; i--) {
      const st = stepsOf(p, S.dates[i]);
      if (S.dates[i] === S.today && (st === null || st < goal)) continue;   // today isn't over yet
      if (st !== null && st >= goal) s.hitStreak++; else break;
    }
    for (let i = s.elapsed - 1; i >= 0; i--) {
      const r = rec(p, S.dates[i]), al = r ? r.alcohol : null;
      if (al === 'dry') s.dryStreak++;
      else if (!al && S.dates[i] === S.today) continue;
      else break;
    }
    s.todaySteps = stepsOf(p, S.today);
    s.base = kgOf(p, S.cfg.weigh[0]);
    for (let k = S.cfg.weigh.length - 1; k > 0; k--) {
      const w = kgOf(p, S.cfg.weigh[k]);
      if (w !== null) { s.latest = w; break; }
    }
    if (s.base && s.latest !== null) s.pct = ((s.base - s.latest) / s.base) * 100;
    return s;
  }
  function finalPct(p) {
    const b = kgOf(p, S.cfg.weigh[0]), f = kgOf(p, S.cfg.weigh[S.cfg.weigh.length - 1]);
    return b && f !== null ? ((b - f) / b) * 100 : null;
  }
  const tier = (st) => (st === null ? '' : st >= S.cfg.big ? 't-big' : st >= S.cfg.goal ? 't-hit' : 't-miss');

  /* =====================================================================
     Render
     ===================================================================== */
  function renderAll(refill) {
    if (!S.me) return;
    renderTop();
    renderHero();
    renderForm(refill);
    renderVersus();
    renderCals();
    if (S.tab === 'weigh') renderWeigh();
    renderConn();
  }

  function renderConn() {
    const el = $('conn');
    if (!S.me) return;
    if (!S.loaded && !S.connErr) { el.hidden = false; el.className = 'conn'; el.textContent = 'Loading the shared log…'; }
    else if (S.connErr) { el.hidden = false; el.className = 'conn err'; el.textContent = 'Can’t reach the server. Showing the last data loaded. It will retry on its own.'; }
    else el.hidden = true;
  }

  function renderTop() {
    const chip = $('day-chip');
    if (S.today < S.start) chip.textContent = 'Starts ' + fmtShort(S.start);
    else if (S.today > S.end) chip.textContent = 'Finished';
    else if (S.today === S.end) chip.textContent = 'Last day';
    else chip.textContent = 'Day ' + (diffDays(S.today, S.start) + 1) + ' of ' + S.cfg.days;
  }

  function setRing(steps) {
    const v = steps || 0, frac = Math.min(v / S.cfg.goal, 1) * 100;
    const ind = $('ring-ind');
    ind.style.strokeDasharray = frac.toFixed(2) + ' 100';
    ind.style.opacity = v > 0 ? '1' : '0';
    $('ring-wrap').classList.toggle('big', v >= S.cfg.big);
    $('ring-num').textContent = fmtNum(v);
    $('ring-sub').textContent = 'of ' + fmtNum(S.cfg.goal) + ' steps';
  }

  function renderHero() {
    const before = S.today < S.start, after = S.today > S.end;
    $('countdown').hidden = !before;
    $('ring-wrap').hidden = before;
    $('hero-hi').textContent = 'Hi ' + NAMES[S.me];
    const h = $('hero-h'), p = $('hero-p');

    if (before) {
      h.textContent = 'Starts ' + fmtLong(S.start);
      p.textContent = 'Logging opens that morning. First weigh-in too, before eating.';
      return;
    }
    if (after) {
      const fa = finalPct(S.me), fb = finalPct(other(S.me));
      setRing(stepsOf(S.me, S.end));
      $('ring-sub').textContent = 'steps on the last day';
      if (fa === null || fb === null) {
        h.textContent = 'Challenge finished';
        p.textContent = 'Waiting on the Nov 13 weigh-in to settle the result.';
      } else if (Math.abs(fa - fb) < 0.05) {
        h.textContent = 'Dead level';
        p.textContent = 'Same % lost. Split dinner and the first round on Nov 14.';
      } else {
        const win = fa > fb ? S.me : other(S.me);
        h.textContent = win === S.me ? 'You won' : NAMES[win] + ' won';
        p.textContent = NAMES[other(win)] + ' pays for dinner and the first round on Nov 14.';
      }
      return;
    }

    const st = stepsOf(S.me, S.today), goal = S.cfg.goal;
    setRing(st);
    const day = diffDays(S.today, S.start) + 1, left = S.cfg.days - day;
    if (st === null) h.textContent = 'No steps logged today';
    else if (st >= S.cfg.big) h.textContent = '15k day. Brilliant.';
    else if (st >= goal) h.textContent = 'Target hit';
    else h.textContent = fmtNum(goal - st) + ' steps to go';
    p.textContent = 'Day ' + day + ' of ' + S.cfg.days + '. ' + (left === 0 ? 'Last day of the challenge.' : plural(left, 'day') + ' left after today.');
  }

  /* ---------- log form ---------- */
  function parseSteps(v) {
    const s = String(v).trim().toLowerCase().replace(/[,\s]/g, '');
    if (!s) return null;
    let n;
    const k = s.match(/^(\d+(?:\.\d+)?)k$/);
    if (k) n = Math.round(parseFloat(k[1]) * 1000);
    else if (/^\d+$/.test(s)) n = parseInt(s, 10);
    else return false;
    return n > 100000 ? false : n;
  }
  function parseKg(v) {
    const s = String(v).trim().replace(',', '.').replace(/\s*kg$/i, '');
    if (!s) return null;
    if (!/^\d{2,3}(\.\d+)?$/.test(s)) return false;
    const n = parseFloat(s);
    return n < 25 || n > 300 ? false : Math.round(n * 10) / 10;
  }

  function stepsHint() {
    const v = parseSteps($('f-steps').value), h = $('steps-hint');
    h.classList.remove('err');
    $('steps-tf').classList.remove('err');
    if (v === false) h.textContent = 'Type a number like 11400 or 11.4k.';
    else if (v === null) h.textContent = 'Target is 10,000. 15,000 or more makes it a big day.';
    else if (v >= S.cfg.big) h.textContent = '15k day.';
    else if (v >= S.cfg.goal) h.textContent = 'Target hit.';
    else h.textContent = fmtNum(S.cfg.goal - v) + ' short of 10k.';
  }
  function fieldErr(which, msg) {
    $(which + '-tf').classList.add('err');
    const hint = $(which === 'steps' ? 'steps-hint' : 'kg-hint');
    hint.textContent = msg;
    hint.classList.add('err');
  }

  function renderForm(refill) {
    const d = S.sel, me = S.me;
    $('d-label').textContent = dayLabel(d);
    $('d-prev').disabled = !isOpen() || d <= S.start;
    $('d-next').disabled = !isOpen() || d >= lastOpen();
    $('kg-wrap').hidden = !isWeigh(d);
    $('log-fs').disabled = !canLog(d) || !S.loaded || S.saving;

    const note = $('log-note');
    note.className = 'log-note';
    if (!isOpen()) { note.hidden = false; note.textContent = 'Logging opens on ' + fmtLong(S.start) + '.'; }
    else if (d < S.today && Date.now() > deadline(d)) {
      note.hidden = false; note.classList.add('warn');
      note.textContent = 'You’re editing ' + fmtDate(d) + '. Its 11:55 pm deadline has passed, so a screenshot added now counts as late.';
    } else note.hidden = true;

    if (refill) {
      const st = stepsOf(me, d), r = rec(me, d), kg = kgOf(me, d);
      $('f-steps').value = st === null ? '' : fmtNum(st);
      S.alcohol = r && (r.alcohol === 'dry' || r.alcohol === 'drank') ? r.alcohol : null;
      $('f-kg').value = kg === null ? '' : fmtKg(kg);
      $('kg-tf').classList.remove('err');
      $('kg-hint').classList.remove('err');
      $('kg-hint').textContent = 'Weigh-in day. Morning, before eating.';
      S.dirty = false;
    }
    $('alc-dry').setAttribute('aria-pressed', String(S.alcohol === 'dry'));
    $('alc-drank').setAttribute('aria-pressed', String(S.alcohol === 'drank'));
    stepsHint();
    $('save').textContent = S.saving ? 'Saving…' : 'Save ' + (d === S.today ? 'today' : fmtShort(d));
    renderShot();
  }

  function renderShot() {
    const d = S.sel, at = shotOf(S.me, d), th = $('shot-thumb'), status = $('shot-status');
    if (at !== null) {
      const src = `/api/shot?u=${S.me}&d=${d}&v=${at}`;
      if (th.dataset.src !== src) {
        th.innerHTML = `<img alt="" src="${src}">`;
        th.dataset.src = src;
      }
      th.classList.add('has');
      th.disabled = false;
      th.setAttribute('aria-label', 'View your screenshot for ' + fmtDate(d));
      const late = at > deadline(d);
      status.className = 'shot-status ' + (late ? 'late' : 'ok');
      status.textContent = 'Added ' + fmtStamp(at) + (late ? '. Late, after the 11:55 pm deadline.' : '.');
      $('shot-btn-t').textContent = 'Replace';
      $('shot-remove').hidden = false;
    } else {
      if (th.dataset.src) { th.innerHTML = ''; th.dataset.src = ''; }
      if (!th.firstChild) th.innerHTML = '<span class="msr">add_a_photo</span>';
      th.classList.remove('has');
      th.disabled = true;
      const passed = isOpen() && Date.now() > deadline(d);
      status.className = 'shot-status' + (passed ? ' late' : '');
      status.textContent = passed ? 'Not added. The 11:55 pm deadline has passed.' : 'Not added yet. Due by 11:55 pm.';
      $('shot-btn-t').textContent = 'Add screenshot';
      $('shot-remove').hidden = true;
    }
    if (S.uploading) { status.className = 'shot-status'; status.textContent = 'Uploading…'; }
    const lock = !canLog(d) || !S.loaded || S.uploading;
    $('shot-btn').disabled = lock;
    $('shot-remove').disabled = lock;
  }

  function moveDay(n) {
    const d = addDays(S.sel, n);
    if (d < S.start || d > lastOpen()) return;
    S.sel = d; S.dirty = false;
    renderForm(true);
  }
  $('d-prev').addEventListener('click', () => moveDay(-1));
  $('d-next').addEventListener('click', () => moveDay(1));

  $('f-steps').addEventListener('input', () => { S.dirty = true; stepsHint(); });
  $('f-steps').addEventListener('blur', () => {
    const v = parseSteps($('f-steps').value);
    if (typeof v === 'number') $('f-steps').value = fmtNum(v);
  });
  $('f-kg').addEventListener('input', () => {
    S.dirty = true;
    $('kg-tf').classList.remove('err');
    $('kg-hint').classList.remove('err');
    $('kg-hint').textContent = 'Weigh-in day. Morning, before eating.';
  });
  ['dry', 'drank'].forEach((v) => {
    $('alc-' + v).addEventListener('click', () => {
      S.alcohol = S.alcohol === v ? null : v;
      S.dirty = true;
      $('alc-dry').setAttribute('aria-pressed', String(S.alcohol === 'dry'));
      $('alc-drank').setAttribute('aria-pressed', String(S.alcohol === 'drank'));
    });
  });

  $('log-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = S.sel;
    if (S.saving || !canLog(d)) return;
    const steps = parseSteps($('f-steps').value);
    if (steps === false) { fieldErr('steps', 'Enter whole steps, like 11400 or 11.4k.'); $('f-steps').focus(); return; }
    let kg = null;
    if (isWeigh(d)) {
      kg = parseKg($('f-kg').value);
      if (kg === false) { fieldErr('kg', 'Enter your weight in kg, like 78.4.'); $('f-kg').focus(); return; }
    }
    S.saving = true;
    renderForm(false);
    try {
      const data = await api('/api/data', 'POST', { date: d, steps, alcohol: S.alcohol, kg });
      S.saving = false; S.dirty = false;
      apply(data);
      snack('Saved ' + (d === S.today ? 'today' : fmtDate(d)) + '.');
    } catch (err) {
      S.saving = false;
      renderForm(false);
      if (err.status !== 401) snack(err.message, true);
    }
  });

  /* ---------- screenshots ---------- */
  function compress(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const max = 1600, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          let q = 0.82, out = c.toDataURL('image/jpeg', q);
          while (out.length > 1000000 && q > 0.45) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
          resolve(out);
        } catch (e) { reject(new Error('Could not process that image. Try a PNG or JPEG screenshot.')); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t an image the browser can read. Try a PNG or JPEG screenshot.')); };
      img.src = url;
    });
  }

  $('shot-btn').addEventListener('click', () => $('shot-input').click());
  $('shot-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    const d = S.sel;
    if (!file || !canLog(d)) return;
    S.uploading = true; renderShot();
    try {
      const image = await compress(file);
      const data = await api('/api/shot', 'POST', { date: d, image });
      S.uploading = false;
      apply(data);
      const late = shotOf(S.me, d) > deadline(d);
      snack('Screenshot added' + (d === S.today ? '' : ' for ' + fmtDate(d)) + (late ? '. Marked late.' : '.'), late);
    } catch (err) {
      S.uploading = false; renderShot();
      if (err.status !== 401) snack(err.message, true);
    }
  });
  $('shot-remove').addEventListener('click', async () => {
    const d = S.sel;
    const passed = Date.now() > deadline(d);
    const ok = await confirmBox('Remove screenshot?', passed
      ? 'This day’s deadline has passed. A screenshot added after removing will count as late.'
      : 'You can add a new one any time before 11:55 pm.', 'Remove');
    if (!ok) return;
    S.uploading = true; renderShot();
    try {
      const data = await api('/api/shot', 'POST', { date: d, remove: true });
      S.uploading = false;
      apply(data);
      snack('Screenshot removed.');
    } catch (err) {
      S.uploading = false; renderShot();
      if (err.status !== 401) snack(err.message, true);
    }
  });
  $('shot-thumb').addEventListener('click', () => { if (shotOf(S.me, S.sel) !== null) openSheet(S.me, S.sel); });

  /* ---------- head to head ---------- */
  function renderVersus() {
    const st = {};
    PLAYERS.forEach((p) => { st[p] = stats(p); });
    const a = st[S.me], b = st[other(S.me)];
    let leader = null;
    if (a.pct !== null && b.pct !== null && Math.abs(a.pct - b.pct) >= 0.05) leader = a.pct > b.pct ? S.me : other(S.me);

    const sides = order().map((p) => {
      const s = st[p];
      const pct = s.pct !== null ? pctText(s.pct) : '–';
      const sub = s.pct !== null
        ? (s.pct < 0 ? 'body weight gained' : 'body weight lost') + '<br>' + fmtKg(s.base) + ' to ' + fmtKg(s.latest) + ' kg'
        : s.base ? 'Started at ' + fmtKg(s.base) + ' kg.<br>Next weigh-in sets the %.' : 'No weigh-in yet';
      const flags = [];
      if (s.drank) flags.push(['bad', 'Drank on ' + plural(s.drank, 'day')]);
      if (s.b2b) flags.push(['bad', 'Missed 10k two days running' + (s.b2b > 1 ? ' ×' + s.b2b : '')]);
      if (s.late) flags.push(['bad', plural(s.late, 'late screenshot')]);
      if (s.noShot) flags.push(['bad', plural(s.noShot, 'day') + ' without a screenshot']);
      if (s.unlogged) flags.push(['', plural(s.unlogged, 'day') + ' not logged']);
      if (s.hitStreak >= 7) flags.push(['good', s.hitStreak + '-day 10k streak']);
      const tag = p === leader ? 'Leading' : p === S.me ? 'You' : '';
      return `<div class="vs-side${p === leader ? ' lead' : ''}">
        <div class="vs-head">${avatar(p, 'lg')}<div><h3>${NAMES[p]}</h3>${tag ? `<small>${tag}</small>` : ''}</div></div>
        <p class="vs-pct">${pct}<small>${sub}</small></p>
        ${flags.length ? `<ul class="chips">${flags.map((f) => `<li class="${f[0]}">${f[1]}</li>`).join('')}</ul>` : ''}
      </div>`;
    }).join('');

    // Tale of the tape: one row per stat, the better value gets highlighted.
    const [L, R] = order().map((p) => st[p]);
    const rows = [
      ['10k days', (s) => s.hit, (s) => s.hit + ' of ' + s.elapsed],
      ['10k streak', (s) => s.hitStreak, (s) => plural(s.hitStreak, 'day')],
      ['Dry days', (s) => s.dry, (s) => s.dry + ' of ' + s.elapsed],
      ['Dry streak', (s) => s.dryStreak, (s) => plural(s.dryStreak, 'day')],
      ['Avg steps', (s) => (s.logged ? s.total / s.logged : 0), (s) => (s.logged ? fmtNum(s.total / s.logged) : '–')]
    ];
    const tape = rows.map(([label, val, show]) => {
      const a1 = L.elapsed ? show(L) : '–', b1 = R.elapsed ? show(R) : '–';
      const va = val(L), vb = val(R), on = L.elapsed && R.elapsed && va !== vb;
      return `<tr><td class="${on && va > vb ? 'win' : ''}">${a1}</td><th scope="row">${label}</th><td class="${on && vb > va ? 'win' : ''}">${b1}</td></tr>`;
    }).join('');
    $('vs-grid').innerHTML = sides +
      `<table class="tape"><caption class="sr-only">${NAMES[order()[0]]} on the left, ${NAMES[order()[1]]} on the right</caption><tbody>${tape}</tbody></table>`;

    const fa = finalPct(S.me), fb = finalPct(other(S.me)), v = $('verdict-t');
    const nm = (p) => (p === S.me ? 'you' : NAMES[p]);
    if (S.today > S.end && fa !== null && fb !== null) {
      if (Math.abs(fa - fb) < 0.05) v.textContent = 'Final: dead level. Split dinner and the first round on Nov 14.';
      else { const lose = fa < fb ? S.me : other(S.me); v.textContent = 'Final: ' + nm(lose) + (lose === S.me ? ' pay' : ' pays') + ' for dinner and the first round on Nov 14.'; }
    } else if (S.today >= S.end && a.base && b.base) {
      const missing = [S.me, other(S.me)].filter((p) => finalPct(p) === null);
      v.textContent = missing.length ? 'Waiting on the final weigh-in from ' + (missing.length === 2 ? 'both of you' : NAMES[missing[0]]) + '.' : 'Final weigh-ins are in.';
    } else if (a.pct !== null && b.pct !== null) {
      if (!leader) v.textContent = 'Dead level on % lost. Nobody is paying yet.';
      else { const lose = other(leader); v.textContent = 'As it stands, ' + nm(lose) + (lose === S.me ? ' pay' : ' pays') + ' for dinner and the first round on Nov 14.'; }
    } else if (!isOpen()) v.textContent = 'First weigh-in is ' + fmtLong(S.start) + '. Morning, before eating.';
    else if (!a.base || !b.base) {
      const missing = [S.me, other(S.me)].filter((p) => !st[p].base);
      v.textContent = 'Waiting on the ' + fmtShort(S.start) + ' starting weight from ' + (missing.length === 2 ? 'both of you' : missing[0] === S.me ? 'you' : NAMES[missing[0]]) + '.';
    } else v.textContent = 'Starting weights are in. The % comparison starts at the next weigh-in.';
  }

  /* ---------- calendar ---------- */
  function renderCals() {
    const lead = (new Date(S.start + 'T00:00:00Z').getUTCDay() + 6) % 7;   // Monday first
    $('cals').innerHTML = order().map((p) => {
      const s = stats(p);
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<span></span>';
      S.dates.forEach((d) => {
        const st = stepsOf(p, d), r = rec(p, d), future = d > S.today;
        const alc = r && (r.alcohol === 'dry' || r.alcohol === 'drank') ? r.alcohol : '';
        const kg = kgOf(p, d);
        const label = NAMES[p] + ', ' + fmtDate(d) + ': ' +
          (future ? 'upcoming' : st === null ? 'steps not logged' : fmtNum(st) + ' steps') +
          (alc ? ', ' + alc : '') + (isWeigh(d) ? ', weigh-in' + (kg !== null ? ' ' + fmtKg(kg) + ' kg' : '') : '');
        const showNum = Number(d.slice(8));
        const monthTag = showNum === 1 ? `<span class="sr-only">${dateFmt(d, { month: 'long' })}</span>` : '';
        cells += `<button type="button" class="day ${tier(st)}${future ? ' future' : ''}${d === S.today ? ' today' : ''}" data-p="${p}" data-d="${d}" aria-label="${label}"${future ? ' disabled' : ''}>` +
          `<span class="tile" aria-hidden="true">${showNum}</span>${monthTag}` +
          (isWeigh(d) ? '<i class="wm" aria-hidden="true"></i>' : '') +
          (alc && !future ? `<span class="tick ${alc}" aria-hidden="true"></span>` : '') + '</button>';
      });
      const summary = !isOpen() ? 'Starts ' + fmtShort(S.start) : s.hit + ' of ' + s.elapsed + ' days at 10k, ' + s.dry + ' dry';
      return `<div class="card cal">
        <div class="cal-head">${avatar(p, 'lg')}<div><h2>${NAMES[p]}</h2><p>${summary}</p></div></div>
        <p class="cal-month">October to November</p>
        <div class="dow" aria-hidden="true"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
        <div class="grid">${cells}</div>
      </div>`;
    }).join('');
  }
  $('cals').addEventListener('click', (e) => {
    const b = e.target.closest('.day');
    if (b && !b.disabled) openSheet(b.dataset.p, b.dataset.d);
  });

  /* ---------- day sheet ---------- */
  function openSheet(p, d) {
    const st = stepsOf(p, d), r = rec(p, d), kg = kgOf(p, d), at = shotOf(p, d);
    const alc = r ? r.alcohol : null;
    const facts = [
      [st === null ? '' : st >= S.cfg.goal ? 'good' : 'bad', 'Steps', st === null ? 'Not logged' : fmtNum(st)],
      [alc === 'drank' ? 'bad' : alc === 'dry' ? 'good' : '', 'Alcohol', alc === 'dry' ? 'Dry' : alc === 'drank' ? 'Drank' : 'Not logged']
    ];
    if (isWeigh(d)) facts.push(['', 'Weight', kg === null ? 'Not logged' : fmtKg(kg) + ' kg']);
    const late = at !== null && at > deadline(d);
    const shot = at !== null
      ? `<div class="sheet-shot"><img src="/api/shot?u=${p}&d=${d}&v=${at}" alt="${NAMES[p]}’s step screenshot for ${fmtDate(d)}"><p class="${late ? 'late' : ''}">Added ${fmtStamp(at)}${late ? '. Late, after the 11:55 pm deadline.' : '.'}</p></div>`
      : `<p class="empty">No screenshot${Date.now() > deadline(d) ? '. The deadline has passed.' : ' yet.'}</p>`;
    const editable = p === S.me && canLog(d);
    $('sheet-body').innerHTML = `
      <div class="sheet-head">${avatar(p, 'lg')}<div><h2 id="sheet-title">${p === S.me ? 'Your day' : NAMES[p] + '’s day'}</h2><p>${fmtLong(d)}${isWeigh(d) ? ', weigh-in' : ''}</p></div>
        <button type="button" class="icon-btn" data-close aria-label="Close"><span class="msr">close</span></button></div>
      <dl class="facts">${facts.map((f) => `<div class="fact ${f[0]}"><dt>${f[1]}</dt><dd>${f[2]}</dd></div>`).join('')}</dl>
      ${shot}
      <div class="sheet-actions">
        <button type="button" class="btn btn-text" data-close>Close</button>
        ${editable ? '<button type="button" class="btn btn-filled" data-edit>Edit this day</button>' : ''}
      </div>`;
    const dlg = $('sheet');
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    const edit = dlg.querySelector('[data-edit]');
    if (edit) edit.addEventListener('click', () => { dlg.close(); goLog(d, 'f-steps'); });
    dlg.showModal();
  }
  $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) $('sheet').close(); });

  function goLog(d, focusId) {
    S.sel = d; S.dirty = false;
    renderForm(true);
    setTab('today');
    requestAnimationFrame(() => {
      $('log-card').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      const f = $(focusId);
      if (f && !f.disabled) f.focus({ preventScroll: true });
    });
  }

  /* ---------- weigh-ins ---------- */
  function renderWeigh() {
    if (!S.me) return;
    const W = S.cfg.weigh, body = $('wbody');
    body.innerHTML = W.map((d, idx) => {
      const tag = idx === 0 ? '<span class="tag">Start</span>' : idx === W.length - 1 ? '<span class="tag">Final</span>' : '';
      const cells = order().map((p) => {
        const kg = kgOf(p, d), base = kgOf(p, W[0]);
        let pct = '';
        if (idx > 0 && kg !== null && base) {
          const v = ((base - kg) / base) * 100;
          pct = `<small class="${v < 0 ? 'up' : v > 0 ? 'down' : ''}">${pctText(v)} ${v < 0 ? 'up' : 'down'}</small>`;
        }
        if (p === S.me && canLog(d) && S.loaded) {
          return kg === null
            ? `<td><button type="button" class="btn btn-tonal cell-btn" data-d="${d}" aria-label="Add your weight for ${fmtDate(d)}">Add</button></td>`
            : `<td><button type="button" class="btn btn-text cell-btn" data-d="${d}" aria-label="Edit your weight for ${fmtDate(d)}"><b>${fmtKg(kg)} kg</b></button>${pct}</td>`;
        }
        return kg === null ? `<td class="muted">${d > S.today ? 'Upcoming' : '–'}</td>` : `<td><b>${fmtKg(kg)} kg</b>${pct}</td>`;
      }).join('');
      return `<tr><th scope="row">${fmtDate(d)}${tag}</th>${cells}</tr>`;
    }).join('');
    renderChart();
  }
  $('wbody').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-d]');
    if (b) goLog(b.dataset.d, 'f-kg');
  });

  function renderChart() {
    const box = $('chart-box'), svg = $('chart'), W = S.cfg.weigh;
    const series = order().map((p) => {
      const base = kgOf(p, W[0]);
      const pts = [];
      if (base) W.forEach((d, i) => { const k = kgOf(p, d); if (k !== null) pts.push({ i, v: ((base - k) / base) * 100 }); });
      return { p, pts };
    });
    const enough = series.some((s) => s.pts.length >= 2);
    $('chart-empty').hidden = enough;
    box.hidden = !enough;
    $('chart-legend').hidden = !enough;
    if (!enough) return;

    const width = Math.max(300, box.clientWidth || 600), height = width < 480 ? 220 : 260;
    const pl = 44, pr = 20, pt = 22, pb = 34;
    const all = series.flatMap((s) => s.pts.map((x) => x.v));
    let lo = Math.min(0, ...all), hi = Math.max(2, ...all);
    const step = hi - lo <= 4 ? 1 : hi - lo <= 8 ? 2 : 5;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (i) => pl + (i * (width - pl - pr)) / (W.length - 1);
    const y = (v) => pt + ((hi - v) / (hi - lo)) * (height - pt - pb);

    let g = '';
    for (let v = lo; v <= hi + 1e-9; v += step) {
      g += `<line class="${v === 0 ? 'zero-l' : 'grid-l'}" x1="${pl}" x2="${width - pr}" y1="${y(v)}" y2="${y(v)}"/>` +
        `<text class="ax" x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
    }
    W.forEach((d, i) => { g += `<text class="ax" x="${x(i)}" y="${height - 10}" text-anchor="middle">${fmtShort(d)}</text>`; });
    series.forEach((s) => {
      if (!s.pts.length) return;
      g += `<path class="ln c-${s.p}" style="fill:none" d="${s.pts.map((q, j) => (j ? 'L' : 'M') + x(q.i) + ' ' + y(q.v)).join('')}"/>`;
      s.pts.forEach((q) => { g += `<circle class="pt c-${s.p}" cx="${x(q.i)}" cy="${y(q.v)}" r="6"/>`; });
      const last = s.pts[s.pts.length - 1];
      if (last.i > 0) g += `<text class="val c-${s.p}" style="stroke:none" x="${x(last.i)}" y="${y(last.v) - 12}" text-anchor="middle">${pctText(last.v)}</text>`;
    });
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = g;
  }
  let resizeT = null;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.me && S.tab === 'weigh') renderChart(); }, 150); });

  /* =====================================================================
     Clock: countdowns, the daily deadline, and the date rolling over
     ===================================================================== */
  function fmtLeft(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? h + 'h ' + pad(m) + 'm' : m + 'm ' + pad(s % 60) + 's';
  }
  function tick() {
    if (!S.me) return;
    const now = Date.now(), t = todayIST();
    if (t !== S.today) {
      const wasOpen = isOpen(), prevLast = lastOpen();
      S.today = t;
      if (isOpen() && !S.dirty && (!wasOpen || S.sel === prevLast)) S.sel = lastOpen();
      renderAll(!S.dirty);
    }
    if (S.today < S.start) {
      const s = Math.max(0, Math.floor((Date.parse(S.start + 'T00:00:00+05:30') - now) / 1000));
      $('c-d').textContent = Math.floor(s / 86400);
      $('c-h').textContent = pad(Math.floor((s % 86400) / 3600));
      $('c-m').textContent = pad(Math.floor((s % 3600) / 60));
      $('c-s').textContent = pad(s % 60);
      $('deadline').hidden = true;
    } else if (S.today <= S.end) {
      const left = Math.floor((deadline(S.today) - now) / 1000), el = $('deadline');
      el.hidden = false;
      el.classList.toggle('urgent', left < 2 * 3600);
      $('deadline-t').textContent = left > 0
        ? (shotOf(S.me, S.today) !== null ? 'Screenshot in. Deadline in ' : 'Add your screenshot by 11:55 pm. ') + fmtLeft(left) + (shotOf(S.me, S.today) !== null ? '.' : ' left.')
        : 'Today’s 11:55 pm deadline has passed.';
      if (shotOf(S.me, S.today) !== null) el.classList.remove('urgent');
    } else $('deadline').hidden = true;
  }
  setInterval(tick, 1000);

  /* =====================================================================
     Boot
     ===================================================================== */
  (async function boot() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
      if (res.ok) { startApp(await res.json()); return; }
      let msg = '';
      if (res.status !== 401) { try { msg = (await res.json()).error || ''; } catch (e) { /* ignore */ } }
      showLogin(msg);
    } catch (e) {
      showLogin('Could not reach the server. Check your connection and reload.');
    }
  })();
})();
