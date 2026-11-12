/*
 * D Route trace (animated): a colour wash over the photo (opacity applies to it), the wordmark top left,
 * the route drawn from start to finish with a moving dot, and at the bottom the kicker, the main number
 * counting up and the small numbers as chips. Text follows onColor(colour); the dot is the highlight.
 * Motion: the route and the dot run over 0.3 to 2.6 s and the main number counts from 0 over the same
 * time (formatted like its final value); the chips slide up from 2.5 s, CHIP_STEP apart (smaller with
 * 4 chips so the last one is done by MOTION).
 * Mockup (.st-dim, .st-route, .st-d-body, .st-chips), sizes in cqw x 10.8: wash colour 50 to 90 percent,
 * route 12cqw (130) from the left and 76cqw (820) wide, line 5 of 170 viewBox units (22), dot radius
 * 5 units (24) with a 2 unit (10) outline, hero 40cqw (432), chips gap 2cqw (22), radius 2cqw (22),
 * border .3cqw (3), padding 2.2cqw / 2cqw (24 / 22), value Barlow 700 8cqw (86) minus 1.5cqw per chip
 * above 3, label mono 2.3cqw (25). The route box takes the height left between the wordmark and the
 * kicker; the chips end 5cqw (54) above the safe area's bottom so they stay inside it while sliding.
 */
import { INK, WHITE, onColor, highlight, rgba } from '../colors.js';
import {
  W, H, SAFE_BOTTOM, FONT, colorLayer, roundRectPath, heroFit, heroLine, text, fitFont, brand, kicker,
  setTracking, softShadow, routeLine, routePartial, heroItem, smallRow, layerAlpha, fadeUp, HERO_SCALE
} from '../draw.js';
import { progress, countText, MOTION } from '../timeline.js';

const BODY_X = 76;
const BODY_W = W - 2 * BODY_X;
const BRAND_X = 76;
const BRAND_Y = 276;
const HERO_PX = 432;
const ROUTE_X = 130;
const ROUTE_W = W - 2 * ROUTE_X;
const ROUTE_TOP = 310;
const ROUTE_LINE = 22;
const DOT_R = 24;
const DOT_RING = 10;
const SLIDE = 54;
const CHIP_GAP = 22;
const CHIP_R = 22;
const CHIP_BORDER = 3;
const CHIP_PAD_Y = 24;
const CHIP_PAD_X = 22;
const CHIP_LABEL_PX = 25;

const T_ROUTE = 0.3;
const T_ROUTE_LEN = 2.3;
const T_CHIP0 = 2.5;
const CHIP_STEP = 0.15;
const CHIP_LEN = 0.2;

export function chipStep(n) {
  if (n < 2) return CHIP_STEP;
  return Math.min(CHIP_STEP, (MOTION - T_CHIP0 - CHIP_LEN) / (n - 1));
}

function chipValuePx(n) {
  return Math.round(86 - Math.max(0, n - 3) * 16.2);
}

function layout(ctx, state) {
  const hero = heroItem(state);
  const base = Math.round(HERO_PX * (HERO_SCALE[hero.key] || 1));
  /* fitted for the final value and for the same shape with zeros, so the count never overflows */
  const px = Math.min(heroFit(ctx, hero.value, hero.unit, BODY_W, base),
    heroFit(ctx, hero.value.replace(/\d/g, '0'), hero.unit, BODY_W, base));
  const items = smallRow(state);
  const n = items.length;
  const L = { hero: hero, px: px, items: items };
  let heroTop;
  if (n) {
    const vpx = chipValuePx(n);
    L.chipLabelY = SAFE_BOTTOM - SLIDE;
    L.chipTop = L.chipLabelY - CHIP_PAD_Y - vpx - 10 - 18;
    L.chipValueY = L.chipTop + CHIP_PAD_Y + Math.round(vpx * 0.8);
    L.chipH = L.chipLabelY + 8 + CHIP_PAD_Y - L.chipTop;
    L.chipW = (BODY_W - CHIP_GAP * (n - 1)) / n;
    L.vpx = items.reduce(function (p, it) {
      return Math.min(p, fitFont(ctx, it.value, L.chipW - 2 * CHIP_PAD_X, vpx, FONT.display, 700));
    }, vpx);
    heroTop = L.chipTop - 43 - Math.round(px * 0.84);
  } else {
    heroTop = SAFE_BOTTOM - 8 - Math.round(px * 0.77);
  }
  L.heroY = heroTop + Math.round(px * 0.77);
  L.kickerY = heroTop - 22 - 14;
  L.routeH = Math.max(120, L.kickerY - 23 - 43 - ROUTE_TOP);
  return L;
}

export function draw(ctx, state, t) {
  const a = layerAlpha(state);
  const photo = state.photo;
  const fg = onColor(state.color);
  const hi = highlight(state.color).fill;
  const L = layout(ctx, state);

  if (photo && a > 0) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(state.color, 0.5));
    g.addColorStop(1, rgba(state.color, 0.9));
    colorLayer(ctx, g, a, 0, 0, W, H);
  }

  const shadow = photo && fg === WHITE;
  const p = progress(t, T_ROUTE, T_ROUTE_LEN);
  const track = state.model.track;
  routeLine(ctx, track, ROUTE_X, ROUTE_TOP, ROUTE_W, L.routeH, rgba(fg, 0.22), ROUTE_LINE);
  const end = routePartial(ctx, track, ROUTE_X, ROUTE_TOP, ROUTE_W, L.routeH, p, fg, ROUTE_LINE);
  if (end) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(end[0], end[1], DOT_R, 0, Math.PI * 2);
    ctx.fillStyle = hi;
    ctx.fill();
    ctx.lineWidth = DOT_RING;
    ctx.strokeStyle = fg;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  if (shadow) softShadow(ctx, rgba(INK, 0.4), 16, 4);
  brand(ctx, BRAND_X, BRAND_Y, fg);
  kicker(ctx, state.model.kicker, BODY_X, L.kickerY, BODY_W, fg);
  heroLine(ctx, countText(L.hero.value, p), L.hero.unit, BODY_X, L.heroY, L.px, fg);
  ctx.restore();

  const step = chipStep(L.items.length);
  L.items.forEach(function (it, i) {
    const x = BODY_X + i * (L.chipW + CHIP_GAP);
    fadeUp(ctx, progress(t, T_CHIP0 + i * step, CHIP_LEN), SLIDE, function () {
      ctx.save();
      ctx.fillStyle = rgba(fg, 0.12);
      roundRectPath(ctx, x, L.chipTop, L.chipW, L.chipH, CHIP_R);
      ctx.fill();
      ctx.strokeStyle = rgba(fg, 0.35);
      ctx.lineWidth = CHIP_BORDER;
      ctx.stroke();
      ctx.restore();
      const cx = x + CHIP_PAD_X;
      const cw = L.chipW - 2 * CHIP_PAD_X;
      text(ctx, it.value, cx, L.chipValueY, L.vpx, FONT.display, 700, fg);
      ctx.save();
      setTracking(ctx, 0.06, CHIP_LABEL_PX);
      const lpx = fitFont(ctx, it.label, cw, CHIP_LABEL_PX, FONT.mono, 500);
      text(ctx, it.label, cx, L.chipLabelY, lpx, FONT.mono, 500, fg, 0.85);
      ctx.restore();
    });
  });
}
