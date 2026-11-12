/*
 * A recording stand-in for CanvasRenderingContext2D (the test environment has no real canvas).
 * Every drawing call lands in ctx.calls. Text calls record the LEFT edge of the drawn text
 * (adjusted for textAlign and any translate), its measured width and the state at call time.
 * measureText(text).width is text.length * px * 0.5 for the current font size.
 * makeCtx({ filter: false }) gives a context without the filter property.
 */
const STATE_KEYS = ['font', 'fillStyle', 'strokeStyle', 'globalAlpha', 'textAlign', 'textBaseline', 'lineWidth',
  'lineCap', 'lineJoin', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'filter', 'tx', 'ty', 'dash'];

function fontPx(font) {
  const m = /(\d+(?:\.\d+)?)px/.exec(font || '');
  return m ? Number(m[1]) : 10;
}

export function makeCtx(opts) {
  const withFilter = !(opts && opts.filter === false);
  const calls = [];
  const stack = [];
  const s = {
    font: '10px sans-serif', fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, textAlign: 'start',
    textBaseline: 'alphabetic', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', shadowColor: 'rgba(0, 0, 0, 0)',
    shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, filter: 'none', tx: 0, ty: 0, dash: []
  };

  function measure(text) { return String(text).length * fontPx(s.font) * 0.5; }
  function textCall(op, text, x, y) {
    const width = measure(text);
    const a = s.textAlign;
    const left = a === 'center' ? x - width / 2 : (a === 'right' || a === 'end') ? x - width : x;
    calls.push({
      op: op, text: String(text), x: left + s.tx, rawX: x, y: y + s.ty, width: width, font: s.font,
      fillStyle: s.fillStyle, strokeStyle: s.strokeStyle, globalAlpha: s.globalAlpha, textAlign: a
    });
  }
  function rec(op, extra) {
    calls.push(Object.assign({ op: op, fillStyle: s.fillStyle, strokeStyle: s.strokeStyle, globalAlpha: s.globalAlpha }, extra || {}));
  }

  const ctx = {
    calls: calls,
    canvas: { width: 1080, height: 1920 },
    save() { stack.push(Object.assign({}, s, { dash: s.dash.slice() })); calls.push({ op: 'save' }); },
    restore() {
      const prev = stack.pop();
      if (prev) {
        const filterChanged = prev.filter !== s.filter;
        Object.assign(s, prev);
        if (filterChanged && withFilter) calls.push({ op: 'filter', value: s.filter, restored: true });
      }
      calls.push({ op: 'restore' });
    },
    measureText(text) { return { width: measure(text) }; },
    fillText(text, x, y) { textCall('fillText', text, x, y); },
    strokeText(text, x, y) { textCall('strokeText', text, x, y); },
    fillRect(x, y, w, h) { rec('fillRect', { x: x + s.tx, y: y + s.ty, w: w, h: h }); },
    strokeRect(x, y, w, h) { rec('strokeRect', { x: x + s.tx, y: y + s.ty, w: w, h: h }); },
    clearRect(x, y, w, h) { rec('clearRect', { x: x, y: y, w: w, h: h }); },
    drawImage() { rec('drawImage', { args: Array.prototype.slice.call(arguments), filter: s.filter }); },
    beginPath() { calls.push({ op: 'beginPath' }); },
    closePath() { calls.push({ op: 'closePath' }); },
    moveTo(x, y) { calls.push({ op: 'moveTo', x: x, y: y }); },
    lineTo(x, y) { calls.push({ op: 'lineTo', x: x, y: y }); },
    arc(x, y, r, a0, a1) { calls.push({ op: 'arc', x: x, y: y, r: r, a0: a0, a1: a1 }); },
    arcTo(x1, y1, x2, y2, r) { calls.push({ op: 'arcTo', x1: x1, y1: y1, x2: x2, y2: y2, r: r }); },
    quadraticCurveTo(cx, cy, x, y) { calls.push({ op: 'quadraticCurveTo', cx: cx, cy: cy, x: x, y: y }); },
    bezierCurveTo(a, b, c, d, x, y) { calls.push({ op: 'bezierCurveTo', x: x, y: y }); },
    rect(x, y, w, h) { calls.push({ op: 'rect', x: x, y: y, w: w, h: h }); },
    fill() { rec('fill'); },
    stroke() { rec('stroke', { lineWidth: s.lineWidth, dash: s.dash.slice() }); },
    clip() { calls.push({ op: 'clip' }); },
    setLineDash(d) { s.dash = Array.isArray(d) ? d.slice() : []; },
    getLineDash() { return s.dash.slice(); },
    translate(x, y) { s.tx += x; s.ty += y; calls.push({ op: 'translate', x: x, y: y }); },
    createLinearGradient(x0, y0, x1, y1) {
      const g = { kind: 'linear', x0: x0, y0: y0, x1: x1, y1: y1, stops: [] };
      g.addColorStop = function (o, c) { g.stops.push([o, c]); };
      return g;
    }
  };

  STATE_KEYS.forEach(function (k) {
    if (k === 'tx' || k === 'ty' || k === 'dash') return;
    if (k === 'filter' && !withFilter) return;
    Object.defineProperty(ctx, k, {
      enumerable: true,
      get() { return s[k]; },
      set(v) {
        s[k] = v;
        if (k === 'filter') calls.push({ op: 'filter', value: v });
      }
    });
  });
  return ctx;
}
