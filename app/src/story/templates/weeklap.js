/*
 * E Week lap (animated): a colour wash over the photo (opacity applies to it), the wordmark top left,
 * an oval track that fills toward the weekly target with this run's part in the highlight colour and a
 * counter of the week's minutes in the middle, then the kicker, the "+N MIN TODAY" tag, the main and
 * small numbers inline and the seven day row. Text follows onColor(colour).
 * Motion: the track shows `before` from the start; the run's part grows from 0 to `add` over 0.3 to
 * 2.6 s while the counter goes from `before` to `after`; the tag fades up and today's day mark grows
 * over 2.6 to 3 s. The fill stops at a full lap; the counter still shows the true `after`.
 * Mockup (.st-oval, .st-oval-num, .st-e-body, .st-plus, .st-days), sizes in cqw x 10.8: oval 8cqw (86)
 * inset, viewBox 200 x 120 with a 13 unit line, counter 25cqw (270) over mono 2.6cqw (28), tag Barlow
 * 700 7.5cqw (81) with 1.4cqw / 2.6cqw (15 / 28) padding and 3cqw (32) below, day row 4cqw (43) below
 * the numbers, bars 2.2cqw (24) with 1.5cqw (16) gaps, letters mono 2.4cqw (26). The oval is centred
 * in the height left between the wordmark and the kicker and shrinks when that height is short.
 */
import { INK, WHITE, onColor, highlight, rgba } from '../colors.js';
import {
  W, H, SAFE_BOTTOM, FONT, colorLayer, text, textWidth, fitFont, brand, kicker, setTracking, softShadow,
  heroItem, smallRow, layerAlpha, inlineLines, drawInline, fadeUp, INLINE
} from '../draw.js';
import { progress } from '../timeline.js';
import { WD } from '../../core/dates.js';

const BODY_X = 76;
const BODY_W = W - 2 * BODY_X;
const BRAND_X = 76;
const BRAND_Y = 276;
const OVAL_TOP = 310;
const OVAL_MAX_W = W - 2 * 86;
const COUNT_PX = 270;
const OF_PX = 28;
const TAG_PX = 81;
const TAG_PAD_Y = 15;
const TAG_PAD_X = 28;
const TAG_GAP = 32;
const DAY_GAP = 16;
const DAY_BAR = 24;
const DAY_PX = 26;
const LAST_BASELINE = SAFE_BOTTOM - 8;

const T_RUN = 0.3;
const T_RUN_LEN = 2.3;
const T_TODAY = 2.6;
const T_TODAY_LEN = 0.4;

/* The stadium of the mockup's oval (M60 10 H140 A50 50 0 0 1 140 110 H60 A50 50 0 0 1 60 10 Z):
   starts at the top left of the top straight and runs clockwise. Adds the part from length d0 to d1. */
function stadium(ctx, o, d0, d1) {
  const hs = o.hs, r = o.r, cx = o.cx, cy = o.cy;
  const segs = [
    { kind: 'line', len: 2 * hs, x0: cx - hs, y0: cy - r, dx: 1, dy: 0 },
    { kind: 'arc', len: Math.PI * r, cx: cx + hs, cy: cy, a0: -Math.PI / 2 },
    { kind: 'line', len: 2 * hs, x0: cx + hs, y0: cy + r, dx: -1, dy: 0 },
    { kind: 'arc', len: Math.PI * r, cx: cx - hs, cy: cy, a0: Math.PI / 2 }
  ];
  let s0 = 0, first = true;
  segs.forEach(function (s) {
    const s1 = s0 + s.len;
    const a = Math.max(d0, s0) - s0;
    const b = Math.min(d1, s1) - s0;
    if (b > a) {
      if (s.kind === 'line') {
        if (first) ctx.moveTo(s.x0 + s.dx * a, s.y0 + s.dy * a);
        ctx.lineTo(s.x0 + s.dx * b, s.y0 + s.dy * b);
      } else {
        const a0 = s.a0 + a / r;
        if (first) ctx.moveTo(s.cx + r * Math.cos(a0), s.cy + r * Math.sin(a0));
        ctx.arc(s.cx, s.cy, r, a0, s.a0 + b / r);
      }
      first = false;
    }
    s0 = s1;
  });
}

function strokeLap(ctx, o, f0, f1, color, close) {
  if (!(f1 > f0)) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = o.line;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  stadium(ctx, o, f0 * o.len, f1 * o.len);
  if (close) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/* Week lap draws the main number and the small numbers up to this many in all (the story page's
   text alternative uses the same cap) */
export const MAX_NUMBERS = 4;

function layout(ctx, state) {
  const week = state.model.week;
  const hero = heroItem(state);
  const items = [{ value: hero.value, label: state.model.values[hero.key].label }].concat(smallRow(state)).slice(0, MAX_NUMBERS);
  const lines = inlineLines(ctx, items, BODY_W);
  const L = { week: week, lines: lines };
  L.dayLetterY = LAST_BASELINE;
  L.dayTop = L.dayLetterY - 19 - 11 - DAY_BAR;
  let bottom = week ? L.dayTop - 43 : LAST_BASELINE + (INLINE.lineH - INLINE.lineBase);
  L.inlineTop = bottom - lines.length * INLINE.lineH;
  bottom = lines.length ? L.inlineTop : bottom;
  if (week) {
    L.tag = '+' + week.add + ' MIN TODAY';
    L.tagPx = fitFont(ctx, L.tag, BODY_W - 2 * TAG_PAD_X, TAG_PX, FONT.display, 700);
    L.tagH = TAG_PAD_Y * 2 + L.tagPx;
    L.tagTop = bottom - TAG_GAP - L.tagH;
    L.tagW = textWidth(ctx, L.tag, L.tagPx, FONT.display, 700) + 2 * TAG_PAD_X;
    L.tagY = L.tagTop + TAG_PAD_Y + Math.round(L.tagPx * 0.8);
    bottom = L.tagTop;
  }
  L.kickerY = bottom - 30;
  const avail = L.kickerY - 23 - 43 - OVAL_TOP;
  const ow = Math.max(200, Math.min(OVAL_MAX_W, avail / 0.6));
  const s = ow / 200;
  L.oval = {
    s: s, cx: W / 2, cy: OVAL_TOP + Math.max(0, (avail - ow * 0.6) / 2) + 60 * s,
    hs: 40 * s, r: 50 * s, line: 13 * s
  };
  L.oval.len = 4 * L.oval.hs + 2 * Math.PI * L.oval.r;
  return L;
}

export function draw(ctx, state, t) {
  const a = layerAlpha(state);
  const photo = state.photo;
  const fg = onColor(state.color);
  const hl = highlight(state.color);
  const L = layout(ctx, state);
  const week = L.week;

  if (photo && a > 0) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(state.color, 0.5));
    g.addColorStop(1, rgba(state.color, 0.9));
    colorLayer(ctx, g, a, 0, 0, W, H);
  }

  const shadow = photo && fg === WHITE;
  const p = progress(t, T_RUN, T_RUN_LEN);
  const today = progress(t, T_TODAY, T_TODAY_LEN);

  if (week && week.target > 0) {
    const o = L.oval;
    const fb = Math.max(0, Math.min(1, week.before / week.target));
    const fr = Math.max(fb, Math.min(1, (week.before + week.add * p) / week.target));
    strokeLap(ctx, o, 0, 1, rgba(fg, 0.22), true);
    strokeLap(ctx, o, 0, fb, fg, false);
    strokeLap(ctx, o, fb, fr, hl.fill, false);

    const count = String(Math.round(week.before + (week.after - week.before) * p));
    const k = o.s / (OVAL_MAX_W / 200);
    const cpx = fitFont(ctx, String(Math.max(week.before, week.after)), 150 * o.s, Math.round(COUNT_PX * k), FONT.display, 800);
    const opx = Math.max(12, Math.round(OF_PX * k));
    const blockH = Math.round(cpx * 0.84) + 11 + Math.round(opx * 0.72);
    const top = o.cy - blockH / 2;
    ctx.save();
    if (shadow) softShadow(ctx, rgba(INK, 0.4), 16, 4);
    text(ctx, count, W / 2, Math.round(top + cpx * 0.77), cpx, FONT.display, 800, fg, 1, 'center');
    setTracking(ctx, 0.12, opx);
    text(ctx, 'OF ' + week.target + ' MIN', W / 2, Math.round(top + blockH), opx, FONT.mono, 500, fg, 1, 'center');
    ctx.restore();
  }

  ctx.save();
  if (shadow) softShadow(ctx, rgba(INK, 0.4), 16, 4);
  brand(ctx, BRAND_X, BRAND_Y, fg);
  kicker(ctx, state.model.kicker, BODY_X, L.kickerY, BODY_W, fg);
  drawInline(ctx, L.lines, BODY_X, L.inlineTop, fg);
  ctx.restore();

  if (!week) return;

  /* the tag slides up by its own gap at most, so it never covers the first number line */
  fadeUp(ctx, today, TAG_GAP, function () {
    ctx.save();
    ctx.fillStyle = hl.fill;
    ctx.fillRect(BODY_X, L.tagTop, L.tagW, L.tagH);
    ctx.restore();
    text(ctx, L.tag, BODY_X + TAG_PAD_X, L.tagY, L.tagPx, FONT.display, 700, hl.on);
  });

  const colW = (BODY_W - DAY_GAP * 6) / 7;
  (week.days || []).slice(0, 7).forEach(function (d, i) {
    const x = BODY_X + i * (colW + DAY_GAP);
    ctx.save();
    ctx.fillStyle = d.on && !d.today ? fg : rgba(fg, 0.22);
    ctx.fillRect(x, L.dayTop, colW, DAY_BAR);
    if (d.today && today > 0) {
      ctx.fillStyle = hl.fill;
      ctx.fillRect(x, L.dayTop, colW * today, DAY_BAR);
    }
    ctx.restore();
    text(ctx, WD[i].charAt(0).toUpperCase(), x + colW / 2, L.dayLetterY, DAY_PX, FONT.mono, 500, fg, 0.85, 'center');
  });
}
