// Plain node tests for gpx-lib.js. Run: node gpx-lib.test.js
// Optional: REAL_GPX=<path> to point at the real Mi Fitness file.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var GPX = require('./gpx-lib.js');

var REAL = process.env.REAL_GPX || path.join(__dirname, '..', '..', '20261006Outdoor running_01 (1).gpx');
var FIX = path.join(__dirname, 'fixtures');
function fx(name) { return fs.readFileSync(path.join(FIX, name), 'utf8'); }

var passed = 0, failed = 0, skipped = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.message)); }
}
function near(actual, expected, tol, label) {
  assert.ok(typeof actual === 'number' && Math.abs(actual - expected) <= tol,
    (label || 'value') + ' expected ' + expected + ' +/- ' + tol + ' but got ' + actual);
}
function throwsMsg(fn, msg) {
  var err = null;
  try { fn(); } catch (e) { err = e; }
  assert.ok(err, 'expected an error');
  assert.strictEqual(err.message, msg);
}

// ---------------------------------------------------------------- real Mi Fitness file
if (fs.existsSync(REAL)) {
  var realText = fs.readFileSync(REAL, 'utf8');
  var realInfo = GPX.parse(realText);
  var realSegs = GPX.clean(realInfo.segments, { type: 'run' });
  var realM = GPX.metrics(realSegs, { type: 'run' });

  test('real: header fields and type hint from the name', function () {
    assert.strictEqual(realInfo.name, '20261006Outdoor running');
    assert.strictEqual(realInfo.desc, 'Export from Mi Fitness');
    assert.strictEqual(realInfo.typeHint, 'run');
    assert.strictEqual(realInfo.startTime, Date.UTC(2026, 9, 6, 18, 48, 54));
    assert.strictEqual(realInfo.segments.length, 1);
    assert.strictEqual(realInfo.segments[0].length, 806);
  });
  test('real: deviceTotals read from unprefixed extensions', function () {
    assert.deepStrictEqual(realInfo.deviceTotals, { distanceM: 5052, climbM: 0, descentM: 0 });
  });
  test('real: cleaning keeps every point', function () {
    assert.strictEqual(realSegs[0].length, 806);
    assert.deepStrictEqual(realSegs.stats, { noCoord: 0, dupTime: 0, backwards: 0, spikes: 0 });
  });
  test('real: about 2.0 km, 807 s elapsed, pace 6:39/km', function () {
    near(realM.distanceM, 2020, 30, 'distanceM');
    assert.strictEqual(realM.elapsedS, 807);
    near(realM.avgPaceSPerKm, 399.5, 3, 'avgPaceSPerKm');
    assert.strictEqual(GPX.fmtPace(realM.avgPaceSPerKm), '6:39 /km');
    assert.strictEqual(GPX.fmtDuration(realM.elapsedS), '13:27');
    assert.strictEqual(GPX.fmtDistance(realM.distanceM), '2.02 km');
    near(realM.avgSpeedKmh, 9.0, 0.1, 'avgSpeedKmh');
    assert.ok(realM.maxSpeedKmh > realM.avgSpeedKmh && realM.maxSpeedKmh < 25, 'maxSpeedKmh sane');
    assert.ok(realM.bestKmPaceS < realM.avgPaceSPerKm, 'best km is faster than average');
  });
  test('real: no hr, ele, cadence, power => nulls', function () {
    ['elevGainM', 'elevLossM', 'minEle', 'maxEle', 'avgHr', 'maxHr', 'avgCad', 'maxCad', 'avgPower', 'maxPower', 'avgTemp']
      .forEach(function (k) { assert.strictEqual(realM[k], null, k + ' should be null'); });
    assert.strictEqual(realM.hrSamples, 0);
    assert.strictEqual(realM.series.ele, null);
    assert.strictEqual(realM.series.hr, null);
  });
  test('real: splits are 1 km, 1 km and a short flagged remainder', function () {
    assert.strictEqual(realM.splits.length, 3);
    assert.strictEqual(realM.splits[0].distanceM, 1000);
    assert.strictEqual(realM.splits[0].partial, false);
    assert.strictEqual(realM.splits[2].partial, true);
    near(realM.splits[2].distanceM, 20, 15, 'partial distance');
    near(realM.splits[0].timeS + realM.splits[1].timeS + realM.splits[2].timeS, 807, 1, 'sum of split times');
  });
  test('real: start point, bbox and series', function () {
    near(realM.startLatLon[0], -6.2359118, 1e-6);
    assert.ok(realM.bbox.minLat < realM.bbox.maxLat && realM.bbox.minLon < realM.bbox.maxLon);
    assert.ok(realM.series.distM.length > 100 && realM.series.distM.length <= 301);
    assert.strictEqual(realM.series.paceSPerKm.length, realM.series.distM.length);
  });
  test('real: analyze() adds a note when device total differs by more than 10 percent', function () {
    var r = GPX.analyze(realText, { age: 40 });
    assert.ok(r.deviceNote && /5\.05 km/.test(r.deviceNote) && /2\.02 km/.test(r.deviceNote), r.deviceNote);
    assert.strictEqual(r.type, 'run');
    assert.ok(r.track.lat.length <= 500);
    assert.strictEqual(r.classification.basis, 'speed');
  });
} else {
  skipped++;
  console.log('SKIP real file not found: ' + REAL);
}

// ---------------------------------------------------------------- fixtures
test('fixture garmin-run-hr-ele: gpxtpx hr, cad, atemp, ele, type running', function () {
  var info = GPX.parse(fx('garmin-run-hr-ele.gpx'));
  assert.strictEqual(info.typeHint, 'run');
  assert.strictEqual(info.name, 'Morning Run');
  assert.strictEqual(info.creator, 'Garmin Connect');
  assert.strictEqual(info.deviceTotals, null);
  assert.strictEqual(info.segments.length, 1);
  var p = info.segments[0][0];
  assert.ok(p.hr > 100 && p.cad > 70 && p.temp === 24 && typeof p.ele === 'number' && typeof p.t === 'number');
  assert.strictEqual(info.startTime, p.t);
});
test('fixture garmin-run-hr-ele: metrics, 2 minute pause excluded from moving time', function () {
  var segs = GPX.clean(GPX.parse(fx('garmin-run-hr-ele.gpx')).segments, { type: 'run' });
  var m = GPX.metrics(segs, { type: 'run' });
  near(m.distanceM, 1800, 20, 'distanceM');
  near(m.elapsedS, 720, 1, 'elapsedS');
  near(m.elapsedS - m.movingS, 120, 8, 'paused time');
  near(m.avgPaceSPerKm, m.movingS / (m.distanceM / 1000), 0.01, 'moving pace');
  assert.ok(m.avgPaceElapsedSPerKm > m.avgPaceSPerKm + 30, 'elapsed pace is slower than moving pace');
  assert.ok(m.avgHr > 125 && m.avgHr < 165, 'avgHr ' + m.avgHr);
  assert.ok(m.maxHr >= m.avgHr && m.hrSamples === m.points);
  near(m.avgCad, 84, 2, 'avgCad (zeros ignored)');
  assert.strictEqual(m.avgPower, null);
  assert.strictEqual(m.avgTemp, 24);
  assert.ok(m.minEle < m.maxEle && m.minEle > 10 && m.maxEle < 50);
  assert.strictEqual(m.splits.length, 2);
  assert.ok(m.splits[0].avgHr > 100 && typeof m.splits[0].elevDeltaM === 'number');
  assert.strictEqual(m.splits[1].partial, true);
  assert.ok(m.series.hr && m.series.ele && m.series.cad && m.series.power === null);
});
test('fixture garmin-run-hr-ele: smoothing and hysteresis keep elevation gain realistic', function () {
  var segs = GPX.clean(GPX.parse(fx('garmin-run-hr-ele.gpx')).segments, { type: 'run' });
  var m = GPX.metrics(segs, { type: 'run' });
  var raw = 0, pts = segs[0], i;
  for (i = 1; i < pts.length; i++) { if (pts[i].ele > pts[i - 1].ele) { raw += pts[i].ele - pts[i - 1].ele; } }
  assert.ok(raw > m.elevGainM * 1.5, 'raw sum ' + raw.toFixed(1) + ' should be much larger than ' + m.elevGainM);
  assert.ok(m.elevGainM > 30 && m.elevGainM < 55, 'elevGainM ' + m.elevGainM);
  assert.ok(m.elevLossM > 30 && m.elevLossM < 55, 'elevLossM ' + m.elevLossM);
});
test('fixture strava-ride-power: ns3 prefix, power, cycling, two segments', function () {
  var info = GPX.parse(fx('strava-ride-power.gpx'));
  assert.strictEqual(info.typeHint, 'cycle');
  assert.strictEqual(info.segments.length, 2);
  assert.strictEqual(info.segments[0].length, 120);
  var p = info.segments[0][1];
  assert.ok(typeof p.power === 'number' && p.hr >= 140 && p.cad === 88 && p.temp === 19, JSON.stringify(p));
  var segs = GPX.clean(info.segments, { type: 'cycle' });
  var m = GPX.metrics(segs, { type: 'cycle' });
  near(m.distanceM, 6700, 80, 'distanceM');
  near(m.elapsedS, 1046, 1, 'elapsedS');
  near(m.elapsedS - m.movingS, 94, 6, 'segment gap excluded from moving time');
  near(m.avgSpeedKmh, 25.3, 1, 'avgSpeedKmh');
  assert.ok(m.avgPower > 150 && m.avgPower < 220, 'avgPower ' + m.avgPower);
  assert.ok(m.maxPower > m.avgPower);
  near(m.avgCad, 88, 0.5, 'avgCad ignores zeros');
  assert.strictEqual(m.splits.length, 2);
  assert.strictEqual(m.splits[0].distanceM, 5000);
  assert.strictEqual(m.splits[1].partial, true);
  assert.ok(m.series.power);
});
test('fixture strava-ride-power: segment gap is not bridged in distance', function () {
  var info = GPX.parse(fx('strava-ride-power.gpx'));
  var a = info.segments[0], b = info.segments[1];
  var bridged = GPX.haversine(a[a.length - 1], b[0]);
  var m = GPX.metrics(GPX.clean(info.segments, { type: 'cycle' }), { type: 'cycle' });
  var sum = 0, s, i;
  for (s = 0; s < 2; s++) { for (i = 1; i < info.segments[s].length; i++) { sum += GPX.haversine(info.segments[s][i - 1], info.segments[s][i]); } }
  near(m.distanceM, sum, 0.1, 'distanceM');
  assert.ok(bridged > 0);
  var ds = GPX.downsample(GPX.clean(info.segments, { type: 'cycle' }), 500);
  assert.deepStrictEqual(ds.brk, [120]);
});
test('fixture openwater-swim: swimming, plain <hr>, swim splits and pace per 100 m', function () {
  var info = GPX.parse(fx('openwater-swim.gpx'));
  assert.strictEqual(info.typeHint, 'swim');
  var segs = GPX.clean(info.segments, { type: 'swim' });
  assert.strictEqual(segs.stats.spikes, 0);
  var m = GPX.metrics(segs, { type: 'swim' });
  assert.ok(m.distanceM > 850 && m.distanceM < 1100, 'distanceM ' + m.distanceM);
  assert.ok(m.avgHr > 125 && m.avgHr < 150);
  near(m.avgPaceSPer100m, m.movingS / (m.distanceM / 100), 0.01, 'avgPaceSPer100m');
  assert.strictEqual(m.splits[0].distanceM, 100);
  assert.strictEqual(m.splits.length, Math.floor(m.distanceM / 100) + 1);
  assert.strictEqual(m.splits[m.splits.length - 1].partial, true);
  assert.ok(/^\d+:\d\d \/100 m$/.test(GPX.fmtSwimPace(m.avgPaceSPer100m)));
  assert.strictEqual(m.elevGainM, null);
});
test('fixture route-only: rtept, no times => time based metrics are null', function () {
  var info = GPX.parse(fx('route-only.gpx'));
  assert.strictEqual(info.name, 'Sunday loop');
  assert.strictEqual(info.typeHint, null);
  assert.strictEqual(info.startTime, null);
  assert.strictEqual(info.segments.length, 1);
  assert.strictEqual(info.segments[0].length, 40);
  var m = GPX.metrics(GPX.clean(info.segments, {}), {});
  assert.ok(m.distanceM > 1500);
  ['elapsedS', 'movingS', 'avgPaceSPerKm', 'avgSpeedKmh', 'maxSpeedKmh', 'bestKmPaceS'].forEach(function (k) {
    assert.strictEqual(m[k], null, k);
  });
  assert.ok(typeof m.elevGainM === 'number');
  assert.strictEqual(m.splits[0].timeS, null);
  assert.strictEqual(m.splits[0].paceSPerKm, null);
  assert.strictEqual(m.series.paceSPerKm, null);
  assert.strictEqual(GPX.fmtPace(m.avgPaceSPerKm), 'n/a');
});
test('fixture pool-swim-no-points: friendly error', function () {
  throwsMsg(function () { GPX.parse(fx('pool-swim-no-points.gpx')); },
    'This file has no GPS track points. Pool swims usually record none.');
});
test('fixture not-gpx.xml: friendly error', function () {
  throwsMsg(function () { GPX.parse(fx('not-gpx.xml')); }, 'This is not a GPX file.');
});
test('fixture spike.gpx: the teleport point is removed and distance stays sane', function () {
  var info = GPX.parse(fx('spike.gpx'));
  assert.strictEqual(info.segments[0].length, 60);
  var raw = GPX.metrics(info.segments, { type: 'run' });
  assert.ok(raw.distanceM > 2000, 'uncleaned track has a huge jump: ' + raw.distanceM);
  var segs = GPX.clean(info.segments, { type: 'run' });
  assert.strictEqual(segs.stats.spikes, 1);
  assert.strictEqual(segs[0].length, 59);
  var m = GPX.metrics(segs, { type: 'run' });
  near(m.distanceM, 201, 15, 'distanceM after cleaning');
  assert.ok(m.maxSpeedKmh < 20);
});

// ---------------------------------------------------------------- parser edge cases
function gpxWrap(inner, attrs) {
  return '<?xml version="1.0"?><gpx version="1.1" ' + (attrs || 'xmlns="http://www.topografix.com/GPX/1/1"') + '>' + inner + '</gpx>';
}
test('parse: empty, whitespace, non-string and non-XML input are not GPX', function () {
  throwsMsg(function () { GPX.parse(''); }, 'This is not a GPX file.');
  throwsMsg(function () { GPX.parse('   \n'); }, 'This is not a GPX file.');
  throwsMsg(function () { GPX.parse(null); }, 'This is not a GPX file.');
  throwsMsg(function () { GPX.parse('hello world'); }, 'This is not a GPX file.');
  throwsMsg(function () { GPX.parse('{"a":1}'); }, 'This is not a GPX file.');
});
test('parse: BOM, comments, CDATA, entities, single quotes, prefixed root', function () {
  var x = '\uFEFF<?xml version="1.0"?><!-- hi --><g:gpx xmlns:g="http://www.topografix.com/GPX/1/1" creator=\'A &amp; B\'>' +
    '<g:trk><g:name>Tom &amp; Jerry &#x41;</g:name><g:desc><![CDATA[a <b> & c]]></g:desc><g:trkseg>' +
    '<g:trkpt lat=\'10.5\' lon=\'20.25\'><g:time>2026-01-01T00:00:00Z</g:time></g:trkpt>' +
    '<g:trkpt lat="10.5001" lon="20.25"/></g:trkseg></g:trk></g:gpx>';
  var info = GPX.parse(x);
  assert.strictEqual(info.name, 'Tom & Jerry A');
  assert.strictEqual(info.desc, 'a <b> & c');
  assert.strictEqual(info.creator, 'A & B');
  assert.strictEqual(info.segments[0].length, 2);
  assert.strictEqual(info.segments[0][0].lat, 10.5);
  assert.strictEqual(info.segments[0][1].t, null);
});
test('parse: points with missing or invalid lat/lon are skipped', function () {
  var info = GPX.parse(gpxWrap('<trk><trkseg><trkpt lat="1" lon="2"/><trkpt lat="x" lon="2"/><trkpt lon="3"/>' +
    '<trkpt lat="91" lon="2"/><trkpt lat="1.1" lon="2.1"/></trkseg></trk>'));
  assert.strictEqual(info.segments[0].length, 2);
});
test('parse: hr, cad, power, temp under any prefix or none', function () {
  var variants = [
    '<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr><gpxtpx:cad>80</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>',
    '<extensions><ns3:TrackPointExtension><ns3:hr>150</ns3:hr><ns3:cad>80</ns3:cad></ns3:TrackPointExtension></extensions>',
    '<extensions><TrackPointExtension><hr>150</hr><cad>80</cad></TrackPointExtension></extensions>',
    '<extensions><hr>150</hr><cad>80</cad></extensions>',
    '<extensions><heartrate>150</heartrate><cadence>80</cadence></extensions>',
    '<hr>150</hr><cad>80</cad>'
  ];
  variants.forEach(function (v, i) {
    var info = GPX.parse(gpxWrap('<trk><trkseg><trkpt lat="1" lon="2">' + v + '</trkpt></trkseg></trk>'));
    var p = info.segments[0][0];
    assert.ok(p.hr === 150 && p.cad === 80, 'variant ' + i + ' ' + JSON.stringify(p));
  });
  var q = GPX.parse(gpxWrap('<trk><trkseg><trkpt lat="1" lon="2"><extensions><power>250</power><atemp>-3.5</atemp></extensions></trkpt>' +
    '<trkpt lat="1" lon="2"><extensions><hr>999</hr><power>-5</power></extensions></trkpt></trkseg></trk>')).segments[0];
  assert.strictEqual(q[0].power, 250);
  assert.strictEqual(q[0].temp, -3.5);
  assert.strictEqual(q[1].hr, null, 'out of range hr rejected');
  assert.strictEqual(q[1].power, null, 'negative power rejected');
});
test('parse: type hints from <type>, numeric Strava types and name text', function () {
  function hint(type, name) {
    return GPX.parse(gpxWrap('<trk>' + (name ? '<name>' + name + '</name>' : '') + (type ? '<type>' + type + '</type>' : '') +
      '<trkseg><trkpt lat="1" lon="2"/></trkseg></trk>')).typeHint;
  }
  assert.strictEqual(hint('running'), 'run');
  assert.strictEqual(hint('trail_running'), 'run');
  assert.strictEqual(hint('Run'), 'run');
  assert.strictEqual(hint('cycling'), 'cycle');
  assert.strictEqual(hint('road_biking'), 'cycle');
  assert.strictEqual(hint('VirtualRide'), 'cycle');
  assert.strictEqual(hint('swimming'), 'swim');
  assert.strictEqual(hint('open_water_swimming'), 'swim');
  assert.strictEqual(hint('lap_swimming'), 'swim');
  assert.strictEqual(hint('walking'), 'walk');
  assert.strictEqual(hint('hiking'), 'walk');
  assert.strictEqual(hint('1'), 'cycle');
  assert.strictEqual(hint('9'), 'run');
  assert.strictEqual(hint('10'), 'walk');
  assert.strictEqual(hint('99'), null);
  assert.strictEqual(hint(null, 'Evening Walk'), 'walk');
  assert.strictEqual(hint(null, 'Outdoor running'), 'run');
  assert.strictEqual(hint(null, 'Afternoon Ride'), 'cycle');
  assert.strictEqual(hint(null, 'Lunch'), null);
  assert.strictEqual(hint('swimming', 'Morning Run'), 'swim', '<type> wins over the name');
});
test('parse: name falls back from trk to metadata to gpx, multiple trk and trkseg are all read', function () {
  var info = GPX.parse(gpxWrap('<metadata><name>Meta name</name><time>2026-02-03T04:05:06Z</time></metadata>' +
    '<trk><trkseg><trkpt lat="1" lon="2"/></trkseg><trkseg><trkpt lat="1.1" lon="2"/></trkseg></trk>' +
    '<trk><trkseg><trkpt lat="1.2" lon="2"/></trkseg></trk>'));
  assert.strictEqual(info.name, 'Meta name');
  assert.strictEqual(info.segments.length, 3);
  assert.strictEqual(info.startTime, Date.UTC(2026, 1, 3, 4, 5, 6), 'falls back to metadata time');
});
test('parse: time zones, fractional seconds and missing Z', function () {
  var info = GPX.parse(gpxWrap('<trk><trkseg>' +
    '<trkpt lat="1" lon="2"><time>2026-10-06T18:48:54.500Z</time></trkpt>' +
    '<trkpt lat="1" lon="2"><time>2026-10-06T20:48:55+02:00</time></trkpt>' +
    '<trkpt lat="1" lon="2"><time>2026-10-06T18:48:56</time></trkpt>' +
    '<trkpt lat="1" lon="2"><time>garbage</time></trkpt></trkseg></trk>'));
  var s = info.segments[0];
  assert.strictEqual(s[0].t, Date.UTC(2026, 9, 6, 18, 48, 54, 500));
  assert.strictEqual(s[1].t, Date.UTC(2026, 9, 6, 18, 48, 55));
  assert.strictEqual(s[2].t, Date.UTC(2026, 9, 6, 18, 48, 56));
  assert.strictEqual(s[3].t, null);
});
test('parse: truncated file keeps the points it has', function () {
  var x = gpxWrap('<trk><trkseg><trkpt lat="1" lon="2"><time>2026-01-01T00:00:00Z</time></trkpt><trkpt lat="1.001" lon="2">');
  x = x.slice(0, x.indexOf('</gpx>'));
  var info = GPX.parse(x);
  assert.ok(info.segments[0].length >= 1);
});
test('parse: DOCTYPE with entity declarations is skipped, not expanded', function () {
  var x = '<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]><gpx><trk><name>x &b; y</name><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>';
  var info = GPX.parse(x);
  assert.strictEqual(info.name, 'x &b; y');
});

// ---------------------------------------------------------------- clean
function mk(lat, lon, t) { return { lat: lat, lon: lon, t: t === undefined ? null : t, ele: null, hr: null, cad: null, power: null, temp: null }; }
test('clean: drops points without coordinates', function () {
  var segs = GPX.clean([[mk(1, 2, 0), mk(NaN, 2, 1000), mk(null, 2, 2000), mk(undefined, undefined, 3000), mk(1.00001, 2, 4000)]], { type: 'run' });
  assert.strictEqual(segs[0].length, 2);
  assert.strictEqual(segs.stats.noCoord, 3);
});
test('clean: drops duplicate and backwards timestamps', function () {
  var segs = GPX.clean([[mk(1, 2, 0), mk(1.00001, 2, 1000), mk(1.00002, 2, 1000), mk(1.00003, 2, 500), mk(1.00004, 2, 2000)]], { type: 'run' });
  assert.strictEqual(segs[0].length, 3);
  assert.strictEqual(segs.stats.dupTime, 1);
  assert.strictEqual(segs.stats.backwards, 1);
});
test('clean: removes a spike at the start and in the middle, keeps a real jump after a gap', function () {
  var t = 0, pts = [], i;
  pts.push(mk(1.05, 2, 0));                              // bad first point, 5 km away
  for (i = 1; i < 20; i++) { pts.push(mk(1 + i * 0.00003, 2, i * 1000)); }
  pts.splice(10, 0, mk(1.2, 2, 9500));                    // spike in the middle
  var segs = GPX.clean([pts], { type: 'run' });
  assert.strictEqual(segs.stats.spikes, 2);
  assert.strictEqual(segs[0].length, 19);
  var gap = [mk(1, 2, 0), mk(1.00003, 2, 1000), mk(1.00006, 2, 2000), mk(1.05, 2, 2000 + 1800000), mk(1.05003, 2, 2000 + 1801000), mk(1.05006, 2, 2000 + 1802000)];
  var kept = GPX.clean([gap], { type: 'run' });
  assert.strictEqual(kept[0].length, 6, 'a 5 km move over 30 minutes is plausible, so it stays');
});
test('clean: per activity caps and a custom cap', function () {
  var fast = [mk(1, 2, 0), mk(1 + 20 / 111320, 2, 1000), mk(1 + 40 / 111320, 2, 2000), mk(1 + 60 / 111320, 2, 3000)];   // 20 m/s
  var bike = GPX.clean([fast], { type: 'cycle' });
  var run = GPX.clean([fast], { type: 'run' });
  assert.strictEqual(bike[0].length, 4, '20 m/s is fine on a bike');
  assert.strictEqual(run.stats.spikes >= 0 && run[0].length >= 1, true);
  var custom = GPX.clean([fast], { type: 'cycle', maxSpeedMs: 10 });
  assert.ok(custom[0].length <= 4);
  assert.strictEqual(GPX.SPIKE_CAPS.run, 15);
  assert.strictEqual(GPX.SPIKE_CAPS.cycle, 30);
  assert.strictEqual(GPX.SPIKE_CAPS.swim, 4);
});
test('clean: time-less tracks are not spike filtered and exact duplicates are dropped', function () {
  var segs = GPX.clean([[mk(1, 2), mk(1, 2), mk(1.5, 2), mk(1.5001, 2)]], {});
  assert.strictEqual(segs[0].length, 3);
  assert.strictEqual(segs.stats.spikes, 0);
});
test('clean: removes empty segments and does not mutate input', function () {
  var input = [[mk(NaN, 2, 0)], [mk(1, 2, 0), mk(1.0001, 2, 1000)]];
  var out = GPX.clean(input, { type: 'run' });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(input[0].length, 1);
  assert.strictEqual(input[1].length, 2);
});

// ---------------------------------------------------------------- metrics
test('metrics: empty input gives zero distance and nulls without throwing', function () {
  var m = GPX.metrics([], { type: 'run' });
  assert.strictEqual(m.distanceM, 0);
  assert.strictEqual(m.points, 0);
  assert.strictEqual(m.avgPaceSPerKm, null);
  assert.deepStrictEqual(m.splits, []);
});
test('metrics: a single point does not throw', function () {
  var m = GPX.metrics([[mk(1, 2, 0)]], { type: 'run' });
  assert.strictEqual(m.distanceM, 0);
  assert.strictEqual(m.elapsedS, 0);
  assert.strictEqual(m.avgPaceSPerKm, null);
});
test('metrics: elevation noise on a flat track gives no climb', function () {
  var pts = [], i, s = 7;
  for (i = 0; i < 300; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    var p = mk(1 + i * 0.00003, 2, i * 1000);
    p.ele = 100 + ((s / 2147483648) * 2 - 1) * 1.0;
    pts.push(p);
  }
  var m = GPX.metrics([pts], { type: 'run' });
  assert.ok(m.elevGainM < 3, 'elevGainM ' + m.elevGainM);
  assert.ok(m.elevLossM < 3, 'elevLossM ' + m.elevLossM);
});
test('metrics: a real 30 m hill is counted', function () {
  var pts = [], i;
  for (i = 0; i < 300; i++) {
    var p = mk(1 + i * 0.00003, 2, i * 1000);
    p.ele = i < 150 ? 100 + i * 0.2 : 130 - (i - 150) * 0.2;
    pts.push(p);
  }
  var m = GPX.metrics([pts], { type: 'run' });
  near(m.elevGainM, 30, 4, 'gain');
  near(m.elevLossM, 30, 4, 'loss');
  near(m.maxEle, 130, 1, 'maxEle');
  near(m.minEle, 100, 1, 'minEle');
});
test('metrics: stop detection ignores short pauses and removes long ones', function () {
  // 60 s moving at 3 m/s, then 5 s standing, then 60 s moving, then 30 s standing, then 60 s moving.
  var pts = [], t = 0, lat = 1, i;
  function move(sec) { for (i = 0; i < sec; i++) { t += 1000; lat += 3 / 111320; pts.push(mk(lat, 2, t)); } }
  function stand(sec) { for (i = 0; i < sec; i++) { t += 1000; pts.push(mk(lat, 2, t)); } }
  pts.push(mk(lat, 2, 0));
  move(60); stand(5); move(60); stand(30); move(60);
  var m = GPX.metrics([pts], { type: 'run' });
  near(m.elapsedS, 215, 0.01);
  near(m.movingS, 185, 0.01, 'short 5 s stop counts as moving, 30 s stop does not');
  near(m.distanceM, 540, 3);
});
test('metrics: bestKmPaceS finds a fast kilometre', function () {
  var pts = [], t = 0, lat = 1, i;
  pts.push(mk(lat, 2, 0));
  for (i = 0; i < 400; i++) { t += 1000; lat += 3 / 111320; pts.push(mk(lat, 2, t)); }     // 3 m/s, 1200 m
  for (i = 0; i < 250; i++) { t += 1000; lat += 5 / 111320; pts.push(mk(lat, 2, t)); }     // 5 m/s, 1250 m
  var m = GPX.metrics([pts], { type: 'run' });
  near(m.bestKmPaceS, 200, 2, 'best km is 1000 m at 5 m/s');
  assert.ok(m.avgPaceSPerKm > 200);
  assert.strictEqual(m.splits.length, 3);
  near(m.splits[0].paceSPerKm, 1000 / (m.splits[0].distanceM / m.splits[0].timeS) , 0.5);
});
test('metrics: split pace sum and partial flag on a clean synthetic run', function () {
  var pts = [], t = 0, lat = 1, i;
  pts.push(mk(lat, 2, 0));
  for (i = 0; i < 700; i++) { t += 1000; lat += 4 / 111320; pts.push(mk(lat, 2, t)); }    // 2800 m at 4 m/s
  var m = GPX.metrics([pts], { type: 'run' });
  assert.strictEqual(m.splits.length, 3);
  near(m.splits[0].paceSPerKm, 250, 1);
  near(m.splits[1].paceSPerKm, 250, 1);
  assert.strictEqual(m.splits[2].partial, true);
  near(m.splits[2].distanceM, 800, 5);
  near(m.splits[2].paceSPerKm, 250, 1);
  near(m.maxSpeedKmh, 14.4, 0.1);
  near(m.avgSpeedKmh, 14.4, 0.1);
});

// ---------------------------------------------------------------- downsample
test('downsample: shrinks to the limit, keeps ends and shape, rounds numbers', function () {
  var pts = [], i;
  for (i = 0; i < 5000; i++) {
    var p = mk(10 + 0.01 * Math.sin(i / 300) + i * 1e-6, 20 + i * 2e-5 + 0.123456789, i * 1000);
    p.ele = 50.04 + i * 0.01; p.hr = 140 + (i % 20);
    pts.push(p);
  }
  var ds = GPX.downsample(pts, 200);
  assert.strictEqual(ds.lat.length, 200);
  assert.strictEqual(ds.lon.length, 200);
  assert.strictEqual(ds.t.length, 200);
  assert.strictEqual(ds.ele.length, 200);
  assert.strictEqual(ds.hr.length, 200);
  assert.strictEqual(ds.t[0], 0);
  assert.strictEqual(ds.t[199], 4999000 / 1000);
  assert.strictEqual(ds.lat[0], Math.round(pts[0].lat * 1e5) / 1e5);
  assert.strictEqual(ds.lat[199], Math.round(pts[4999].lat * 1e5) / 1e5);
  ds.lat.concat(ds.lon).forEach(function (v) { assert.ok(Math.abs(Math.round(v * 1e5) / 1e5 - v) < 1e-9); });
  for (i = 1; i < ds.t.length; i++) { assert.ok(ds.t[i] > ds.t[i - 1]); }
  assert.deepStrictEqual(ds.brk, []);
  // Shape: every original point lies close to the simplified line (within 30 m).
  var maxDev = 0, k = 0, j;
  for (j = 0; j < pts.length; j++) {
    var tt = j;
    while (k < ds.t.length - 2 && ds.t[k + 1] <= tt) { k++; }
    var a = { lat: ds.lat[k], lon: ds.lon[k] }, b = { lat: ds.lat[k + 1], lon: ds.lon[k + 1] };
    var f = (tt - ds.t[k]) / (ds.t[k + 1] - ds.t[k]);
    var q = { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
    maxDev = Math.max(maxDev, GPX.haversine(q, pts[j]));
  }
  assert.ok(maxDev < 100, 'max deviation ' + maxDev.toFixed(1) + ' m');
});
test('downsample: small input is kept whole, missing sensors give null arrays, segments give brk', function () {
  var a = [mk(1, 2, 0), mk(1.001, 2, 1000)], b = [mk(1.01, 2, 90000), mk(1.011, 2, 91000), mk(1.012, 2, 92000)];
  var ds = GPX.downsample([a, b], 500);
  assert.strictEqual(ds.lat.length, 5);
  assert.strictEqual(ds.ele, null);
  assert.strictEqual(ds.hr, null);
  assert.deepStrictEqual(ds.brk, [2]);
  assert.deepStrictEqual(ds.t, [0, 1, 90, 91, 92]);
  var none = GPX.downsample([mk(1, 2), mk(1.1, 2)], 500);
  assert.strictEqual(none.t, null);
  assert.deepStrictEqual(GPX.downsample([], 10).lat, []);
});
test('downsample: output is small enough for localStorage (500 points, with hr and ele)', function () {
  var rich = GPX.analyze(fx('garmin-run-hr-ele.gpx'), { age: 40 });
  var json = JSON.stringify({ t: rich.track, m: rich.metrics });
  assert.ok(rich.track.lat.length <= 500);
  assert.ok(json.length < 60000, 'summary + track json is ' + json.length + ' chars');
});

// ---------------------------------------------------------------- classify
test('classify: heart rate method uses 64 to 76 percent moderate, 77 and above vigorous', function () {
  function c(avgHr, age) { return GPX.classify({ avgHr: avgHr, hrSamples: 100, avgSpeedKmh: 9, type: 'run' }, { type: 'run', age: age }); }
  assert.strictEqual(c(100, 40).intensity, 'light');    // max 180, 55%
  assert.strictEqual(c(116, 40).intensity, 'moderate'); // 64.4%
  assert.strictEqual(c(137, 40).intensity, 'moderate'); // 76.1%
  assert.strictEqual(c(139, 40).intensity, 'vigorous'); // 77.2%
  assert.strictEqual(c(139, 40).basis, 'hr');
  assert.ok(/77%/.test(c(139, 40).detail) && /180 bpm/.test(c(139, 40).detail), c(139, 40).detail);
});
test('classify: falls back to speed, then to default', function () {
  var run = GPX.classify({ avgHr: null, hrSamples: 0, avgSpeedKmh: 11, type: 'run' }, { type: 'run', age: 40 });
  assert.strictEqual(run.basis, 'speed');
  assert.strictEqual(run.intensity, 'vigorous');
  assert.strictEqual(GPX.classify({ avgSpeedKmh: 3, type: 'walk' }, { type: 'walk' }).intensity, 'light');
  assert.strictEqual(GPX.classify({ avgSpeedKmh: 5, type: 'walk' }, { type: 'walk' }).intensity, 'moderate');
  assert.strictEqual(GPX.classify({ avgSpeedKmh: 18, type: 'cycle' }, { type: 'cycle' }).intensity, 'moderate');
  assert.strictEqual(GPX.classify({ avgSpeedKmh: 3, type: 'swim' }, { type: 'swim' }).intensity, 'vigorous');
  var hrNoAge = GPX.classify({ avgHr: 150, hrSamples: 100, avgSpeedKmh: 8, type: 'run' }, { type: 'run' });
  assert.strictEqual(hrNoAge.basis, 'speed', 'no age means no HR method');
  var d = GPX.classify({ avgHr: null, hrSamples: 0, avgSpeedKmh: null }, { type: 'run' });
  assert.strictEqual(d.basis, 'default');
  assert.ok(['light', 'moderate', 'vigorous'].indexOf(d.intensity) >= 0);
  var few = GPX.classify({ avgHr: 170, hrSamples: 3, avgSpeedKmh: 8, type: 'run' }, { type: 'run', age: 40 });
  assert.strictEqual(few.basis, 'speed', 'too few HR samples');
});
test('classify: custom thresholds and maxHr override are honoured', function () {
  var m = { avgHr: 130, hrSamples: 100, avgSpeedKmh: 9, type: 'run' };
  var base = GPX.classify(m, { type: 'run', age: 40 });
  assert.strictEqual(base.intensity, 'moderate');
  var strict = GPX.classify(m, { type: 'run', age: 40, thresholds: { hr: { moderatePct: 50, vigorousPct: 70 } } });
  assert.strictEqual(strict.intensity, 'vigorous');
  var viaMax = GPX.classify(m, { type: 'run', maxHr: 200 });
  assert.strictEqual(viaMax.basis, 'hr');
  assert.strictEqual(viaMax.intensity, 'moderate');
  var sp = GPX.classify({ avgSpeedKmh: 9, type: 'run' }, { type: 'run', thresholds: { speedKmh: { run: { moderate: 5, vigorous: 8 } } } });
  assert.strictEqual(sp.intensity, 'vigorous');
  assert.strictEqual(GPX.DEFAULT_THRESHOLDS.hr.moderatePct, 64);
  assert.strictEqual(GPX.DEFAULT_THRESHOLDS.hr.vigorousPct, 77);
  assert.strictEqual(GPX.DEFAULT_THRESHOLDS.hr.maxHrBase, 220);
  assert.strictEqual(GPX.DEFAULT_THRESHOLDS.speedKmh.run.moderate, 6, 'defaults not mutated by overrides');
});

// ---------------------------------------------------------------- formatters
test('formatters', function () {
  assert.strictEqual(GPX.fmtPace(399.4), '6:39 /km');
  assert.strictEqual(GPX.fmtPace(359.6), '6:00 /km');
  assert.strictEqual(GPX.fmtPace(0), 'n/a');
  assert.strictEqual(GPX.fmtPace(null), 'n/a');
  assert.strictEqual(GPX.fmtDuration(807), '13:27');
  assert.strictEqual(GPX.fmtDuration(3725), '1:02:05');
  assert.strictEqual(GPX.fmtDuration(59.6), '1:00');
  assert.strictEqual(GPX.fmtDuration(0), '0:00');
  assert.strictEqual(GPX.fmtDuration(null), 'n/a');
  assert.strictEqual(GPX.fmtDistance(2020.1), '2.02 km');
  assert.strictEqual(GPX.fmtDistance(850), '850 m');
  assert.strictEqual(GPX.fmtDistance(1000), '1.00 km');
  assert.strictEqual(GPX.fmtSwimPace(125), '2:05 /100 m');
  assert.strictEqual(GPX.fmtSwimPace(undefined), 'n/a');
  assert.strictEqual(GPX.fmtSpeed(9.01), '9.0 km/h');
});

// ---------------------------------------------------------------- analyze
test('analyze: one call on every usable fixture', function () {
  ['garmin-run-hr-ele.gpx', 'strava-ride-power.gpx', 'openwater-swim.gpx', 'route-only.gpx', 'spike.gpx'].forEach(function (f) {
    var r = GPX.analyze(fx(f), { age: 35 });
    assert.ok(r.metrics.distanceM > 0, f);
    assert.ok(r.track.lat.length > 0 && r.track.lat.length <= 500, f);
    assert.ok(['run', 'cycle', 'swim', 'walk'].indexOf(r.type) >= 0, f);
    assert.ok(r.classification.intensity, f);
    assert.strictEqual(r.deviceNote, null, f);
  });
  assert.strictEqual(GPX.analyze(fx('strava-ride-power.gpx'), {}).type, 'cycle');
  assert.strictEqual(GPX.analyze(fx('strava-ride-power.gpx'), { type: 'run' }).type, 'run', 'explicit type wins');
  throwsMsg(function () { GPX.analyze(fx('pool-swim-no-points.gpx'), {}); }, GPX.MSG_NO_POINTS);
  throwsMsg(function () { GPX.analyze(fx('not-gpx.xml'), {}); }, GPX.MSG_NOT_GPX);
});

// ---------------------------------------------------------------- house style
test('no em dash or en dash characters in the library or the tests', function () {
  var bad = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)];
  ['gpx-lib.js', 'gpx-lib.test.js', 'make-fixtures.js'].concat(fs.readdirSync(FIX).map(function (f) { return 'fixtures/' + f; }))
    .forEach(function (f) {
      var s = fs.readFileSync(path.join(__dirname, f), 'utf8');
      bad.forEach(function (ch) { assert.ok(s.indexOf(ch) < 0, f + ' contains a dash character'); });
    });
});

// ---------------------------------------------------------------- performance (reported, loosely asserted)
test('performance: 20,000 point file parses and analyses quickly', function () {
  var n = 20000, t0 = Date.UTC(2026, 9, 6, 6, 0, 0), x = '<?xml version="1.0"?><gpx creator="perf" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>Perf run</name><type>running</type><trkseg>', i;
  var parts = [];
  for (i = 0; i < n; i++) {
    var lat = 51.5 + i * 0.000027 + 0.002 * Math.sin(i / 500), lon = -0.12 + i * 0.00002 + 0.002 * Math.cos(i / 700);
    parts.push('<trkpt lat="' + lat.toFixed(7) + '" lon="' + lon.toFixed(7) + '"><ele>' + (40 + 10 * Math.sin(i / 400)).toFixed(1) + '</ele><time>' +
      new Date(t0 + i * 1000).toISOString() + '</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>' + (140 + (i % 30)) + '</gpxtpx:hr><gpxtpx:cad>' + (80 + (i % 7)) + '</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>');
  }
  x += parts.join('') + '</trkseg></trk></gpx>';
  var a = Date.now();
  var info = GPX.parse(x);
  var b = Date.now();
  var segs = GPX.clean(info.segments, { type: 'run' });
  var c = Date.now();
  var m = GPX.metrics(segs, { type: 'run' });
  var d = Date.now();
  var ds = GPX.downsample(segs, 500);
  var e = Date.now();
  console.log('     20,000 points, ' + (x.length / 1e6).toFixed(1) + ' MB: parse ' + (b - a) + ' ms, clean ' + (c - b) + ' ms, metrics ' +
    (d - c) + ' ms, downsample ' + (e - d) + ' ms, total ' + (e - a) + ' ms');
  assert.strictEqual(m.points, n);
  assert.ok(ds.lat.length <= 500);
  assert.ok(e - a < 3000, 'too slow: ' + (e - a) + ' ms');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed' + (skipped ? ', ' + skipped + ' skipped' : ''));
process.exit(failed ? 1 : 0);
