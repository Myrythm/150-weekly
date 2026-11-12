import {
  exportPng, videoSupport, exportVideo, storyFileName, canShareFile, shareFile, downloadBlob
} from '../../src/story/export.js';
import { FPS, FRAMES, DURATION } from '../../src/story/timeline.js';

/* A controllable stand in for Mediabunny, so the WebCodecs path can run without a real encoder. */
const mb = vi.hoisted(() => ({
  adds: [],
  closed: 0,
  cancelled: 0,
  buffer: null,
  throwOnAdd: false,
  sourceOptions: null,
  hangAfter: -1,
  hungAdd: null,
  hangFinalize: false,
  cancelHangs: false,
  addDelay: 0
}));

vi.mock('mediabunny', () => {
  class Output {
    constructor(opts) { this.format = opts.format; this.target = opts.target; }
    addVideoTrack() {}
    async start() {}
    async finalize() {
      if (mb.hangFinalize) await new Promise(() => {});
      this.target.buffer = mb.buffer;
    }
    async cancel() {
      mb.cancelled++;
      if (mb.cancelHangs) await new Promise(() => {});
    }
  }
  class Mp4OutputFormat { constructor(opts) { this.opts = opts; } }
  class BufferTarget { constructor() { this.buffer = null; } }
  class Quality { constructor(opts) { this.opts = opts; } }
  class CanvasSource {
    constructor(canvas, opts) { mb.sourceOptions = opts; this.opts = opts; }
    async add(timestamp, duration) {
      if (mb.throwOnAdd) throw new Error('encoder failed');
      if (mb.addDelay) await new Promise((resolve) => setTimeout(resolve, mb.addDelay));
      if (mb.hangAfter >= 0 && mb.adds.length >= mb.hangAfter) {
        /* A stalled encoder: no packet, and add() resolves only when the test releases it. */
        await new Promise((resolve) => { mb.hungAdd = resolve; });
        return;
      }
      mb.adds.push([timestamp, duration]);
      if (this.opts.onEncodedPacket) this.opts.onEncodedPacket({}, {});
    }
    close() { mb.closed++; }
  }
  return { Output, Mp4OutputFormat, BufferTarget, Quality, CanvasSource };
});

/* The first bytes of a real MP4: a box size and the 'ftyp' box type. */
function mp4Bytes() {
  const b = new Uint8Array(32);
  b.set([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  return b.buffer;
}

function noVideoApis() {
  vi.stubGlobal('VideoEncoder', undefined);
  vi.stubGlobal('MediaRecorder', undefined);
}

function encoderSupported(ok) {
  vi.stubGlobal('VideoEncoder', { isConfigSupported: vi.fn(async (c) => ({ supported: ok, config: c })) });
}

function recorderSupporting(test, bytes) {
  const made = [];
  class FakeRecorder {
    static isTypeSupported(m) { return test(m); }
    constructor(stream, opts) {
      this.stream = stream;
      this.mimeType = opts.mimeType;
      this.state = 'inactive';
      made.push(this);
    }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({ data: new Blob([bytes || mp4Bytes()], { type: 'video/mp4' }) });
      setTimeout(() => this.onstop(), 0);
    }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  return made;
}

function fakeCanvas() {
  return {
    width: 1080,
    height: 1920,
    captureStream: vi.fn(() => ({ getTracks: () => [{ stop: vi.fn() }] }))
  };
}

beforeEach(() => {
  mb.adds = [];
  mb.closed = 0;
  mb.cancelled = 0;
  mb.buffer = null;
  mb.throwOnAdd = false;
  mb.sourceOptions = null;
  mb.hangAfter = -1;
  mb.hungAdd = null;
  mb.hangFinalize = false;
  mb.cancelHangs = false;
  mb.addDelay = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('storyFileName uses the session date and the extension', () => {
  expect(storyFileName({ date: '2026-10-07' }, 'mp4')).toBe('weekly150-run-2026-10-07.mp4');
  expect(storyFileName({ date: '2026-10-07' }, 'png')).toBe('weekly150-run-2026-10-07.png');
});

test('exportPng resolves the canvas as a PNG blob', async () => {
  const png = new Blob(['x'], { type: 'image/png' });
  const canvas = { toBlob: vi.fn((cb, type) => cb(type === 'image/png' ? png : null)) };
  await expect(exportPng(canvas)).resolves.toBe(png);
  expect(canvas.toBlob.mock.calls[0][1]).toBe('image/png');
});

test('videoSupport is none with neither API', async () => {
  noVideoApis();
  await expect(videoSupport()).resolves.toBe('none');
});

test('videoSupport is recorder when only MediaRecorder supports an MP4 type', async () => {
  noVideoApis();
  recorderSupporting((m) => m.indexOf('video/mp4') === 0);
  await expect(videoSupport()).resolves.toBe('recorder');
});

test('videoSupport is webcodecs when VideoEncoder.isConfigSupported resolves supported', async () => {
  noVideoApis();
  encoderSupported(true);
  await expect(videoSupport()).resolves.toBe('webcodecs');
  const cfg = globalThis.VideoEncoder.isConfigSupported.mock.calls[0][0];
  expect(cfg).toMatchObject({ codec: 'avc1.640029', width: 1080, height: 1920, bitrate: 8e6, framerate: 30 });
});

test('videoSupport is none when the encoder says unsupported and MediaRecorder has only WebM', async () => {
  noVideoApis();
  encoderSupported(false);
  recorderSupporting((m) => m.indexOf('video/webm') === 0);
  await expect(videoSupport()).resolves.toBe('none');
});

test('exportVideo resolves null when support is none and never calls drawFrame', async () => {
  noVideoApis();
  const drawFrame = vi.fn();
  await expect(exportVideo(fakeCanvas(), drawFrame, vi.fn())).resolves.toBeNull();
  expect(drawFrame).not.toHaveBeenCalled();
});

test('exportVideo resolves null when MediaRecorder supports only video/webm', async () => {
  noVideoApis();
  const made = recorderSupporting((m) => m.indexOf('video/webm') === 0);
  const drawFrame = vi.fn();
  await expect(exportVideo(fakeCanvas(), drawFrame, vi.fn())).resolves.toBeNull();
  expect(drawFrame).not.toHaveBeenCalled();
  expect(made.length).toBe(0);
});

test('exportVideo with WebCodecs draws every frame at i / FPS and returns an MP4', async () => {
  noVideoApis();
  encoderSupported(true);
  mb.buffer = mp4Bytes();
  const drawFrame = vi.fn();
  const progress = [];
  const out = await exportVideo(fakeCanvas(), drawFrame, (p) => progress.push(p));
  expect(out.path).toBe('webcodecs');
  expect(out.blob.type).toBe('video/mp4');
  expect(out.blob.size).toBe(32);
  expect(drawFrame).toHaveBeenCalledTimes(FRAMES);
  expect(drawFrame.mock.calls[0][0]).toBe(0);
  expect(drawFrame.mock.calls[FRAMES - 1][0]).toBeCloseTo((FRAMES - 1) / FPS, 9);
  expect(mb.adds.length).toBe(FRAMES);
  expect(mb.adds[10][0]).toBeCloseTo(10 / FPS, 9);
  expect(mb.adds[10][1]).toBeCloseTo(1 / FPS, 9);
  expect(mb.sourceOptions).toMatchObject({ codec: 'avc', fullCodecString: 'avc1.640029' });
  expect(mb.sourceOptions.quality.opts).toEqual({ bitrate: 8e6 });
  expect(progress[progress.length - 1]).toBe(1);
  expect(progress.every((p) => p >= 0 && p <= 1)).toBe(true);
});

test('exportVideo falls through to null when WebCodecs gives no MP4 and nothing records MP4', async () => {
  noVideoApis();
  encoderSupported(true);
  mb.buffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer;
  await expect(exportVideo(fakeCanvas(), vi.fn(), vi.fn())).resolves.toBeNull();
});

test('exportVideo falls through to MediaRecorder when the encoder throws', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  noVideoApis();
  encoderSupported(true);
  mb.throwOnAdd = true;
  recorderSupporting((m) => m.indexOf('video/mp4') === 0);
  let ts = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => { ts += 250; setTimeout(() => cb(ts), 0); return 1; });
  const drawFrame = vi.fn();
  const out = await exportVideo(fakeCanvas(), drawFrame, vi.fn());
  expect(mb.cancelled).toBe(1);
  expect(out.path).toBe('recorder');
  expect(warn).toHaveBeenCalledWith('story export: webcodecs failed', expect.any(Error));
  expect(out.blob.type).toBe('video/mp4');
  expect(out.blob.size).toBeGreaterThan(0);
});

test('exportVideo falls through to MediaRecorder when add never resolves after the first packet', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.useFakeTimers();
  noVideoApis();
  encoderSupported(true);
  mb.buffer = mp4Bytes();
  mb.hangAfter = 1;
  mb.cancelHangs = true;
  recorderSupporting((m) => m.indexOf('video/mp4') === 0);
  let ts = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => { ts += 100; setTimeout(() => cb(ts), 0); return 1; });
  const drawFrame = vi.fn();
  const progress = [];
  let settled = false;
  const pending = exportVideo(fakeCanvas(), drawFrame, (p) => progress.push(p)).then((r) => { settled = true; return r; });
  await vi.advanceTimersByTimeAsync(9000);
  expect(settled).toBe(false);
  expect(mb.cancelled).toBe(0);
  expect(mb.adds.length).toBe(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(mb.cancelled).toBe(1);
  await vi.advanceTimersByTimeAsync(10000);
  const out = await pending;
  expect(out.path).toBe('recorder');
  expect(out.blob.type).toBe('video/mp4');
  expect(progress[progress.length - 1]).toBe(1);
  expect(warn).toHaveBeenCalledWith('story export: webcodecs failed', expect.any(Error));
  /* The stalled attempt must not draw or report once it is stopped, even if add() resolves late. */
  const draws = drawFrame.mock.calls.length;
  const reports = progress.length;
  mb.hungAdd();
  await vi.advanceTimersByTimeAsync(1000);
  expect(drawFrame.mock.calls.length).toBe(draws);
  expect(progress.length).toBe(reports);
  expect(mb.adds.length).toBe(1);
});

test('exportVideo gives up when finalize never finishes', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.useFakeTimers();
  noVideoApis();
  encoderSupported(true);
  mb.buffer = mp4Bytes();
  mb.hangFinalize = true;
  let settled = false;
  const pending = exportVideo(fakeCanvas(), vi.fn(), vi.fn()).then((r) => { settled = true; return r; });
  await vi.advanceTimersByTimeAsync(9000);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(2000);
  await expect(pending).resolves.toBeNull();
  expect(mb.cancelled).toBe(1);
  expect(warn).toHaveBeenCalledWith('story export: webcodecs failed', expect.any(Error));
});

test('exportVideo gives up when the encode keeps progressing but exceeds the overall cap', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.useFakeTimers();
  noVideoApis();
  encoderSupported(true);
  mb.buffer = mp4Bytes();
  mb.addDelay = 9000;
  let settled = false;
  const pending = exportVideo(fakeCanvas(), vi.fn(), vi.fn()).then((r) => { settled = true; return r; });
  await vi.advanceTimersByTimeAsync(DURATION * 24 * 1000 - 1000);
  expect(settled).toBe(false);
  expect(mb.cancelled).toBe(0);
  await vi.advanceTimersByTimeAsync(3000);
  await expect(pending).resolves.toBeNull();
  expect(mb.cancelled).toBe(1);
  expect(mb.adds.length).toBeLessThan(FRAMES);
  expect(warn).toHaveBeenCalled();
});

test('exportVideo records in real time for DURATION seconds with MediaRecorder', async () => {
  noVideoApis();
  const made = recorderSupporting((m) => m.indexOf('video/mp4') === 0);
  let ts = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb) => { ts += 100; setTimeout(() => cb(ts), 0); return 1; });
  const drawFrame = vi.fn();
  const progress = [];
  const canvas = fakeCanvas();
  const out = await exportVideo(canvas, drawFrame, (p) => progress.push(p));
  expect(out.path).toBe('recorder');
  expect(made.length).toBe(1);
  expect(made[0].mimeType.indexOf('video/mp4')).toBe(0);
  expect(canvas.captureStream).toHaveBeenCalledWith(FPS);
  const times = drawFrame.mock.calls.map((c) => c[0]);
  expect(times[0]).toBe(0);
  expect(Math.max(...times)).toBeLessThanOrEqual(DURATION);
  expect(Math.max(...times)).toBeGreaterThan(DURATION - 0.5);
  expect(progress[progress.length - 1]).toBe(1);
});

test('exportVideo ends promptly with null when a recorder frame throws (a stale export)', async () => {
  vi.useFakeTimers();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  noVideoApis();
  const made = recorderSupporting((m) => m.indexOf('video/mp4') === 0);
  let ts = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => { ts += 100; setTimeout(() => cb(ts), 0); return 1; });
  let calls = 0;
  const drawFrame = vi.fn(() => { calls++; if (calls > 3) throw new Error('The export is no longer wanted.'); });
  const canvas = fakeCanvas();
  const track = { stop: vi.fn() };
  canvas.captureStream = vi.fn(() => ({ getTracks: () => [track] }));
  let settled = false;
  const pending = exportVideo(canvas, drawFrame, vi.fn()).then((r) => { settled = true; return r; });
  await vi.advanceTimersByTimeAsync(500);
  expect(settled).toBe(true);
  await expect(pending).resolves.toBeNull();
  expect(made[0].state).toBe('inactive');
  expect(track.stop).toHaveBeenCalled();
  /* no more frames once it has ended */
  const n = drawFrame.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1000);
  expect(drawFrame.mock.calls.length).toBe(n);
  expect(warn).toHaveBeenCalledWith('story export: recorder failed', expect.any(Error));
});

test('exportVideo resolves null when the recorder gives a file without an ftyp box', async () => {
  noVideoApis();
  recorderSupporting((m) => m.indexOf('video/mp4') === 0, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]));
  let ts = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => { ts += 250; setTimeout(() => cb(ts), 0); return 1; });
  await expect(exportVideo(fakeCanvas(), vi.fn(), vi.fn())).resolves.toBeNull();
});

test('the recorder path records a detached canvas from a hidden place in the page, then takes it out', async () => {
  noVideoApis();
  recorderSupporting((m) => m.indexOf('video/mp4') === 0);
  let ts = 0;
  const seen = [];
  vi.stubGlobal('requestAnimationFrame', (cb) => { ts += 250; setTimeout(() => cb(ts), 0); return 1; });
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  canvas.captureStream = vi.fn(() => ({ getTracks: () => [{ stop: vi.fn() }] }));
  const drawFrame = vi.fn(() => {
    seen.push({ connected: canvas.isConnected, hidden: canvas.getAttribute('aria-hidden'), position: canvas.style.position, left: canvas.style.left });
  });
  const out = await exportVideo(canvas, drawFrame, vi.fn());
  expect(out.path).toBe('recorder');
  expect(seen[0]).toEqual({ connected: true, hidden: 'true', position: 'fixed', left: '-99999px' });
  expect(canvas.isConnected).toBe(false);
  expect(canvas.getAttribute('aria-hidden')).toBeNull();
  expect(canvas.style.position).toBe('');
});

test('the recorder path leaves a canvas that is already in the page where it is', async () => {
  noVideoApis();
  recorderSupporting((m) => m.indexOf('video/mp4') === 0);
  let ts = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => { ts += 250; setTimeout(() => cb(ts), 0); return 1; });
  const holder = document.createElement('div');
  document.body.appendChild(holder);
  const canvas = document.createElement('canvas');
  holder.appendChild(canvas);
  canvas.captureStream = vi.fn(() => ({ getTracks: () => [{ stop: vi.fn() }] }));
  const out = await exportVideo(canvas, vi.fn(), vi.fn());
  expect(out.path).toBe('recorder');
  expect(canvas.parentNode).toBe(holder);
  expect(canvas.getAttribute('aria-hidden')).toBeNull();
  holder.remove();
});

test('canShareFile is false when navigator.canShare is missing', () => {
  vi.stubGlobal('navigator', { share: vi.fn() });
  expect(canShareFile(new File(['x'], 'a.png', { type: 'image/png' }))).toBe(false);
});

test('canShareFile asks navigator.canShare with the file', () => {
  const canShare = vi.fn(() => true);
  vi.stubGlobal('navigator', { share: vi.fn(), canShare });
  const f = new File(['x'], 'a.png', { type: 'image/png' });
  expect(canShareFile(f)).toBe(true);
  expect(canShare).toHaveBeenCalledWith({ files: [f] });
});

test('shareFile calls navigator.share synchronously with the file', () => {
  const share = vi.fn(() => Promise.resolve());
  vi.stubGlobal('navigator', { share, canShare: () => true });
  const f = new File(['x'], 'a.png', { type: 'image/png' });
  const p = shareFile(f);
  expect(share).toHaveBeenCalledWith({ files: [f] });
  return p;
});

test('downloadBlob clicks an anchor with download set to the name and no target, then revokes later', () => {
  vi.useFakeTimers();
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:story');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  let clicked = null;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    clicked = {
      download: this.getAttribute('download'),
      target: this.getAttribute('target'),
      href: this.getAttribute('href'),
      attached: document.body.contains(this)
    };
  });
  const blob = new Blob(['x'], { type: 'video/mp4' });
  downloadBlob(blob, 'weekly150-run-2026-10-07.mp4');
  expect(create).toHaveBeenCalledWith(blob);
  expect(clicked).toEqual({ download: 'weekly150-run-2026-10-07.mp4', target: null, href: 'blob:story', attached: true });
  expect(document.querySelector('a[download]')).toBeNull();
  expect(revoke).not.toHaveBeenCalled();
  vi.advanceTimersByTime(30000);
  expect(revoke).toHaveBeenCalledWith('blob:story');
});
