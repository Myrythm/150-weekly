/*
 * The story renderer: one function draws a template onto the 1080 x 1920 canvas from the state and a
 * time value in seconds. The live preview and the export use the same call, so they cannot differ.
 * state = { template, model, numbers: { hero, small }, color, opacity (0..100),
 *           photo: { bitmap, w, h } | null, view: { zoom, x, y } }
 * The photo (or, without one, the chosen colour) is the background; the template draws the rest.
 * Static templates ignore t; the animated ones (C, D, E, see timeline.js) draw the frame at t seconds.
 */
import { W, H, SAFE_TOP, SAFE_BOTTOM, drawPhoto } from './draw.js';
import { INK } from './colors.js';
import * as bib from './templates/bib.js';
import * as clean from './templates/clean.js';
import * as poster from './templates/poster.js';
import * as splits from './templates/splits.js';
import * as route from './templates/route.js';
import * as weeklap from './templates/weeklap.js';

export { W, H, SAFE_TOP, SAFE_BOTTOM };

export const TEMPLATES = { A: bib, B: clean, C: splits, D: route, E: weeklap, F: poster };

const DEFAULT_VIEW = { zoom: 1, x: 0, y: 0 };

export function drawStory(ctx, state, t) {
  const tpl = TEMPLATES[state.template];
  const view = state.view || DEFAULT_VIEW;
  const s = state.view ? state : Object.assign({}, state, { view: view });
  ctx.save();
  ctx.globalAlpha = 1;
  if (state.photo && state.photo.bitmap) {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    drawPhoto(ctx, state.photo, view, 0, 0, W, H);
  } else {
    ctx.fillStyle = state.color;
    ctx.fillRect(0, 0, W, H);
  }
  if (tpl && state.model) tpl.draw(ctx, s, t || 0);
  ctx.restore();
}
