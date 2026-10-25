import { niceStep, timeStep, nearestIdx, pctile, sortedNums, chartSpecs, chartUnitNote, readAt, f1 } from '../../src/core/chartMath.js';
import { fmtMinSec, fmtDistShort, fmtStartTime } from '../../src/core/format.js';
import { sampleTrack } from '../../src/core/sample.js';

describe('chart math', function () {
  test('niceStep picks 1, 2, 5 or 10 times a power of ten', function () {
    expect(niceStep(100, 4)).toBe(20);
    expect(niceStep(3000, 5)).toBe(500);
    expect(niceStep(10, 3)).toBe(5);
  });

  test('timeStep picks the first step with 5 ticks or fewer, else 1800', function () {
    expect(timeStep(40)).toBe(10);
    expect(timeStep(25)).toBe(5);
    expect(timeStep(9000)).toBe(1800);
  });

  test('nearestIdx finds the closest distance', function () {
    expect(nearestIdx([0, 10, 20], 14)).toBe(1);
    expect(nearestIdx([0, 10, 20], 16)).toBe(2);
    expect(nearestIdx([0, 10, 20], -5)).toBe(0);
    expect(nearestIdx([0, 10, 20], 99)).toBe(2);
    expect(nearestIdx([0, 10, 20], 5)).toBe(0);
  });

  test('sortedNums drops non numbers, pctile reads a rank', function () {
    expect(sortedNums([3, null, 1, NaN, 2])).toEqual([1, 2, 3]);
    expect(pctile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(pctile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(pctile([1, 2, 3, 4, 5], 1)).toBe(5);
    expect(f1(1.26)).toBe(1.3);
  });

  test('chartSpecs for the sample run: pace, elevation, heart rate', function () {
    const m = sampleTrack('2026-10-21', 30).metrics;
    const specs = chartSpecs(m, 'run');
    expect(specs.map(function (s) { return s.id; })).toEqual(['pace', 'ele', 'hr']);
    expect(specs[0].title).toBe('Pace');
    expect(specs[0].invert).toBe(true);
    expect(chartUnitNote(specs[0])).toBe('Faster is higher.');
    expect(chartUnitNote(specs[1])).toBe('');
    expect(specs[2].fmt(151.6)).toBe('152 bpm');
  });

  test('chartSpecs by type and with too little data', function () {
    const s = { distM: [0, 100, 200], speedKmh: [10, 12, 14], paceSPerKm: [300, 310, null], ele: [null, 1, null], hr: [] };
    expect(chartSpecs({ series: s, avgSpeedKmh: 12 }, 'cycle').map(function (x) { return x.id; })).toEqual(['speed']);
    expect(chartSpecs({ series: s, avgSpeedKmh: 12 }, 'cycle')[0].avg).toBe('12.0 km/h');
    const swim = chartSpecs({ series: s, avgPaceSPer100m: 95 }, 'swim');
    expect(swim[0].title).toBe('Pace per 100 m');
    expect(swim[0].vals).toEqual([30, 31, null]);
    expect(swim[0].avg).toBe('1:35 /100 m');
    expect(chartSpecs({ series: { distM: [0] } }, 'run')).toEqual([]);
  });

  test('readAt gives the value or the null text at the nearest point', function () {
    const spec = chartSpecs({ series: { distM: [0, 500, 1500], hr: [120, null, 140] } }, 'run')[0];
    expect(readAt(spec, [0, 500, 1500], 480).txt).toBe('no reading at 500 m');
    expect(readAt(spec, [0, 500, 1500], 1400).txt).toBe('140 bpm at 1.50 km');
  });
});

describe('formatting', function () {
  test('fmtMinSec, fmtDistShort, fmtStartTime', function () {
    expect(fmtMinSec(330.4)).toBe('5:30');
    expect(fmtMinSec(0)).toBeNull();
    expect(fmtMinSec(null)).toBeNull();
    expect(fmtDistShort(999.4)).toBe('999 m');
    expect(fmtDistShort(1234)).toBe('1.23 km');
    expect(fmtStartTime(new Date(2026, 9, 21, 6, 10).getTime())).toBe('Wed 21 Oct 2026, 06:10');
  });
});
