/*
 * C Splits (animated): at the top the kicker, the main number and the small numbers inline over a dark
 * gradient; at the bottom a band in the chosen colour with one lane per km (or per 5 km block), the bar
 * length by pace and the fastest lane in the highlight colour. Opacity applies to the band; below 100
 * the photo under it is blurred. Text on the band is onColor(colour).
 * Motion: the top fades up over 0 to 0.5 s; lane i grows from the left over 0.7 s from 0.35 + i x step
 * (step 0.18 s, smaller when needed so the last lane is done by MOTION); its pace fades in over 0.4 s
 * from 0.5 s after its start.
 * Mockup (.st-c-top, .st-band, .st-lane), sizes in cqw x 10.8: top inset 7cqw (76), hero 30cqw (324),
 * band padding 5cqw / 6cqw (54 / 65), header mono 2.8cqw (30) with 2.5cqw (27) below, lanes 5cqw (54)
 * label column, 13cqw (140) pace column, gaps 2cqw (22), lane 1.7cqw padding (18), rule .4cqw (4),
 * label Barlow 700 6.5cqw (70), bar 4.6cqw (50), pace mono 3.6cqw (39). The lane pitch shrinks when
 * the lanes would not fit above the safe area's bottom.
 */
import { INK, WHITE, onColor, highlight, rgba } from '../colors.js';
import {
  W, H, SAFE_BOTTOM, FONT, drawPhoto, colorLayer, heroFit, heroLine, text, fitFont, kicker, setTracking,
  heroItem, smallRow, layerAlpha, inlineLines, drawInline, fadeUp, INLINE, HERO_SCALE, BRAND
} from '../draw.js';
import { progress, MOTION } from '../timeline.js';

const TOP_X = 76;
const TOP_W = W - 2 * TOP_X;
const KICKER_Y = 276;
const HERO_PX = 324;
const SLIDE = 54;
const BAND_PAD = 54;
const BAND_X = 65;
const BAND_W = W - 2 * BAND_X;
const HEAD_PX = 30;
const HEAD_BASE = 22;
const HEAD_GAP = 27;
const LANES_BOTTOM = SAFE_BOTTOM;
const LANE_PITCH = 110;
const LABEL_COL = 70;
const PACE_COL = 140;
const COL_GAP = 22;
const BAR_X = BAND_X + LABEL_COL + COL_GAP;
const BAR_MAX = BAND_W - LABEL_COL - PACE_COL - 2 * COL_GAP;
const BLUR_MAX = 43;

const T_TOP = 0.5;
const T_LANE0 = 0.35;
const T_STEP = 0.18;
const T_GROW = 0.7;
const T_PACE_DELAY = 0.5;
const T_PACE = 0.4;

export function laneStep(n) {
  if (n < 2) return T_STEP;
  return Math.min(T_STEP, (MOTION - T_LANE0 - T_PACE_DELAY - T_PACE) / (n - 1));
}

function layout(ctx, state) {
  const hero = heroItem(state);
  const px = heroFit(ctx, hero.value, hero.unit, TOP_W, Math.round(HERO_PX * (HERO_SCALE[hero.key] || 1)));
  const lines = inlineLines(ctx, smallRow(state), TOP_W);
  const heroTop = KICKER_Y + 14 + 22;
  const heroBottom = heroTop + Math.round(px * 0.84);
  const inlineTop = heroBottom + 11;
  const topBottom = lines.length ? inlineTop + lines.length * INLINE.lineH : heroBottom;
  const lanes = state.model.lanes || [];
  const n = lanes.length;
  const head = BAND_PAD + HEAD_PX + HEAD_GAP;
  const bandTop = Math.round(Math.max(topBottom + 43, LANES_BOTTOM - head - n * LANE_PITCH));
  const pitch = n ? Math.min(LANE_PITCH, (LANES_BOTTOM - bandTop - head) / n) : 0;
  return {
    hero: hero, px: px, lines: lines, heroY: heroTop + Math.round(px * 0.77), inlineTop: inlineTop,
    lanes: lanes, bandTop: bandTop, headY: bandTop + BAND_PAD + HEAD_BASE, lanesTop: bandTop + head, pitch: pitch
  };
}

export function draw(ctx, state, t) {
  const a = layerAlpha(state);
  const photo = state.photo;
  const fg = onColor(state.color);
  const topFg = photo ? WHITE : fg;
  const hi = highlight(state.color).fill;
  const L = layout(ctx, state);

  if (photo) {
    const g = ctx.createLinearGradient(0, 0, 0, H / 2);
    g.addColorStop(0, rgba(INK, 0.65));
    g.addColorStop(1, rgba(INK, 0));
    colorLayer(ctx, g, 1, 0, 0, W, H / 2);
  }

  fadeUp(ctx, progress(t, 0, T_TOP), SLIDE, function () {
    kicker(ctx, state.model.kicker, TOP_X, KICKER_Y, TOP_W, topFg);
    heroLine(ctx, L.hero.value, L.hero.unit, TOP_X, L.heroY, L.px, topFg);
    drawInline(ctx, L.lines, TOP_X, L.inlineTop, topFg);
  });

  if (photo) {
    if (a < 1 && 'filter' in ctx) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, L.bandTop, W, H - L.bandTop);
      ctx.clip();
      ctx.filter = 'blur(' + Math.round((1 - a) * BLUR_MAX) + 'px)';
      drawPhoto(ctx, photo, state.view, 0, 0, W, H);
      ctx.filter = 'none';
      ctx.restore();
    }
    colorLayer(ctx, state.color, a, 0, L.bandTop, W, H - L.bandTop);
  } else {
    ctx.save();
    ctx.fillStyle = fg;
    ctx.fillRect(0, L.bandTop, W, 6);
    ctx.restore();
  }

  ctx.save();
  setTracking(ctx, 0.14, HEAD_PX);
  if (L.lanes.length) {
    const perBlock = L.lanes[0].label !== '1';
    text(ctx, perBlock ? 'SPLITS PER 5 KM' : 'SPLITS PER KM', BAND_X, L.headY, HEAD_PX, FONT.mono, 500, fg);
  }
  text(ctx, BRAND, BAND_X + BAND_W, L.headY, HEAD_PX, FONT.mono, 500, fg, 1, 'right');
  ctx.restore();

  const k = L.pitch / LANE_PITCH;
  const rule = Math.max(2, Math.round(4 * k));
  const labelPx = Math.round(70 * k);
  const barH = Math.round(50 * k);
  const pacePx = Math.round(39 * k);
  const step = laneStep(L.lanes.length);
  L.lanes.forEach(function (lane, i) {
    const top = L.lanesTop + i * L.pitch;
    const mid = top + rule + (L.pitch - rule) / 2;
    ctx.save();
    ctx.fillStyle = rgba(fg, 0.3);
    ctx.fillRect(BAND_X, top, BAND_W, rule);
    ctx.restore();

    const lpx = fitFont(ctx, lane.label, LABEL_COL, labelPx, FONT.display, 700);
    text(ctx, lane.label, BAND_X, Math.round(mid + labelPx * 0.35), lpx, FONT.display, 700, fg);

    const start = T_LANE0 + i * step;
    const grow = progress(t, start, T_GROW);
    const bw = BAR_MAX * lane.frac * grow;
    if (bw > 0) {
      ctx.save();
      ctx.fillStyle = lane.best ? hi : fg;
      ctx.fillRect(BAR_X, Math.round(mid - barH / 2), bw, barH);
      ctx.restore();
    }

    const show = progress(t, start + T_PACE_DELAY, T_PACE);
    if (show > 0) {
      const ppx = fitFont(ctx, lane.paceText, PACE_COL, pacePx, FONT.mono, 500);
      text(ctx, lane.paceText, BAND_X + BAND_W, Math.round(mid + pacePx * 0.36), ppx, FONT.mono, 500, fg, show, 'right');
    }
  });
}
