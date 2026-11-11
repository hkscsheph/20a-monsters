/* ============================================================
   Camera — webcam feed + optional MediaPipe hand tracking.
   Everything runs locally in the browser; no frames are uploaded.
   ============================================================ */

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let visionPromise = null;
function loadVision() {
  if (!visionPromise) {
    visionPromise = import(/* @vite-ignore */ `${CDN}/vision_bundle.mjs`)
      .then(async (mod) => {
        const fileset = await mod.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
        return { mod, fileset };
      })
      .catch((err) => {
        visionPromise = null; // allow a retry on the next attempt
        throw err;
      });
  }
  return visionPromise;
}

export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.on = false;

    this.landmarker = null;
    this.handsOn = false;
    this.handsLoading = false;
    this.hands = [];
    this.lastVideoTime = -1;
    this.lastStamp = 0;
    this._smooth = new Map();
  }

  async start() {
    if (this.on) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw Object.assign(new Error('Camera API unavailable'), { code: 'unsupported' });
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    this.video.srcObject = this.stream;
    this.video.muted = true;
    try {
      await this.video.play();
    } catch (err) {
      /* autoplay can fail on some browsers; the stream still renders once allowed */
    }
    this.on = true;
  }

  stop() {
    this.handsOn = false;
    this.hands = [];
    this._smooth.clear();
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
    this.on = false;
  }

  async enableHands() {
    if (!this.on) throw Object.assign(new Error('Camera is off'), { code: 'no-camera' });
    if (this.landmarker) {
      this.handsOn = true;
      return;
    }
    if (this.handsLoading) return;
    this.handsLoading = true;
    try {
      const { mod, fileset } = await loadVision();
      const create = (delegate) =>
        mod.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

      try {
        this.landmarker = await create('GPU');
      } catch (gpuErr) {
        this.landmarker = await create('CPU');
      }
      this.handsOn = true;
    } finally {
      this.handsLoading = false;
    }
  }

  disableHands() {
    this.handsOn = false;
    this.hands = [];
    this._smooth.clear();
  }

  /* Map a normalised, mirrored landmark to stage pixels (object-fit: cover). */
  toStage(nx, ny, stageW, stageH) {
    const vw = this.video.videoWidth || 16;
    const vh = this.video.videoHeight || 9;
    const scale = Math.max(stageW / vw, stageH / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const ox = (stageW - dw) / 2;
    const oy = (stageH - dh) / 2;
    return { x: ox + (1 - nx) * dw, y: oy + ny * dh };
  }

  update(stamp, stageW, stageH) {
    if (!this.handsOn || !this.landmarker || !this.video.videoWidth) return this.hands;
    if (this.video.currentTime === this.lastVideoTime) return this.hands;
    this.lastVideoTime = this.video.currentTime;

    let ts = stamp;
    if (ts <= this.lastStamp) ts = this.lastStamp + 1;
    this.lastStamp = ts;

    let result = null;
    try {
      result = this.landmarker.detectForVideo(this.video, ts);
    } catch (err) {
      return this.hands;
    }
    if (!result) return this.hands;

    const out = [];
    const seen = new Set();
    const landmarks = result.landmarks || [];

    for (let i = 0; i < landmarks.length; i += 1) {
      const lm = landmarks[i];
      if (!lm || lm.length < 21) continue;

      const label = result.handednesses?.[i]?.[0]?.categoryName || `hand${i}`;
      const id = `${label}-${i}`;
      seen.add(id);

      // palm centre
      const palm = lm[9];
      const p = this.toStage(palm.x, palm.y, stageW, stageH);

      // scale-invariant pinch: thumb tip (4) to index tip (8), normalised by palm size
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
      const palmSize = Math.max(0.001, dist(lm[0], lm[9]));
      const pinchRatio = dist(lm[4], lm[8]) / palmSize;

      const prev = this._smooth.get(id);
      const k = 0.55;
      const x = prev ? prev.x + (p.x - prev.x) * k : p.x;
      const y = prev ? prev.y + (p.y - prev.y) * k : p.y;
      const vx = prev ? (x - prev.x) * 60 : 0;
      const vy = prev ? (y - prev.y) * 60 : 0;
      this._smooth.set(id, { x, y });

      out.push({
        id,
        x,
        y,
        vx,
        vy,
        pinch: pinchRatio < 0.55,
        pinchRatio,
        label,
      });
    }

    for (const key of [...this._smooth.keys()]) {
      if (!seen.has(key)) this._smooth.delete(key);
    }

    this.hands = out;
    return out;
  }
}
