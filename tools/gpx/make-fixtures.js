// Generates the synthetic GPX fixtures in ./fixtures (deterministic, seeded). Run: node make-fixtures.js
var fs = require('fs');
var path = require('path');
var dir = path.join(__dirname, 'fixtures');
if (!fs.existsSync(dir)) { fs.mkdirSync(dir); }

var seed = 12345;
function rand() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
function noise(a) { return (rand() * 2 - 1) * a; }

var LAT0 = 51.5, LON0 = -0.12;
function toLL(x, y) { return [LAT0 + y / 111320, LON0 + x / (111320 * Math.cos(LAT0 * Math.PI / 180))]; }
function iso(ms) { return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z'); }

// Walks a gently curving path. Returns { x, y } after travelling dist metres from the origin.
function pathAt(dist) {
  var a = dist / 400;
  return { x: dist * 0.8 + 60 * Math.sin(a), y: dist * 0.6 + 60 * (1 - Math.cos(a)) };
}

function write(name, text) { fs.writeFileSync(path.join(dir, name), text); }

// 1. Garmin run: 2 s spacing, 3 m/s, hr, cad, atemp, ele, a 2 minute pause with tiny jitter.
(function () {
  var t0 = Date.UTC(2026, 9, 6, 6, 30, 0), t = t0, dist = 0, pts = [], i, step = 2;
  var anchor = null;
  for (i = 0; i < 300; i++) {
    if (i === 150) {
      // Pause: 24 points, 5 s apart, standing still (jitter under 0.6 m).
      var base = pathAt(dist), baseEle = 30 + 15 * Math.sin(2 * Math.PI * dist / 1200);
      for (var k = 0; k < 24; k++) {
        t += 5000;
        var ll = toLL(base.x + noise(0.3), base.y + noise(0.3));
        pts.push({ lat: ll[0], lon: ll[1], ele: baseEle, hr: 120 - k * 0.5, cad: 0, t: t });
      }
      t += 2000;
    }
    t += step * 1000;
    dist += 3 * step;
    var p = pathAt(dist), l2 = toLL(p.x, p.y);
    pts.push({
      lat: l2[0], lon: l2[1],
      ele: 30 + 15 * Math.sin(2 * Math.PI * dist / 1200) + noise(0.6),
      hr: Math.round(145 + 15 * Math.sin(i / 40) + noise(1.5)),
      cad: Math.round(84 + noise(2)),
      t: t
    });
  }
  var x = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx creator="Garmin Connect" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" ' +
    'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
    ' <metadata><time>' + iso(t0) + '</time></metadata>\n' +
    ' <trk>\n  <name>Morning Run</name>\n  <type>running</type>\n  <trkseg>\n';
  pts.forEach(function (q) {
    x += '   <trkpt lat="' + q.lat.toFixed(6) + '" lon="' + q.lon.toFixed(6) + '">\n' +
      '    <ele>' + q.ele.toFixed(1) + '</ele>\n    <time>' + iso(q.t) + '</time>\n' +
      '    <extensions><gpxtpx:TrackPointExtension><gpxtpx:atemp>24</gpxtpx:atemp><gpxtpx:hr>' +
      Math.round(q.hr) + '</gpxtpx:hr><gpxtpx:cad>' + q.cad + '</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>\n' +
      '   </trkpt>\n';
  });
  x += '  </trkseg>\n </trk>\n</gpx>\n';
  write('garmin-run-hr-ele.gpx', x);
})();

// 2. Strava ride: ns3 prefix, power, cad, hr, two trksegs with a 90 s gap, 7 m/s, 4 s spacing.
(function () {
  var t0 = Date.UTC(2026, 9, 10, 8, 0, 0), t = t0, dist = 0, i;
  function seg(n) {
    var s = '  <trkseg>\n';
    for (i = 0; i < n; i++) {
      t += 4000; dist += 28;
      var p = pathAt(dist), ll = toLL(p.x, p.y);
      var pw = Math.max(0, Math.round(190 + 60 * Math.sin(i / 7) + noise(15)));
      if (i % 11 === 0) { pw = 0; }
      s += '   <trkpt lat="' + ll[0].toFixed(6) + '" lon="' + ll[1].toFixed(6) + '">\n' +
        '    <ele>' + (20 + 5 * Math.sin(dist / 900) + noise(0.3)).toFixed(1) + '</ele>\n' +
        '    <time>' + iso(t) + '</time>\n' +
        '    <extensions>\n     <power>' + pw + '</power>\n' +
        '     <ns3:TrackPointExtension><ns3:atemp>19</ns3:atemp><ns3:hr>' + Math.round(150 + 10 * Math.sin(i / 20)) +
        '</ns3:hr><ns3:cad>' + (i % 11 === 0 ? 0 : 88) + '</ns3:cad></ns3:TrackPointExtension>\n    </extensions>\n' +
        '   </trkpt>\n';
    }
    return s + '  </trkseg>\n';
  }
  var x = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" ' +
    'xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n' +
    ' <metadata><time>' + iso(t0) + '</time></metadata>\n <trk>\n  <name>Lunch Ride</name>\n  <type>cycling</type>\n';
  x += seg(120);
  t += 90000; // pause between segments
  x += seg(120);
  x += ' </trk>\n</gpx>\n';
  write('strava-ride-power.gpx', x);
})();

// 3. Open water swim: 3 s spacing, 1 m/s (1:40 per 100 m), plain <hr>, zigzag path.
(function () {
  var t0 = Date.UTC(2026, 9, 12, 7, 0, 0), t = t0, dist = 0, i;
  var x = '<?xml version="1.0"?>\n<gpx creator="Test Watch" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    ' <trk>\n  <name>Lake swim</name>\n  <type>swimming</type>\n  <trkseg>\n';
  for (i = 0; i < 400; i++) {
    t += 3000; dist += 3;
    var p = pathAt(dist * 0.7), ll = toLL(p.x + 8 * Math.sin(dist / 30), p.y);
    x += '   <trkpt lat="' + ll[0].toFixed(6) + '" lon="' + ll[1].toFixed(6) + '"><time>' + iso(t) + '</time>' +
      '<extensions><hr>' + Math.round(135 + 10 * Math.sin(i / 50)) + '</hr></extensions></trkpt>\n';
  }
  x += '  </trkseg>\n </trk>\n</gpx>\n';
  write('openwater-swim.gpx', x);
})();

// 4. Route only: rtept, no times, with elevation.
(function () {
  var x = '<?xml version="1.0"?>\n<gpx creator="Route Planner" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    ' <rte>\n  <name>Sunday loop</name>\n';
  for (var i = 0; i < 40; i++) {
    var p = pathAt(i * 50), ll = toLL(p.x, p.y);
    x += '  <rtept lat="' + ll[0].toFixed(6) + '" lon="' + ll[1].toFixed(6) + '"><ele>' + (40 + 10 * Math.sin(i / 6)).toFixed(1) + '</ele></rtept>\n';
  }
  x += ' </rte>\n</gpx>\n';
  write('route-only.gpx', x);
})();

// 5. Pool swim: a track with no points.
write('pool-swim-no-points.gpx',
  '<?xml version="1.0"?>\n<gpx creator="Test Watch" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">\n' +
  ' <metadata><time>2026-10-14T06:00:00Z</time></metadata>\n' +
  ' <trk><name>Pool Swim</name><type>lap_swimming</type><trkseg></trkseg></trk>\n</gpx>\n');

// 6. Not GPX at all.
write('not-gpx.xml',
  '<?xml version="1.0"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Not a GPX</name></Document></kml>\n');

// 7. Spike: 60 points at 3 m/s, one teleported 1.1 km north.
(function () {
  var t0 = Date.UTC(2026, 9, 15, 6, 0, 0);
  var x = '<?xml version="1.0"?>\n<gpx creator="Test" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    ' <trk><name>Run with a glitch</name><type>running</type><trkseg>\n';
  for (var i = 0; i < 60; i++) {
    var p = pathAt(i * 3), ll = toLL(p.x, p.y);
    var lat = ll[0] + (i === 30 ? 0.01 : 0);
    x += '  <trkpt lat="' + lat.toFixed(6) + '" lon="' + ll[1].toFixed(6) + '"><time>' + iso(t0 + i * 1000) + '</time></trkpt>\n';
  }
  x += ' </trkseg></trk>\n</gpx>\n';
  write('spike.gpx', x);
})();

console.log('fixtures written to ' + dir);
