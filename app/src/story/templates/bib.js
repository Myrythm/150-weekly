/*
 * A Race bib (static): the wordmark top left, a paper bib card at the bottom with two holes in the
 * chosen colour, the kicker, the main number, the results row and, when the week has a target,
 * the bar "N OF T MIN THIS WEEK". Opacity applies to the card; below 100 the photo under the card
 * is blurred. Text on the card is ink.
 * Mockup (.st-a, .st-bib), sizes in cqw x 10.8: card inset 6cqw (65), radius 4cqw (43),
 * padding 8cqw / 5cqw (86 / 54), hero 36cqw (389), meter 2.2cqw (24), blur up to 4cqw (43).
 */
import { INK, WHITE, onColor, rgba } from '../colors.js';
import {
  W, H, SAFE_BOTTOM, FONT, drawPhoto, colorLayer, roundRectPath, numberRow, numberRowHeight, heroFit, heroLine,
  text, brand, kicker, softShadow, setTracking, heroItem, smallItems, HERO_SCALE
} from '../draw.js';

const CARD_X = 65;
const CARD_W = W - 2 * CARD_X;
const PAD_TOP = 86;
const PAD_X = 54;
const PAD_BOTTOM = 54;
const RADIUS = 43;
const HOLE_D = 32;
const HOLE_INSET = 43;
const HERO_PX = 389;
const LAST_BASELINE = SAFE_BOTTOM - 8;
const BRAND_X = 76;
const BRAND_Y = 276;
const BLUR_MAX = 43;
const METER_H = 24;
const WEEK_PX = 27;

function layout(ctx, state) {
  const cw = CARD_W - 2 * PAD_X;
  const hero = heroItem(state);
  const items = smallItems(state).map(function (v) { return { value: v.value, label: v.label }; });
  const px = heroFit(ctx, hero.value, hero.unit, cw, Math.round(HERO_PX * (HERO_SCALE[hero.key] || 1)));
  const L = { cw: cw, hero: hero, items: items, px: px };
  L.kickerY = PAD_TOP + 25;
  L.heroTop = PAD_TOP + 39 + 22;
  L.heroY = L.heroTop + Math.round(px * 0.77);
  L.rowTop = L.heroTop + Math.round(px * 0.84) + 32;
  const rowH = numberRowHeight(items.length);
  let last = rowH ? L.rowTop + rowH - 6 : L.heroY;
  const week = state.model.week;
  if (week && week.target > 0) {
    L.meterTop = rowH ? L.rowTop + rowH + 43 : L.rowTop;
    L.weekY = L.meterTop + METER_H + 16 + 20;
    last = L.weekY;
  }
  const top = LAST_BASELINE - last;
  ['kickerY', 'heroTop', 'heroY', 'rowTop', 'meterTop', 'weekY'].forEach(function (k) {
    if (L[k] !== undefined) L[k] += top;
  });
  L.cardTop = top;
  L.cardH = LAST_BASELINE + PAD_BOTTOM - top;
  return L;
}

export function draw(ctx, state) {
  const a = Math.max(0, Math.min(100, state.opacity)) / 100;
  const photo = state.photo;
  const L = layout(ctx, state);
  const cx = CARD_X + PAD_X;

  if (photo && a < 1 && 'filter' in ctx) {
    ctx.save();
    roundRectPath(ctx, CARD_X, L.cardTop, CARD_W, L.cardH, RADIUS);
    ctx.clip();
    ctx.filter = 'blur(' + Math.round((1 - a) * BLUR_MAX) + 'px)';
    drawPhoto(ctx, photo, state.view, 0, 0, W, H);
    ctx.filter = 'none';
    ctx.restore();
  }

  ctx.save();
  if (a > 0) softShadow(ctx, rgba(INK, 0.5 * a), 80, 50);
  colorLayer(ctx, WHITE, a, CARD_X, L.cardTop, CARD_W, L.cardH, RADIUS);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = state.color;
  [CARD_X + HOLE_INSET + HOLE_D / 2, CARD_X + CARD_W - HOLE_INSET - HOLE_D / 2].forEach(function (hx) {
    ctx.beginPath();
    ctx.arc(hx, L.cardTop + HOLE_D + HOLE_D / 2, HOLE_D / 2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  kicker(ctx, state.model.kicker, cx, L.kickerY, L.cw, INK);
  heroLine(ctx, L.hero.value, L.hero.unit, cx, L.heroY, L.px, INK);
  numberRow(ctx, L.items, cx, L.rowTop, L.cw, INK);

  const week = state.model.week;
  if (L.weekY !== undefined) {
    ctx.save();
    ctx.fillStyle = rgba(INK, 0.13);
    ctx.fillRect(cx, L.meterTop, L.cw, METER_H);
    const frac = Math.max(0, Math.min(1, week.after / week.target));
    if (frac > 0) {
      ctx.fillStyle = state.color;
      ctx.fillRect(cx, L.meterTop, L.cw * frac, METER_H);
    }
    setTracking(ctx, 0.08, WEEK_PX);
    text(ctx, week.after + ' OF ' + week.target + ' MIN THIS WEEK', cx, L.weekY, WEEK_PX, FONT.mono, 500, INK, 0.8);
    ctx.restore();
  }

  ctx.save();
  if (photo) softShadow(ctx, rgba(INK, 0.6), 20, 4);
  brand(ctx, BRAND_X, BRAND_Y, photo ? WHITE : onColor(state.color));
  ctx.restore();
}
