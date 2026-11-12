/*
 * F Poster (static): the chosen colour as the full background (opacity applies to it), the photo in a
 * rounded frame at the top with a small route outline in its bottom right corner, and below it the
 * kicker, the main number, the results row and the wordmark. Text follows onColor(colour).
 * Without a photo the frame is a dashed outline.
 * Mockup (.st-f, .st-f-photo, .st-f-body), sizes in cqw x 10.8: frame inset 6cqw (65) from 14cqw (151),
 * radius 3cqw (32), body inset 7cqw (76), hero 35cqw (378), route 19cqw wide (205) at 4cqw (43) from
 * the frame's corner. The frame ends 10cqw (108) above the kicker so the body fits the safe area.
 */
import { INK, WHITE, onColor, rgba } from '../colors.js';
import {
  W, H, SAFE_BOTTOM, drawPhoto, colorLayer, roundRectPath, numberRow, numberRowHeight, heroFit, heroLine,
  brand, kicker, softShadow, routeLine, heroItem, smallRow, layerAlpha, HERO_SCALE, BRAND_PX
} from '../draw.js';

const FRAME_X = 65;
const FRAME_W = W - 2 * FRAME_X;
const FRAME_TOP = 151;
const FRAME_R = 32;
const FRAME_GAP = 108;
const FRAME_MIN_H = 240;
const BODY_X = 76;
const BODY_W = W - 2 * BODY_X;
const HERO_PX = 378;
const BRAND_Y = SAFE_BOTTOM - 8;
const ROUTE_W = 205;
const ROUTE_H = 229;
const ROUTE_INSET = 43;

export function draw(ctx, state) {
  const a = layerAlpha(state);
  const photo = state.photo;
  const fg = onColor(state.color);

  colorLayer(ctx, state.color, a, 0, 0, W, H);

  const hero = heroItem(state);
  const items = smallRow(state);
  const px = heroFit(ctx, hero.value, hero.unit, BODY_W, Math.round(HERO_PX * (HERO_SCALE[hero.key] || 1)));
  const brandTop = BRAND_Y - Math.round(BRAND_PX * 0.72);
  const rowH = numberRowHeight(items.length);
  const rowTop = rowH ? brandTop - 43 - 8 - (rowH - 6) : brandTop - 43;
  const heroTop = rowTop - 32 - Math.round(px * 0.84);
  const heroY = heroTop + Math.round(px * 0.77);
  const kickerY = heroTop - 22 - 14;
  const bodyTop = heroTop - 22 - 39;
  const frameH = Math.max(FRAME_MIN_H, bodyTop - FRAME_GAP - FRAME_TOP);

  ctx.save();
  if (photo) {
    softShadow(ctx, rgba(INK, 0.5), 40, 22);
    ctx.fillStyle = INK;
    roundRectPath(ctx, FRAME_X, FRAME_TOP, FRAME_W, frameH, FRAME_R);
    ctx.fill();
    softShadow(ctx, rgba(INK, 0), 0, 0);
    ctx.save();
    roundRectPath(ctx, FRAME_X, FRAME_TOP, FRAME_W, frameH, FRAME_R);
    ctx.clip();
    drawPhoto(ctx, photo, state.view, FRAME_X, FRAME_TOP, FRAME_W, frameH);
    ctx.restore();
  } else {
    ctx.strokeStyle = fg;
    ctx.lineWidth = 5;
    ctx.setLineDash([22, 14]);
    roundRectPath(ctx, FRAME_X, FRAME_TOP, FRAME_W, frameH, FRAME_R);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  ctx.save();
  if (photo) softShadow(ctx, rgba(INK, 0.4), 16, 4);
  routeLine(ctx, state.model.track, FRAME_X + FRAME_W - ROUTE_INSET - ROUTE_W,
    FRAME_TOP + frameH - ROUTE_INSET - ROUTE_H, ROUTE_W, ROUTE_H, photo ? WHITE : fg, 9);
  ctx.restore();

  kicker(ctx, state.model.kicker, BODY_X, kickerY, BODY_W, fg);
  heroLine(ctx, hero.value, hero.unit, BODY_X, heroY, px, fg);
  numberRow(ctx, items, BODY_X, rowTop, BODY_W, fg);
  brand(ctx, BODY_X, BRAND_Y, fg, 0.85);
}
