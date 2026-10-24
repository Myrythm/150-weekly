/*
 * Weekly 150 web: the Artifact page script, wrapped so nothing runs at parse time.
 *   W150App.start({ store, profile: { username, displayName }, onLogout(), onClearAll() })
 *     once per page load, after the store is hydrated (a second call returns false and does
 *     nothing). All w150.* data goes through ctx.store; only the theme stays in localStorage.
 *   W150App.reload()         re-read every key from the store and re-render (remote change)
 *   W150App.setSyncStatus(s) 'saving' | 'saved' | 'error', wired to the store's onStatus
 * The global GPX comes from js/gpx-lib.js. The code below keeps the Artifact's order and text.
 */
window.W150App = {
  setSyncStatus: function (state) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.textContent = state === 'saving' ? 'Saving' : state === 'error' ? 'Not saved, retrying' : state === 'saved' ? 'Saved' : '';
    el.setAttribute('data-state', state || '');
  },
  reload: function () { /* replaced by start() */ },
  started: false,
  start: function (ctx) {
  'use strict';
  if (window.W150App.started) return false;
  window.W150App.started = true;
  const store = ctx.store;

  /* ===== Evidence slots: a row renders only when stat, claim and url are all filled ===== */
  const FACTS = [
    { id: "FACT_1", stat: "150 min",
      claim: "WHO's 2020 guideline for adults is 150 to 300 minutes of moderate activity a week, or 75 to 150 minutes of vigorous activity, plus muscle-strengthening on 2 or more days.",
      sourceLabel: "Bull et al., British Journal of Sports Medicine, 2020",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/" },
    { id: "FACT_2", stat: "8,000 steps",
      claim: "In a study of US adults, those who averaged 8,000 steps a day had about half the risk of death over roughly 10 years compared with those who averaged 4,000.",
      sourceLabel: "Saint-Maurice et al., JAMA, 2020;323(12):1151-1160",
      url: "https://jamanetwork.com/journals/jama/fullarticle/2763292" },
    { id: "FACT_3", stat: "97 reviews",
      claim: "Across 97 reviews covering about 128,000 people, physical activity was linked to less depression, anxiety and distress than usual care.",
      sourceLabel: "Singh et al., British Journal of Sports Medicine, 2023;57(18):1203-1209",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10579187/" },
    { id: "FACT_4", stat: "15 min",
      claim: "In 416,175 Taiwanese adults, about 15 minutes of activity a day was linked to a 14% lower risk of death and about three more years of life expectancy.",
      sourceLabel: "Wen et al., The Lancet, 2011;378(9798):1244-1253",
      url: "https://pubmed.ncbi.nlm.nih.gov/21846575/" },
    { id: "FACT_5", stat: "66 days",
      claim: "In 96 people repeating one daily behavior, a new habit typically took about 66 days to feel automatic, with wide variation. One missed day made little difference.",
      sourceLabel: "Lally et al., European Journal of Social Psychology, 2010",
      url: "https://doi.org/10.1002/ejsp.674" },
    { id: "FACT_6", stat: "1 to 2 days",
      claim: "In a large UK study, adults who fit their activity into one or two sessions a week still had lower death rates than inactive adults.",
      sourceLabel: "O'Donovan et al., JAMA Internal Medicine, 2017;177(3):335-342",
      url: "https://doi.org/10.1001/jamainternmed.2016.8014" }
  ];

  /* ===== constants ===== */
  const KEYS = { meta: 'w150.meta', sessions: 'w150.sessions', plan: 'w150.plan', prefs: 'w150.prefs', theme: 'w150.theme', breaks: 'w150.breaks', tracks: 'w150.tracks' };
  const TYPE_LABEL = { walk: 'Walk', run: 'Run', cycle: 'Cycle', strength: 'Strength', swim: 'Swim', yoga: 'Yoga or stretching', sport: 'Sport', stairs: 'Stairs', other: 'Other', balance: 'Balance or tai chi', dance: 'Dance' };
  const VALID_TYPES = ['walk', 'run', 'cycle', 'strength', 'swim', 'yoga', 'sport', 'stairs', 'other', 'habit', 'balance', 'dance'];
  /* Types that make a balance day on their own (65+ group). Any other session can count through its "balance work" flag. */
  const BALANCE_TYPES = ['balance', 'yoga', 'dance'];
  /* Extra log-form activities, added only while the active guide tracks balance days: [value, label, insert before] */
  const BALANCE_OPTIONS = [['balance', 'Balance or tai chi', 'swim'], ['dance', 'Dance', 'sport']];
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const WD_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* ===== WHO 2020 guideline by age group (the single source of every target and target copy) =====
     aerobic: weekly minutes target. vigorousMultiplier: credit per vigorous minute (2 is the adult
     equivalence; children count 1:1). muscleDays / vigorousDays / balanceDays: days per week, 0 = not tracked.
     lane: tick and label spacing on the lane scale.
     stretch: optional stretch goal in minutes, shown once the target is met (adult and 65+ only; absent = none). */
  const GUIDE = {
    child: {
      key: 'child', minAge: 5, maxAge: 17,
      aerobic: 420, perDay: 60, vigorousMultiplier: 1,
      muscleDays: 3, muscleLabel: 'Strength days', vigorousDays: 3, balanceDays: 0,
      lane: { tick: 30, label: 60 },
      copy: {
        chip: 'Age 5 to 17 guideline',
        h1: 'Bank 420 minutes this week.',
        lead: 'That is about 60 minutes a day on average. Play, sport, PE and walking or cycling to school all count. Log what you did and watch your lane fill.',
        logNote: 'For ages 5 to 17, moderate and vigorous minutes count the same toward 420.',
        muscleHelp: 'WHO also suggests vigorous activity and muscle- and bone-strengthening on 3 or more days a week. Running, jumping and sport help build bone.',
        met: 'Target met. Anything extra still counts, so keep playing.',
        zero: 'One active game or a walk to school today is a real start.',
        sit: { p1: "WHO's 2020 guideline says children and teenagers should limit the time they spend sitting, particularly recreational screen time.", p2: 'Getting up and moving between stretches of sitting or screens is an easy habit to build. Try it a few times a day.' },
        lastDay: 'A long game outside, a bike ride or a sports session would do it.',
        footer: 'For ages 5 to 17, Weekly 150 follows the WHO guideline: an average of 60 minutes a day of moderate to vigorous activity, plus vigorous activity and muscle- and bone-strengthening on 3 or more days a week.',
        fact: { stat: '60 min a day', claim: "WHO's 2020 guideline for children and adolescents aged 5 to 17 is an average of 60 minutes a day of moderate to vigorous activity, with vigorous activity and muscle- and bone-strengthening on 3 or more days a week." }
      }
    },
    adult: {
      key: 'adult', minAge: 18, maxAge: 64,
      aerobic: 150, stretch: 300, perDay: 0, vigorousMultiplier: 2,
      muscleDays: 2, muscleLabel: 'Strength days', vigorousDays: 0, balanceDays: 0,
      lane: { tick: 10, label: 30 },
      copy: {
        chip: 'Adult 18 to 64 guideline',
        h1: 'Bank 150 minutes this week.',
        lead: 'Two brisk walks and a few short sessions add up faster than you think. Log what you did, watch your lane fill, come back tomorrow.',
        logNote: 'Vigorous minutes count double toward 150, as in the WHO guideline.',
        muscleHelp: 'WHO also suggests muscle work on 2 or more days a week.',
        met: 'Target met. Anything extra still counts: more activity brings more benefit, up to 300 minutes and beyond.',
        zero: 'One 10-minute walk today is a real start.',
        sit: { p1: "WHO's 2020 guideline says to limit the time you spend sitting, and to swap some of it for movement of any intensity, including light movement. Replacing sitting time with activity brings health benefits.", p2: 'If you sit a lot, WHO says to aim for more than the recommended moderate to vigorous minutes, which helps reduce the harm of long hours of sitting.' },
        lastDay: '',
        footer: 'Weekly 150 follows the WHO guideline for adults: at least 150 minutes of moderate activity a week, or 75 of vigorous, plus muscle work on 2 or more days.',
        fact: null
      }
    },
    older: {
      key: 'older', minAge: 65, maxAge: 120,
      aerobic: 150, stretch: 300, perDay: 0, vigorousMultiplier: 2,
      muscleDays: 2, muscleLabel: 'Strength days', vigorousDays: 0, balanceDays: 3,
      lane: { tick: 10, label: 30 },
      copy: {
        chip: 'Age 65 and over guideline',
        h1: 'Bank 150 minutes this week.',
        lead: 'Walks, gardening and a few short sessions add up faster than you think. Log what you did, watch your lane fill, and keep some strength and balance work in the mix.',
        logNote: 'Vigorous minutes count double toward 150, as in the WHO guideline.',
        muscleHelp: 'WHO also suggests muscle work on 2 or more days a week, and balance and strength activity at moderate effort or more on 3 or more days to help prevent falls.',
        met: 'Target met. Anything extra still counts: more activity brings more benefit, up to 300 minutes and beyond.',
        zero: 'One 10-minute walk today is a real start.',
        sit: { p1: "WHO's 2020 guideline says to limit the time you spend sitting, and to swap some of it for movement of any intensity, including light movement. Replacing sitting time with activity brings health benefits.", p2: 'If you sit a lot, WHO says to aim for more than the recommended moderate to vigorous minutes, which helps reduce the harm of long hours of sitting.' },
        lastDay: '',
        balanceHelp: 'Moves that test your balance, like tai chi, dancing or standing on one leg, help prevent falls. Count sessions at moderate effort or more.',
        footer: 'For ages 65 and over, Weekly 150 follows the WHO guideline: the adult target of at least 150 minutes of moderate activity a week, or 75 of vigorous, plus muscle work on 2 or more days and balance and strength activity at moderate effort or more on 3 or more days to help prevent falls.',
        fact: { stat: '150 min', claim: "WHO's 2020 guideline for adults 65 and over matches the adult one (150 to 300 minutes of moderate activity a week, or 75 to 150 vigorous, plus muscle-strengthening on 2 or more days) and adds balance and strength activity at moderate effort or more on 3 or more days to help prevent falls." }
      }
    }
  };
  /* copy used before an age is set (adult preview) or for under-5s (no targets shown) */
  const GUIDE_NOTE = {
    unsetChip: 'Preview: adult targets until you set your age',
    under5Chip: 'Under 5: no targets here',
    under5H1: 'Made for ages 5 and up.',
    under5Lead: 'Young children need plenty of active play. WHO has a separate guide for under-5s that covers movement, sleep and screen time.',
    footer: 'Weekly 150 follows the WHO 2020 guideline: for adults, at least 150 minutes of moderate activity a week, or 75 of vigorous, plus muscle work on 2 or more days. Children aged 5 to 17 and adults 65 and over have their own targets, set from your age.'
  };
  const SAMPLE_PLAN = { after: 'pour my morning coffee', will: 'do 10 squats', where: 'the kitchen counter', minutes: 2 };
  /* sample move breaks by days back from today (0 = today), shown only while the sample is active and never stored */
  const SAMPLE_BREAKS = [4, 3, 5, 0, 2, 6, 3];
  const BREAK_KEEP_DAYS = 30, BREAK_MAX = 99, NUDGE_MS = 30 * 60 * 1000;
  const PLAN_CHIPS = {
    after: ['pour my morning coffee', 'park the car', 'close my laptop', 'brush my teeth'],
    will: ['do 10 squats', 'walk around the block', 'climb the stairs twice', 'hold a 30 second plank'],
    where: ['the kitchen counter', 'my front door', 'my desk', 'the bottom of the stairs']
  };
  const PENNANT = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1h1.6v12H3z"/><path d="M4.6 1.5L12 4.5 4.6 7.5z"/></svg>';

  /* ===== GPX import settings =====
     Effort thresholds for imported tracks (gpx-research.md). METs: light below 3, moderate 3 to 5.9, vigorous 6 or more
     (WHO 2020, CDC). Speeds: 2024 Adult Compendium bands converted to km/h. Heart rate: CDC 64 to 76% of max HR is
     moderate, 77% and up vigorous; max HR is 220 minus age from 18, and 208 minus 0.7 x age (Tanaka) under 18.
     hr, speedKmh and placeholder go to GPX.classify / GPX.analyze as they are; the rest is read by judgeEffort(). */
  const GPX_THRESHOLDS = {
    placeholder: false,
    hr: { maxHrBase: 220, moderatePct: 64, vigorousPct: 77, minSamples: 10 },
    speedKmh: {
      walk: { moderate: 4.0, vigorous: 7.2 },    /* below 4.0 light (2.3 to 2.8 METs), 7.2 and up 7.0+ METs */
      run: { moderate: 4.2, vigorous: 6.4 },     /* jogging 4.2 to 6.3 is 3.3 METs; 6.4 and up 6.5+ METs */
      cycle: { moderate: 0, vigorous: 16.1 },    /* leisure riding below 16.1 is 4.0 to 5.8 METs */
      swim: { moderate: 1.6, vigorous: 2.6 }     /* crawl 1.6 to 2.5 is 5.8 METs, 2.6 and up 8.0+ */
    },
    runAsWalkBelowKmh: 4.2,          /* a "run" slower than this is judged with the walking bands */
    swimSpeedTrustKmh: [1.6, 6.0],   /* GPS swim speed outside the crawl table is not trusted ... */
    openWater: 'vigorous',           /* ... and open-water swimming (6.0 METs) applies instead */
    tanakaUnderAge: 18
  };
  const TRACK_CAP = 30;                          /* route details kept for the 30 most recent imports */
  const GPX_MAX_BYTES = 25 * 1024 * 1024;
  const SAMPLE_TRACK_ID = 't_sample';            /* the sample run's track is generated in code, never stored */
  const GPX_TYPES = ['run', 'walk', 'cycle', 'swim', 'other'];
  const TYPE_WORD = { run: 'running', walk: 'walking', cycle: 'cycling', swim: 'swimming', other: 'this activity' };


  const $ = function (id) { return document.getElementById(id); };
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  /* ===== storage helpers: data goes through the injected store, only the theme uses localStorage (in try/catch) ===== */
  function load(key, fallback) { try { const v = store.get(key, null); return v === null || v === undefined ? fallback : v; } catch (e) { return fallback; } }
  function save(key, value) { try { return store.set(key, value) === true; } catch (e) { return false; } }
  function removeKey(key) { try { return store.remove(key) === true; } catch (e) { return false; } }
  function loadTheme() { try { const v = localStorage.getItem(KEYS.theme); return v ? JSON.parse(v) : 'auto'; } catch (e) { return 'auto'; } }
  function saveTheme(v) { try { localStorage.setItem(KEYS.theme, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  const storageOk = true;

  /* ===== theme (applied first) ===== */
  let theme = 'auto';
  (function initTheme() {
    const t = loadTheme();
    theme = (t === 'light' || t === 'dark') ? t : 'auto';
    applyTheme();
  })();
  function applyTheme() {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    const btn = $('theme-toggle');
    if (btn) btn.textContent = 'Theme: ' + theme.charAt(0).toUpperCase() + theme.slice(1);
  }

  /* ===== tiny DOM builder (text only, never innerHTML with user data) ===== */
  function h(tag, props) {
    const e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        const v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    for (let i = 2; i < arguments.length; i++) {
      const kid = arguments[i];
      if (kid === null || kid === undefined || kid === false) continue;
      if (Array.isArray(kid)) kid.forEach(function (k2) { if (k2) e.append(k2.nodeType ? k2 : document.createTextNode(String(k2))); });
      else e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }

  /* ===== dates (local time only) ===== */
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function today() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function dayIndex(d) { return (d.getDay() + 6) % 7; }
  function weekStart(d) { return addDays(d, -dayIndex(d)); }
  function plural(n, one, many) { return n === 1 ? one : many; }
  function makeId() { return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ===== state ===== */
  let meta = { v: 1, seeded: true, sampleActive: false };
  let sessions = [];
  let plan = null;
  let prefs = { sound: false, age: null, nudge: false };   /* age: whole years 0 to 120, or null until asked; nudge: the 30 minute sitting nudge */
  let breaks = {};                            /* move breaks per day: { 'YYYY-MM-DD': count }, last 30 days only */
  let askingAge = false;                      /* true while the user reopened the age step with Change age */
  let tracks = {};                            /* imported GPX details by trackId (w150.tracks), loaded at init */

  const PREV_WEEKS = [
    [[0, 'walk', 55, 'M'], [2, 'run', 25, 'V'], [4, 'strength', 20, 'M'], [5, 'cycle', 50, 'M']],
    [[1, 'walk', 60, 'M'], [3, 'strength', 20, 'M'], [5, 'run', 30, 'V'], [6, 'walk', 35, 'M']],
    [[0, 'walk', 30, 'M'], [3, 'walk', 25, 'M'], [5, 'cycle', 40, 'M']],
    [[1, 'run', 25, 'V'], [2, 'strength', 20, 'M'], [4, 'walk', 60, 'M'], [6, 'swim', 40, 'M']],
    [[2, 'walk', 20, 'M'], [6, 'walk', 45, 'M']],
    [[0, 'yoga', 30, 'M'], [3, 'walk', 30, 'M'], [5, 'run', 20, 'V']],
    [[0, 'walk', 40, 'M'], [1, 'strength', 25, 'M'], [3, 'run', 25, 'V'], [5, 'cycle', 60, 'M']],
    [[4, 'walk', 25, 'M']],
    [[3, 'walk', 20, 'L']],
    [[1, 'walk', 20, 'M'], [5, 'walk', 30, 'M']],
    [[2, 'sport', 45, 'M']]
  ];
  /* aerobic minutes: 40 + 36 (18 vigorous x2) + 20 = 96. The strength row is a muscle day and the light row is light activity: both add 0.
     The fourth field flags a walk that included balance work: the 65+ sample reads 1 of 3 balance days, other groups see no change. */
  /* The fifth field 'gpx' marks the sample run as an imported track (generated in code by sampleTrack()), so Details works without an upload. */
  const CUR_WEEK = [['walk', 40, 'M', true], ['strength', 15, 'M'], ['walk', 15, 'L'], ['run', 18, 'V', false, 'gpx'], ['walk', 20, 'M']];

  function seedSessions() {
    const t = today(), ws = weekStart(t), di = dayIndex(t);
    const rows = [];
    PREV_WEEKS.forEach(function (arr, i) {
      arr.forEach(function (r) { rows.push([addDays(ws, -7 * (i + 1) + r[0]), r[1], r[2], r[3], false, false]); });
    });
    CUR_WEEK.forEach(function (r, i) { rows.push([addDays(ws, Math.floor(i * (di + 1) / CUR_WEEK.length)), r[0], r[1], r[2], r[3] === true, r[4] === 'gpx']); });
    const base = Date.now();
    return rows.map(function (r, i) {
      const s = { id: makeId() + i, date: ymd(r[0]), type: r[1], minutes: r[2], intensity: r[3] === 'V' ? 'vigorous' : r[3] === 'L' ? 'light' : 'moderate', balance: r[4] === true, source: r[5] ? 'gpx' : 'log', sample: true, createdAt: base - (rows.length - i) * 1000 };
      if (r[5]) s.trackId = SAMPLE_TRACK_ID;
      return s;
    });
  }

  function sanitizeSessions(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    list.forEach(function (s) {
      if (!s || typeof s !== 'object') return;
      if (typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return;
      if (VALID_TYPES.indexOf(s.type) < 0) return;
      const m = Number(s.minutes);
      if (!Number.isInteger(m) || m < 1 || m > 240) return;
      const o = { id: typeof s.id === 'string' ? s.id : makeId(), date: s.date, type: s.type, minutes: m, intensity: (s.intensity === 'vigorous' || s.intensity === 'light') ? s.intensity : 'moderate', balance: s.balance === true, source: (s.source === 'plan' || s.source === 'snack' || s.source === 'gpx') ? s.source : 'log', sample: !!s.sample, createdAt: Number(s.createdAt) || Date.now() };
      if (typeof s.note === 'string') o.note = s.note;
      if (typeof s.trackId === 'string' && /^t_[a-z0-9]{1,40}$/.test(s.trackId)) o.trackId = s.trackId;
      out.push(o);
    });
    return out;
  }
  function sanitizeAge(a) {
    return (typeof a === 'number' && Number.isInteger(a) && a >= 0 && a <= 120) ? a : null;
  }
  function sanitizeBreaks(b) {
    const out = {};
    if (!b || typeof b !== 'object' || Array.isArray(b)) return out;
    const cutoff = ymd(addDays(today(), -BREAK_KEEP_DAYS));
    Object.keys(b).forEach(function (k) {
      const n = b[k];
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && k >= cutoff && Number.isInteger(n) && n >= 1) out[k] = Math.min(n, BREAK_MAX);
    });
    return out;
  }
  function saveBreaks() {
    breaks = sanitizeBreaks(breaks);
    if (storageOk) save(KEYS.breaks, breaks);
  }
  function sanitizePlan(p) {
    if (!p || typeof p !== 'object') return null;
    const a = String(p.after || '').trim().slice(0, 60), w = String(p.will || '').trim().slice(0, 60), l = String(p.where || '').trim().slice(0, 60);
    if (!a || !w || !l) return null;
    let m = Number(p.minutes); if (!Number.isInteger(m) || m < 1 || m > 30) m = 2;
    return { after: a, will: w, where: l, minutes: m, sample: !!p.sample, savedAt: Number(p.savedAt) || Date.now() };
  }

  function persist() {
    const cutoff = ymd(addDays(today(), -120));
    sessions = sessions.filter(function (s) { return s.date >= cutoff; });
    if (!storageOk) return false;
    const a = save(KEYS.meta, meta), b = save(KEYS.sessions, sessions), c = save(KEYS.plan, plan), d = save(KEYS.prefs, prefs);
    return a && b && c && d;
  }

  /* A sample stored before the balance field existed: flag its first current-week walk so the 65+ sample reads 1 of 3. */
  function migrateSampleBalance(raw) {
    if (!meta.sampleActive || !Array.isArray(raw)) return;
    if (raw.some(function (s) { return s && typeof s === 'object' && 'balance' in s; })) return;
    const ws = ymd(weekStart(today()));
    const hit = sessions.find(function (s) { return s.sample && s.type === 'walk' && s.intensity === 'moderate' && s.date >= ws; });
    if (hit) { hit.balance = true; persist(); }
  }

  function loadState() {
    const m = storageOk ? load(KEYS.meta, null) : null;
    const stored = storageOk ? load(KEYS.sessions, null) : null;
    prefs = Object.assign({ sound: false, age: null, nudge: false }, (storageOk ? load(KEYS.prefs, null) : null) || {});
    prefs.sound = !!prefs.sound;
    prefs.nudge = prefs.nudge === true;
    breaks = sanitizeBreaks(storageOk ? load(KEYS.breaks, null) : null);
    prefs.age = sanitizeAge(prefs.age);
    if (m && typeof m === 'object') {
      meta = { v: 1, seeded: true, sampleActive: !!m.sampleActive };
      sessions = sanitizeSessions(stored);
      plan = sanitizePlan(storageOk ? load(KEYS.plan, null) : null);
    } else if (Array.isArray(stored) && stored.length) {
      sessions = sanitizeSessions(stored);
      plan = sanitizePlan(load(KEYS.plan, null));
      meta = { v: 1, seeded: true, sampleActive: sessions.some(function (s) { return s.sample; }) };
      persist();
    } else {
      meta = { v: 1, seeded: true, sampleActive: true };
      sessions = seedSessions();
      plan = Object.assign({ sample: true, savedAt: Date.now() }, SAMPLE_PLAN);
      persist();
    }
    migrateSampleBalance(stored);
    tracks = sanitizeTracks(storageOk ? load(KEYS.tracks, null) : null);
    (function initTracks() {
      const n = Object.keys(tracks).length;
      migrateSampleGpx();
      pruneTracks();
      if (storageOk && Object.keys(tracks).length !== n) saveTracks();
    })();
  }

  /* ===== age group and active guideline ===== */
  /* 'unset' (no age yet), 'under5', or a GUIDE key: 'child', 'adult', 'older' */
  function ageGroup(age) {
    if (age === null || age === undefined) return 'unset';
    if (age < 5) return 'under5';
    if (age <= GUIDE.child.maxAge) return 'child';
    if (age <= GUIDE.adult.maxAge) return 'adult';
    return 'older';
  }
  function currentGroup() { return ageGroup(prefs.age); }
  function hasTargets() { return !!GUIDE[currentGroup()]; }
  /* The guide every readout uses. Before an age is set the page previews the adult guide.
     Under-5s get no targets on screen; their minutes are counted 1:1 like the child group. */
  function activeGuide() {
    const k = currentGroup();
    return GUIDE[k] || (k === 'under5' ? GUIDE.child : GUIDE.adult);
  }
  function ageStepOpen() { const k = currentGroup(); return k === 'unset' || k === 'under5' || askingAge; }

  /* ===== derived values ===== */
  /* Aerobic credit only. Strength sessions count toward muscle days, never toward minutes (WHO 2020 treats them separately). */
  function isStrength(s) { return s.type === 'strength'; }
  /* Light activity (below about 3 METs) is recorded and shown but earns no aerobic credit in any age group. */
  function isLight(s) { return !isStrength(s) && s.intensity === 'light'; }
  /* Qualifying session for the 65+ balance guideline: a balance, yoga or dance session, or any session flagged "included balance work". Effort is not checked here. */
  function isBalance(s) { return s.balance === true || BALANCE_TYPES.indexOf(s.type) >= 0; }
  /* The one balance-day check, used by calc(), the splits tag, the log messages and the routines: a qualifying session at moderate effort or more (WHO 2020). Strength is stored as moderate, so a flagged strength session still counts. credit() still follows effort. */
  function countsAsBalance(s) { return isBalance(s) && s.intensity !== 'light'; }
  function credit(s) { return (isStrength(s) || isLight(s)) ? 0 : (s.intensity === 'vigorous' ? s.minutes * activeGuide().vigorousMultiplier : s.minutes); }
  function actLabel(s) { return s.type === 'habit' ? 'Plan: ' + (s.note || 'habit') : TYPE_LABEL[s.type]; }
  function weekCredit(ws) {
    const a = ymd(ws), b = ymd(addDays(ws, 6));
    let sum = 0, n = 0;
    sessions.forEach(function (s) { if (s.date >= a && s.date <= b) { sum += credit(s); n++; } });
    return { credit: sum, count: n };
  }
  function calc() {
    const g = activeGuide(), target = g.aerobic;
    const t = today(), ws = weekStart(t), di = dayIndex(t);
    const a = ymd(ws), b = ymd(addDays(ws, 6));
    const cur = sessions.filter(function (s) { return s.date >= a && s.date <= b; });
    let mod = 0, vig = 0;
    let strengthMin = 0, lightMin = 0;
    cur.forEach(function (s) { if (isStrength(s)) strengthMin += s.minutes; else if (isLight(s)) lightMin += s.minutes; else if (s.intensity === 'vigorous') vig += s.minutes; else mod += s.minutes; });
    const total = mod + vig * g.vigorousMultiplier;
    const strengthDays = new Set(cur.filter(function (s) { return s.type === 'strength'; }).map(function (s) { return s.date; })).size;
    const balanceDays = new Set(cur.filter(countsAsBalance).map(function (s) { return s.date; })).size;
    const vigDays = new Set(cur.filter(function (s) { return s.intensity === 'vigorous' && !isStrength(s); }).map(function (s) { return s.date; })).size;
    const lw = weekCredit(addDays(ws, -7));
    let streak = 0;
    for (let k = 1; k <= 20; k++) { if (weekCredit(addDays(ws, -7 * k)).credit >= target) streak++; else break; }
    const thisHit = total >= target;
    if (thisHit) streak++;
    return { guide: g, target: target, group: currentGroup(), today: t, ws: ws, di: di, daysLeft: 7 - di, cur: cur, mod: mod, vig: vig, total: total, remaining: Math.max(0, target - total), strengthDays: strengthDays, strengthMin: strengthMin, lightMin: lightMin, balanceDays: balanceDays, vigDays: vigDays, lastWeek: lw, streak: streak, thisHit: thisHit };
  }

  /* ===== announcements ===== */
  function announce(msg) {
    const el = $('live'); el.textContent = '';
    setTimeout(function () { el.textContent = msg; }, 60);
  }

  /* ===== sample handling ===== */
  function clearSample() {
    sessions = sessions.filter(function (s) { return !s.sample; });
    if (plan && plan.sample) plan = null;
    meta.sampleActive = false;
    persist();
    announce('Sample cleared. Your log starts now.');
  }

  /* ===== render: hero ===== */
  let bibShown = null, bibRaf = 0, bibSettle = 0;
  function fmtBib(n) { return String(Math.round(n)).padStart(3, '0'); }
  function setBibNumber(n) {
    const node = $('bib-number');
    cancelAnimationFrame(bibRaf);
    clearTimeout(bibSettle);
    if (bibShown === null || reduced() || bibShown === n) { node.textContent = fmtBib(n); bibShown = n; return; }
    const from = bibShown, t0 = performance.now();
    bibShown = n;
    (function step(now) {
      const p = Math.min(1, (now - t0) / 400);
      node.textContent = fmtBib(from + (n - from) * p);
      if (p < 1) bibRaf = requestAnimationFrame(step);
    })(t0);
    /* safety net: if frames are throttled (background tab), still land on the exact value */
    bibSettle = setTimeout(function () { cancelAnimationFrame(bibRaf); node.textContent = fmtBib(n); }, 450);
  }

  function nextStepLine(c) {
    const g = c.guide, rem = c.remaining, mult = g.vigorousMultiplier;
    if (c.total >= c.target && g.stretch) {
      if (c.total >= g.stretch) return 'Stretch goal met: ' + c.total + ' minutes this week. Anything extra still counts.';
      return 'Target met. Stretch goal: ' + g.stretch + ' minutes for extra benefit, ' + (g.stretch - c.total) + ' to go.';
    }
    if (c.total >= c.target) return g.copy.met;
    if (c.daysLeft === 1) return rem + ' minutes to go today. ' + (mult > 1 ? 'A ' + Math.ceil(rem / mult) + '-minute run would do it, so would a long walk.' : g.copy.lastDay);
    if (c.total === 0) return c.target + ' minutes to go with ' + c.daysLeft + ' days left. ' + g.copy.zero;
    return rem + ' minutes to go with ' + c.daysLeft + ' days left. That is about ' + Math.ceil(rem / c.daysLeft) + ' minutes a day' + (mult > 1 ? ', or ' + Math.ceil(rem / mult) + ' minutes of running in total.' : '.');
  }
  function fillBoxes(id, count, on) {
    const box = $(id);
    if (box.children.length !== count) { box.replaceChildren(); for (let i = 0; i < count; i++) box.append(h('i')); }
    for (let i = 0; i < box.children.length; i++) box.children[i].classList.toggle('on', i < on);
  }

  function renderHero(c) {
    const sample = meta.sampleActive;
    const g = c.guide, target = c.target, total = c.total, mult = g.vigorousMultiplier;
    $('bib').setAttribute('aria-label', 'This week: ' + total + ' of ' + target + ' active minutes');
    $('bib').classList.toggle('is-sample', sample);
    $('bib-sample-tag').hidden = !sample;
    $('bib-week').textContent = 'Week of ' + c.ws.getDate() + ' ' + MON[c.ws.getMonth()].toUpperCase();
    $('bib-target').textContent = 'Target ' + target;
    setBibNumber(total);
    $('bib-status').textContent = total >= target ? 'Target met' + (total > target ? ' +' + (total - target) + ' extra' : '') : c.remaining + ' to go';

    /* lane */
    const vigCredit = c.vig * mult;
    const denom = Math.max(target, total);
    $('seg-mod').style.width = (c.mod / denom * 100) + '%';
    $('seg-vig').style.width = (vigCredit / denom * 100) + '%';
    $('lane').classList.toggle('is-sample', sample);
    const pct = Math.min(total, target) / target * 100;
    const marker = $('lane-marker');
    marker.style.setProperty('--pct', String(pct));
    marker.textContent = total > target ? target + '+' : String(total);
    const over = $('lane-over');
    over.hidden = total <= target;
    over.textContent = '+' + (total - target);
    /* stretch goal progress: only once the target is met and the group has a stretch goal (adult and 65+) */
    const stretchLabel = $('lane-stretch');
    stretchLabel.hidden = !(g.stretch && total >= target);
    if (!stretchLabel.hidden) stretchLabel.textContent = 'Stretch ' + g.stretch + ': ' + total;
    const meter = $('lane-wrap');
    meter.setAttribute('aria-label', 'Active minutes this week toward ' + target);
    meter.setAttribute('aria-valuemax', String(target));
    meter.setAttribute('aria-valuenow', String(Math.min(total, target)));
    meter.setAttribute('aria-valuetext', total >= target ? (total + ' of ' + target + ' minutes, target met') : (total + ' of ' + target + ' minutes, ' + c.remaining + ' to go'));
    $('legend-mod').textContent = 'Moderate ' + c.mod + ' min';
    $('legend-light').textContent = 'Light: ' + c.lightMin + ' min this week (not counted)';
    $('legend-vig').textContent = mult > 1 ? 'Vigorous ' + c.vig + ' min x' + mult + ' = ' + vigCredit : 'Vigorous ' + c.vig + ' min';

    /* next step */
    $('next-step').textContent = nextStepLine(c);

    /* strength (and vigorous days for the 5 to 17 group) */
    const sd = Math.min(c.strengthDays, g.muscleDays);
    $('strength-count').textContent = sd + ' of ' + g.muscleDays;
    fillBoxes('strength-boxes', g.muscleDays, sd);
    $('vig-days').hidden = !g.vigorousDays;
    if (g.vigorousDays) {
      const vd = Math.min(c.vigDays, g.vigorousDays);
      $('vig-count').textContent = vd + ' of ' + g.vigorousDays;
      fillBoxes('vig-boxes', g.vigorousDays, vd);
    }
    renderBalance(c);

    /* last week */
    const lw = $('lastweek');
    if (c.lastWeek.count > 0) {
      lw.hidden = false;
      lw.textContent = 'Last week: ' + c.lastWeek.credit + ' of ' + target + '.' + (c.lastWeek.credit >= target ? ' Target met.' : '');
    } else lw.hidden = true;

    $('sample-banner').hidden = !sample;
    $('grid-sample-tag').hidden = !sample;
  }

  /* Balance days, shown only for groups whose guide tracks them (65+). */
  function renderBalance(c) {
    const box = $('balance');
    if (!box || !c) return;
    const g = c.guide;
    box.hidden = !(g.balanceDays > 0);
    if (box.hidden) return;
    const bd = Math.min(c.balanceDays, g.balanceDays);
    $('balance-count').textContent = bd + ' of ' + g.balanceDays;
    fillBoxes('balance-boxes', g.balanceDays, bd);
    $('balance-help').textContent = g.copy.balanceHelp;
  }

  /* lane scale for the active guide; rebuilt when the age group changes */
  function buildLane(g) {
    const target = g.aerobic, tick = g.lane.tick, step = g.lane.label;
    const scale = $('lane-scale');
    Array.prototype.slice.call(scale.querySelectorAll('.tick')).forEach(function (t) { t.remove(); });
    for (let m = 0; m < target; m += tick) {
      const tall = m % step === 0;
      scale.insertBefore(h('span', { class: 'tick' + (tall ? ' tick-tall' : ''), style: 'left:' + (m / target * 100) + '%' }), scale.firstChild);
    }
    const labels = [[0, '0', 'l-first']];
    for (let m = step; m < target; m += step) labels.push([m, String(m), 'l-desk']);
    labels.push([target / 2, String(target / 2), 'l-mob']);
    labels.push([target, target + ' FINISH', '']);
    const box = $('lane-labels');
    box.replaceChildren();
    labels.forEach(function (l) { box.append(h('span', { class: l[2], style: 'left:' + (l[0] / target * 100) + '%', text: l[1] })); });
  }

  /* ===== log form: strength is a muscle day (effort hidden); light is logged but not counted; 65+ can log balance work ===== */
  function syncActivityOptions(g) {
    const sel = $('log-activity'), want = g.balanceDays > 0;
    BALANCE_OPTIONS.forEach(function (o) {
      const el = $('log-opt-' + o[0]);
      if (want && !el) {
        const opt = new Option(o[1], o[0]);
        opt.id = 'log-opt-' + o[0];
        sel.insertBefore(opt, sel.querySelector('option[value="' + o[2] + '"]'));
      } else if (!want && el) {
        if (sel.value === o[0]) sel.value = 'walk';
        el.remove();
      }
    });
  }
  /* the intensity the form will store: strength is always moderate (the effort group is hidden for it) */
  function formIntensity(type) { return type === 'strength' ? 'moderate' : $('log-int-vig').checked ? 'vigorous' : $('log-int-light').checked ? 'light' : 'moderate'; }
  function syncLogForm(g) {
    const guide = g || activeGuide();
    syncActivityOptions(guide);
    const type = $('log-activity').value;
    const strength = type === 'strength';
    const light = $('log-int-light').checked, vig = $('log-int-vig').checked;
    const tracks = guide.balanceDays > 0, native = BALANCE_TYPES.indexOf(type) >= 0;
    $('log-balance-row').hidden = !tracks || native;
    if (!tracks) $('log-balance-work').checked = false;
    const probe = { type: type, balance: $('log-balance-work').checked, intensity: formIntensity(type) };
    /* light never counts; for a light balance-type or flagged session the note says why */
    const balNote = !tracks ? '' : countsAsBalance(probe) ? ' It also counts as a balance day.' : isBalance(probe) ? ' Balance days need moderate effort or more.' : '';
    $('log-effort').hidden = strength;
    $('log-int-help').textContent = light ? 'A slow stroll or light housework. You can talk and sing easily.' : vig ? 'You can only say a few words before you need a breath.' : 'You can talk, but not sing.';
    $('log-int-note').textContent = (strength ? 'Strength counts as a muscle day, not toward your ' + guide.aerobic + ' minutes.' : light ? 'Light movement is good for you and breaks up sitting. It does not count toward your ' + guide.aerobic + ' minutes.' : guide.copy.logNote) + balNote;
  }

  /* ===== age step and guide copy ===== */
  let appliedGroup = '';
  /* updates every piece of copy that depends on the age group; runs on each renderAll */
  function applyGuide(c) {
    const g = c.guide, group = c.group, covered = hasTargets();
    if (group !== appliedGroup) {
      buildLane(g);
      renderFacts();
      if (T.r && !routineVisible(T.r)) {
        stopInterval();
        T.state = 'idle'; T.r = null; T.steps = []; T.bounds = []; T.acc = 0; T.idx = 0; T.logged = false; T.pendingSwitch = null;
        $('snack-switch').hidden = true;
        renderTimer();
      }
      renderRoutines();
      appliedGroup = group;
    }
    const u5 = group === 'under5';
    $('week-heading').textContent = u5 ? GUIDE_NOTE.under5H1 : g.copy.h1;
    $('week-lead').textContent = u5 ? GUIDE_NOTE.under5Lead : g.copy.lead;
    const chip = $('age-chip');
    chip.textContent = group === 'unset' ? GUIDE_NOTE.unsetChip : u5 ? GUIDE_NOTE.under5Chip : g.copy.chip;
    chip.classList.toggle('is-preview', !covered);
    $('targets').hidden = u5;
    syncLogForm(g);
    $('strength-label').textContent = g.muscleLabel;
    $('strength-help').textContent = g.copy.muscleHelp;
    $('strength').title = g.copy.muscleHelp;
    $('footer-guide').textContent = covered ? g.copy.footer : GUIDE_NOTE.footer;
    $('streak-intro').textContent = 'One square per day. Darker means more aerobic minutes; a ringed square is a strength-only day and a dotted square is a light-only day. ' + (u5 ? '' : 'A flag marks every week you reached ' + c.target + '. ') + 'Missed days happen; the week is what counts.';
    $('sit-p1').textContent = g.copy.sit.p1;
    $('sit-p2').textContent = g.copy.sit.p2;
    $('sit-light-note').textContent = 'It shows in your log but does not count toward your ' + g.aerobic + ' minutes.';
    $('tile-weeks-label').textContent = 'Weeks at ' + c.target;
    $('legend-hit').textContent = 'Hit ' + c.target;
    $('legend-hit').hidden = u5;
    $('legend-flag').hidden = u5;
    $('legend-hit-group').hidden = u5;
    $('tiles').hidden = u5;
    $('streak-msg').hidden = u5;

    /* the age step replaces the log panel while it is open */
    const open = ageStepOpen();
    $('age-step').hidden = !open;
    $('log').hidden = open;
    $('band-grid').classList.toggle('is-asking', open);
    $('age-change').hidden = open;
    $('age-cancel').hidden = !(open && covered);
    $('age-under5').hidden = !u5;
  }

  function showAgeError(on) {
    const inp = $('age-input');
    $('age-err').hidden = !on;
    if (on) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
  }
  function focusAgeInput() {
    try { $('age-step').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) { /* ignore */ }
    $('age-input').focus({ preventScroll: true });
  }
  function openAgeStep() {
    askingAge = true;
    $('age-input').value = prefs.age === null ? '' : String(prefs.age);
    showAgeError(false);
    renderAll();
    focusAgeInput();
  }
  function closeAgeStep() {
    askingAge = false;
    showAgeError(false);
    renderAll();
    $('age-change').focus();
  }
  function onAgeSubmit(ev) {
    ev.preventDefault();
    const inp = $('age-input');
    const raw = inp.value.trim(), n = Number(raw);
    if (!/^\d{1,3}$/.test(raw) || n > 120) {
      showAgeError(true);
      inp.focus();
      return;
    }
    showAgeError(false);
    prefs.age = n;
    askingAge = false;
    persist();
    renderAll();
    if (currentGroup() === 'under5') {
      announce('This tracker starts at age 5. WHO has a separate guide for younger children.');
      inp.focus();
      return;
    }
    announce('Targets set: ' + activeGuide().copy.chip + '.');
    $('age-change').focus();
  }

  /* ===== render: log panel date options ===== */
  function buildDateOptions() {
    const sel = $('log-date');
    const prev = sel.selectedIndex >= 0 ? sel.selectedIndex : 0;
    const t = today();
    sel.replaceChildren();
    for (let i = 0; i < 7; i++) {
      const d = addDays(t, -i);
      const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : WD[dayIndex(d)] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
      sel.append(new Option(label, ymd(d)));
    }
    sel.selectedIndex = prev;
  }

  /* ===== render: splits ===== */
  let lastRemoved = null, lastRemovedTrack = null, undoTimer = 0;
  function renderSplits(c) {
    const body = $('splits-body');
    body.replaceChildren();
    const rows = c.cur.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt; });
    rows.forEach(function (s) {
      const d = parseYmd(s.date), di = dayIndex(d);
      const label = actLabel(s), muscle = isStrength(s), light = isLight(s);
      const bal = c.guide.balanceDays > 0 && countsAsBalance(s);
      const gpx = s.source === 'gpx';
      const actCell = h('td', { class: 'c-act', role: 'cell' }, label, gpx ? [' ', h('span', { class: 'tag tag-neutral', title: 'Imported from a GPX file', text: 'GPX' })] : null, s.sample ? [' ', h('span', { class: 'tag tag-sample', text: 'Sample' })] : null, bal ? [' ', h('span', { class: 'tag tag-neutral', text: 'Balance' })] : null);
      const tr = h('tr', { role: 'row', 'data-id': s.id, class: s.sample ? 'is-sample' : '' },
        h('td', { class: 'c-day', role: 'cell', text: WD[di] + ' ' + d.getDate() }),
        actCell,
        h('td', { class: 'c-min num', role: 'cell', text: String(s.minutes) }),
        h('td', { class: 'c-eff', role: 'cell' }, muscle ? [h('span', { class: 'muted', 'aria-hidden': 'true', text: '-' }), h('span', { class: 'sr-only', text: 'Not applicable' })] : h('span', { class: 'tag ' + (s.intensity === 'vigorous' ? 'tag-vig' : light ? 'tag-neutral' : 'tag-mod'), text: s.intensity })),
        h('td', { class: 'c-counts num' + (muscle ? ' is-muscle' : light ? ' is-light' : ''), role: 'cell', text: muscle ? 'Muscle day' : light ? 'Not counted' : String(credit(s)) }),
        h('td', { class: 'c-rm', role: 'cell' }, h('span', { class: 'c-btns' },
          gpx ? h('button', { class: 'btn-text', type: 'button', id: 'details-' + s.id, 'data-details': s.id, 'aria-label': 'Details for ' + label + ', ' + WD_LONG[di], text: 'Details' }) : null,
          h('button', { class: 'btn-text', type: 'button', id: 'remove-' + s.id, 'data-remove': s.id, 'aria-label': 'Remove ' + label + ', ' + s.minutes + ' minutes, ' + WD_LONG[di], text: 'Remove' })))
      );
      body.append(tr);
    });
    renderEarlier(c);
    $('splits-total').textContent = String(c.total);
    $('splits-table').hidden = rows.length === 0;
    $('splits-empty').hidden = rows.length !== 0;
    const hasS = rows.some(isStrength), hasL = rows.some(isLight);
    $('splits-note').hidden = !(hasS || hasL);
    $('splits-note').textContent = hasS && hasL ? 'Strength work counts toward muscle days, not minutes. Light activity is good for you but is not counted either. The week total is aerobic minutes only.'
      : hasL ? 'Light activity is good for you but does not count toward your ' + c.target + ' minutes. The week total is aerobic minutes only.'
      : 'Strength work counts toward muscle days, not minutes. The week total is aerobic minutes only.';
  }

  function hideUndo() { clearTimeout(undoTimer); $('undo-bar').hidden = true; lastRemoved = null; lastRemovedTrack = null; }
  function removeSession(id) {
    const i = sessions.findIndex(function (s) { return s.id === id; });
    if (i < 0) return;
    const s = sessions.splice(i, 1)[0];
    lastRemoved = s;
    /* an imported session takes its stored route with it; Undo puts both back */
    lastRemovedTrack = (s.trackId && tracks[s.trackId]) ? { id: s.trackId, rec: tracks[s.trackId] } : null;
    if (lastRemovedTrack) { delete tracks[s.trackId]; saveTracks(); }
    if (DETAIL.id === s.id) closeDetail(false);
    persist();
    renderAll();
    $('undo-text').textContent = 'Removed ' + actLabel(s) + ', ' + s.minutes + ' min.';
    $('undo-bar').hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, 6000);
    $('undo-btn').focus();
  }
  function undoRemove() {
    if (!lastRemoved) return;
    const s = lastRemoved, tr = lastRemovedTrack;
    sessions.push(s);
    persist();
    if (tr) { tracks[tr.id] = tr.rec; saveTracks(); }
    hideUndo();
    renderAll();
    const btn = document.getElementById('remove-' + s.id);
    if (btn) btn.focus();
  }

  /* ===== render: consistency grid ===== */
  function renderGrid(c) {
    const g = $('grid');
    g.replaceChildren();
    const dayCredit = {}, dayRaw = {}, dayStr = {}, dayLight = {};
    sessions.forEach(function (s) { dayCredit[s.date] = (dayCredit[s.date] || 0) + credit(s); dayRaw[s.date] = (dayRaw[s.date] || 0) + s.minutes; if (isStrength(s)) dayStr[s.date] = (dayStr[s.date] || 0) + s.minutes; if (isLight(s)) dayLight[s.date] = (dayLight[s.date] || 0) + s.minutes; });
    const weeks = [];
    for (let k = 0; k < 12; k++) {
      const ws = addDays(c.ws, -7 * (11 - k));
      weeks.push({ ws: ws, hit: c.group !== 'under5' && weekCredit(ws).credit >= c.target });
    }
    const todayS = ymd(c.today);
    g.append(h('span'));
    weeks.forEach(function (w, k) {
      const mo = w.ws.getMonth();
      let show = k === 0 ? (weeks[1].ws.getMonth() === mo) : (weeks[k - 1].ws.getMonth() !== mo);
      g.append(h('span', { class: 'g-month', text: show ? MON[mo] : '' }));
    });
    for (let r = 0; r < 7; r++) {
      g.append(h('span', { class: 'g-row', text: (r === 0 ? 'M' : r === 2 ? 'W' : r === 4 ? 'F' : '') }));
      weeks.forEach(function (w) {
        const d = addDays(w.ws, r), ds = ymd(d);
        const cr = dayCredit[ds] || 0, str = dayStr[ds] || 0, lt = dayLight[ds] || 0, raw = (dayRaw[ds] || 0) - str - lt;
        const future = ds > todayS;
        const lvStep = c.target / 7.5;   /* 20 and 40 min for a 150 target */
        /* 'lvs' = strength work but no aerobic minutes; 'lvl' = light activity only. Both are active days, neither is aerobic. */
        const lv = cr === 0 ? (str > 0 ? 's' : lt > 0 ? 'l' : 0) : cr < lvStep ? 1 : cr < lvStep * 2 ? 2 : 3;
        const ltNote = lt > 0 ? ', plus ' + lt + ' min light (not counted)' : '';
        const name = WD[r] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
        const title = future ? name + ': upcoming' : lv === 's' ? name + ': muscle day, ' + str + ' min of strength (no aerobic minutes)' + ltNote : lv === 'l' ? name + ': ' + lt + ' min light activity (not counted toward ' + c.target + ')' : name + ': ' + raw + ' min' + (cr !== raw ? ' (counts as ' + cr + ')' : '') + ltNote + (str > 0 ? ', plus a muscle day' : '');
        g.append(h('span', { class: 'cell ' + (future ? 'future' : 'lv' + lv) + (ds === todayS ? ' today' : ''), title: title }));
      });
    }
    g.append(h('span'));
    weeks.forEach(function (w) {
      const f = h('span', { class: 'g-flag' });
      if (w.hit) f.innerHTML = PENNANT;
      g.append(f);
    });

    const hits = weeks.filter(function (w) { return w.hit; }).length;
    let active = 0;
    for (let i = 0; i < 28; i++) { if ((dayRaw[ymd(addDays(c.today, -i))] || 0) > 0) active++; }
    g.setAttribute('aria-label', '12-week activity grid. ' + (c.group !== 'under5' ? hits + ' of 12 weeks reached ' + c.target + '. ' : '') + active + ' active days in the last 28. Ringed squares are strength-only days. Dotted squares are light-only days.');
    $('tile-streak').textContent = String(c.streak);
    $('tile-streak-unit').textContent = plural(c.streak, 'week', 'weeks') + ' at ' + c.target + ' in a row';
    $('tile-weeks').textContent = String(hits);
    $('tile-days').textContent = String(active);
    $('grid-empty').hidden = sessions.length > 0;

    let msg;
    if (c.thisHit) msg = 'This week is in the bank. Streak now ' + c.streak + '.';
    else if (c.streak >= 1) msg = 'Keep the streak: ' + c.remaining + ' minutes to go by Sunday.';
    else if (c.remaining < c.target) msg = 'Start a streak this week: ' + c.remaining + ' minutes to go by Sunday.';
    else msg = 'Start a streak this week: ' + c.target + ' minutes by Sunday.';
    $('streak-msg').textContent = msg;
  }

  /* ===== plan ===== */
  function planSessionToday(c) {
    const ts = ymd(c.today);
    return sessions.find(function (s) { return s.source === 'plan' && s.date === ts; }) || null;
  }
  function renderPlan(c) {
    const card = $('plan-card');
    card.classList.toggle('is-sample', !!(plan && plan.sample));
    $('plan-empty').hidden = !!plan;
    $('plan-filled').hidden = !plan;
    if (!plan) return;
    $('plan-card-label').textContent = plan.sample ? 'Sample plan' : 'My plan';
    $('plan-sentence').textContent = 'After I ' + plan.after + ', I will ' + plan.will + ' at ' + plan.where + '.';
    $('plan-takes').textContent = 'About ' + plan.minutes + ' ' + plural(plan.minutes, 'minute', 'minutes') + '.';
    const planDates = {};
    sessions.forEach(function (s) { if (s.source === 'plan') planDates[s.date] = true; });
    const days = $('plan-days');
    days.replaceChildren();
    let done = 0;
    for (let i = 6; i >= 0; i--) {
      const d = addDays(c.today, -i), ds = ymd(d), on = !!planDates[ds];
      if (on) done++;
      days.append(h('span', { class: 'plan-day' + (on ? ' on' : '') + (i === 0 ? ' today' : '') }, h('i'), h('span', { text: WD[dayIndex(d)].charAt(0) })));
    }
    $('plan-caption').textContent = 'Done ' + done + ' of the last 7 days';
    const doneToday = !!planSessionToday(c);
    $('plan-done').hidden = doneToday;
    $('plan-done-msg').hidden = !doneToday;
  }
  function showPlanError(msg) {
    const e = $('plan-error');
    e.hidden = !msg; e.textContent = msg || '';
  }
  function onPlanSubmit(ev) {
    ev.preventDefault();
    const after = $('plan-after').value.trim().slice(0, 60), will = $('plan-will').value.trim().slice(0, 60), where = $('plan-where').value.trim().slice(0, 60);
    const raw = $('plan-minutes').value.trim(), mins = Number(raw);
    ['plan-after', 'plan-will', 'plan-where'].forEach(function (id) { $(id).removeAttribute('aria-invalid'); });
    $('plan-minutes').removeAttribute('aria-invalid');
    $('plan-status').textContent = '';
    if (!after || !will || !where) {
      showPlanError('Fill in all three blanks to save your plan.');
      [['plan-after', after], ['plan-will', will], ['plan-where', where]].forEach(function (p) { if (!p[1]) $(p[0]).setAttribute('aria-invalid', 'true'); });
      const first = !after ? 'plan-after' : !will ? 'plan-will' : 'plan-where';
      $(first).focus();
      return;
    }
    if (!/^\d+$/.test(raw) || mins < 1 || mins > 30) {
      showPlanError('Enter minutes from 1 to 30.');
      $('plan-minutes').setAttribute('aria-invalid', 'true');
      $('plan-minutes').focus();
      return;
    }
    showPlanError('');
    if (meta.sampleActive) clearSample();
    plan = { after: after, will: will, where: where, minutes: mins, sample: false, savedAt: Date.now() };
    persist();
    renderAll();
    resetBuilder();
    $('plan-status').textContent = 'Plan saved.';
    announce('Plan saved.');
  }
  function resetBuilder() {
    $('plan-after').value = ''; $('plan-will').value = ''; $('plan-where').value = ''; $('plan-minutes').value = '2';
    ['plan-after', 'plan-will', 'plan-where', 'plan-minutes'].forEach(function (id) { $(id).removeAttribute('aria-invalid'); });
    showPlanError('');
  }
  function buildPlanChips() {
    ['after', 'will', 'where'].forEach(function (key) {
      const box = $('plan-chips-' + key);
      PLAN_CHIPS[key].forEach(function (text, i) {
        box.append(h('button', { class: 'chip', type: 'button', id: 'plan-chip-' + key + '-' + i, text: text, onclick: function () {
          $('plan-' + key).value = text;
          $('plan-' + key).removeAttribute('aria-invalid');
          showPlanError('');
          const order = ['plan-after', 'plan-will', 'plan-where'];
          const next = order.find(function (id) { return !$(id).value.trim(); });
          if (next) $(next).focus(); else $('plan-save').focus();
        } }));
      });
    });
  }
  function planDidToday() {
    const c = calc();
    if (!plan || planSessionToday(c)) return;
    if (plan.sample) { plan.sample = false; }
    addSession({ type: 'habit', minutes: plan.minutes, intensity: 'moderate', source: 'plan', note: plan.will });
    const u = $('plan-undo');
    if (u && !$('plan-done-msg').hidden) u.focus();
  }
  function planUndoToday() {
    const c = calc();
    const s = planSessionToday(c);
    if (!s) return;
    sessions = sessions.filter(function (x) { return x.id !== s.id; });
    persist(); renderAll();
    $('plan-done').focus();
  }

  /* ===== adding sessions ===== */
  function addSession(f) {
    if (meta.sampleActive) clearSample();
    const s = { id: makeId(), date: f.date || ymd(today()), type: f.type, minutes: f.minutes, intensity: f.intensity, balance: f.balance === true, source: f.source, sample: false, createdAt: Date.now() };
    if (f.note !== undefined) s.note = f.note;
    if (f.trackId) s.trackId = f.trackId;
    sessions.push(s);
    persist();
    renderAll();
    return s;
  }

  function showMinutesError(on) {
    const inp = $('log-minutes');
    $('log-minutes-err').hidden = !on;
    if (on) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
  }
  function onLogSubmit(ev) {
    ev.preventDefault();
    const inp = $('log-minutes');
    const raw = inp.value.trim(), n = Number(raw);
    const status = $('log-status');
    if (!/^\d+$/.test(raw) || n < 1 || n > 240) {
      showMinutesError(true);
      status.textContent = '';
      inp.focus();
      return;
    }
    showMinutesError(false);
    const type = $('log-activity').value;
    const intensity = formIntensity(type);
    const date = $('log-date').value;
    const ws = ymd(weekStart(today()));
    const g = activeGuide();
    const native = BALANCE_TYPES.indexOf(type) >= 0;
    const flag = g.balanceDays > 0 && !native && !$('log-balance-row').hidden && $('log-balance-work').checked;
    const s = addSession({ date: date, type: type, minutes: n, intensity: intensity, balance: flag, source: 'log' });
    const past = date < ws;
    /* same rule as calc(): the message says it counted only when countsAsBalance is true; a light qualifying session gets the short reason line */
    const balTail = g.balanceDays <= 0 ? '' : countsAsBalance(s) ? (past ? ' It counted as a balance day that week.' : ' It also counts as a balance day.') : isBalance(s) ? ' Balance days need moderate effort or more.' : '';
    let msg;
    if (type === 'strength') msg = (past ? 'Logged to last week. ' : 'Logged. ') + 'Counted as a muscle day, not toward your minutes.' + balTail;
    else if (intensity === 'light') msg = (past ? 'Logged to last week. ' : 'Logged. ') + 'Counted as light activity, not toward your ' + g.aerobic + ' minutes.' + balTail;
    else if (past) msg = 'Logged to last week.' + balTail;
    else if (intensity === 'vigorous') {
      const mult = g.vigorousMultiplier;
      msg = (mult > 1 ? 'Logged. ' + n + ' vigorous minutes counts as ' + (n * mult) + ' toward this week.' : 'Logged. ' + n + ' vigorous minutes toward this week.') + balTail;
    }
    else msg = 'Logged. ' + n + ' minutes toward this week.' + balTail;
    status.textContent = msg;
    $('log-balance-work').checked = false;
    syncLogForm();
    inp.value = '';
    inp.focus();
  }

  /* ===== timer ===== */
  const ROUTINES = [
    { id: 'stairs', name: 'Stair climb', type: 'stairs', intensity: 'vigorous', tag: '3 min', logMin: 3, summary: 'Climb stairs briskly for 40 seconds, rest 20. Three rounds.', moves: ['Climb', 'Climb', 'Climb'], work: 40, rest: 20 },
    { id: 'desk', name: 'Desk reset', type: 'strength', intensity: 'moderate', tag: '5 min', logMin: 5, summary: 'Chair squats, wall push-ups, standing march, calf raises, hip hinge reach. 45 seconds on, 15 off.', moves: ['Chair squats', 'Wall push-ups', 'Standing march', 'Calf raises', 'Hip hinge reach'], work: 45, rest: 15 },
    { id: 'kitchen', name: 'Kitchen circuit', type: 'strength', intensity: 'vigorous', tag: '7 min', logMin: 7, summary: 'Squats, counter push-ups, reverse lunges, fast feet, glute bridge, plank, step jacks. 40 on, 20 off.', moves: ['Squats', 'Counter push-ups', 'Reverse lunges', 'Fast feet', 'Glute bridge', 'Plank', 'Step jacks'], work: 40, rest: 20 },
    { id: 'steady', name: 'Steady feet', type: 'balance', intensity: 'moderate', tag: '5 min', logMin: 5, groups: ['older'], summary: 'Heel-to-toe walk along a counter, single-leg stand, sit-to-stand from a chair, side leg raises, slow marching. 45 seconds on, 15 off. Swap legs halfway through the stand and the raises.', safety: 'Stay within reach of a counter or sturdy chair. Stop if you feel dizzy.', moves: ['Heel-to-toe walk', 'Single-leg stand', 'Sit-to-stand', 'Side leg raises', 'Slow marching'], work: 45, rest: 15 },
    { id: 'loop', name: 'Brisk loop', type: 'walk', intensity: 'moderate', tag: '10 min', logMin: 10, summary: 'One easy minute, eight brisk minutes, one easy minute. Out the door and back.', custom: [['Easy walk', 60, 'work'], ['Brisk walk', 480, 'work'], ['Easy walk', 60, 'work']] }
  ];
  /* a routine with a groups list shows only for those age groups (see ageGroup) */
  function routineVisible(r) { return !r.groups || r.groups.indexOf(currentGroup()) >= 0; }
  /* a routine logs as a balance day under the same rule as countsAsBalance (Steady feet is moderate) */
  function routineBalance(r) { return countsAsBalance({ type: r.type, balance: false, intensity: r.intensity }); }
  function buildSteps(r) {
    let steps = [];
    if (r.custom) steps = r.custom.map(function (x) { return { label: x[0], sec: x[1], kind: x[2] }; });
    else {
      r.moves.forEach(function (m) { steps.push({ label: m, sec: r.work, kind: 'work' }); steps.push({ label: 'Rest', sec: r.rest, kind: 'rest' }); });
      steps.pop();
    }
    return steps;
  }

  const T = { state: 'idle', r: null, steps: [], bounds: [], total: 0, acc: 0, t0: 0, idx: 0, interval: 0, logged: false, pendingSwitch: null };
  let audio = null;
  function ensureAudio() {
    if (audio) return audio;
    try { const C = window.AudioContext || window.webkitAudioContext; if (C) audio = new C(); } catch (e) { audio = null; }
    return audio;
  }
  function beep(count) {
    if (!prefs.sound) return;
    try { if (navigator.vibrate) navigator.vibrate(150); } catch (e) { /* ignore */ }
    try {
      if (!audio) return;
      if (audio.state === 'suspended' && audio.resume) audio.resume();
      for (let i = 0; i < count; i++) {
        const t = audio.currentTime + i * 0.24;
        const osc = audio.createOscillator(), gain = audio.createGain();
        osc.type = 'sine'; osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(gain); gain.connect(audio.destination);
        osc.start(t); osc.stop(t + 0.13);
      }
    } catch (e) { /* silent */ }
  }
  function elapsed() { return T.acc + (T.state === 'running' ? performance.now() - T.t0 : 0); }
  function stepAt(ms) {
    for (let i = 0; i < T.bounds.length; i++) if (ms < T.bounds[i]) return i;
    return T.bounds.length - 1;
  }
  function fmtClock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }
  function timerAnnounce(msg) {
    const el = $('timer-live'); el.textContent = '';
    setTimeout(function () { el.textContent = msg; }, 60);
  }
  function announceStep() {
    const st = T.steps[T.idx];
    timerAnnounce(st.label + ', ' + st.sec + ' seconds');
  }
  function stopInterval() { clearInterval(T.interval); T.interval = 0; }
  function startInterval() { stopInterval(); T.interval = setInterval(tick, 250); }

  function renderTimer() {
    const st = T.state, r = T.r;
    const start = $('snack-start'), skip = $('snack-skip'), reset = $('snack-reset');
    start.textContent = st === 'running' ? 'Pause' : st === 'paused' ? 'Resume' : 'Start';
    start.disabled = !(st === 'ready' || st === 'running' || st === 'paused');
    skip.disabled = !(st === 'running' || st === 'paused');
    reset.disabled = !(st === 'running' || st === 'paused' || st === 'finished');

    const stepEl = $('timer-step'), digits = $('timer-digits'), next = $('timer-next'), total = $('timer-total'), strip = $('timer-strip');
    const logBtn = $('snack-log'), partial = $('snack-partial'), loggedMsg = $('snack-logged'), safety = $('timer-safety');
    stepEl.classList.remove('is-rest');
    safety.hidden = !(st !== 'idle' && r && r.safety);
    safety.textContent = (r && r.safety) || '';
    if (st === 'idle' || !r) {
      $('timer-name').textContent = 'No snack loaded';
      stepEl.textContent = 'Pick a snack and press Load timer.';
      digits.textContent = '00:00'; next.textContent = ''; total.textContent = '';
      strip.replaceChildren();
      logBtn.hidden = true; partial.hidden = true; loggedMsg.hidden = true;
      return;
    }
    $('timer-name').textContent = r.name;
    const el = elapsed();
    if (st === 'finished') {
      stepEl.textContent = 'Done.';
      digits.textContent = '00:00';
      next.textContent = r.type === 'strength' ? 'Logs as a muscle day, not toward your minutes.' : routineBalance(r) ? r.logMin + ' ' + plural(r.logMin, 'minute', 'minutes') + ' in the bank, and it logs as a balance day.' : r.logMin + ' ' + plural(r.logMin, 'minute', 'minutes') + ' in the bank if you log it.';
      total.textContent = '';
    } else {
      const step = T.steps[T.idx];
      stepEl.textContent = step.label;
      if (step.kind === 'rest') stepEl.classList.add('is-rest');
      digits.textContent = fmtClock(T.bounds[T.idx] - el);
      const nx = T.steps[T.idx + 1];
      next.textContent = 'Next: ' + (nx ? nx.label : 'Finish');
      total.textContent = 'Total left ' + fmtClock(T.total - el);
    }
    const blocks = strip.children;
    for (let i = 0; i < blocks.length; i++) {
      blocks[i].className = (st === 'finished' || i < T.idx) ? 'done' : (i === T.idx ? 'cur' : '');
    }
    logBtn.hidden = !(st === 'finished' && !T.logged);
    if (!logBtn.hidden) logBtn.textContent = r.type === 'strength' ? 'Log as a muscle day' : routineBalance(r) ? 'Log ' + r.logMin + ' min as a balance day' : 'Log ' + r.logMin + ' min';
    const partialMin = Math.floor(el / 60000);
    partial.hidden = !(st === 'paused' && partialMin >= 1);
    if (!partial.hidden) partial.textContent = 'Stop and log ' + partialMin + ' min' + (r.type === 'strength' ? ' as a muscle day' : routineBalance(r) ? ' as a balance day' : '');
    loggedMsg.hidden = !T.logged;
    loggedMsg.textContent = r.type === 'strength' ? 'Logged as a muscle day, not toward your minutes. Nice work.' : routineBalance(r) ? 'Logged. Counted as a balance day. Nice work.' : 'Logged. Nice work.';
  }

  function tick() {
    if (T.state !== 'running') return;
    const el = elapsed();
    if (el >= T.total) { finishTimer(); return; }
    const idx = stepAt(el);
    if (idx !== T.idx) { T.idx = idx; announceStep(); beep(1); }
    renderTimer();
  }
  function finishTimer() {
    stopInterval();
    T.state = 'finished'; T.acc = T.total; T.idx = T.steps.length - 1;
    timerAnnounce('Done. ' + T.r.logMin + ' minutes.' + (T.r.type === 'strength' ? ' This logs as a muscle day.' : routineBalance(T.r) ? ' This logs as a balance day.' : ''));
    beep(3);
    renderTimer();
    const lb = $('snack-log'); if (!lb.hidden) lb.focus();
  }
  function loadRoutine(id) {
    const r = ROUTINES.find(function (x) { return x.id === id; });
    if (!r) return;
    stopInterval();
    T.r = r; T.steps = buildSteps(r);
    let acc = 0; T.bounds = T.steps.map(function (s) { acc += s.sec * 1000; return acc; });
    T.total = acc; T.acc = 0; T.idx = 0; T.state = 'ready'; T.logged = false; T.pendingSwitch = null;
    $('snack-switch').hidden = true;
    const strip = $('timer-strip');
    strip.replaceChildren();
    T.steps.forEach(function () { strip.append(h('i')); });
    renderRoutines();
    renderTimer();
    try { $('timer-panel').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) { /* ignore */ }
    $('snack-start').focus({ preventScroll: true });
  }
  function requestLoad(id) {
    const inProgress = (T.state === 'running' || T.state === 'paused');
    if (inProgress && T.r && T.r.id === id) { $('snack-start').focus({ preventScroll: true }); return; }
    if (inProgress) {
      const r = ROUTINES.find(function (x) { return x.id === id; });
      T.pendingSwitch = id;
      $('snack-switch-msg').textContent = 'Switch to ' + r.name + '? Your current timer stops.';
      $('snack-switch').hidden = false;
      $('snack-switch-no').focus();
      return;
    }
    loadRoutine(id);
  }
  function onStart() {
    const st = T.state;
    if (st === 'ready') {
      if (prefs.sound) ensureAudio();
      T.logged = false; T.acc = 0; T.idx = 0; T.t0 = performance.now(); T.state = 'running';
      startInterval(); announceStep();
    } else if (st === 'running') {
      T.acc = elapsed(); T.state = 'paused'; stopInterval();
    } else if (st === 'paused') {
      if (prefs.sound) ensureAudio();
      T.t0 = performance.now(); T.state = 'running'; startInterval();
    }
    renderTimer();
  }
  function onSkip() {
    if (T.state !== 'running' && T.state !== 'paused') return;
    if (T.idx >= T.steps.length - 1) { finishTimer(); return; }
    T.acc = T.bounds[T.idx];
    T.idx += 1;
    if (T.state === 'running') T.t0 = performance.now();
    announceStep(); beep(1);
    renderTimer();
  }
  function onReset() {
    if (!T.r) return;
    stopInterval();
    T.acc = 0; T.idx = 0; T.state = 'ready'; T.logged = false;
    renderTimer();
    $('snack-start').focus();
  }
  function logSnack(minutes) {
    const r = T.r;
    if (!r || minutes < 1) return;
    addSession({ type: r.type, minutes: minutes, intensity: r.intensity, source: 'snack', note: r.name });
  }
  function onLogSnack() {
    if (T.state !== 'finished' || T.logged) return;
    logSnack(T.r.logMin);
    T.logged = true;
    renderTimer();
    $('snack-reset').focus();
  }
  function onPartial() {
    const mins = Math.floor(elapsed() / 60000);
    if (mins < 1) return;
    logSnack(mins);
    stopInterval();
    T.acc = 0; T.idx = 0; T.state = 'ready'; T.logged = true;
    renderTimer();
    $('snack-start').focus();
  }
  function renderRoutines() {
    const ul = $('routines');
    ul.replaceChildren();
    ROUTINES.filter(routineVisible).forEach(function (r) {
      const selected = T.r && T.r.id === r.id;
      ul.append(h('li', { class: 'routine' + (selected ? ' is-selected' : ''), id: 'routine-' + r.id },
        h('div', { class: 'routine-head' }, h('h3', { class: 'h3', text: r.name }),
          h('span', { class: 'routine-tags' }, h('span', { class: 'tag tag-neutral', text: r.tag }), r.type === 'strength' ? h('span', { class: 'tag tag-neutral', text: 'Muscle day' }) : h('span', { class: 'tag ' + (r.intensity === 'vigorous' ? 'tag-vig' : 'tag-mod'), text: r.intensity }), routineBalance(r) ? h('span', { class: 'tag tag-neutral', text: 'Balance day' }) : null)),
        h('div', { class: 'routine-body' }, h('p', { class: 'small muted', text: r.summary }), r.safety ? h('p', { class: 'small routine-safety', text: r.safety }) : null),
        h('button', { class: 'btn btn-outline btn-small', type: 'button', id: 'snack-load-' + r.id, 'aria-label': 'Load timer: ' + r.name, text: 'Load timer', onclick: function () { requestLoad(r.id); } })
      ));
    });
  }

  /* ===== evidence ===== */
  function renderFacts() {
    const ul = $('facts');
    ul.replaceChildren();
    const g = hasTargets() ? activeGuide() : GUIDE.adult;
    FACTS.forEach(function (f0) {
      const f = (f0.id === 'FACT_1' && g.copy.fact) ? Object.assign({}, f0, g.copy.fact) : f0;
      if (!f.stat || !f.claim || !f.url) return;
      ul.append(h('li', { class: 'fact', id: 'fact-' + f.id.toLowerCase().replace('_', '-') },
        h('p', { class: 'fact-stat', text: f.stat }),
        h('p', { class: 'fact-claim', text: f.claim }),
        h('p', { class: 'small fact-source' }, 'Source: ', h('a', { href: f.url, target: '_blank', rel: 'noopener', text: f.sourceLabel || f.url }), h('span', { class: 'sr-only', text: ' (opens in a new tab)' }))
      ));
    });
  }

  /* ===== footer, clear all ===== */
  function renderFooter() {
    $('footer-storage').textContent = 'Your log is saved to your account. Only you can see it.';
  }
  async function clearAllData() {
    stopInterval();
    const keepAge = prefs.age;
    sessions = []; plan = null; prefs = { sound: false, age: keepAge, nudge: false }; askingAge = false;
    breaks = {};
    tracks = {};
    resetGpxImport();
    closeDetail(false);
    SIT.nudged = false; SIT.lastAt = Date.now(); SIT.since = 'you opened this page';
    hideBreakUndo();
    $('sit-nudge').checked = false;
    meta = { v: 1, seeded: true, sampleActive: false };
    [KEYS.meta, KEYS.sessions, KEYS.plan, KEYS.prefs, KEYS.breaks, KEYS.tracks].forEach(removeKey);
    save(KEYS.meta, meta);
    save(KEYS.prefs, prefs);
    hideUndo();
    T.state = 'idle'; T.r = null; T.steps = []; T.bounds = []; T.acc = 0; T.idx = 0; T.logged = false;
    $('snack-switch').hidden = true;
    $('snack-sound').checked = false;
    resetBuilder();
    $('plan-status').textContent = '';
    $('log-status').textContent = '';
    showMinutesError(false);
    $('age-input').value = keepAge === null ? '' : String(keepAge);
    showAgeError(false);
    renderRoutines();
    renderTimer();
    renderAll();
    /* the auth layer flushes the queued deletes; everything above is already on screen */
    if (typeof ctx.onClearAll === 'function') { try { await ctx.onClearAll(); } catch (e) { /* the sync status shows the failure */ } }
  }

  /* ===== sit less: move breaks, 7 day record, optional 30 minute nudge ===== */
  /* Breaks are not sessions: they never touch sessions[], credit() or any minute total. lastAt/since live in memory only. */
  const SIT = { lastAt: Date.now(), since: 'you opened this page', nudged: false, undo: null, undoTimer: 0 };
  function sitVisible() { return currentGroup() !== 'under5'; }
  /* real count for a date, or the made-up sample count while the sample is active */
  function breakCount(d) {
    if (meta.sampleActive) {
      const back = Math.round((today() - d) / 86400000);
      return (back >= 0 && back < SAMPLE_BREAKS.length) ? SAMPLE_BREAKS[back] : 0;
    }
    return breaks[ymd(d)] || 0;
  }
  function renderSit(c) {
    const show = sitVisible();
    $('sitless').hidden = !show;
    $('nav-sitless').hidden = !show;
    if (!show) { $('sit-nudge-msg').hidden = true; return; }
    const n = breakCount(c.today), sample = meta.sampleActive;
    $('sit-card').classList.toggle('is-sample', sample);
    $('sit-sample-tag').hidden = !sample;
    $('sit-count').textContent = String(n);
    const marks = $('sit-marks');
    marks.replaceChildren();
    if (n === 0) marks.append(h('span', { class: 'small muted', text: 'None yet today.' }));
    else {
      for (let i = 0; i < Math.min(n, 12); i++) marks.append(h('i'));
      if (n > 12) marks.append(h('span', { class: 'small muted', text: '+' + (n - 12) }));
    }
    const days = $('sit-days');
    days.replaceChildren();
    let on = 0;
    for (let i = 6; i >= 0; i--) {
      const d = addDays(c.today, -i), has = breakCount(d) > 0;
      if (has) on++;
      days.append(h('span', { class: 'plan-day' + (has ? ' on' : '') + (i === 0 ? ' today' : '') }, h('i'), h('span', { text: WD[dayIndex(d)].charAt(0) })));
    }
    $('sit-caption').textContent = 'Moved on ' + on + ' of the last 7 days';
    $('sit-break').setAttribute('aria-label', 'I got up and moved. ' + n + ' ' + plural(n, 'break', 'breaks') + ' today.');
    renderNudge();
  }
  function hideBreakUndo() { clearTimeout(SIT.undoTimer); SIT.undo = null; const b = $('sit-undo-bar'); if (b) b.hidden = true; }
  function addBreak() {
    if (!sitVisible()) return;
    const ds = ymd(today());
    if (meta.sampleActive) clearSample();
    const prev = breaks[ds] || 0;
    if (prev >= BREAK_MAX) return;
    breaks[ds] = prev + 1;
    SIT.undo = { date: ds, prev: prev, prevAt: SIT.lastAt, prevSince: SIT.since };
    SIT.lastAt = Date.now(); SIT.since = 'your last break'; SIT.nudged = false;
    saveBreaks();
    renderAll();
    const n = prev + 1;
    $('sit-undo-text').textContent = 'Break ' + n + ' added today.';
    $('sit-undo-bar').hidden = false;
    clearTimeout(SIT.undoTimer);
    SIT.undoTimer = setTimeout(hideBreakUndo, 6000);
    announce(n + ' ' + plural(n, 'break', 'breaks') + ' today.');
  }
  function undoBreak() {
    const u = SIT.undo;
    if (!u) return;
    if (u.prev > 0) breaks[u.date] = u.prev; else delete breaks[u.date];
    SIT.lastAt = u.prevAt; SIT.since = u.prevSince; SIT.nudged = false;
    hideBreakUndo();
    saveBreaks();
    renderAll();
    $('sit-break').focus();
  }
  function renderNudge() {
    const box = $('sit-nudge-msg');
    const show = prefs.nudge && SIT.nudged && sitVisible();
    box.hidden = !show;
    if (!show) return;
    const mins = Math.max(1, Math.round((Date.now() - SIT.lastAt) / 60000));
    $('sit-nudge-text').textContent = 'It has been about ' + mins + ' minutes since ' + SIT.since + '. Stand up, stretch, walk to the window.';
  }
  /* timestamp check, not a timer chain: runs on a light interval and when the tab becomes visible again; paused while the tab is hidden */
  function checkNudge() {
    if (!prefs.nudge || SIT.nudged || document.hidden || !sitVisible()) return;
    if (Date.now() - SIT.lastAt < NUDGE_MS) return;
    SIT.nudged = true;
    renderNudge();
    beep(2);
  }
  function snoozeNudge() {
    SIT.nudged = false; SIT.lastAt = Date.now(); SIT.since = 'you chose Not now';
    renderNudge();
    $('sit-break').focus();
  }
  function onNudgeToggle(ev) {
    prefs.nudge = ev.target.checked;
    SIT.nudged = false; SIT.lastAt = Date.now(); SIT.since = 'you turned the nudge on';
    if (prefs.nudge && prefs.sound) ensureAudio();
    persist();
    renderNudge();
  }

  /* ===== GPX import: effort, storage, review card, detail view =====
     Parsing and metrics come from GPX (js/gpx-lib.js, loaded before this script). A saved import is a normal session (addSession, so credit(),
     light and strength rules, sample clearing, Undo and the grid all apply) with source 'gpx' and a trackId. Route details live
     under KEYS.tracks as { trackId: { name, type, startTime, metrics, track, classification, deviceNote, importedAt } }. */
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function km1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  function maxHrFor(age) {
    if (age === null || age === undefined || age < 5) return null;
    return age < GPX_THRESHOLDS.tanakaUnderAge ? 208 - 0.7 * age : GPX_THRESHOLDS.hr.maxHrBase - age;
  }
  function gpxOpts(type) {
    const o = { thresholds: GPX_THRESHOLDS }, mh = maxHrFor(prefs.age);
    if (type) o.type = type;
    if (mh !== null) o.maxHr = mh;
    return o;
  }
  function speedBand(sp, inten) {
    if (inten === 'vigorous') return km1(sp.vigorous) + ' km/h and up';
    if (inten === 'moderate') return sp.moderate > 0 ? km1(sp.moderate) + ' to ' + km1(sp.vigorous - 0.1) + ' km/h' : 'below ' + km1(sp.vigorous) + ' km/h';
    return 'moderate starts at ' + km1(sp.moderate) + ' km/h';
  }
  /* The effort a track suggests and why, in plain words: heart rate first (needs an age), then speed, then a default. */
  function judgeEffort(m, pageType) {
    const th = GPX_THRESHOLDS, age = prefs.age, maxHr = maxHrFor(age);
    const libType = pageType === 'other' ? ((m && m.type) || 'run') : pageType;
    const hasHr = !!m && isNum(m.avgHr) && m.avgHr > 0;
    const spd = (m && isNum(m.avgSpeedKmh) && m.avgSpeedKmh > 0) ? m.avgSpeedKmh : null;
    const asWalk = libType === 'run' && spd !== null && spd < th.runAsWalkBelowKmh;
    const opts = { type: asWalk ? 'walk' : libType, thresholds: th };
    if (maxHr !== null) opts.maxHr = maxHr;
    const cls = GPX.classify(m, opts);
    if (cls.basis === 'hr') {
      const pct = Math.round(m.avgHr / maxHr * 100);
      const band = cls.intensity === 'vigorous' ? th.hr.vigorousPct + '% and up' : cls.intensity === 'moderate' ? th.hr.moderatePct + '% to ' + (th.hr.vigorousPct - 1) + '%' : 'moderate starts at ' + th.hr.moderatePct + '%';
      return { intensity: cls.intensity, basis: 'hr', text: 'From your heart rate: average ' + Math.round(m.avgHr) + ' bpm is ' + pct + '% of your estimated max ' + Math.round(maxHr) + ', so this is ' + cls.intensity + ' (' + band + ').' };
    }
    const why = !hasHr ? 'No heart rate in this file' : age === null ? 'Heart rate needs your age, which is not set yet' : maxHr === null ? 'Heart rate zones here start at age 5' : 'Too few heart rate readings';
    if (pageType === 'other') return { intensity: 'moderate', basis: 'default', text: why + '. There is no speed rule for this activity, so effort starts at moderate. Change it if that is wrong.' };
    if (libType === 'swim') {
      const r = th.swimSpeedTrustKmh;
      if (cls.basis === 'speed' && spd >= r[0] && spd <= r[1]) return { intensity: cls.intensity, basis: 'speed', text: why + ', so effort comes from speed: ' + km1(spd) + ' km/h swimming is ' + cls.intensity + ' (' + speedBand(th.speedKmh.swim, cls.intensity) + ').' };
      return { intensity: th.openWater, basis: 'default', text: why + (spd !== null ? ', and GPS speed is not reliable enough for this swim. ' : '. ') + 'Open-water swimming is rated about 6 METs, which is vigorous.' };
    }
    if (cls.basis === 'speed') {
      const sp = th.speedKmh[asWalk ? 'walk' : libType];
      return { intensity: cls.intensity, basis: 'speed', text: why + ', so effort comes from speed: ' + km1(spd) + ' km/h' + (asWalk ? ' is walking pace, which is ' : ' ' + TYPE_WORD[libType] + ' is ') + cls.intensity + ' (' + speedBand(sp, cls.intensity) + ').' };
    }
    return { intensity: 'moderate', basis: 'default', text: why + ', and no times to measure speed, so effort starts at moderate. Change it if that is wrong.' };
  }

  /* ----- formatting ----- */
  function fmtMinSec(s) { if (!isNum(s) || s <= 0) return null; const t = Math.round(s); return Math.floor(t / 60) + ':' + pad(t % 60); }
  function fmtDistShort(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(2) + ' km'; }
  function fmtDay(ds) { const d = parseYmd(ds); return WD[dayIndex(d)] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function fmtStartTime(ms) { const d = new Date(ms); return WD[dayIndex(d)] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  /* average pace line for a type: pace for run, walk and other; speed for cycle; pace per 100 m for swim */
  function paceLine(m, type) {
    if (type === 'cycle') return isNum(m.avgSpeedKmh) ? ['Avg speed', GPX.fmtSpeed(m.avgSpeedKmh)] : null;
    if (type === 'swim') return isNum(m.avgPaceSPer100m) ? ['Avg pace', GPX.fmtSwimPace(m.avgPaceSPer100m)] : null;
    return isNum(m.avgPaceSPerKm) ? ['Avg pace', GPX.fmtPace(m.avgPaceSPerKm)] : null;
  }

  /* ----- storage (w150.tracks) ----- */
  function sanitizeTracks(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(function (id) {
      const r = raw[id];
      if (!/^t_[a-z0-9]{1,40}$/.test(id) || id === SAMPLE_TRACK_ID || !r || typeof r !== 'object') return;
      const t = r.track, m = r.metrics;
      if (!t || !Array.isArray(t.lat) || !Array.isArray(t.lon) || !t.lat.length || t.lat.length !== t.lon.length) return;
      if (!m || typeof m !== 'object' || !isNum(m.distanceM)) return;
      if (!Array.isArray(t.brk)) t.brk = [];
      const c = r.classification;
      out[id] = {
        name: typeof r.name === 'string' ? r.name.slice(0, 80) : '',
        type: GPX_TYPES.indexOf(r.type) >= 0 ? r.type : 'other',
        startTime: isNum(r.startTime) ? r.startTime : null,
        metrics: m, track: t,
        classification: (c && typeof c.text === 'string') ? { intensity: c.intensity, basis: c.basis, text: c.text } : null,
        deviceNote: typeof r.deviceNote === 'string' ? r.deviceNote : null,
        importedAt: Number(r.importedAt) || 0
      };
    });
    return out;
  }
  /* drop route details no session points to (removed, or past the 120 day window) */
  function pruneTracks() {
    const ref = {};
    sessions.forEach(function (s) { if (s.trackId) ref[s.trackId] = true; });
    Object.keys(tracks).forEach(function (id) { if (!ref[id]) delete tracks[id]; });
  }
  function saveTracks() {
    pruneTracks();
    if (!storageOk) return true;
    /* an empty map is saved as {}, never deleted, so a delete cannot wipe a track added on another device */
    return save(KEYS.tracks, tracks);
  }
  /* keeps the newest TRACK_CAP imports; on a storage error nothing changes and the caller saves the session alone */
  function storeTrack(id, rec) {
    const before = Object.assign({}, tracks);
    tracks[id] = rec;
    const ids = Object.keys(tracks).sort(function (a, b) { return tracks[a].importedAt - tracks[b].importedAt; });
    while (ids.length > TRACK_CAP) delete tracks[ids.shift()];
    if (saveTracks()) return true;
    tracks = before;
    return false;
  }
  function roundArr(a, k) {
    if (!Array.isArray(a)) return null;
    const f = Math.pow(10, k);
    return a.map(function (v) { return isNum(v) ? Math.round(v * f) / f : null; });
  }
  function rnd(v, k) { return isNum(v) ? Math.round(v * Math.pow(10, k)) / Math.pow(10, k) : null; }
  /* the summary plus a rounded series (about 300 points) for the charts; keeps w150.tracks small */
  function compactMetrics(m) {
    const o = Object.assign({}, m), s = m.series || {};
    o.series = { distM: roundArr(s.distM, 1), tS: roundArr(s.tS, 0), ele: roundArr(s.ele, 1), hr: roundArr(s.hr, 0), cad: roundArr(s.cad, 0), power: roundArr(s.power, 0), paceSPerKm: roundArr(s.paceSPerKm, 0), speedKmh: roundArr(s.speedKmh, 2) };
    o.splits = (m.splits || []).map(function (x) { return { index: x.index, distanceM: rnd(x.distanceM, 1), timeS: rnd(x.timeS, 1), paceSPerKm: rnd(x.paceSPerKm, 1), paceSPer100m: rnd(x.paceSPer100m, 1), avgHr: rnd(x.avgHr, 0), elevDeltaM: rnd(x.elevDeltaM, 1), partial: !!x.partial }; });
    return o;
  }
  /* the stored details for a session, the generated sample, or null when the route is not stored */
  function getTrack(s) {
    if (!s || !s.trackId) return null;
    if (s.trackId === SAMPLE_TRACK_ID) return s.sample ? sampleTrack(s) : null;
    return tracks[s.trackId] || null;
  }
  /* a sample stored before GPX import existed: its 18 minute vigorous run becomes the sample import */
  function migrateSampleGpx() {
    if (!meta.sampleActive || sessions.some(function (s) { return s.sample && s.trackId; })) return;
    const ws = ymd(weekStart(today()));
    const hit = sessions.find(function (s) { return s.sample && s.type === 'run' && s.minutes === 18 && s.intensity === 'vigorous' && s.date >= ws; });
    if (hit) { hit.source = 'gpx'; hit.trackId = SAMPLE_TRACK_ID; persist(); }
  }

  /* ----- sample track: an 18 minute loop run, generated the same way every time (never stored) ----- */
  let sampleCache = null;
  function sampleTrack(s) {
    const key = s.date + '|' + prefs.age;
    if (sampleCache && sampleCache.key === key) return sampleCache.rec;
    const LAT0 = -6.2186, LON0 = 106.8019, A = 560, B = 380, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
    const ring = [], cum = [0], N = 720;
    for (let i = 0; i <= N; i++) {
      const th = -Math.PI / 2 + i / N * 2 * Math.PI;
      ring.push([A * Math.cos(th) + 6 * Math.sin(7 * th), B * Math.sin(th) + 4 * Math.cos(5 * th), th]);
      if (i) cum.push(cum[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
    }
    const per = cum[N], d0 = parseYmd(s.date);
    const t0 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 6, 10, 0).getTime();
    const pts = [];
    let dist = 0, j = 0;
    for (let t = 0; t <= 1080; t += 2) {
      if (t) dist += 2 * (2.6 + 0.35 * Math.sin(Math.PI * t / 1200) + 0.05 * Math.sin(t / 37));
      const sd = dist % per;
      if (sd < cum[j]) j = 0;
      while (j < N - 1 && cum[j + 1] < sd) j++;
      const f = (sd - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      const x = ring[j][0] + (ring[j + 1][0] - ring[j][0]) * f + 2 * Math.sin(t / 23);
      const y = ring[j][1] + (ring[j + 1][1] - ring[j][1]) * f + 2 * Math.cos(t / 31);
      const th = ring[j][2];
      pts.push({ lat: LAT0 + y / MLAT, lon: LON0 + x / MLON, t: t0 + t * 1000, ele: 9 + 3 * Math.sin(2 * th) + 1.5 * Math.sin(5 * th), hr: Math.round(116 + 42 * (1 - Math.exp(-t / 200)) + 4 * Math.sin(t / 70)), cad: 84 + Math.round(2 * Math.sin(t / 50)), power: null, temp: 27 });
    }
    const segs = GPX.clean([pts], { type: 'run' });
    const m = GPX.metrics(segs, { type: 'run' });
    const rec = { name: 'Morning loop', type: 'run', startTime: t0, metrics: m, track: GPX.downsample(segs, 300), classification: judgeEffort(m, 'run'), deviceNote: null, importedAt: 0, sample: true };
    sampleCache = { key: key, rec: rec };
    return rec;
  }

  /* ----- import queue and review card ----- */
  const GQ = { pending: [], item: null, reading: false, total: 0, index: 0, saved: [], errors: [], trigger: 'gpx-pick-splits' };
  function setGpxStatus(msg) { $('gpx-status').textContent = msg || ''; }
  function renderGpxErrors() {
    const ul = $('gpx-errors');
    ul.replaceChildren();
    GQ.errors.forEach(function (e) { ul.append(h('li', null, h('span', { text: e.name + ': ' }), e.msg)); });
    ul.hidden = !GQ.errors.length;
  }
  function addGpxError(name, msg) { GQ.errors.push({ name: name, msg: msg }); renderGpxErrors(); }
  function gpxMessage(e) {
    const m = e && e.message;
    return (m === GPX.MSG_NOT_GPX || m === GPX.MSG_NO_POINTS) ? m : 'This file could not be read as a GPX track. Try exporting it again.';
  }
  function resetGpxImport() {
    GQ.pending = []; GQ.item = null; GQ.reading = false; GQ.total = 0; GQ.index = 0; GQ.saved = []; GQ.errors = [];
    renderGpxErrors(); setGpxStatus('');
    $('gpx-review').hidden = true;
  }
  function enqueueFiles(fileList, trigger) {
    const files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    if (!GQ.item && !GQ.reading && !GQ.pending.length) { GQ.total = 0; GQ.index = 0; GQ.saved = []; GQ.errors = []; renderGpxErrors(); setGpxStatus(''); }
    if (trigger) GQ.trigger = trigger;
    GQ.total += files.length;
    files.forEach(function (f) { GQ.pending.push(f); });
    if (!GQ.item && !GQ.reading) nextGpxFile();
    else if (GQ.item) showReview(false);
  }
  function nextGpxFile() {
    const f = GQ.pending.shift();
    if (!f) { finishGpxBatch(); return; }
    GQ.index++;
    if (f.size > GPX_MAX_BYTES) { addGpxError(f.name, 'This file is larger than 25 MB. Export a shorter activity.'); nextGpxFile(); return; }
    GQ.reading = true;
    /* a short reading note, unless the line still holds the message about the file saved just before */
    const note = 'Reading ' + f.name + '.';
    if (!$('gpx-status').textContent) setGpxStatus(note);
    const done = function () { GQ.reading = false; if ($('gpx-status').textContent === note) setGpxStatus(''); };
    const rd = new FileReader();
    rd.onload = function () { done(); importGpxText(String(rd.result || ''), f.name); };
    rd.onerror = function () { done(); addGpxError(f.name, 'This file could not be read. Try picking it again.'); nextGpxFile(); };
    rd.readAsText(f);
  }
  function importGpxText(text, name) {
    let r;
    try { r = GPX.analyze(text, gpxOpts()); } catch (e) { addGpxError(name, gpxMessage(e)); nextGpxFile(); return; }
    const type = GPX_TYPES.indexOf(r.type) >= 0 ? r.type : 'run';
    GQ.item = { name: name, text: text, detected: r.info.typeHint, baseType: r.type, type: type, cache: {}, judge: null, minutesTouched: false, effortTouched: false };
    GQ.item.cache[r.type] = r;
    showReview(true);
  }
  /* analysis for the chosen activity (stop speed, spike cap and split length depend on it); Other reuses the detected type */
  function itemAnalysis(it) {
    const lt = it.type === 'other' ? it.baseType : it.type;
    if (!it.cache[lt]) it.cache[lt] = GPX.analyze(it.text, gpxOpts(lt));
    return it.cache[lt];
  }
  function gpxDateRange() { const t = today(); return { min: ymd(addDays(t, -120)), max: ymd(t) }; }
  function findDuplicate(r) {
    const st = r.info.startTime, d = r.metrics.distanceM;
    if (!isNum(st)) return null;
    const id = Object.keys(tracks).find(function (k) { const x = tracks[k]; return x.startTime === st && Math.abs(x.metrics.distanceM - d) <= Math.max(5, d * 0.01); });
    if (!id) return null;
    return { rec: tracks[id], session: sessions.find(function (s) { return s.trackId === id; }) || null };
  }
  function renderReviewCount() {
    $('gpx-r-count').textContent = GQ.total > 1 ? 'Import review, file ' + GQ.index + ' of ' + GQ.total : 'Import review';
  }
  function setRadio(prefix, v) { $(prefix + (v === 'vigorous' ? 'vig' : v === 'light' ? 'light' : 'mod')).checked = true; }
  function showFieldError(id, msg) {
    const inp = $(id), err = $(id + '-err');
    err.hidden = !msg;
    if (msg) { err.textContent = msg; inp.setAttribute('aria-invalid', 'true'); } else inp.removeAttribute('aria-invalid');
  }
  function dateProblem(v) {
    const rg = gpxDateRange();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Pick a date.';
    if (v > rg.max) return 'Pick a date up to today.';
    if (v < rg.min) return 'This is from ' + fmtDay(v) + ' ' + v.slice(0, 4) + '. The log keeps the last 120 days, so pick a newer date or skip this file.';
    return '';
  }
  function showReview(first) {
    const it = GQ.item;
    if (!it) return;
    let r;
    try { r = itemAnalysis(it); } catch (e) { return; }
    const m = r.metrics, info = r.info;
    $('gpx-review').hidden = false;
    renderReviewCount();
    $('gpx-r-file').textContent = 'File: ' + it.name;
    const rows = [['Name', info.name || 'No name in the file'], ['Start', isNum(info.startTime) ? fmtStartTime(info.startTime) : 'No time in the file'], ['Distance', GPX.fmtDistance(m.distanceM)]];
    if (isNum(m.movingS)) rows.push(['Moving time', GPX.fmtDuration(m.movingS)]);
    const pl = paceLine(m, it.type);
    if (pl) rows.push(pl);
    if (isNum(m.avgHr)) rows.push(['Avg heart rate', Math.round(m.avgHr) + ' bpm']);
    const dl = $('gpx-r-read');
    dl.replaceChildren();
    rows.forEach(function (rw) { dl.append(h('div', null, h('dt', { text: rw[0] }), h('dd', { text: rw[1] }))); });
    $('gpx-r-device').hidden = !r.deviceNote;
    $('gpx-r-device').textContent = r.deviceNote || '';
    const cs = r.cleanStats || {}, spikes = cs.spikes || 0;
    $('gpx-r-clean').hidden = !spikes;
    $('gpx-r-clean').textContent = spikes ? 'Left out ' + spikes + ' GPS ' + plural(spikes, 'point that jumped', 'points that jumped') + ' too far to be real.' : '';
    $('gpx-type').value = it.type;
    $('gpx-type-note').hidden = !!it.detected;
    const rg = gpxDateRange(), dIn = $('gpx-date');
    dIn.min = rg.min; dIn.max = rg.max;
    if (first) {
      dIn.value = isNum(info.startTime) ? ymd(new Date(info.startTime)) : rg.max;
      showFieldError('gpx-date', dateProblem(dIn.value));
      showFieldError('gpx-minutes', '');
    }
    const mIn = $('gpx-minutes');
    if (!it.minutesTouched) mIn.value = isNum(m.movingS) ? String(Math.min(240, Math.max(1, Math.round(m.movingS / 60)))) : '';
    $('gpx-minutes-note').textContent = !isNum(m.movingS) ? 'No times in this file. Enter how long it took.' : m.movingS / 60 > 240 ? 'Moving time ' + GPX.fmtDuration(m.movingS) + '. One session holds up to 240 minutes.' : 'Moving time ' + GPX.fmtDuration(m.movingS) + ', rounded to whole minutes.';
    it.judge = judgeEffort(m, it.type);
    if (!it.effortTouched) setRadio('gpx-int-', it.judge.intensity);
    $('gpx-basis').textContent = it.judge.text;
    $('gpx-set-age').hidden = !(prefs.age === null && isNum(m.avgHr));
    const dup = findDuplicate(r);
    $('gpx-dup').hidden = !dup;
    $('gpx-dup').textContent = dup ? 'You already imported this activity' + (dup.session ? ' (' + TYPE_LABEL[dup.session.type] + ' on ' + fmtDay(dup.session.date) + ', ' + GPX.fmtDistance(dup.rec.metrics.distanceM) + ')' : '') + '. Skip it, or save it again as a second session.' : '';
    $('gpx-cancel').textContent = dup ? 'Skip this file' : GQ.pending.length ? 'Skip this file' : 'Cancel';
    $('gpx-save').textContent = dup ? 'Save again' : 'Save to log';
    if (first) {
      try { $('gpx-review').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
      $('gpx-r-title').focus({ preventScroll: true });
    }
  }
  function savedMessage(s, stored) {
    const past = s.date < ymd(weekStart(today()));
    const what = TYPE_LABEL[s.type] + ', ' + s.minutes + ' min, ' + s.intensity;
    let msg = past ? 'Saved to ' + fmtDay(s.date) + ': ' + what + '.' : 'Saved to your log: ' + what + '.';
    if (isLight(s)) msg += ' Light activity is logged but not counted toward your minutes.';
    else msg += past ? ' It counts toward that week.' : ' Counts as ' + credit(s) + ' toward this week.';
    if (!stored) msg += ' The route could not be kept with this import, so only the session was saved.';
    return msg;
  }
  function onGpxSave(ev) {
    ev.preventDefault();
    const it = GQ.item;
    if (!it) return;
    let r;
    try { r = itemAnalysis(it); } catch (e) { return; }
    const dIn = $('gpx-date'), mIn = $('gpx-minutes');
    const raw = mIn.value.trim(), n = Number(raw);
    const dErr = dateProblem(dIn.value), mBad = !/^\d+$/.test(raw) || n < 1 || n > 240;
    showFieldError('gpx-date', dErr);
    showFieldError('gpx-minutes', mBad ? 'Enter minutes from 1 to 240.' : '');
    if (dErr) { dIn.focus(); return; }
    if (mBad) { mIn.focus(); return; }
    const intensity = $('gpx-int-vig').checked ? 'vigorous' : $('gpx-int-light').checked ? 'light' : 'moderate';
    const id = 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rec = { name: (r.info.name || '').slice(0, 80), type: it.type, startTime: isNum(r.info.startTime) ? r.info.startTime : null, metrics: compactMetrics(r.metrics), track: r.track, classification: it.judge, deviceNote: r.deviceNote || null, importedAt: Date.now() };
    GQ.item = null;
    const s = addSession({ date: dIn.value, type: it.type, minutes: n, intensity: intensity, source: 'gpx', trackId: id });
    const stored = storeTrack(id, rec);
    if (!stored) { delete s.trackId; persist(); }
    renderAll();
    GQ.saved.push(s.id);
    setGpxStatus(savedMessage(s, stored));
    if (GQ.pending.length) nextGpxFile(); else finishGpxBatch();
  }
  function onGpxCancel() {
    const it = GQ.item;
    if (!it) return;
    GQ.item = null;
    setGpxStatus('Skipped ' + it.name + '.');
    if (GQ.pending.length) nextGpxFile(); else finishGpxBatch();
  }
  /* end of a batch: open the last saved activity, or send focus back to the control that started it */
  function finishGpxBatch() {
    $('gpx-review').hidden = true;
    if (GQ.total > 1) setGpxStatus((GQ.saved.length ? 'Imported ' + GQ.saved.length + ' of ' + GQ.total + ' files.' : 'No files imported.') + (GQ.errors.length ? ' The problems are listed above.' : ''));
    const last = GQ.saved.length ? GQ.saved[GQ.saved.length - 1] : null;
    GQ.saved = [];
    if (last && sessions.some(function (s) { return s.id === last; })) { openDetail(last); return; }
    const t = $(GQ.trigger);
    (t && t.offsetParent !== null ? t : $('gpx-pick-splits')).focus();
  }
  function wireDropTarget(zone, trigger) {
    const hasFiles = function (e) { return !!(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0); };
    zone.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; zone.classList.add('is-over'); });
    zone.addEventListener('dragleave', function (e) { if (!zone.contains(e.relatedTarget)) zone.classList.remove('is-over'); });
    zone.addEventListener('drop', function (e) {
      zone.classList.remove('is-over');
      if (!hasFiles(e)) return;
      e.preventDefault(); e.stopPropagation();
      enqueueFiles(e.dataTransfer.files, trigger);
    });
  }

  /* ----- earlier imports (sessions outside this week keep their Details) ----- */
  function renderEarlier(c) {
    const a = ymd(c.ws), b = ymd(addDays(c.ws, 6));
    const list = sessions.filter(function (s) { return s.source === 'gpx' && (s.date < a || s.date > b) && getTrack(s); })
      .sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : y.createdAt - x.createdAt; });
    $('gpx-earlier').hidden = !list.length;
    const ul = $('gpx-earlier-list');
    ul.replaceChildren();
    list.forEach(function (s) {
      const rec = getTrack(s);
      ul.append(h('li', null,
        h('span', { class: 'earlier-day', text: fmtDay(s.date) }),
        h('span', { class: 'earlier-what', text: TYPE_LABEL[s.type] + ', ' + GPX.fmtDistance(rec.metrics.distanceM) + ', ' + s.minutes + ' min' + (rec.name ? ', ' + rec.name : '') }),
        h('button', { class: 'btn-text', type: 'button', id: 'earlier-' + s.id, 'data-details': s.id, 'aria-label': 'Details for ' + TYPE_LABEL[s.type] + ', ' + fmtDay(s.date), text: 'Details' })));
    });
  }

  /* ----- detail view ----- */
  const DETAIL = { id: null, charts: [], route: null, width: 0, cursor: null };
  const SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]); });
    for (let i = 2; i < arguments.length; i++) if (arguments[i]) e.append(arguments[i]);
    return e;
  }
  function f1(x) { return Math.round(x * 10) / 10; }
  function sortedNums(a) { return a.filter(isNum).sort(function (x, y) { return x - y; }); }
  function pctile(v, p) { return v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))]; }
  function niceStep(range, target) {
    const raw = range / Math.max(1, target), p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
  }
  function timeStep(range) { const c = [5, 10, 15, 20, 30, 60, 120, 300, 600, 1200]; return c.find(function (s) { return range / s <= 5; }) || 1800; }
  function nearestIdx(arr, d) {
    let lo = 0, hi = arr.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arr[mid] < d) lo = mid; else hi = mid; }
    return Math.abs(arr[lo] - d) <= Math.abs(arr[hi] - d) ? lo : hi;
  }

  function openDetail(id) {
    const s = sessions.find(function (x) { return x.id === id; });
    if (!s) return;
    DETAIL.id = id; DETAIL.cursor = null;
    $('gpx-detail').hidden = false;
    renderDetail();
    try { $('gpx-detail').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
    $('gpx-d-title').focus({ preventScroll: true });
  }
  function closeDetail(focusBack) {
    const id = DETAIL.id;
    DETAIL.id = null; DETAIL.charts = []; DETAIL.route = null;
    $('gpx-detail').hidden = true;
    $('gpx-d-body').replaceChildren();
    if (!focusBack) return;
    const back = [id && 'details-' + id, id && 'earlier-' + id, GQ.trigger, 'gpx-pick-splits'].map(function (x) { return x && document.getElementById(x); }).find(function (el) { return el && el.offsetParent !== null; });
    if (back) back.focus();
  }
  function statItem(label, value, unit, note) {
    return h('div', { class: 'stat' }, h('dt', { text: label }), h('dd', null, value, unit ? h('span', { class: 'u', text: unit }) : null, note ? h('span', { class: 'n', text: note }) : null));
  }
  function buildStats(m, type) {
    const dl = h('dl', { class: 'stats', id: 'gpx-d-stats' });
    const add = function (l, v, u, n) { dl.append(statItem(l, v, u, n)); };
    if (isNum(m.distanceM)) { if (m.distanceM < 1000) add('Distance', String(Math.round(m.distanceM)), 'm'); else add('Distance', (m.distanceM / 1000).toFixed(2), 'km'); }
    if (isNum(m.movingS)) add('Moving time', GPX.fmtDuration(m.movingS));
    if (isNum(m.elapsedS)) add('Elapsed time', GPX.fmtDuration(m.elapsedS));
    if (type === 'cycle') { if (isNum(m.avgSpeedKmh)) add('Avg speed', km1(m.avgSpeedKmh), 'km/h'); }
    else if (type === 'swim') { if (fmtMinSec(m.avgPaceSPer100m)) add('Avg pace', fmtMinSec(m.avgPaceSPer100m), '/100 m'); }
    else if (fmtMinSec(m.avgPaceSPerKm)) add('Avg pace', fmtMinSec(m.avgPaceSPerKm), '/km');
    if ((type === 'run' || type === 'walk') && fmtMinSec(m.bestKmPaceS)) add('Best km', fmtMinSec(m.bestKmPaceS), '/km');
    if (isNum(m.maxSpeedKmh)) add('Max speed', km1(m.maxSpeedKmh), 'km/h');
    if (isNum(m.elevGainM)) add('Climb, descent', '+' + Math.round(m.elevGainM) + ' / -' + Math.round(isNum(m.elevLossM) ? m.elevLossM : 0), 'm');
    if (isNum(m.minEle) && isNum(m.maxEle)) add('Elevation', Math.round(m.minEle) + ' to ' + Math.round(m.maxEle), 'm');
    if (isNum(m.avgHr)) add('Avg heart rate', String(Math.round(m.avgHr)), 'bpm');
    if (isNum(m.maxHr)) add('Max heart rate', String(Math.round(m.maxHr)), 'bpm');
    if (isNum(m.avgCad)) {
      const oneFoot = (type === 'run' || type === 'walk') && m.avgCad < 120;
      add('Avg cadence', String(Math.round(m.avgCad)), type === 'cycle' ? 'rpm' : 'spm', oneFoot ? 'Counts one foot. About ' + Math.round(m.avgCad * 2) + ' steps per minute.' : null);
    }
    if (isNum(m.avgPower)) add('Avg power', String(Math.round(m.avgPower)), 'W');
    if (isNum(m.maxPower)) add('Max power', String(Math.round(m.maxPower)), 'W');
    if (isNum(m.avgTemp)) add('Avg temperature', String(Math.round(m.avgTemp)), '°C');
    return dl;
  }
  function chartSpecs(m, type) {
    const s = m.series || {}, out = [];
    const has = function (a) { return Array.isArray(a) && a.filter(isNum).length >= 2; };
    if (!Array.isArray(s.distM) || s.distM.length < 2) return out;
    if (type === 'cycle' && has(s.speedKmh)) out.push({ id: 'speed', title: 'Speed', vals: s.speedKmh, fmt: function (v) { return km1(v) + ' km/h'; }, tick: function (v) { return String(Math.round(v)); }, clip: true, avg: isNum(m.avgSpeedKmh) ? km1(m.avgSpeedKmh) + ' km/h' : null, nullText: 'stopped' });
    else if (type === 'swim' && has(s.paceSPerKm)) out.push({ id: 'pace', title: 'Pace per 100 m', vals: s.paceSPerKm.map(function (v) { return isNum(v) ? v / 10 : null; }), fmt: function (v) { return fmtMinSec(v) + ' /100 m'; }, tick: fmtMinSec, invert: true, clip: true, time: true, avg: fmtMinSec(m.avgPaceSPer100m) ? fmtMinSec(m.avgPaceSPer100m) + ' /100 m' : null, nullText: 'stopped' });
    else if (type !== 'cycle' && type !== 'swim' && has(s.paceSPerKm)) out.push({ id: 'pace', title: 'Pace', vals: s.paceSPerKm, fmt: function (v) { return fmtMinSec(v) + ' /km'; }, tick: fmtMinSec, invert: true, clip: true, time: true, avg: fmtMinSec(m.avgPaceSPerKm) ? fmtMinSec(m.avgPaceSPerKm) + ' /km' : null, nullText: 'stopped' });
    if (has(s.ele)) out.push({ id: 'ele', title: 'Elevation', vals: s.ele, fmt: function (v) { return Math.round(v) + ' m'; }, tick: function (v) { return String(Math.round(v)); }, area: true, minSpan: 20, avg: null, nullText: 'no reading' });
    if (has(s.hr)) out.push({ id: 'hr', title: 'Heart rate', vals: s.hr, fmt: function (v) { return Math.round(v) + ' bpm'; }, tick: function (v) { return String(Math.round(v)); }, minSpan: 20, avg: isNum(m.avgHr) ? Math.round(m.avgHr) + ' bpm' : null, nullText: 'no reading' });
    return out;
  }
  function chartUnitNote(spec) { return spec.id === 'pace' ? 'Faster is higher.' : ''; }

  function drawChart(box, spec, distM, total) {
    box.replaceChildren();
    const W = Math.max(260, Math.round(box.clientWidth || 360)), H = W < 480 ? 140 : 170;
    const L = 46, R = 12, T = 10, B = 24, iw = W - L - R, ih = H - T - B;
    const v = sortedNums(spec.vals);
    let lo = spec.clip ? pctile(v, 0.03) : v[0], hi = spec.clip ? pctile(v, 0.97) : v[v.length - 1];
    if (spec.minSpan && hi - lo < spec.minSpan) { const c = (hi + lo) / 2; lo = c - spec.minSpan / 2; hi = c + spec.minSpan / 2; }
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    const padv = (hi - lo) * 0.08; lo -= padv; hi += padv;
    const yOf = function (val) { const c = Math.max(lo, Math.min(hi, val)), f = (c - lo) / (hi - lo); return spec.invert ? T + f * ih : T + (1 - f) * ih; };
    const xOf = function (d) { return L + (total > 0 ? Math.max(0, Math.min(1, d / total)) : 0) * iw; };
    const svg = sv('svg', { id: 'gpx-d-chart-' + spec.id, viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', tabindex: '0', 'aria-label': spec.title + ' over distance, from ' + spec.fmt(v[0]) + ' to ' + spec.fmt(v[v.length - 1]) + '. Use the arrow keys to read values along the way.' });
    const step = spec.time ? timeStep(hi - lo) : niceStep(hi - lo, 3);
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
      const y = f1(yOf(t));
      svg.append(sv('line', { class: 'ch-grid', x1: L, x2: W - R, y1: y, y2: y }));
      const tx = sv('text', { class: 'ch-ax', x: L - 6, y: y + 4, 'text-anchor': 'end' }); tx.textContent = spec.tick(t); svg.append(tx);
    }
    svg.append(sv('line', { class: 'ch-axis', x1: L, x2: W - R, y1: T + ih, y2: T + ih }));
    const useKm = total >= 1500;
    const xs = niceStep(useKm ? total / 1000 : total, W < 480 ? 3 : 5) * (useKm ? 1000 : 1);
    for (let d = 0; d <= total + 1e-6; d += xs) {
      const x = xOf(d);
      if (d > 0 && x > W - R - 18) break;
      const tx = sv('text', { class: 'ch-ax', x: f1(x), y: H - 6, 'text-anchor': d === 0 ? 'start' : 'middle' });
      tx.textContent = d === 0 ? '0' : useKm ? (+(d / 1000).toFixed(2)) + ' km' : Math.round(d) + ' m';
      svg.append(tx);
    }
    let line = '', area = '', open = false, first = null, last = null;
    for (let i = 0; i < distM.length; i++) {
      const val = spec.vals[i];
      if (!isNum(val) || !isNum(distM[i])) { open = false; continue; }
      const x = f1(xOf(distM[i])), y = f1(yOf(val));
      line += (open ? 'L' : 'M') + x + ' ' + y;
      area += (first === null ? 'M' + x + ' ' + (T + ih) + 'L' : 'L') + x + ' ' + y;
      if (first === null) first = x;
      last = x; open = true;
    }
    if (spec.area && first !== null) svg.append(sv('path', { class: 'ch-area', d: area + 'L' + last + ' ' + (T + ih) + 'Z' }));
    svg.append(sv('path', { class: 'ch-line', d: line }));
    const cur = sv('line', { class: 'ch-cur', x1: 0, x2: 0, y1: T, y2: T + ih, visibility: 'hidden' });
    const dot = sv('circle', { class: 'ch-dot', r: 4, cx: 0, cy: 0, visibility: 'hidden' });
    svg.append(cur, dot);
    box.append(svg);
    const ch = { spec: spec, svg: svg, xOf: xOf, yOf: yOf, cur: cur, dot: dot, distM: distM, W: W, L: L, iw: iw, total: total };
    const fromEvent = function (e) {
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (W / Math.max(1, rect.width));
      setCursor(Math.max(0, Math.min(1, (x - L) / iw)) * total);
    };
    svg.addEventListener('pointermove', fromEvent);
    svg.addEventListener('pointerdown', fromEvent);
    svg.addEventListener('keydown', function (e) {
      const stepD = total / 40, now = DETAIL.cursor === null ? 0 : DETAIL.cursor;
      let next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(total, now + stepD);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, now - stepD);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = total;
      if (next === null) return;
      e.preventDefault();
      setCursor(next, true);
    });
    return ch;
  }
  /* one shared crosshair: every chart and the route marker follow the same distance */
  function setCursor(d, fromKey) {
    DETAIL.cursor = d;
    const parts = [];
    DETAIL.charts.forEach(function (ch) {
      const i = nearestIdx(ch.distM, d), val = ch.spec.vals[i];
      const x = f1(ch.xOf(ch.distM[i]));
      ch.cur.setAttribute('x1', x); ch.cur.setAttribute('x2', x); ch.cur.setAttribute('visibility', 'visible');
      if (isNum(val)) { ch.dot.setAttribute('cx', x); ch.dot.setAttribute('cy', f1(ch.yOf(val))); ch.dot.setAttribute('visibility', 'visible'); }
      else ch.dot.setAttribute('visibility', 'hidden');
      const txt = (isNum(val) ? ch.spec.fmt(val) : ch.spec.nullText) + ' at ' + fmtDistShort(ch.distM[i]);
      const out = document.getElementById('gpx-d-read-' + ch.spec.id);
      if (out) out.textContent = txt;
      parts.push(ch.spec.title + ' ' + txt);
    });
    const rt = DETAIL.route;
    if (rt && rt.cum.length > 1) {
      const rd = d * rt.ratio, c = rt.cum;
      let i = 1;
      while (i < c.length - 1 && c[i] < rd) i++;
      const f = c[i] > c[i - 1] ? Math.max(0, Math.min(1, (rd - c[i - 1]) / (c[i] - c[i - 1]))) : 0;
      rt.cur.setAttribute('cx', f1(rt.px[i - 1] + (rt.px[i] - rt.px[i - 1]) * f));
      rt.cur.setAttribute('cy', f1(rt.py[i - 1] + (rt.py[i] - rt.py[i - 1]) * f));
      rt.cur.setAttribute('visibility', 'visible');
    }
    if (fromKey) $('gpx-d-live').textContent = parts.join('. ');
  }
  /* route: equirectangular projection (longitude scaled by cos(latitude)), fitted to the box with padding, aspect kept */
  function drawRoute(box, rec, type) {
    box.replaceChildren();
    const tr = rec.track, n = tr.lat.length, total = rec.metrics.distanceM;
    const W = Math.max(260, Math.round(box.clientWidth || 360)), PAD = 28;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (let i = 0; i < n; i++) { minLat = Math.min(minLat, tr.lat[i]); maxLat = Math.max(maxLat, tr.lat[i]); minLon = Math.min(minLon, tr.lon[i]); maxLon = Math.max(maxLon, tr.lon[i]); }
    const k = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    const mx = function (lon) { return (lon - minLon) * 111320 * k; }, my = function (lat) { return (maxLat - lat) * 110574; };
    const dx = mx(maxLon), dy = my(minLat);
    let H = dx > 0 ? Math.round(dy * (W - 2 * PAD) / dx + 2 * PAD) : W;
    H = Math.max(200, Math.min(H, Math.max(320, Math.round(W * 1.1))));
    let s = Math.min(dx > 0 ? (W - 2 * PAD) / dx : Infinity, dy > 0 ? (H - 2 * PAD) / dy : Infinity);
    if (!isFinite(s)) s = 1;
    const ox = (W - dx * s) / 2, oy = (H - dy * s) / 2;
    const brk = {};
    (tr.brk || []).forEach(function (b) { brk[b] = true; });
    const px = [], py = [], cum = [0];
    for (let i = 0; i < n; i++) {
      px.push(ox + mx(tr.lon[i]) * s); py.push(oy + my(tr.lat[i]) * s);
      if (i) cum.push(cum[i - 1] + (brk[i] ? 0 : GPX.haversine({ lat: tr.lat[i - 1], lon: tr.lon[i - 1] }, { lat: tr.lat[i], lon: tr.lon[i] })));
    }
    /* colour: heart rate if present, else speed from the point times; quartiles of one blue ramp */
    let col = null;
    if (Array.isArray(tr.hr) && tr.hr.filter(isNum).length >= 10) col = { vals: tr.hr.map(function (x, i) { let a = 0, c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) if (isNum(tr.hr[j])) { a += tr.hr[j]; c++; } return c ? a / c : null; }), low: 'Lower heart rate', high: 'Higher' };
    else if (Array.isArray(tr.t) && tr.t.filter(isNum).length >= 10) col = { vals: tr.t.map(function (x, i) { const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2), dt = tr.t[b] - tr.t[a]; return isNum(dt) && dt > 0 ? (cum[b] - cum[a]) / dt : null; }), low: 'Slower', high: 'Faster' };
    const q = col ? sortedNums(col.vals) : [];
    const qs = q.length >= 8 ? [pctile(q, 0.25), pctile(q, 0.5), pctile(q, 0.75)] : null;
    if (!qs) col = null;
    const bucket = function (i) { if (!col) return 3; const v = col.vals[i]; if (!isNum(v)) return 2; return v < qs[0] ? 1 : v < qs[1] ? 2 : v < qs[2] ? 3 : 4; };
    const svg = sv('svg', { id: 'gpx-d-route', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': 'Route shape, ' + GPX.fmtDistance(total) + ', drawn from the GPS points without a map. The green dot is the start and the red ring is the finish.' });
    let dCase = '';
    for (let i = 0; i < n; i++) dCase += (i === 0 || brk[i] ? 'M' : 'L') + f1(px[i]) + ' ' + f1(py[i]);
    svg.append(sv('path', { class: 'rt-case', d: dCase }));
    let run = null;
    const runs = [];
    for (let i = 1; i < n; i++) {
      if (brk[i]) { run = null; continue; }
      const b = bucket(i);
      if (!run || run.b !== b) { run = { b: b, d: 'M' + f1(px[i - 1]) + ' ' + f1(py[i - 1]) }; runs.push(run); }
      run.d += 'L' + f1(px[i]) + ' ' + f1(py[i]);
    }
    runs.forEach(function (r) { svg.append(sv('path', { class: 'rt-line rt-' + r.b, d: r.d })); });
    /* numbered distance markers: km (100 m for swims), thinned to at most 12 */
    const unit = type === 'swim' ? 100 : 1000;
    let step = unit;
    while (total / step > 12) step *= 2;
    const ratio = total > 0 ? cum[n - 1] / total : 1;
    let j = 1;
    for (let d = step; d < total - step * 0.15; d += step) {
      const rd = d * ratio;
      while (j < n - 1 && cum[j] < rd) j++;
      const f = cum[j] > cum[j - 1] ? Math.max(0, Math.min(1, (rd - cum[j - 1]) / (cum[j] - cum[j - 1]))) : 0;
      const x = f1(px[j - 1] + (px[j] - px[j - 1]) * f), y = f1(py[j - 1] + (py[j] - py[j - 1]) * f);
      const label = sv('text', { x: x, y: y + 3.5 });
      label.textContent = String(Math.round(d / unit));
      svg.append(sv('g', { class: 'rt-km' }, sv('circle', { cx: x, cy: y, r: 9 }), label));
    }
    svg.append(sv('circle', { class: 'rt-finish', cx: f1(px[n - 1]), cy: f1(py[n - 1]), r: 9 }));
    svg.append(sv('circle', { class: 'rt-start', cx: f1(px[0]), cy: f1(py[0]), r: 6 }));
    const cur = sv('circle', { class: 'rt-cur', r: 6, cx: 0, cy: 0, visibility: 'hidden' });
    svg.append(cur);
    box.append(svg);
    return { px: px, py: py, cum: cum, ratio: ratio, cur: cur, col: col, step: step, unit: unit };
  }
  function routeLegend(rt) {
    const stepText = rt.unit === 100 ? 'Numbered dots every ' + rt.step + ' m (1 = 100 m).' : 'Numbered dots every ' + (rt.step / 1000) + ' km.';
    return h('div', { class: 'route-legend small', id: 'gpx-d-route-legend' },
      rt.col ? h('span', { class: 'lg' }, h('span', { text: rt.col.low }), h('span', { class: 'ramp', 'aria-hidden': 'true' }, h('i', { class: 'sw-r1' }), h('i', { class: 'sw-r2' }), h('i', { class: 'sw-r3' }), h('i', { class: 'sw-r4' })), h('span', { text: rt.col.high })) : null,
      h('span', { class: 'lg' }, h('span', { class: 'key-start', 'aria-hidden': 'true' }), h('span', { text: 'Start' })),
      h('span', { class: 'lg' }, h('span', { class: 'key-finish', 'aria-hidden': 'true' }), h('span', { text: 'Finish' })),
      h('span', { text: stepText }));
  }
  function splitsSheet(m, type) {
    const sp = m.splits || [];
    if (!sp.length) return null;
    const lt = m.type || type, len = lt === 'swim' ? 100 : lt === 'cycle' ? 5000 : 1000;
    const hasT = sp.some(function (x) { return isNum(x.timeS); }), hasHr = sp.some(function (x) { return isNum(x.avgHr); }), hasEle = sp.some(function (x) { return isNum(x.elevDeltaM); });
    const paceHead = type === 'cycle' ? 'Speed km/h' : type === 'swim' ? 'Pace /100 m' : 'Pace /km';
    const cols = [['Split', false]];
    if (hasT) { cols.push(['Time', true]); cols.push([paceHead, true]); }
    if (hasHr) cols.push(['Avg HR', true]);
    if (hasEle) cols.push(['Elev m', true]);
    const what = lt === 'swim' ? '100 m' : lt === 'cycle' ? '5 km' : 'km';
    const table = h('table', { class: 'sheet', id: 'gpx-d-splits' },
      h('caption', { text: 'Splits per ' + what }),
      h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { scope: 'col', class: c[1] ? 'num' : null, text: c[0] }); }))));
    const body = h('tbody');
    let partial = false;
    sp.forEach(function (x) {
      const cells = [];
      if (x.partial) partial = true;
      cells.push(h('td', null, x.partial ? 'Last ' + fmtDistShort(x.distanceM) : fmtDistShort(x.index * len), x.partial ? h('span', { class: 'sr-only', text: ' (partial split)' }) : null));
      if (hasT) {
        cells.push(h('td', { class: 'num', text: isNum(x.timeS) ? GPX.fmtDuration(x.timeS) : '-' }));
        const pv = type === 'cycle' ? (isNum(x.timeS) && x.timeS > 0 ? km1(x.distanceM / x.timeS * 3.6) : null) : type === 'swim' ? fmtMinSec(x.paceSPer100m) : fmtMinSec(x.paceSPerKm);
        cells.push(h('td', { class: 'num', text: pv || '-' }));
      }
      if (hasHr) cells.push(h('td', { class: 'num', text: isNum(x.avgHr) ? String(Math.round(x.avgHr)) : '-' }));
      if (hasEle) cells.push(h('td', { class: 'num', text: isNum(x.elevDeltaM) ? (x.elevDeltaM > 0 ? '+' : '') + Math.round(x.elevDeltaM) : '-' }));
      body.append(h('tr', { class: x.partial ? 'is-partial' : null }, cells));
    });
    table.append(body);
    return h('div', null, h('div', { class: 'sheet-wrap' }, table), partial ? h('p', { class: 'small muted', id: 'gpx-d-splits-note', text: 'The last row is a partial split, shorter than a full ' + what + '.' }) : null);
  }
  function renderDetail() {
    const s = sessions.find(function (x) { return x.id === DETAIL.id; });
    if (!s) { closeDetail(false); return; }
    const rec = getTrack(s), type = s.type, label = TYPE_LABEL[type];
    $('gpx-d-sample').hidden = !s.sample;
    $('gpx-d-title').textContent = (rec && rec.name) || label;
    $('gpx-d-meta').textContent = [label, rec && isNum(rec.startTime) ? fmtStartTime(rec.startTime) : fmtDay(s.date), s.minutes + ' min logged'].join(' · ');
    const eff = $('gpx-d-effort');
    eff.className = 'tag ' + (s.intensity === 'vigorous' ? 'tag-vig' : s.intensity === 'light' ? 'tag-neutral' : 'tag-mod');
    eff.textContent = s.intensity;
    const cl = rec && rec.classification;
    $('gpx-d-basis').textContent = cl ? cl.text + (cl.intensity && cl.intensity !== s.intensity ? ' You logged it as ' + s.intensity + '.' : '') : '';
    $('gpx-d-hrnote').hidden = !(cl && cl.basis === 'hr');
    const miss = $('gpx-d-missing');
    miss.hidden = !!rec;
    miss.textContent = rec ? '' : s.trackId ? 'The route for this session is no longer stored. Your account keeps the details of the ' + TRACK_CAP + ' most recent imports. The session stays in your log.' : 'The route for this session was not stored with the import. The session is in your log.';
    $('gpx-d-device').hidden = !(rec && rec.deviceNote);
    $('gpx-d-device').textContent = (rec && rec.deviceNote) || '';
    const body = $('gpx-d-body');
    body.replaceChildren();
    DETAIL.charts = []; DETAIL.route = null;
    if (!rec) return;
    const m = rec.metrics;
    body.append(buildStats(m, type));
    const tr = rec.track, lat0 = tr.lat[0], lon0 = tr.lon[0];
    const osm = 'https://www.openstreetmap.org/?mlat=' + lat0.toFixed(5) + '&mlon=' + lon0.toFixed(5) + '#map=16/' + lat0.toFixed(5) + '/' + lon0.toFixed(5);
    const routeBox = h('div', { class: 'route-box', id: 'gpx-d-route-box' });
    const routeFig = h('figure', { class: 'route', id: 'gpx-d-route-fig' },
      h('div', { class: 'fig-title' }, h('span', { class: 'label', text: 'Route' }), h('span', { class: 'fig-read', text: GPX.fmtDistance(m.distanceM) })),
      routeBox,
      h('div', { id: 'gpx-d-route-legend-slot' }),
      h('figcaption', { class: 'small muted route-cap' }, 'No map background here: the line is drawn from the GPS points in the file. ', h('a', { href: osm, target: '_blank', rel: 'noopener', id: 'gpx-d-osm', text: 'Open start point in OpenStreetMap' }), h('span', { class: 'sr-only', text: ' (opens in a new tab)' })));
    const specs = chartSpecs(m, type);
    const chartsCol = h('div', { class: 'charts', id: 'gpx-d-charts' });
    const boxes = specs.map(function (sp) {
      const box = h('div', { class: 'chart-box', id: 'gpx-d-chart-box-' + sp.id });
      chartsCol.append(h('figure', { class: 'chart', id: 'gpx-d-fig-' + sp.id },
        h('div', { class: 'fig-title' }, h('span', { class: 'label', text: sp.title }), h('span', { class: 'fig-read', id: 'gpx-d-read-' + sp.id, text: sp.avg ? 'avg ' + sp.avg : '' })),
        box,
        chartUnitNote(sp) ? h('figcaption', { class: 'small muted', text: chartUnitNote(sp) }) : null));
      return box;
    });
    if (specs.length) chartsCol.append(h('p', { class: 'small muted', id: 'gpx-d-chart-help', text: 'Point at a chart, or focus it and use the arrow keys, to read values at any distance.' }), h('p', { class: 'sr-only', id: 'gpx-d-live', role: 'status', 'aria-live': 'polite' }));
    else chartsCol.append(h('p', { class: 'small muted', text: 'This file has no times, heart rate or elevation to chart.' }), h('p', { class: 'sr-only', id: 'gpx-d-live' }));
    body.append(h('div', { class: 'gpx-d-grid' }, routeFig, chartsCol));
    const sheet = splitsSheet(m, type);
    if (sheet) body.append(sheet);
    /* draw after layout so the SVGs match the real box width (text stays at its true size) */
    DETAIL.route = drawRoute(routeBox, rec, type);
    $('gpx-d-route-legend-slot').replaceWith(routeLegend(DETAIL.route));
    const distM = (m.series && m.series.distM) || [];
    DETAIL.charts = specs.map(function (sp, i) { return drawChart(boxes[i], sp, distM, distM.length ? distM[distM.length - 1] : m.distanceM); });
    DETAIL.width = routeBox.clientWidth;
  }
  function redrawDetailGraphics() {
    if (!DETAIL.id) return;
    const routeBox = $('gpx-d-route-box');
    if (!routeBox || routeBox.clientWidth === DETAIL.width) return;
    const keep = DETAIL.cursor;
    renderDetail();
    if (keep !== null) setCursor(keep);
  }

  /* ===== render all ===== */
  let renderedDay = '';
  function renderAll() {
    const c = calc();
    renderedDay = ymd(c.today);
    applyGuide(c);
    renderHero(c);
    renderSplits(c);
    renderGrid(c);
    renderPlan(c);
    renderSit(c);
    /* GPX: a detail view whose session is gone closes; an open import review follows a new age (heart rate method) */
    if (DETAIL.id && !sessions.some(function (s) { return s.id === DETAIL.id; })) closeDetail(false);
    if (GQ.item) showReview(false);
  }

  /* ===== wiring ===== */
  function wire() {
    $('theme-toggle').addEventListener('click', function () {
      theme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
      applyTheme();
      saveTheme(theme);
    });
    $('header-log').addEventListener('click', function (ev) {
      if (ageStepOpen()) { ev.preventDefault(); focusAgeInput(); return; }
      setTimeout(function () { $('log-activity').focus({ preventScroll: true }); }, 0);
    });
    $('nav-log').addEventListener('click', function (ev) {
      if (ageStepOpen()) { ev.preventDefault(); focusAgeInput(); }
    });
    $('age-form').addEventListener('submit', onAgeSubmit);
    $('age-input').addEventListener('input', function () { if (!$('age-err').hidden) showAgeError(false); });
    $('age-change').addEventListener('click', openAgeStep);
    $('age-cancel').addEventListener('click', closeAgeStep);
    $('sample-clear').addEventListener('click', function () {
      clearSample();
      renderAll();
      $('log-status').textContent = 'Sample cleared. Your log starts now.';
      $('week-heading').focus();
    });

    $('log-form').addEventListener('submit', onLogSubmit);
    $('log-minutes').addEventListener('input', function () { if (!$('log-minutes-err').hidden) showMinutesError(false); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-min]'), function (b) {
      b.addEventListener('click', function () { const i = $('log-minutes'); i.value = b.getAttribute('data-min'); showMinutesError(false); i.focus(); });
    });
    ['log-int-light', 'log-int-mod', 'log-int-vig'].forEach(function (id) { $(id).addEventListener('change', function () { syncLogForm(); }); });
    $('log-activity').addEventListener('change', function () { syncLogForm(); });
    $('log-balance-work').addEventListener('change', function () { syncLogForm(); });

    $('splits-body').addEventListener('click', function (ev) {
      const b = ev.target.closest('[data-remove]');
      if (b) removeSession(b.getAttribute('data-remove'));
      const d = ev.target.closest('[data-details]');
      if (d) openDetail(d.getAttribute('data-details'));
    });
    $('gpx-earlier-list').addEventListener('click', function (ev) {
      const d = ev.target.closest('[data-details]');
      if (d) openDetail(d.getAttribute('data-details'));
    });

    /* GPX import: two buttons share one file input; both controls also take dropped files */
    $('gpx-pick-log').addEventListener('click', function () { GQ.trigger = 'gpx-pick-log'; $('gpx-file').click(); });
    $('gpx-pick-splits').addEventListener('click', function () { GQ.trigger = 'gpx-pick-splits'; $('gpx-file').click(); });
    $('gpx-file').addEventListener('change', function (ev) { const files = ev.target.files; enqueueFiles(files, GQ.trigger); ev.target.value = ''; });
    wireDropTarget($('gpx-drop'), 'gpx-pick-log');
    wireDropTarget($('gpx-bar'), 'gpx-pick-splits');
    /* a file dropped anywhere else must not replace the page */
    window.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
    window.addEventListener('drop', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
    $('gpx-review').addEventListener('submit', onGpxSave);
    $('gpx-cancel').addEventListener('click', onGpxCancel);
    $('gpx-type').addEventListener('change', function (ev) {
      const it = GQ.item;
      if (!it) return;
      const prev = it.type;
      it.type = ev.target.value;
      try { itemAnalysis(it); } catch (e) { it.type = prev; ev.target.value = prev; $('gpx-basis').textContent = 'That activity does not fit the points in this file, so it stays ' + TYPE_LABEL[prev] + '.'; return; }
      showReview(false);
    });
    $('gpx-minutes').addEventListener('input', function () { if (GQ.item) GQ.item.minutesTouched = true; if (!$('gpx-minutes-err').hidden) showFieldError('gpx-minutes', ''); });
    $('gpx-date').addEventListener('change', function (ev) { showFieldError('gpx-date', dateProblem(ev.target.value)); });
    ['gpx-int-light', 'gpx-int-mod', 'gpx-int-vig'].forEach(function (id) { $(id).addEventListener('change', function () { if (GQ.item) GQ.item.effortTouched = true; }); });
    $('gpx-set-age').addEventListener('click', function () { if (ageStepOpen()) focusAgeInput(); else openAgeStep(); });
    $('gpx-d-close').addEventListener('click', function () { closeDetail(true); });
    $('gpx-detail').addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.preventDefault(); closeDetail(true); } });
    let resizeT = 0;
    window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(redrawDetailGraphics, 150); });
    $('undo-btn').addEventListener('click', undoRemove);

    $('plan-form').addEventListener('submit', onPlanSubmit);
    $('plan-clear').addEventListener('click', function () { resetBuilder(); $('plan-status').textContent = ''; $('plan-after').focus(); });
    $('plan-done').addEventListener('click', planDidToday);
    $('plan-undo').addEventListener('click', planUndoToday);
    $('plan-edit').addEventListener('click', function () {
      if (!plan) return;
      $('plan-after').value = plan.after; $('plan-will').value = plan.will; $('plan-where').value = plan.where; $('plan-minutes').value = String(plan.minutes);
      showPlanError('');
      $('plan-after').focus();
    });
    $('plan-delete').addEventListener('click', function () { $('plan-del-confirm').hidden = false; $('plan-del-no').focus(); });
    $('plan-del-no').addEventListener('click', function () { $('plan-del-confirm').hidden = true; $('plan-delete').focus(); });
    $('plan-del-yes').addEventListener('click', function () {
      plan = null; persist(); $('plan-del-confirm').hidden = true; renderAll();
      $('plan-after').focus({ preventScroll: true });
    });

    $('snack-start').addEventListener('click', onStart);
    $('snack-skip').addEventListener('click', onSkip);
    $('snack-reset').addEventListener('click', onReset);
    $('snack-log').addEventListener('click', onLogSnack);
    $('snack-partial').addEventListener('click', onPartial);
    $('snack-switch-yes').addEventListener('click', function () { const id = T.pendingSwitch; if (id) loadRoutine(id); });
    $('snack-switch-no').addEventListener('click', function () { T.pendingSwitch = null; $('snack-switch').hidden = true; $('snack-start').focus({ preventScroll: true }); });
    $('snack-sound').checked = !!prefs.sound;
    $('snack-sound').addEventListener('change', function (ev) {
      prefs.sound = ev.target.checked;
      if (prefs.sound) ensureAudio();
      persist();
    });

    $('sit-break').addEventListener('click', addBreak);
    $('sit-nudge-move').addEventListener('click', function () { addBreak(); $('sit-break').focus(); });
    $('sit-nudge-snooze').addEventListener('click', snoozeNudge);
    $('sit-undo').addEventListener('click', undoBreak);
    $('sit-nudge').checked = prefs.nudge;
    $('sit-nudge').addEventListener('change', onNudgeToggle);
    $('sit-log-link').addEventListener('click', function (ev) {
      if (ageStepOpen()) { ev.preventDefault(); focusAgeInput(); return; }
      setTimeout(function () { $('log-activity').focus({ preventScroll: true }); }, 0);
    });

    $('clear-all').addEventListener('click', function () { $('clear-all').hidden = true; $('clear-confirm').hidden = false; $('clear-status').textContent = ''; $('clear-no').focus(); });
    $('clear-no').addEventListener('click', function () { $('clear-confirm').hidden = true; $('clear-all').hidden = false; $('clear-all').focus(); });
    $('clear-yes').addEventListener('click', function () {
      clearAllData();
      $('clear-confirm').hidden = true; $('clear-all').hidden = false;
      $('clear-status').textContent = 'All cleared.';
      $('clear-all').focus();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { checkDayRollover(); tick(); checkNudge(); }
    });
    setInterval(checkDayRollover, 60000);
    setInterval(checkNudge, 30000);
  }
  function checkDayRollover() {
    if (ymd(today()) !== renderedDay) { buildDateOptions(); renderAll(); }
  }

  /* ===== init ===== */
  loadState();
  if (prefs.age !== null) $('age-input').value = String(prefs.age);
  buildDateOptions();
  buildPlanChips();
  renderRoutines();
  renderTimer();
  renderFooter();
  applyTheme();
  wire();
  renderAll();

  /* ===== account shell: header name, log out, reload after a remote change ===== */
  const displayName = (ctx.profile && ctx.profile.displayName) || '';
  $('who-name').textContent = displayName;
  $('bib-name').textContent = displayName;
  $('bib-name').hidden = !displayName;
  $('logout').addEventListener('click', function () { if (typeof ctx.onLogout === 'function') ctx.onLogout(); });
  window.W150App.reload = function () {
    loadState();
    $('age-input').value = prefs.age === null ? '' : String(prefs.age);
    $('sit-nudge').checked = prefs.nudge;
    renderAll();
  };
  }
};
