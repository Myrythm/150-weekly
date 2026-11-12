/*
 * B Clean (static): the photo is the star. A small route outline in the top right corner, and at the
 * bottom the kicker, the main number, the small numbers inline and the wordmark. Opacity applies to
 * the bottom gradient (the chosen colour mixed 40 percent with black). Text is white with a soft
 * shadow over a photo; without a photo the colour is the background and text follows onColor.
 * Mockup (.st-b, .st-scrim, .st-route-sm, .st-b-body), sizes in cqw x 10.8: gradient from 38 percent,
 * body inset 7cqw (76), hero 39cqw (421), inline numbers 8.5cqw (92) with mono units 3cqw (32),
 * route 24cqw wide (259) at 7cqw from the right.
 */
import { INK, WHITE, onColor, rgba } from '../colors.js';
import {
  W, H, SAFE_TOP, SAFE_BOTTOM, FONT, colorLayer, heroFit, heroLine, text, textWidth, fitFont, brand, kicker,
  softShadow, routeLine, shade, heroItem, smallItems, HERO_SCALE, BRAND_PX
} from '../draw.js';

const BODY_X = 76;
const BODY_W = W - 2 * BODY_X;
const HERO_PX = 421;
const VALUE_PX = 92;
const UNIT_PX = 32;
const UNIT_GAP = 11;
const ITEM_GAP = 50;
const LINE_H = 106;
const LINE_BASE = 81;
const BRAND_Y = SAFE_BOTTOM - 8;
const ROUTE_W = 259;
const ROUTE_H = 290;
const SCRIM_FROM = 0.38;

/* The small numbers as inline items, wrapped into lines that fit the body width. */
function inlineLines(ctx, values) {
  const lines = [];
  let line = [], used = 0;
  values.forEach(function (v) {
    const unit = v.label.toLowerCase();
    const wu = textWidth(ctx, unit, UNIT_PX, FONT.mono, 500);
    let vpx = VALUE_PX;
    if (textWidth(ctx, v.value, vpx, FONT.display, 600) + UNIT_GAP + wu > BODY_W) {
      vpx = fitFont(ctx, v.value, BODY_W - UNIT_GAP - wu, VALUE_PX, FONT.display, 600);
    }
    const wv = textWidth(ctx, v.value, vpx, FONT.display, 600);
    const item = { value: v.value, unit: unit, vpx: vpx, wv: wv, w: wv + UNIT_GAP + wu };
    const need = line.length ? used + ITEM_GAP + item.w : item.w;
    if (line.length && need > BODY_W) {
      lines.push(line);
      line = [item];
      used = item.w;
    } else {
      line.push(item);
      used = need;
    }
  });
  if (line.length) lines.push(line);
  return lines;
}

export function draw(ctx, state) {
  const a = Math.max(0, Math.min(100, state.opacity)) / 100;
  const photo = state.photo;
  const fg = photo ? WHITE : onColor(state.color);

  if (photo && a > 0) {
    const mix = shade(state.color, 0.4);
    const g = ctx.createLinearGradient(0, H * SCRIM_FROM, 0, H);
    g.addColorStop(0, rgba(mix, 0));
    g.addColorStop(1, rgba(mix, 1));
    colorLayer(ctx, g, a, 0, H * SCRIM_FROM, W, H * (1 - SCRIM_FROM));
  }

  ctx.save();
  if (photo) softShadow(ctx, rgba(INK, 0.4), 16, 4);
  routeLine(ctx, state.model.track, W - BODY_X - ROUTE_W, SAFE_TOP, ROUTE_W, ROUTE_H, fg, 11);
  ctx.restore();

  const hero = heroItem(state);
  const px = heroFit(ctx, hero.value, hero.unit, BODY_W, Math.round(HERO_PX * (HERO_SCALE[hero.key] || 1)));
  const lines = inlineLines(ctx, smallItems(state));
  const brandTop = BRAND_Y - Math.round(BRAND_PX * 0.72);
  let heroBottom = brandTop - 43;
  let inlineTop = 0;
  if (lines.length) {
    const lastBase = brandTop - 43 - (LINE_H - LINE_BASE);
    inlineTop = lastBase - LINE_BASE - (lines.length - 1) * LINE_H;
    heroBottom = inlineTop - 22;
  }
  const heroTop = heroBottom - Math.round(px * 0.84);
  const heroY = heroTop + Math.round(px * 0.77);
  const kickerY = heroTop - 22 - 14;

  ctx.save();
  if (photo) softShadow(ctx, rgba(INK, 0.4), 24, 4);
  kicker(ctx, state.model.kicker, BODY_X, kickerY, BODY_W, fg);
  heroLine(ctx, hero.value, hero.unit, BODY_X, heroY, px, fg);
  lines.forEach(function (line, i) {
    const y = inlineTop + i * LINE_H + LINE_BASE;
    let x = BODY_X;
    line.forEach(function (it) {
      text(ctx, it.value, x, y, it.vpx, FONT.display, 600, fg);
      text(ctx, it.unit, x + it.wv + UNIT_GAP, y, UNIT_PX, FONT.mono, 500, fg, 0.8);
      x += it.w + ITEM_GAP;
    });
  });
  brand(ctx, BODY_X, BRAND_Y, fg, 0.85);
  ctx.restore();
}
