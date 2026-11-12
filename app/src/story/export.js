/*
 * Story export: PNG, MP4 video, share and download.
 *
 * Video attempts are ordered WebCodecs first, then MediaRecorder. This order follows the desktop
 * Chrome check of the Task 1 spike (WebCodecs gave a full 5.0 s MP4, MediaRecorder an MP4 that
 * played 4.13 s). The result on the owner's Android phone is still pending; if it shows that one
 * path fails there, keep both paths and reorder them here.
 *
 * Mediabunny is loaded with a dynamic import inside the WebCodecs path only, so it lands in its own
 * chunk and the main bundle does not grow. A WebM is never returned: Instagram needs an MP4.
 */
import { FPS, FRAMES, DURATION } from './timeline.js';

/* Proven in the Task 1 spike on desktop Chrome: H.264 High 4.1 first, 8 Mbps. */
const AVC_CODECS = ['avc1.640029', 'avc1.64002A', 'avc1.4d0029'];
const RECORDER_TYPES = ['video/mp4;codecs=avc1.640029', 'video/mp4;codecs=avc1', 'video/mp4'];
const BITRATE = 8e6;
const WIDTH = 1080;
const HEIGHT = 1920;
/* The WebCodecs path fails when it makes no progress (no packet, no accepted frame) for this long,
   including during finalize, or when the whole encode takes longer than the cap. */
const STALL_MS = 10000;
const ENCODE_CAP_MS = DURATION * 24 * 1000;
/* How long a failed WebCodecs attempt may take to cancel before the fallback runs anyway. */
const CANCEL_MS = 1000;
/* Extra time a real time recording may take beyond DURATION (a hidden tab stops animation frames). */
const RECORDER_SLACK_MS = 10000;
const REVOKE_MS = 30000;

/** Resolves the canvas as a PNG blob. */
export function exportPng(canvas) {
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) resolve(blob);
      else reject(new Error('The image could not be created.'));
    }, 'image/png');
  });
}

/* The first H.264 codec string the browser can encode at this size, or null. */
async function pickAvc(width, height) {
  const VE = globalThis.VideoEncoder;
  if (!VE || typeof VE.isConfigSupported !== 'function') return null;
  for (const codec of AVC_CODECS) {
    try {
      const r = await VE.isConfigSupported({ codec, width, height, bitrate: BITRATE, framerate: FPS });
      if (r && r.supported) return codec;
    } catch (e) {
      /* try the next codec string */
    }
  }
  return null;
}

/* The first MP4 type MediaRecorder can record, or null. WebM types are never tried. */
function pickRecorderType() {
  const MR = globalThis.MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== 'function') return null;
  for (const type of RECORDER_TYPES) {
    try {
      if (MR.isTypeSupported(type)) return type;
    } catch (e) {
      /* try the next type */
    }
  }
  return null;
}

/** Which video path this browser offers: 'webcodecs', 'recorder' or 'none'. */
export async function videoSupport(width = WIDTH, height = HEIGHT) {
  if (await pickAvc(width, height)) return 'webcodecs';
  if (pickRecorderType()) return 'recorder';
  return 'none';
}

/* True when the buffer is non-empty and starts with an MP4 'ftyp' box. */
function isMp4(buffer) {
  if (!buffer || !(buffer.byteLength > 8)) return false;
  const b = new Uint8Array(buffer, 4, 4);
  return b[0] === 0x66 && b[1] === 0x74 && b[2] === 0x79 && b[3] === 0x70;
}

function reporter(onProgress) {
  return function (p) {
    if (typeof onProgress !== 'function') return;
    onProgress(p < 0 ? 0 : p > 1 ? 1 : p);
  };
}

/* Frame by frame H.264 into an MP4 with Mediabunny. Resolves the MP4 blob, or null when the output
   is not an MP4; rejects (after cancelling the output) when the encode fails or stalls. */
async function viaWebCodecs(canvas, drawFrame, report, codec) {
  const mb = await import('mediabunny');
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
  let stopped = false;
  let stallTimer;
  let capTimer;
  let fail;
  const watchdog = new Promise(function (_, reject) { fail = reject; });
  watchdog.catch(function () { /* only raced below */ });
  /* Re-armed on every packet and every accepted frame; fires after STALL_MS without either. */
  function alive() {
    if (stopped) return;
    clearTimeout(stallTimer);
    stallTimer = setTimeout(function () { fail(new Error('The encoder stalled.')); }, STALL_MS);
  }
  const source = new mb.CanvasSource(canvas, {
    codec: 'avc',
    fullCodecString: codec,
    quality: new mb.Quality({ bitrate: BITRATE }),
    keyFrameInterval: 1,
    onEncodedPacket: alive
  });
  output.addVideoTrack(source, { frameRate: FPS });
  alive();
  capTimer = setTimeout(function () { fail(new Error('The encode took too long.')); }, ENCODE_CAP_MS);
  const work = (async function () {
    await output.start();
    for (let i = 0; i < FRAMES; i++) {
      if (stopped) return;
      drawFrame(i / FPS);
      await source.add(i / FPS, 1 / FPS);
      if (stopped) return;
      alive();
      report((i + 1) / FRAMES);
    }
    source.close();
    await output.finalize();
  })();
  work.catch(function () {});
  try {
    await Promise.race([work, watchdog]);
  } catch (e) {
    stopped = true;
    clearTimeout(stallTimer);
    clearTimeout(capTimer);
    /* cancel() can wait on the encoder or the output lock, so it gets a short time at most. */
    let cancelTimer;
    const gaveUp = new Promise(function (resolve) { cancelTimer = setTimeout(resolve, CANCEL_MS); });
    try {
      const cancelled = Promise.resolve().then(function () { return output.cancel(); });
      cancelled.catch(function () { /* already closed */ });
      await Promise.race([cancelled, gaveUp]);
    } catch (e2) {
      /* already closed */
    } finally {
      clearTimeout(cancelTimer);
    }
    /* exportVideo logs it and falls through to MediaRecorder */
    throw e;
  } finally {
    stopped = true;
    clearTimeout(stallTimer);
    clearTimeout(capTimer);
  }
  const buffer = output.target.buffer;
  if (!isMp4(buffer)) return null;
  return new Blob([buffer], { type: 'video/mp4' });
}

/* Puts a canvas that is not in the page into it, out of sight, so the recording sees it drawn like
   the in-page canvas of the Task 1 spike. Returns an undo function, or null when nothing was moved. */
function attachHidden(canvas) {
  if (canvas.isConnected !== false || typeof document === 'undefined' || !document.body) return null;
  const css = canvas.style.cssText;
  const hadHidden = canvas.hasAttribute('aria-hidden');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.position = 'fixed';
  canvas.style.left = '-99999px';
  canvas.style.top = '0';
  canvas.style.pointerEvents = 'none';
  document.body.appendChild(canvas);
  return function () {
    canvas.remove();
    canvas.style.cssText = css;
    if (!hadHidden) canvas.removeAttribute('aria-hidden');
  };
}

/* Real time recording of the canvas for DURATION seconds. Resolves an MP4 blob, or null.
   Rejects when a frame throws (a stale export), so the recording stops at once. */
async function viaRecorder(canvas, drawFrame, report) {
  const type = pickRecorderType();
  if (!type || typeof canvas.captureStream !== 'function') return null;
  const detach = attachHidden(canvas);
  let stream = null;
  let deadline;
  let over = false;
  try {
    drawFrame(0);
    stream = canvas.captureStream(FPS);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: BITRATE });
    if (rec.mimeType && rec.mimeType.toLowerCase().indexOf('video/mp4') !== 0) return null;
    const chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(function (resolve, reject) {
      rec.onstop = resolve;
      rec.onerror = function () { reject(new Error('MediaRecorder failed.')); };
    });
    stopped.catch(function () {});
    const late = new Promise(function (_, reject) {
      deadline = setTimeout(function () { reject(new Error('Recording took too long.')); },
        DURATION * 1000 + RECORDER_SLACK_MS);
    });
    late.catch(function () {});
    rec.start(1000);
    const played = new Promise(function (resolve, reject) {
      let start = null;
      function tick(ts) {
        if (over) return;
        if (start === null) start = ts;
        const elapsed = (ts - start) / 1000;
        if (elapsed >= DURATION) { resolve(); return; }
        try {
          drawFrame(elapsed);
        } catch (e) {
          reject(e);
          return;
        }
        report(elapsed / DURATION);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    played.catch(function () {});
    try {
      await Promise.race([played, late]);
    } finally {
      over = true;
      if (rec.state !== 'inactive') rec.stop();
    }
    await Promise.race([stopped, late]);
    if (!chunks.length) return null;
    const blob = new Blob(chunks, { type: 'video/mp4' });
    if (!(blob.size > 0)) return null;
    if (!isMp4(await blob.slice(0, 16).arrayBuffer())) return null;
    return blob;
  } finally {
    over = true;
    clearTimeout(deadline);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    if (detach) detach();
  }
}

/**
 * Exports the story as an MP4. drawFrame(t) draws the story at time t (seconds) onto canvas.
 * onProgress gets 0..1 (it starts again from 0 if the first path fails and the second runs).
 * Resolves { blob, path } with path 'webcodecs' or 'recorder', or null when neither gives an MP4.
 */
export async function exportVideo(canvas, drawFrame, onProgress) {
  const report = reporter(onProgress);
  const codec = await pickAvc(canvas.width || WIDTH, canvas.height || HEIGHT);
  if (codec) {
    try {
      const blob = await viaWebCodecs(canvas, drawFrame, report, codec);
      if (blob) { report(1); return { blob, path: 'webcodecs' }; }
    } catch (e) {
      /* fall through to MediaRecorder; the warning helps when a phone test fails */
      console.warn('story export: webcodecs failed', e);
    }
  }
  if (!pickRecorderType()) return null;
  report(0);
  try {
    const blob = await viaRecorder(canvas, drawFrame, report);
    if (blob) { report(1); return { blob, path: 'recorder' }; }
  } catch (e) {
    /* no MP4 from either path */
    console.warn('story export: recorder failed', e);
  }
  return null;
}

/** 'weekly150-run-2026-10-07.png' for a session on 2026-10-07 and ext 'png'. */
export function storyFileName(session, ext) {
  const date = session && /^\d{4}-\d{2}-\d{2}$/.test(session.date) ? '-' + session.date : '';
  return 'weekly150-run' + date + '.' + ext;
}

/** True when the browser can share this file through the system share sheet. */
export function canShareFile(file) {
  const nav = globalThis.navigator;
  if (!nav || typeof nav.canShare !== 'function' || typeof nav.share !== 'function') return false;
  try {
    return !!nav.canShare({ files: [file] });
  } catch (e) {
    return false;
  }
}

/**
 * Opens the share sheet with the file. Call it directly from a click handler: nothing is awaited
 * before navigator.share, so the tap still counts as the user's gesture. Rejects as navigator.share
 * does (an AbortError when the person closes the sheet).
 */
export function shareFile(file) {
  return navigator.share({ files: [file] });
}

/** Saves the blob under the name through a temporary <a download>; the URL is revoked later. */
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, REVOKE_MS);
}
