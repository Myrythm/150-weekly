import { coverRect, loadPhoto, releasePhoto } from '../../src/story/photo.js';

afterEach(() => { vi.unstubAllGlobals(); });

test('coverRect at zoom 1 is a centred crop with the box aspect', () => {
  const r = coverRect(4000, 3000, 1080, 1920, { zoom: 1, x: 0, y: 0 });
  expect(r.sw).toBeCloseTo(1687.5, 6);
  expect(r.sh).toBe(3000);
  expect(r.sx).toBeCloseTo((4000 - 1687.5) / 2, 6);
  expect(r.sy).toBe(0);
});

test('coverRect at zoom 2 halves both sides and stays centred', () => {
  const r = coverRect(4000, 3000, 1080, 1920, { zoom: 2, x: 0, y: 0 });
  expect(r.sw).toBeCloseTo(843.75, 6);
  expect(r.sh).toBe(1500);
  expect(r.sx + r.sw / 2).toBeCloseTo(2000, 6);
  expect(r.sy + r.sh / 2).toBeCloseTo(1500, 6);
});

test('coverRect x 1 pushes the crop to the right edge and never outside the image', () => {
  const r = coverRect(4000, 3000, 1080, 1920, { zoom: 1, x: 1, y: 0 });
  expect(r.sx + r.sw).toBeCloseTo(4000, 6);
  const far = coverRect(4000, 3000, 1080, 1920, { zoom: 9, x: 7, y: -7 });
  expect(far.sx).toBeGreaterThanOrEqual(0);
  expect(far.sy).toBeGreaterThanOrEqual(0);
  expect(far.sx + far.sw).toBeLessThanOrEqual(4000 + 1e-9);
  expect(far.sy + far.sh).toBeLessThanOrEqual(3000 + 1e-9);
  expect(far.sw).toBeCloseTo(1687.5 / 3, 6);
  const left = coverRect(4000, 3000, 1080, 1920, { zoom: 1, x: -1, y: 0 });
  expect(left.sx).toBe(0);
});

test('coverRect for a tall photo in a wide box crops top and bottom', () => {
  const r = coverRect(1000, 3000, 1000, 1000, { zoom: 1, x: 0, y: 1 });
  expect(r).toEqual({ sx: 0, sy: 2000, sw: 1000, sh: 1000 });
  expect(coverRect(1000, 3000, 1000, 1000).sy).toBe(1000);
});

test('loadPhoto rejects a file that is not an image', async () => {
  const f = new File(['hello'], 'note.txt', { type: 'text/plain' });
  await expect(loadPhoto(f)).rejects.toThrow('not-image');
  await expect(loadPhoto(null)).rejects.toThrow('not-image');
});

test('loadPhoto rejects with decode-failed when the image cannot be decoded', async () => {
  vi.stubGlobal('createImageBitmap', vi.fn(() => { throw new Error('bad'); }));
  const f = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
  const err = await loadPhoto(f).catch(e => e);
  expect(err).toBeInstanceOf(Error);
  expect(err.message).toBe('decode-failed');
});

test('loadPhoto scales the longer side to 2160, applies orientation and closes the full size bitmap', async () => {
  const full = { width: 8000, height: 6000, close: vi.fn() };
  const stub = vi.fn((src, opts) => {
    if (src === full) return Promise.resolve({ width: opts.resizeWidth, height: opts.resizeHeight, close: vi.fn() });
    return Promise.resolve(full);
  });
  vi.stubGlobal('createImageBitmap', stub);
  const f = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
  const p = await loadPhoto(f);
  expect(Math.max(p.w, p.h)).toBe(2160);
  expect(p).toMatchObject({ w: 2160, h: 1620 });
  expect(p.bitmap.width).toBe(2160);
  expect(full.close).toHaveBeenCalledTimes(1);
  expect(stub.mock.calls[0][1]).toMatchObject({ imageOrientation: 'from-image' });
});

function fakeOffscreen(drawn) {
  return class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return { drawImage: (...a) => drawn.push(a) }; }
  };
}

test('loadPhoto falls back to a canvas when the resize is ignored, and closes both oversized bitmaps', async () => {
  const full = { width: 8000, height: 6000, close: vi.fn() };
  const ignored = { width: 8000, height: 6000, close: vi.fn() };
  const drawn = [];
  const Off = fakeOffscreen(drawn);
  vi.stubGlobal('OffscreenCanvas', Off);
  vi.stubGlobal('createImageBitmap', vi.fn((src) => {
    if (src === full) return Promise.resolve(ignored);
    if (src instanceof Off) return Promise.resolve({ width: src.width, height: src.height, close: vi.fn() });
    return Promise.resolve(full);
  }));
  const p = await loadPhoto(new File(['x'], 'p.jpg', { type: 'image/jpeg' }));
  expect(Math.max(p.w, p.h)).toBeLessThanOrEqual(2160);
  expect(p).toMatchObject({ w: 2160, h: 1620 });
  expect(p.bitmap).toMatchObject({ width: 2160, height: 1620 });
  expect(full.close).toHaveBeenCalledTimes(1);
  expect(ignored.close).toHaveBeenCalledTimes(1);
  expect(drawn).toHaveLength(1);
  expect(drawn[0][0]).toBe(full);
});

test('loadPhoto reports the real size of the resized bitmap', async () => {
  const full = { width: 8000, height: 6000, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn((src) => src === full
    ? Promise.resolve({ width: 2000, height: 1500, close: vi.fn() })
    : Promise.resolve(full)));
  const p = await loadPhoto(new File(['x'], 'p.jpg', { type: 'image/jpeg' }));
  expect(p).toMatchObject({ w: 2000, h: 1500 });
  expect(full.close).toHaveBeenCalledTimes(1);
});

test('loadPhoto rejects with decode-failed and closes everything when the canvas fallback fails too', async () => {
  const full = { width: 8000, height: 6000, close: vi.fn() };
  const ignored = { width: 8000, height: 6000, close: vi.fn() };
  const Off = fakeOffscreen([]);
  vi.stubGlobal('OffscreenCanvas', Off);
  vi.stubGlobal('createImageBitmap', vi.fn((src) => {
    if (src === full) return Promise.resolve(ignored);
    if (src instanceof Off) return Promise.reject(new Error('no'));
    return Promise.resolve(full);
  }));
  const err = await loadPhoto(new File(['x'], 'p.jpg', { type: 'image/jpeg' })).catch(e => e);
  expect(err.message).toBe('decode-failed');
  expect(full.close).toHaveBeenCalledTimes(1);
  expect(ignored.close).toHaveBeenCalledTimes(1);
});

test('loadPhoto keeps a small photo as it is', async () => {
  const small = { width: 1200, height: 900, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve(small)));
  const p = await loadPhoto(new File(['x'], 'p.png', { type: 'image/png' }));
  expect(p).toEqual({ bitmap: small, w: 1200, h: 900 });
  expect(small.close).not.toHaveBeenCalled();
});

test('releasePhoto closes the bitmap and tolerates null', () => {
  const b = { close: vi.fn() };
  releasePhoto({ bitmap: b, w: 1, h: 1 });
  expect(b.close).toHaveBeenCalledTimes(1);
  expect(() => releasePhoto(null)).not.toThrow();
});
