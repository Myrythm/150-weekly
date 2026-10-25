/* Timer routines. Moved from web/js/app.js; the group is a parameter instead of currentGroup(). */
import { countsAsBalance } from './rules.js';

export const ROUTINES = [
  { id: 'stairs', name: 'Stair climb', type: 'stairs', intensity: 'vigorous', tag: '3 min', logMin: 3, summary: 'Climb stairs briskly for 40 seconds, rest 20. Three rounds.', moves: ['Climb', 'Climb', 'Climb'], work: 40, rest: 20 },
  { id: 'desk', name: 'Desk reset', type: 'strength', intensity: 'moderate', tag: '5 min', logMin: 5, summary: 'Chair squats, wall push-ups, standing march, calf raises, hip hinge reach. 45 seconds on, 15 off.', moves: ['Chair squats', 'Wall push-ups', 'Standing march', 'Calf raises', 'Hip hinge reach'], work: 45, rest: 15 },
  { id: 'kitchen', name: 'Kitchen circuit', type: 'strength', intensity: 'vigorous', tag: '7 min', logMin: 7, summary: 'Squats, counter push-ups, reverse lunges, fast feet, glute bridge, plank, step jacks. 40 on, 20 off.', moves: ['Squats', 'Counter push-ups', 'Reverse lunges', 'Fast feet', 'Glute bridge', 'Plank', 'Step jacks'], work: 40, rest: 20 },
  { id: 'steady', name: 'Steady feet', type: 'balance', intensity: 'moderate', tag: '5 min', logMin: 5, groups: ['older'], summary: 'Heel-to-toe walk along a counter, single-leg stand, sit-to-stand from a chair, side leg raises, slow marching. 45 seconds on, 15 off. Swap legs halfway through the stand and the raises.', safety: 'Stay within reach of a counter or sturdy chair. Stop if you feel dizzy.', moves: ['Heel-to-toe walk', 'Single-leg stand', 'Sit-to-stand', 'Side leg raises', 'Slow marching'], work: 45, rest: 15 },
  { id: 'loop', name: 'Brisk loop', type: 'walk', intensity: 'moderate', tag: '10 min', logMin: 10, summary: 'One easy minute, eight brisk minutes, one easy minute. Out the door and back.', custom: [['Easy walk', 60, 'work'], ['Brisk walk', 480, 'work'], ['Easy walk', 60, 'work']] }
];
/* a routine with a groups list shows only for those age groups (group is ageGroup(age)) */
export function routineVisible(r, group) { return !r.groups || r.groups.indexOf(group) >= 0; }
/* a routine logs as a balance day under the same rule as countsAsBalance (Steady feet is moderate) */
export function routineBalance(r) { return countsAsBalance({ type: r.type, balance: false, intensity: r.intensity }); }
export function buildSteps(r) {
  let steps = [];
  if (r.custom) steps = r.custom.map(function (x) { return { label: x[0], sec: x[1], kind: x[2] }; });
  else {
    r.moves.forEach(function (m) { steps.push({ label: m, sec: r.work, kind: 'work' }); steps.push({ label: 'Rest', sec: r.rest, kind: 'rest' }); });
    steps.pop();
  }
  return steps;
}
