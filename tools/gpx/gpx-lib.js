/*
 * GPX library for Weekly 150. No dependencies. Works in the browser (paste inside the page's
 * IIFE) and in node (module.exports). Uses its own small XML scanner, so DOMParser is not needed.
 *
 * Typical flow:
 *   var r = GPX.analyze(xmlText, { age: 40 });   // parse + clean + metrics + track + classify
 * or step by step:
 *   var info = GPX.parse(text);                  // throws Error with a user-facing message
 *   var segs = GPX.clean(info.segments, { type: 'run' });
 *   var m    = GPX.metrics(segs, { type: 'run' });
 *   var trk  = GPX.downsample(segs, 500);
 *   var c    = GPX.classify(m, { type: 'run', age: 40 });
 *
 * API
 *   parse(text) -> { name, desc, creator, typeHint, startTime, deviceTotals, segments }
 *     typeHint: 'run' | 'cycle' | 'swim' | 'walk' | null. Taken from trk/rte <type>, then from the
 *       name text ("Outdoor running"), numeric Strava types included (1 ride, 9 run, 10 walk, 4 hike).
 *     startTime: ms since epoch (first point with a time, else metadata time) or null.
 *     deviceTotals: { distanceM, climbM, descentM } from <totalDistance> etc, each may be null; or null.
 *     segments: [[ { lat, lon, t (ms|null), ele|null, hr|null, cad|null, power|null, temp|null } ]]
 *     Handles namespaces and prefixes (none, gpxtpx:, ns3:, ...), trk/trkseg/trkpt and rte/rtept.
 *     Throws: "This is not a GPX file." or
 *             "This file has no GPS track points. Pool swims usually record none."
 *
 *   clean(segments, { type, maxSpeedMs }) -> segments (new arrays, same point objects)
 *     Drops points without lat/lon, duplicate or backwards timestamps, and GPS spikes (implied speed
 *     above the cap: run 15, walk 8, cycle 30, swim 4, other 35 m/s). Empty segments are removed.
 *     The result array has a .stats property: { noCoord, dupTime, backwards, spikes }.
 *     Spike removal needs timestamps, so time-less tracks are not spike filtered.
 *
 *   metrics(segments, { type, stopSpeedMs, stopSeconds, smoothS, eleWindow, eleThresholdM, splitM, seriesN })
 *     -> { type, points, distanceM, elapsedS, movingS, avgPaceSPerKm, avgPaceElapsedSPerKm,
 *          avgSpeedKmh, avgPaceSPer100m, maxSpeedKmh, bestKmPaceS, elevGainM, elevLossM, minEle,
 *          maxEle, avgHr, maxHr, hrSamples, avgCad, maxCad, avgPower, maxPower, avgTemp,
 *          splits, series, bbox, startLatLon }
 *     Everything that needs timestamps is null when the file has none (elapsedS, movingS, paces,
 *     speeds, splits timeS). Everything that needs ele or hr is null when the file has none.
 *     distanceM is the plain haversine sum of cleaned points (segment gaps are not bridged).
 *     movingS excludes inter-segment gaps and stops (speed below stopSpeedMs for stopSeconds or more).
 *     avgPaceSPerKm, avgSpeedKmh and avgPaceSPer100m use moving time; avgPaceElapsedSPerKm uses elapsed.
 *     avgCad ignores zero samples. Running cadence in GPX is usually one foot only (steps per minute
 *     is roughly double). avgPower includes zeros.
 *     splits: [{ index, distanceM, timeS, paceSPerKm, paceSPer100m, avgHr, elevDeltaM, partial }]
 *       split length: 1 km (run, walk), 5 km (cycle), 100 m (swim). Last short split has partial:true.
 *     series (about 300 points, evenly spaced by distance):
 *       { distM[], tS[], ele[]|null, hr[]|null, cad[]|null, power[]|null, paceSPerKm[], speedKmh[] }
 *       paceSPerKm entries are null while stopped; paceSPerKm and speedKmh are null without times.
 *     bbox: { minLat, maxLat, minLon, maxLon }.  startLatLon: [lat, lon].
 *
 *   downsample(pointsOrSegments, maxN = 500)
 *     -> { lat[], lon[], t[]|null (seconds from first point), ele[]|null, hr[]|null, brk[] }
 *     Keeps the route shape (Ramer-Douglas-Peucker order, always keeps segment ends). lat/lon have 5
 *     decimals. brk lists indices where a new segment starts (do not draw a line into those points).
 *
 *   classify(metrics, { type, age, maxHr, thresholds }) -> { intensity, basis, detail }
 *     intensity 'light' | 'moderate' | 'vigorous'; basis 'hr' | 'speed' | 'default'.
 *     Thresholds shape: see DEFAULT_THRESHOLDS (partial overrides are merged in).
 *
 *   analyze(text, { type, age, maxHr, thresholds, maxPoints, maxSpeedMs }) -> one-call result
 *     { info, type, cleanStats, metrics, track, classification, deviceNote }
 *     deviceNote is a short string when device totalDistance differs from the GPS points by more than
 *     10 percent, else null.
 *
 *   Formatters: fmtPace(sPerKm) "6:39 /km", fmtDuration(s) "13:27" | "1:02:05",
 *     fmtDistance(m) "2.02 km" (or "850 m" below 1 km), fmtSwimPace(sPer100m) "2:05 /100 m",
 *     fmtSpeed(kmh) "9.0 km/h". They return "n/a" for missing values.
 *
 *   Also exported: DEFAULT_THRESHOLDS, SPIKE_CAPS, MSG_NOT_GPX, MSG_NO_POINTS, haversine(a, b),
 *     detectType(text), normType(text).
 */
var GPX = (function () {
  'use strict';

  var MSG_NOT_GPX = 'This is not a GPX file.';
  var MSG_NO_POINTS = 'This file has no GPS track points. Pool swims usually record none.';

  // Placeholder values: another agent supplies research based numbers. Keep this shape.
  var DEFAULT_THRESHOLDS = {
    placeholder: true,
    hr: {
      maxHrBase: 220,        // max HR = maxHrBase - age
      moderatePct: 64,       // percent of max HR, moderate starts here
      vigorousPct: 77,       // vigorous starts here (moderate is 64 to 76 percent)
      minSamples: 10         // need this many HR samples to trust the HR method
    },
    speedKmh: {              // average moving speed where each band starts, below moderate is light
      walk:  { moderate: 4.0,  vigorous: 7.0 },
      run:   { moderate: 6.0,  vigorous: 9.5 },
      cycle: { moderate: 16.0, vigorous: 22.0 },
      swim:  { moderate: 1.5,  vigorous: 2.5 }
    }
  };

  var SPIKE_CAPS = { run: 15, walk: 8, cycle: 30, swim: 4, other: 35 };

  // Per activity analysis settings.
  var TYPE_CFG = {
    run:   { stopSpeed: 0.5, splitM: 1000, smoothS: 10 },
    walk:  { stopSpeed: 0.4, splitM: 1000, smoothS: 10 },
    cycle: { stopSpeed: 1.0, splitM: 5000, smoothS: 10 },
    swim:  { stopSpeed: 0.1, splitM: 100,  smoothS: 20 }
  };

  // ---------------------------------------------------------------- small helpers

  function rnd(x, k) {
    if (x === null || x === undefined || !isFinite(x)) { return null; }
    var f = Math.pow(10, k || 0);
    return Math.round(x * f) / f;
  }

  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  function haversine(a, b) {
    var R = 6371008.8, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    var s1 = Math.sin(dLat / 2), s2 = Math.sin(dLon / 2);
    var h = s1 * s1 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * s2 * s2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // ---------------------------------------------------------------- activity type

  function normType(s) {
    if (s === null || s === undefined) { return null; }
    s = String(s).toLowerCase();
    if (s === 'run' || s === 'cycle' || s === 'swim' || s === 'walk') { return s; }
    return detectType(s);
  }

  // Strava numeric activity types (best effort).
  var NUMERIC_TYPES = { '1': 'cycle', '4': 'walk', '9': 'run', '10': 'walk' };

  function detectType(text) {
    if (text === null || text === undefined) { return null; }
    var s = String(text).toLowerCase().replace(/[_\-]+/g, ' ').trim();
    if (!s) { return null; }
    if (/^\d+$/.test(s)) { return NUMERIC_TYPES[s] || null; }
    if (/swim/.test(s)) { return 'swim'; }
    if (/cycl|bike|biking|bicycl|\bride|virtualride|spinning/.test(s)) { return 'cycle'; }
    if (/running|\brun\b|\bjog|treadmill/.test(s)) { return 'run'; }
    if (/walk|hik/.test(s)) { return 'walk'; }
    return null;
  }

  // ---------------------------------------------------------------- XML scanner

  function decodeEntities(s) {
    if (s.indexOf('&') < 0) { return s; }
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, function (m, e) {
      if (e === 'amp') { return '&'; }
      if (e === 'lt') { return '<'; }
      if (e === 'gt') { return '>'; }
      if (e === 'quot') { return '"'; }
      if (e === 'apos') { return "'"; }
      var code = e.charAt(1) === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch (err) { return ''; }
    });
  }

  function localName(n) {
    var i = n.indexOf(':');
    return (i >= 0 ? n.slice(i + 1) : n).toLowerCase();
  }

  // Returns the root element as { n (lowercase local name), a (attrs), c (children), t (text) }.
  // Lenient: unclosed tags at the end of a truncated file are accepted. DOCTYPE entities are not
  // expanded (no entity expansion attacks).
  function scanXml(text) {
    var len = text.length, i = 0, lt, end, root = null, stack = [];
    var ATTR_RE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    if (text.charCodeAt(0) === 0xFEFF) { i = 1; }
    while (i < len) {
      lt = text.indexOf('<', i);
      if (lt < 0) { break; }
      if (lt > i && stack.length) {
        var raw = text.substring(i, lt);
        if (/\S/.test(raw)) { stack[stack.length - 1].t += decodeEntities(raw); }
      }
      if (text.substr(lt, 4) === '<!--') {
        end = text.indexOf('-->', lt + 4);
        if (end < 0) { break; }
        i = end + 3;
        continue;
      }
      if (text.substr(lt, 9) === '<![CDATA[') {
        end = text.indexOf(']]>', lt + 9);
        if (end < 0) { break; }
        if (stack.length) { stack[stack.length - 1].t += text.substring(lt + 9, end); }
        i = end + 3;
        continue;
      }
      if (text.charAt(lt + 1) === '?') {
        end = text.indexOf('?>', lt + 2);
        if (end < 0) { break; }
        i = end + 2;
        continue;
      }
      if (text.charAt(lt + 1) === '!') {
        // DOCTYPE or other declaration; skip, honouring an internal subset in brackets.
        end = text.indexOf('>', lt + 2);
        var br = text.indexOf('[', lt + 2);
        if (br >= 0 && (end < 0 || br < end)) {
          var closeBr = text.indexOf(']', br);
          end = closeBr < 0 ? -1 : text.indexOf('>', closeBr);
        }
        if (end < 0) { break; }
        i = end + 1;
        continue;
      }
      if (text.charAt(lt + 1) === '/') {
        end = text.indexOf('>', lt + 2);
        if (end < 0) { break; }
        var cname = localName(text.substring(lt + 2, end).trim());
        for (var k = stack.length - 1; k >= 0; k--) {
          if (stack[k].n === cname) { stack.length = k; break; }
        }
        i = end + 1;
        continue;
      }
      // Open tag: find the closing '>' while respecting quoted attribute values.
      var q = 0, j = lt + 1, c;
      for (; j < len; j++) {
        c = text.charCodeAt(j);
        if (q) { if (c === q) { q = 0; } }
        else if (c === 34 || c === 39) { q = c; }
        else if (c === 62) { break; }
      }
      if (j >= len) { break; }
      var inner = text.substring(lt + 1, j);
      var selfClose = inner.charAt(inner.length - 1) === '/';
      if (selfClose) { inner = inner.slice(0, -1); }
      var sp = inner.search(/[\s]/);
      var tagName = sp < 0 ? inner : inner.slice(0, sp);
      var node = { n: localName(tagName), a: {}, c: [], t: '' };
      if (sp >= 0) {
        var rest = inner.slice(sp), m;
        ATTR_RE.lastIndex = 0;
        while ((m = ATTR_RE.exec(rest)) !== null) {
          node.a[localName(m[1])] = decodeEntities(m[2] !== undefined ? m[2] : m[3]);
        }
      }
      if (stack.length) { stack[stack.length - 1].c.push(node); }
      else if (!root) { root = node; }
      if (!selfClose) { stack.push(node); }
      i = j + 1;
    }
    return root;
  }

  function kids(node, name) {
    var out = [], i;
    if (!node) { return out; }
    for (i = 0; i < node.c.length; i++) { if (node.c[i].n === name) { out.push(node.c[i]); } }
    return out;
  }

  function kid(node, name) {
    if (!node) { return null; }
    for (var i = 0; i < node.c.length; i++) { if (node.c[i].n === name) { return node.c[i]; } }
    return null;
  }

  function kidText(node, name) {
    var k = kid(node, name);
    return k ? k.t.trim() : '';
  }

  // ---------------------------------------------------------------- GPX parsing

  function parseTime(s) {
    s = (s || '').trim();
    if (!s) { return null; }
    if (/T/.test(s) && !/(Z|[+\-]\d\d:?\d\d)$/i.test(s)) { s += 'Z'; }
    var v = Date.parse(s);
    return isFinite(v) ? v : null;
  }

  function numIn(text, lo, hi) {
    var v = parseFloat(text);
    if (!isFinite(v) || v < lo || v > hi) { return null; }
    return v;
  }

  var EXT_MAP = {
    hr: 'hr', heartrate: 'hr', heart_rate: 'hr',
    cad: 'cad', cadence: 'cad', runcadence: 'cad',
    power: 'power', watts: 'power', powerinwatts: 'power',
    atemp: 'temp', temp: 'temp', temperature: 'temp', wtemp: 'temp'
  };
  var EXT_RANGE = { hr: [30, 250], cad: [0, 300], power: [0, 3000], temp: [-60, 80] };

  function readExt(node, p) {
    for (var i = 0; i < node.c.length; i++) {
      var c = node.c[i], field = EXT_MAP[c.n];
      if (field) {
        if (p[field] === null && c.t) {
          p[field] = numIn(c.t, EXT_RANGE[field][0], EXT_RANGE[field][1]);
        }
      } else if (c.c.length) {
        readExt(c, p);
      }
    }
  }

  function readPoint(el) {
    var lat = parseFloat(el.a.lat), lon = parseFloat(el.a.lon);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { return null; }
    var p = { lat: lat, lon: lon, t: null, ele: null, hr: null, cad: null, power: null, temp: null };
    for (var i = 0; i < el.c.length; i++) {
      var c = el.c[i];
      if (c.n === 'time') { p.t = parseTime(c.t); }
      else if (c.n === 'ele') { p.ele = numIn(c.t, -1000, 10000); }
      else if (c.c.length) { readExt(c, p); }
      else if (EXT_MAP[c.n] && c.t && p[EXT_MAP[c.n]] === null) {
        var f = EXT_MAP[c.n];
        p[f] = numIn(c.t, EXT_RANGE[f][0], EXT_RANGE[f][1]);
      }
    }
    return p;
  }

  function readTotals(root) {
    var holders = [], trks = kids(root, 'trk'), i, t;
    for (i = 0; i < trks.length; i++) { t = kid(trks[i], 'extensions'); if (t) { holders.push(t); } }
    t = kid(root, 'extensions'); if (t) { holders.push(t); }
    var out = { distanceM: null, climbM: null, descentM: null }, any = false;
    holders.forEach(function (h) {
      var map = { totaldistance: 'distanceM', cumulativeclimb: 'climbM', cumulativedecrease: 'descentM' };
      (function walk(n) {
        for (var k = 0; k < n.c.length; k++) {
          var c = n.c[k], f = map[c.n];
          if (f && out[f] === null) {
            var v = parseFloat(c.t);
            if (isFinite(v)) { out[f] = v; any = true; }
          } else if (c.c.length) { walk(c); }
        }
      })(h);
    });
    return any ? out : null;
  }

  function parse(text) {
    if (typeof text !== 'string' || !text.trim()) { throw new Error(MSG_NOT_GPX); }
    var root = scanXml(text);
    if (!root || root.n !== 'gpx') { throw new Error(MSG_NOT_GPX); }

    var segments = [], trks = kids(root, 'trk'), rtes = kids(root, 'rte'), i, j, k, pts, p;
    for (i = 0; i < trks.length; i++) {
      var segs = kids(trks[i], 'trkseg');
      for (j = 0; j < segs.length; j++) {
        pts = [];
        var els = kids(segs[j], 'trkpt');
        for (k = 0; k < els.length; k++) { p = readPoint(els[k]); if (p) { pts.push(p); } }
        if (pts.length) { segments.push(pts); }
      }
    }
    for (i = 0; i < rtes.length; i++) {
      pts = [];
      var rp = kids(rtes[i], 'rtept');
      for (k = 0; k < rp.length; k++) { p = readPoint(rp[k]); if (p) { pts.push(p); } }
      if (pts.length) { segments.push(pts); }
    }
    if (!segments.length) { throw new Error(MSG_NO_POINTS); }

    var meta = kid(root, 'metadata');
    function firstOf(field) {
      var cands = [], v;
      if (trks.length) { cands.push(kidText(trks[0], field)); }
      cands.push(kidText(meta, field));
      cands.push(kidText(root, field));
      if (rtes.length) { cands.push(kidText(rtes[0], field)); }
      for (var x = 0; x < cands.length; x++) { v = cands[x]; if (v) { return v; } }
      return '';
    }
    var name = firstOf('name'), desc = firstOf('desc');

    var typeText = '';
    if (trks.length) { typeText = kidText(trks[0], 'type'); }
    if (!typeText && rtes.length) { typeText = kidText(rtes[0], 'type'); }
    var typeHint = detectType(typeText) || detectType(name);

    var startTime = null;
    outer:
    for (i = 0; i < segments.length; i++) {
      for (j = 0; j < segments[i].length; j++) {
        if (segments[i][j].t !== null) { startTime = segments[i][j].t; break outer; }
      }
    }
    if (startTime === null) { startTime = parseTime(kidText(meta, 'time')); }

    return {
      name: name,
      desc: desc,
      creator: root.a.creator || '',
      typeHint: typeHint,
      startTime: startTime,
      deviceTotals: readTotals(root),
      segments: segments
    };
  }

  // ---------------------------------------------------------------- clean

  function spikeFilter(pts, cap, stats) {
    var n = pts.length;
    if (n < 3) { return pts; }
    function sp(a, b) {
      if (a.t === null || b.t === null) { return 0; }
      var dt = (b.t - a.t) / 1000;
      if (dt <= 0) { return 0; }
      return haversine(a, b) / dt;
    }
    var start = 0;
    // A bad first point: first step too fast while the next step is normal.
    while (start < n - 2 && sp(pts[start], pts[start + 1]) > cap && sp(pts[start + 1], pts[start + 2]) <= cap) {
      stats.spikes++;
      start++;
    }
    var res = [pts[start]], anchor = pts[start], i, k, consistent;
    for (i = start + 1; i < n; i++) {
      var p = pts[i];
      if (sp(anchor, p) > cap) {
        consistent = false;
        for (k = i + 1; k < n && k <= i + 3; k++) {
          if (sp(anchor, pts[k]) <= cap) { consistent = true; break; }
        }
        if (consistent) { stats.spikes++; continue; }
        // Nobody returns to the anchor: treat as a real jump (GPS gap), keep it.
      }
      res.push(p);
      anchor = p;
    }
    return res;
  }

  function clean(segments, opts) {
    opts = opts || {};
    var type = normType(opts.type);
    var cap = isNum(opts.maxSpeedMs) ? opts.maxSpeedMs : (SPIKE_CAPS[type] || SPIKE_CAPS.other);
    var stats = { noCoord: 0, dupTime: 0, backwards: 0, spikes: 0 };
    var out = [];
    (segments || []).forEach(function (seg) {
      var pts = [], last = null;
      (seg || []).forEach(function (p) {
        if (!p || !isNum(p.lat) || !isNum(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) {
          stats.noCoord++;
          return;
        }
        if (last) {
          if (p.t !== null && last.t !== null) {
            if (p.t === last.t) { stats.dupTime++; return; }
            if (p.t < last.t) { stats.backwards++; return; }
          } else if (p.t === null && last.t === null && p.lat === last.lat && p.lon === last.lon) {
            stats.dupTime++;
            return;
          }
        }
        pts.push(p);
        last = p;
      });
      pts = spikeFilter(pts, cap, stats);
      if (pts.length) { out.push(pts); }
    });
    out.stats = stats;
    return out;
  }

  // ---------------------------------------------------------------- metrics

  function flatten(segments) {
    var P = [], first = [];
    (segments || []).forEach(function (seg) {
      var started = false;
      (seg || []).forEach(function (p) {
        if (p && isNum(p.lat) && isNum(p.lon)) {
          P.push(p);
          first.push(!started);
          started = true;
        }
      });
    });
    return { P: P, first: first };
  }

  function emptyMetrics(type) {
    return {
      type: type, points: 0, distanceM: 0, elapsedS: null, movingS: null, avgPaceSPerKm: null,
      avgPaceElapsedSPerKm: null, avgSpeedKmh: null, avgPaceSPer100m: null, maxSpeedKmh: null,
      bestKmPaceS: null, elevGainM: null, elevLossM: null, minEle: null, maxEle: null, avgHr: null,
      maxHr: null, hrSamples: 0, avgCad: null, maxCad: null, avgPower: null, maxPower: null,
      avgTemp: null, splits: [], series: null, bbox: null, startLatLon: null
    };
  }

  function stat(arr, skipZero) {
    var sum = 0, n = 0, max = null, i, v;
    for (i = 0; i < arr.length; i++) {
      v = arr[i];
      if (v === null || (skipZero && v === 0)) { continue; }
      sum += v; n++;
      if (max === null || v > max) { max = v; }
    }
    return { n: n, avg: n ? sum / n : null, max: max };
  }

  // Minimum time (in the tt axis) to cover W metres, interpolated. d must be non-decreasing.
  function bestWindow(d, tt, W) {
    var n = d.length;
    if (n < 2 || d[n - 1] < W) { return null; }
    var best = Infinity, j = 0, i, target, frac, t0, dur;
    for (i = 1; i < n; i++) {
      if (d[i] < W) { continue; }
      target = d[i] - W;
      while (j + 1 < i && d[j + 1] <= target) { j++; }
      frac = d[j + 1] > d[j] ? (target - d[j]) / (d[j + 1] - d[j]) : 0;
      if (frac < 0) { frac = 0; }
      t0 = tt[j] + frac * (tt[j + 1] - tt[j]);
      dur = tt[i] - t0;
      if (dur > 0 && dur < best) { best = dur; }
    }
    return best === Infinity ? null : best;
  }

  function metrics(segments, opts) {
    opts = opts || {};
    var type = normType(opts.type) || 'run';
    var cfg = TYPE_CFG[type];
    var fl = flatten(segments), P = fl.P, first = fl.first, n = P.length, i;
    if (!n) { return emptyMetrics(type); }

    var stopSpeed = isNum(opts.stopSpeedMs) ? opts.stopSpeedMs : cfg.stopSpeed;
    var stopSeconds = isNum(opts.stopSeconds) ? opts.stopSeconds : 10;
    var smoothS = isNum(opts.smoothS) ? opts.smoothS : cfg.smoothS;
    var splitM = isNum(opts.splitM) ? opts.splitM : cfg.splitM;
    var seriesN = opts.seriesN || 300;
    var eleWindow = opts.eleWindow || 5;
    var eleTh = isNum(opts.eleThresholdM) ? opts.eleThresholdM : 3;

    var hasTime = true;
    for (i = 0; i < n; i++) { if (P[i].t === null) { hasTime = false; break; } }

    // Cumulative distance d, elapsed time ce (gaps between segments removed), step data.
    var d = new Array(n), ce = new Array(n), stepD = new Array(n), stepDt = new Array(n);
    d[0] = 0; ce[0] = 0; stepD[0] = 0; stepDt[0] = 0;
    for (i = 1; i < n; i++) {
      if (first[i]) {
        d[i] = d[i - 1]; ce[i] = ce[i - 1]; stepD[i] = 0; stepDt[i] = 0;
      } else {
        stepD[i] = haversine(P[i - 1], P[i]);
        d[i] = d[i - 1] + stepD[i];
        stepDt[i] = hasTime ? Math.max(0, (P[i].t - P[i - 1].t) / 1000) : 0;
        ce[i] = ce[i - 1] + stepDt[i];
      }
    }
    var distanceM = d[n - 1];

    // Moving time: runs of slow steps lasting stopSeconds or more are stops.
    var cumT = null, movingS = null;
    if (hasTime) {
      var moving = new Array(n), j, dur;
      for (i = 0; i < n; i++) { moving[i] = 0; }
      var slow = function (x) { return stepDt[x] <= 0 || stepD[x] / stepDt[x] < stopSpeed; };
      i = 1;
      while (i < n) {
        if (first[i]) { i++; continue; }
        if (slow(i)) {
          j = i; dur = 0;
          while (j < n && !first[j] && slow(j)) { dur += stepDt[j]; j++; }
          if (dur < stopSeconds) { for (var x = i; x < j; x++) { moving[x] = 1; } }
          i = j;
        } else { moving[i] = 1; i++; }
      }
      cumT = new Array(n);
      cumT[0] = 0;
      for (i = 1; i < n; i++) { cumT[i] = cumT[i - 1] + (moving[i] ? stepDt[i] : 0); }
      movingS = cumT[n - 1];
    }

    var firstT = null, lastT = null;
    for (i = 0; i < n; i++) { if (P[i].t !== null) { firstT = P[i].t; break; } }
    for (i = n - 1; i >= 0; i--) { if (P[i].t !== null) { lastT = P[i].t; break; } }
    var elapsedS = (firstT !== null && lastT !== null) ? (lastT - firstT) / 1000 : null;

    // Smoothed speed per point (window of smoothS seconds of elapsed time).
    var sm = null, maxSpeed = null;
    if (hasTime && ce[n - 1] > 0) {
      sm = new Array(n);
      var jj = 0, span, okSpan = Math.min(0.8 * smoothS, 0.8 * ce[n - 1]);
      sm[0] = null;
      for (i = 1; i < n; i++) {
        while (jj + 1 < i && ce[i] - ce[jj + 1] >= smoothS) { jj++; }
        span = ce[i] - ce[jj];
        if (span > 0) {
          sm[i] = (d[i] - d[jj]) / span;
          if (span >= okSpan && (maxSpeed === null || sm[i] > maxSpeed)) { maxSpeed = sm[i]; }
        } else { sm[i] = null; }
      }
      if (sm[1] === null) { sm[0] = null; } else { sm[0] = sm[1]; }
    }

    // Elevation: fill gaps, smooth with a centred moving average, count with hysteresis.
    var eleCount = 0, eleS = null, gain = null, loss = null, minEle = null, maxEle = null;
    for (i = 0; i < n; i++) { if (P[i].ele !== null) { eleCount++; } }
    if (eleCount >= 1) {
      var filled = new Array(n), lastE = null, firstIdx = -1;
      for (i = 0; i < n; i++) { if (P[i].ele !== null) { firstIdx = i; break; } }
      for (i = 0; i < n; i++) {
        if (P[i].ele !== null) { lastE = P[i].ele; }
        filled[i] = lastE !== null ? lastE : P[firstIdx].ele;
      }
      var pre = new Array(n + 1), half = Math.floor(eleWindow / 2);
      pre[0] = 0;
      for (i = 0; i < n; i++) { pre[i + 1] = pre[i] + filled[i]; }
      eleS = new Array(n);
      for (i = 0; i < n; i++) {
        var lo = Math.max(0, i - half), hi = Math.min(n - 1, i + half);
        eleS[i] = (pre[hi + 1] - pre[lo]) / (hi - lo + 1);
      }
      gain = 0; loss = 0;
      var ref = eleS[0];
      minEle = eleS[0]; maxEle = eleS[0];
      for (i = 1; i < n; i++) {
        var v = eleS[i];
        if (v < minEle) { minEle = v; }
        if (v > maxEle) { maxEle = v; }
        if (v - ref >= eleTh) { gain += v - ref; ref = v; }
        else if (ref - v >= eleTh) { loss += ref - v; ref = v; }
      }
    }

    // Sensor stats.
    var hrArr = new Array(n), cadArr = new Array(n), powArr = new Array(n), tmpArr = new Array(n);
    for (i = 0; i < n; i++) { hrArr[i] = P[i].hr; cadArr[i] = P[i].cad; powArr[i] = P[i].power; tmpArr[i] = P[i].temp; }
    var sHr = stat(hrArr), sCad = stat(cadArr, true), sPow = stat(powArr), sTmp = stat(tmpArr);

    // Splits.
    var splits = [], L = splitM, nextB = L, startD = 0, startT = 0, startEle = eleS ? eleS[0] : null;
    var hrSum = 0, hrN = 0, idx = 1;
    var tAxis = cumT;
    function pushSplit(dist, t0, t1, e1, partial) {
      var timeS = tAxis ? t1 - t0 : null;
      if (timeS !== null && timeS <= 0) { timeS = null; }
      splits.push({
        index: idx++,
        distanceM: rnd(dist, 1),
        timeS: rnd(timeS, 2),
        paceSPerKm: timeS !== null ? rnd(timeS / (dist / 1000), 2) : null,
        paceSPer100m: timeS !== null ? rnd(timeS / (dist / 100), 2) : null,
        avgHr: hrN ? rnd(hrSum / hrN, 1) : null,
        elevDeltaM: (startEle !== null && e1 !== null) ? rnd(e1 - startEle, 1) : null,
        partial: !!partial
      });
    }
    for (i = 1; i < n; i++) {
      if (!first[i]) {
        var d0 = d[i - 1], d1 = d[i];
        while (d1 >= nextB && d1 > d0) {
          var f = (nextB - d0) / (d1 - d0);
          var tc = tAxis ? tAxis[i - 1] + f * (tAxis[i] - tAxis[i - 1]) : 0;
          var ec = eleS ? eleS[i - 1] + f * (eleS[i] - eleS[i - 1]) : null;
          pushSplit(L, startT, tc, ec, false);
          startD = nextB; startT = tc; startEle = ec;
          hrSum = 0; hrN = 0;
          nextB += L;
        }
      }
      if (hrArr[i] !== null) { hrSum += hrArr[i]; hrN++; }
    }
    if (distanceM - startD >= 1 && distanceM > 0) {
      pushSplit(distanceM - startD, startT, tAxis ? tAxis[n - 1] : 0, eleS ? eleS[n - 1] : null, true);
    }

    // Chart series, evenly spaced by distance.
    var series = null, bbox, k;
    var sIdx = [];
    if (distanceM > 0) {
      var p2 = 0, lastPick = -1;
      for (k = 0; k <= seriesN; k++) {
        var target = distanceM * k / seriesN;
        while (p2 < n - 1 && d[p2] < target) { p2++; }
        if (p2 !== lastPick) { sIdx.push(p2); lastPick = p2; }
      }
    } else { sIdx.push(0); }
    var hasHr = sHr.n > 0, hasCad = sCad.n > 0 || stat(cadArr).n > 0, hasPow = sPow.n > 0;
    series = {
      distM: [], tS: [], ele: eleS ? [] : null, hr: hasHr ? [] : null, cad: hasCad ? [] : null,
      power: hasPow ? [] : null, paceSPerKm: sm ? [] : null, speedKmh: sm ? [] : null
    };
    sIdx.forEach(function (ix) {
      series.distM.push(rnd(d[ix], 1));
      series.tS.push(firstT !== null && P[ix].t !== null ? rnd((P[ix].t - firstT) / 1000, 0) : null);
      if (eleS) { series.ele.push(rnd(eleS[ix], 1)); }
      if (hasHr || hasCad) {
        var a = Math.max(0, ix - 2), b = Math.min(n - 1, ix + 2), s = 0, c = 0, s2 = 0, c2 = 0, y;
        for (y = a; y <= b; y++) {
          if (hrArr[y] !== null) { s += hrArr[y]; c++; }
          if (cadArr[y] !== null) { s2 += cadArr[y]; c2++; }
        }
        if (hasHr) { series.hr.push(c ? rnd(s / c, 0) : null); }
        if (hasCad) { series.cad.push(c2 ? rnd(s2 / c2, 0) : null); }
      }
      if (hasPow) {
        var a3 = Math.max(0, ix - 2), b3 = Math.min(n - 1, ix + 2), s3 = 0, c3 = 0, z;
        for (z = a3; z <= b3; z++) { if (powArr[z] !== null) { s3 += powArr[z]; c3++; } }
        series.power.push(c3 ? rnd(s3 / c3, 0) : null);
      }
      if (sm) {
        var spd = sm[ix];
        series.speedKmh.push(spd !== null ? rnd(spd * 3.6, 2) : null);
        series.paceSPerKm.push(spd !== null && spd >= 0.3 ? rnd(1000 / spd, 1) : null);
      }
    });

    var minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (i = 0; i < n; i++) {
      if (P[i].lat < minLat) { minLat = P[i].lat; }
      if (P[i].lat > maxLat) { maxLat = P[i].lat; }
      if (P[i].lon < minLon) { minLon = P[i].lon; }
      if (P[i].lon > maxLon) { maxLon = P[i].lon; }
    }
    bbox = { minLat: minLat, maxLat: maxLat, minLon: minLon, maxLon: maxLon };

    var km = distanceM / 1000;
    var best = hasTime ? bestWindow(d, cumT, 1000) : null;
    return {
      type: type,
      points: n,
      distanceM: rnd(distanceM, 1),
      elapsedS: rnd(elapsedS, 2),
      movingS: rnd(movingS, 2),
      avgPaceSPerKm: (movingS && km >= 0.001) ? rnd(movingS / km, 2) : null,
      avgPaceElapsedSPerKm: (elapsedS && km >= 0.001) ? rnd(elapsedS / km, 2) : null,
      avgSpeedKmh: (movingS && distanceM > 0) ? rnd(distanceM / movingS * 3.6, 2) : null,
      avgPaceSPer100m: (movingS && distanceM >= 1) ? rnd(movingS / (distanceM / 100), 2) : null,
      maxSpeedKmh: maxSpeed !== null ? rnd(maxSpeed * 3.6, 2) : null,
      bestKmPaceS: rnd(best, 2),
      elevGainM: rnd(gain, 1),
      elevLossM: rnd(loss, 1),
      minEle: rnd(minEle, 1),
      maxEle: rnd(maxEle, 1),
      avgHr: rnd(sHr.avg, 1),
      maxHr: sHr.max,
      hrSamples: sHr.n,
      avgCad: rnd(sCad.avg, 1),
      maxCad: sCad.max,
      avgPower: rnd(sPow.avg, 1),
      maxPower: sPow.max,
      avgTemp: rnd(sTmp.avg, 1),
      splits: splits,
      series: series,
      bbox: bbox,
      startLatLon: [P[0].lat, P[0].lon]
    };
  }

  // ---------------------------------------------------------------- downsample

  function heapPush(h, e) {
    h.push(e);
    var i = h.length - 1, p;
    while (i > 0) {
      p = (i - 1) >> 1;
      if (h[p].dist >= h[i].dist) { break; }
      var tmp = h[p]; h[p] = h[i]; h[i] = tmp;
      i = p;
    }
  }

  function heapPop(h) {
    var top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last;
      var i = 0, n = h.length, l, r, m;
      for (;;) {
        l = 2 * i + 1; r = l + 1; m = i;
        if (l < n && h[l].dist > h[m].dist) { m = l; }
        if (r < n && h[r].dist > h[m].dist) { m = r; }
        if (m === i) { break; }
        var tmp = h[m]; h[m] = h[i]; h[i] = tmp;
        i = m;
      }
    }
    return top;
  }

  function downsample(input, maxN) {
    maxN = Math.max(2, maxN || 500);
    var segs;
    if (input && input.length && Array.isArray(input[0])) { segs = input; }
    else { segs = [input || []]; }
    var P = [], segRanges = [];
    segs.forEach(function (seg) {
      var lo = P.length;
      (seg || []).forEach(function (p) { if (p && isNum(p.lat) && isNum(p.lon)) { P.push(p); } });
      if (P.length > lo) { segRanges.push([lo, P.length - 1]); }
    });
    var n = P.length;
    var out = { lat: [], lon: [], t: null, ele: null, hr: null, brk: [] };
    if (!n) { return out; }

    var keep = [], k;
    if (n <= maxN) {
      for (k = 0; k < n; k++) { keep.push(k); }
    } else {
      var lat0 = P[0].lat, cosL = Math.cos(lat0 * Math.PI / 180), px = new Array(n), py = new Array(n);
      for (k = 0; k < n; k++) { px[k] = (P[k].lon - P[0].lon) * cosL; py[k] = P[k].lat - lat0; }
      var chosen = new Uint8Array(n), count = 0, heap = [];
      var farthest = function (lo, hi) {
        if (hi - lo < 2) { return null; }
        var ax = px[lo], ay = py[lo], dx = px[hi] - ax, dy = py[hi] - ay, len2 = dx * dx + dy * dy;
        var bestI = -1, bestD = -1, q, dist, t, ex, ey;
        for (q = lo + 1; q < hi; q++) {
          ex = px[q] - ax; ey = py[q] - ay;
          if (len2 === 0) { dist = ex * ex + ey * ey; }
          else {
            t = (ex * dx + ey * dy) / len2;
            if (t < 0) { t = 0; } else if (t > 1) { t = 1; }
            var cx = ex - t * dx, cy = ey - t * dy;
            dist = cx * cx + cy * cy;
          }
          if (dist > bestD) { bestD = dist; bestI = q; }
        }
        return { lo: lo, hi: hi, idx: bestI, dist: bestD };
      };
      segRanges.forEach(function (r) {
        if (!chosen[r[0]]) { chosen[r[0]] = 1; count++; }
        if (!chosen[r[1]]) { chosen[r[1]] = 1; count++; }
        var e = farthest(r[0], r[1]);
        if (e) { heapPush(heap, e); }
      });
      while (count < maxN && heap.length) {
        var top = heapPop(heap);
        chosen[top.idx] = 1; count++;
        var e1 = farthest(top.lo, top.idx), e2 = farthest(top.idx, top.hi);
        if (e1) { heapPush(heap, e1); }
        if (e2) { heapPush(heap, e2); }
      }
      for (k = 0; k < n; k++) { if (chosen[k]) { keep.push(k); } }
    }

    var starts = {};
    segRanges.forEach(function (r) { starts[r[0]] = true; });
    var t0 = null, allT = true, anyEle = false, anyHr = false;
    for (k = 0; k < n; k++) {
      if (P[k].t === null) { allT = false; }
      if (P[k].ele !== null) { anyEle = true; }
      if (P[k].hr !== null) { anyHr = true; }
    }
    if (allT) { t0 = P[0].t; out.t = []; }
    if (anyEle) { out.ele = []; }
    if (anyHr) { out.hr = []; }
    keep.forEach(function (ix, outIdx) {
      var p = P[ix];
      out.lat.push(Math.round(p.lat * 1e5) / 1e5);
      out.lon.push(Math.round(p.lon * 1e5) / 1e5);
      if (out.t) { out.t.push(Math.round((p.t - t0) / 1000)); }
      if (out.ele) { out.ele.push(p.ele !== null ? Math.round(p.ele * 10) / 10 : null); }
      if (out.hr) { out.hr.push(p.hr !== null ? Math.round(p.hr) : null); }
      if (starts[ix] && outIdx > 0) { out.brk.push(outIdx); }
    });
    return out;
  }

  // ---------------------------------------------------------------- classify

  function mergeThresholds(over) {
    var th = {
      placeholder: DEFAULT_THRESHOLDS.placeholder,
      hr: {}, speedKmh: {}
    }, key, t;
    for (key in DEFAULT_THRESHOLDS.hr) { th.hr[key] = DEFAULT_THRESHOLDS.hr[key]; }
    for (t in DEFAULT_THRESHOLDS.speedKmh) {
      th.speedKmh[t] = {
        moderate: DEFAULT_THRESHOLDS.speedKmh[t].moderate,
        vigorous: DEFAULT_THRESHOLDS.speedKmh[t].vigorous
      };
    }
    if (over) {
      if (over.hr) { for (key in over.hr) { th.hr[key] = over.hr[key]; } }
      if (over.speedKmh) {
        for (t in over.speedKmh) {
          th.speedKmh[t] = th.speedKmh[t] || {};
          for (key in over.speedKmh[t]) { th.speedKmh[t][key] = over.speedKmh[t][key]; }
        }
      }
      if (over.placeholder !== undefined) { th.placeholder = over.placeholder; }
    }
    return th;
  }

  function classify(m, opts) {
    opts = opts || {};
    var th = mergeThresholds(opts.thresholds);
    var type = normType(opts.type) || (m && normType(m.type)) || 'run';
    var maxHr = isNum(opts.maxHr) ? opts.maxHr : (isNum(opts.age) && opts.age > 0 ? th.hr.maxHrBase - opts.age : null);

    if (m && maxHr && isNum(m.avgHr) && m.hrSamples >= th.hr.minSamples) {
      var pct = m.avgHr / maxHr * 100;
      var inten = pct >= th.hr.vigorousPct ? 'vigorous' : (pct >= th.hr.moderatePct ? 'moderate' : 'light');
      return {
        intensity: inten,
        basis: 'hr',
        detail: 'Average heart rate ' + Math.round(m.avgHr) + ' bpm is ' + Math.round(pct) +
          '% of an estimated maximum of ' + Math.round(maxHr) + ' bpm (moderate from ' + th.hr.moderatePct +
          '%, vigorous from ' + th.hr.vigorousPct + '%).'
      };
    }
    var sp = th.speedKmh[type];
    if (m && sp && isNum(m.avgSpeedKmh) && m.avgSpeedKmh > 0) {
      var inten2 = m.avgSpeedKmh >= sp.vigorous ? 'vigorous' : (m.avgSpeedKmh >= sp.moderate ? 'moderate' : 'light');
      return {
        intensity: inten2,
        basis: 'speed',
        detail: 'Average speed ' + m.avgSpeedKmh.toFixed(1) + ' km/h (moderate from ' + sp.moderate +
          ' km/h, vigorous from ' + sp.vigorous + ' km/h). No heart rate was used.'
      };
    }
    return {
      intensity: 'moderate',
      basis: 'default',
      detail: 'Not enough heart rate or speed data to judge intensity, so it is assumed moderate.'
    };
  }

  // ---------------------------------------------------------------- formatters

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function fmtDuration(s) {
    if (!isNum(s) || s < 0) { return 'n/a'; }
    var t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
    return h > 0 ? h + ':' + pad2(m) + ':' + pad2(sec) : m + ':' + pad2(sec);
  }

  function fmtPace(sPerKm) {
    if (!isNum(sPerKm) || sPerKm <= 0) { return 'n/a'; }
    var t = Math.round(sPerKm);
    return Math.floor(t / 60) + ':' + pad2(t % 60) + ' /km';
  }

  function fmtSwimPace(sPer100m) {
    if (!isNum(sPer100m) || sPer100m <= 0) { return 'n/a'; }
    var t = Math.round(sPer100m);
    return Math.floor(t / 60) + ':' + pad2(t % 60) + ' /100 m';
  }

  function fmtDistance(m) {
    if (!isNum(m) || m < 0) { return 'n/a'; }
    if (m < 1000) { return Math.round(m) + ' m'; }
    return (m / 1000).toFixed(2) + ' km';
  }

  function fmtSpeed(kmh) {
    if (!isNum(kmh) || kmh < 0) { return 'n/a'; }
    return kmh.toFixed(1) + ' km/h';
  }

  // ---------------------------------------------------------------- analyze

  function analyze(text, opts) {
    opts = opts || {};
    var info = parse(text);
    var type = normType(opts.type) || info.typeHint || 'run';
    var segs = clean(info.segments, { type: type, maxSpeedMs: opts.maxSpeedMs });
    if (!segs.length) { throw new Error(MSG_NO_POINTS); }
    var m = metrics(segs, { type: type });
    var track = downsample(segs, opts.maxPoints || 500);
    var cls = classify(m, { type: type, age: opts.age, maxHr: opts.maxHr, thresholds: opts.thresholds });
    var note = null, dt = info.deviceTotals;
    if (dt && isNum(dt.distanceM) && dt.distanceM > 0 && m.distanceM > 0) {
      var diff = Math.abs(dt.distanceM - m.distanceM) / dt.distanceM;
      if (diff > 0.10) {
        note = 'The device reported ' + fmtDistance(dt.distanceM) + ' but the GPS points in this file add up to ' +
          fmtDistance(m.distanceM) + '. The file may be one part of a split export. The numbers shown use the points.';
      }
    }
    return {
      info: {
        name: info.name, desc: info.desc, creator: info.creator, typeHint: info.typeHint,
        startTime: info.startTime, deviceTotals: info.deviceTotals
      },
      type: type,
      cleanStats: segs.stats,
      metrics: m,
      track: track,
      classification: cls,
      deviceNote: note
    };
  }

  return {
    parse: parse,
    clean: clean,
    metrics: metrics,
    downsample: downsample,
    classify: classify,
    analyze: analyze,
    fmtPace: fmtPace,
    fmtDuration: fmtDuration,
    fmtDistance: fmtDistance,
    fmtSwimPace: fmtSwimPace,
    fmtSpeed: fmtSpeed,
    haversine: haversine,
    detectType: detectType,
    normType: normType,
    DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
    SPIKE_CAPS: SPIKE_CAPS,
    MSG_NOT_GPX: MSG_NOT_GPX,
    MSG_NO_POINTS: MSG_NO_POINTS
  };
})();
if (typeof module !== 'undefined') { module.exports = GPX; }
