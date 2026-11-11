/* ============================================================
   Camera — webcam feed + optional MediaPipe tracking.
   Two trackers share the same video:
     · hands — 2 hands, pinch / wave / petting (puppet mode)
     · pose  — up to 4 people, head tilt + body gestures (follow mode)
   Everything runs locally in the browser; no frames are uploaded.
   ============================================================ */

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const MAX_PEOPLE = 4;

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
    this._hist = new Map();     // hand id → recent x positions (wave detection)
    this._pinch = new Map();    // hand id → pinch hysteresis state
    this._prevHands = [];       // last frame's hands, for stable ids
    this._nextHandId = 1;

    this.landmarker = null;
    this.handsOn = false;
    this.handsLoading = false;
    this.hands = [];
    this.lastVideoTime = -1;
    this.lastStamp = 0;
    this._smooth = new Map();

    // pose / people tracking
    this.poseLandmarker = null;
    this.poseOn = false;
    this.poseLoading = false;
    this.persons = [];
    this.lastPoseTime = -1;
    this.lastPoseStamp = 0;
    this._personSmooth = new Map();
    this._prevPersons = [];
    this._nextPersonId = 1;
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
    this.poseOn = false;
    this.persons = [];
    this._personSmooth.clear();
    this._prevPersons = [];
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
          baseOptions: { modelAssetPath: HAND_MODEL, delegate },
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

  /* ---- people / pose tracking ---------------------------------- */

  async enablePose() {
    if (!this.on) throw Object.assign(new Error('Camera is off'), { code: 'no-camera' });
    if (this.poseLandmarker) {
      this.poseOn = true;
      return;
    }
    if (this.poseLoading) return;
    this.poseLoading = true;
    try {
      const { mod, fileset } = await loadVision();
      const create = (delegate) =>
        mod.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate },
          runningMode: 'VIDEO',
          numPoses: MAX_PEOPLE,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

      try {
        this.poseLandmarker = await create('GPU');
      } catch (gpuErr) {
        this.poseLandmarker = await create('CPU');
      }
      this.poseOn = true;
    } finally {
      this.poseLoading = false;
    }
  }

  disablePose() {
    this.poseOn = false;
    this.persons = [];
    this._personSmooth.clear();
    this._prevPersons = [];
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
    if (!this.video.videoWidth) return this.hands;
    if (this.poseOn && this.poseLandmarker) this.updatePose(stamp, stageW, stageH);
    if (this.handsOn && this.landmarker) this.updateHands(stamp, stageW, stageH);
    return this.hands;
  }

  /**
   * Read up to MAX_PEOPLE poses and reduce each one to the handful of numbers
   * the monsters care about: where the person is, how their head is tilted and
   * turned, which way the torso leans, and how high each arm is.
   */
  updatePose(stamp, stageW, stageH) {
    if (!this.poseLandmarker) return this.persons;
    if (this.video.currentTime === this.lastPoseTime) return this.persons;
    this.lastPoseTime = this.video.currentTime;

    let ts = stamp;
    if (ts <= this.lastPoseStamp) ts = this.lastPoseStamp + 1;
    this.lastPoseStamp = ts;

    let result = null;
    try {
      result = this.poseLandmarker.detectForVideo(this.video, ts);
    } catch (err) {
      return this.persons;
    }
    if (!result) return this.persons;

    const lists = result.landmarks || [];
    const out = [];
    const claimed = new Set();
    const seen = new Set();
    const clampf = (v, a, b) => (v < a ? a : v > b ? b : v);

    for (let i = 0; i < lists.length && out.length < MAX_PEOPLE; i += 1) {
      const lm = lists[i];
      if (!lm || lm.length < 25) continue;
      const vis = (idx) => (lm[idx] && typeof lm[idx].visibility === 'number' ? lm[idx].visibility : 1);
      // without shoulders there is nothing to drive anything from
      if (Math.min(vis(11), vis(12)) < 0.4) continue;

      const at = (idx) => this.toStage(lm[idx].x, lm[idx].y, stageW, stageH);
      const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

      const nose = at(0);
      const earL = at(7);
      const earR = at(8);
      const shL = at(11);
      const shR = at(12);
      const wrL = at(15);
      const wrR = at(16);
      const hipL = at(23);
      const hipR = at(24);
      const shoulders = mid(shL, shR);
      const hips = mid(hipL, hipR);

      const headWidth = Math.max(10, Math.hypot(earL.x - earR.x, earL.y - earR.y));
      const shoulderWidth = Math.max(20, Math.hypot(shL.x - shR.x, shL.y - shR.y));
      const torso = Math.max(50, Math.hypot(shoulders.x - hips.x, shoulders.y - hips.y));
      const headVis = Math.min(vis(7), vis(8));

      // head roll: the ear-to-ear line, taken left-to-right on screen (the
      // stage is mirrored) so a positive angle is a clockwise, rightward tilt.
      // Falls back to the shoulder line when the ears face away.
      const roll = (a, b) => {
        const [left, right] = a.x <= b.x ? [a, b] : [b, a];
        return Math.atan2(right.y - left.y, right.x - left.x);
      };
      const headTilt = headVis > 0.3 ? roll(earL, earR) : roll(shL, shR);
      // head turn: nose offset between the ears, normalised by head width
      const headYaw = headVis > 0.3 ? clampf((nose.x - (earL.x + earR.x) / 2) / headWidth, -1.2, 1.2) : 0;
      // torso lean: shoulders sideways from the hips
      const lean = clampf((shoulders.x - hips.x) / torso, -1, 1);
      // arm height: wrists above the shoulders, 0 = hanging, 1 = overhead
      const armL = clampf(((shL.y - wrL.y) / torso - 0.12) / 0.85, 0, 1);
      const armR = clampf(((shR.y - wrR.y) / torso - 0.12) / 0.85, 0, 1);
      const presence = clampf(Math.min(vis(11), vis(12)) * 1.3, 0, 1);


      // stable id: the closest person from the previous frame (landmark order
      // shuffles as people move around)
      let id = null;
      let bestD = 320;
      for (const prev of this._prevPersons) {
        if (claimed.has(prev.id)) continue;
        const d = Math.hypot(prev.x - shoulders.x, prev.y - shoulders.y);
        if (d < bestD) { bestD = d; id = prev.id; }
      }
      if (!id) id = `person-${this._nextPersonId++}`;
      claimed.add(id);
      seen.add(id);

      // the whole skeleton in stage pixels, for drawing the rig over the video
      const prevPts = this._personSmooth.get(`pts-${id}`) || null;
      const pts = prevPts || new Float32Array(66);   // reused, no per-frame garbage
      for (let k = 0; k < 33; k += 1) {
        const q = at(k);
        const lerpTo = prevPts ? prevPts[k * 2] + (q.x - prevPts[k * 2]) * 0.55 : q.x;
        const lerpY = prevPts ? prevPts[k * 2 + 1] + (q.y - prevPts[k * 2 + 1]) * 0.55 : q.y;
        pts[k * 2] = lerpTo;
        pts[k * 2 + 1] = lerpY;
      }
      this._personSmooth.set(`pts-${id}`, pts);

      // head circle: centred between the ears, or on the nose when they hide
      const headR = Math.max(8, (headVis > 0.3 ? headWidth : shoulderWidth * 0.3) * 0.5);
      const head = headVis > 0.3
        ? { x: (earL.x + earR.x) / 2, y: (earL.y + earR.y) / 2 - headWidth * 0.12, r: headR }
        : { x: nose.x, y: nose.y, r: headR };

      // smooth every channel, with small dead zones so tracking noise
      // doesn't shiver through the monsters
      const prevS = this._personSmooth.get(id);
      const k = 0.5;
      const ease = (from, to, dead = 0) =>
        (Math.abs(to - from) < dead ? from : from + (to - from) * k);
      const person = prevS
        ? {
            id,
            x: ease(prevS.x, shoulders.x, 0.8),
            y: ease(prevS.y, shoulders.y, 0.8),
            headTilt: ease(prevS.headTilt, headTilt, 0.01),
            headYaw: ease(prevS.headYaw, headYaw, 0.02),
            lean: ease(prevS.lean, lean, 0.02),
            armL: ease(prevS.armL, armL, 0.03),
            armR: ease(prevS.armR, armR, 0.03),
            presence: ease(prevS.presence, presence, 0.02),
            shoulderWidth,
            pts,
            head,
            energy: 0,
          }
        : {
            id,
            x: shoulders.x,
            y: shoulders.y,
            headTilt,
            headYaw,
            lean,
            armL,
            armR,
            presence,
            shoulderWidth,
            pts,
            head,
            energy: 0,
          };

      // movement wakes them up, and both arms overhead really wakes them up
      let energy = prevS ? prevS.energy * 0.9 : 0;
      if (prevS) {
        const moved = Math.hypot(person.x - prevS.x, person.y - prevS.y);
        energy += Math.min(0.8, moved * 0.05);
      }
      if (armL > 0.7 && armR > 0.7) energy = Math.max(energy, 0.6);
      person.energy = clampf(energy, 0, 1);

      this._personSmooth.set(id, person);
      out.push(person);
    }

    for (const key of [...this._personSmooth.keys()]) {
      if (!seen.has(key) && !seen.has(String(key).replace(/^pts-/, ''))) this._personSmooth.delete(key);
    }

    out.sort((a, b) => (a.id < b.id ? -1 : 1));
    this._prevPersons = out.map((p) => ({ id: p.id, x: p.x, y: p.y }));
    this.persons = out;
    return out;
  }

  updateHands(stamp, stageW, stageH) {
    if (!this.landmarker) return this.hands;
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
    const claimed = new Set();
    const landmarks = result.landmarks || [];

    for (let i = 0; i < landmarks.length; i += 1) {
      const lm = landmarks[i];
      if (!lm || lm.length < 21) continue;

      const label = result.handednesses?.[i]?.[0]?.categoryName || `hand${i}`;

      // palm centre
      const palm = lm[9];
      const p = this.toStage(palm.x, palm.y, stageW, stageH);

      // Landmark order can shuffle between frames, so inherit the id of the
      // closest hand from last frame. Without this, two hands swap identities
      // and whatever they are holding gets dropped and grabbed again.
      let id = null;
      let bestD = 190;
      for (const ph of this._prevHands) {
        if (claimed.has(ph.id)) continue;
        const d = Math.hypot(ph.x - p.x, ph.y - p.y);
        if (d < bestD) { bestD = d; id = ph.id; }
      }
      if (!id) id = `hand-${this._nextHandId++}`;
      claimed.add(id);
      seen.add(id);

      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
      const palmSize = Math.max(0.001, dist(lm[0], lm[9]));

      // scale-invariant pinch: thumb tip (4) to index tip (8)
      const pinchRatio = dist(lm[4], lm[8]) / palmSize;
      const wasPinching = this._pinch.get(id) || false;
      const pinching = wasPinching ? pinchRatio < 0.62 : pinchRatio < 0.5;
      this._pinch.set(id, pinching);

      // how many fingers point away from the wrist?
      let extended = 0;
      const tips = [8, 12, 16, 20];
      const mids = [6, 10, 14, 18];
      for (let f = 0; f < 4; f += 1) {
        if (dist(lm[tips[f]], lm[0]) > dist(lm[mids[f]], lm[0]) * 1.06) extended += 1;
      }
      const open = extended >= 3;

      // smoothing with a dead zone: tracking noise under ~1px is ignored
      // (it used to show up as a shiver on whatever the monster was holding)
      const prev = this._smooth.get(id);
      let x = p.x;
      let y = p.y;
      let vx = 0;
      let vy = 0;
      if (prev) {
        const dt = Math.max(0.008, (stamp - prev.t) / 1000);
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        if (Math.hypot(dx, dy) < 1.2) {
          x = prev.x;
          y = prev.y;
        } else {
          x = prev.x + dx * 0.6;
          y = prev.y + dy * 0.6;
        }
        vx = (x - prev.x) / dt;
        vy = (y - prev.y) / dt;
      }
      this._smooth.set(id, { x, y, t: stamp });

      // waving: count sideways reversals over the last second
      const hist = this._hist.get(id) || [];
      hist.push({ t: stamp, x });
      while (hist.length > 2 && stamp - hist[0].t > 900) hist.shift();
      this._hist.set(id, hist);
      let reversals = 0;
      let dir = 0;
      for (let h = 1; h < hist.length; h += 1) {
        const dx = hist[h].x - hist[h - 1].x;
        if (Math.abs(dx) < 1.2) continue;
        const d = dx > 0 ? 1 : -1;
        if (dir !== 0 && d !== dir) reversals += 1;
        dir = d;
      }
      const wave = Math.min(1, Math.max(0, (reversals - 1) / 3));

      out.push({
        id,
        x,
        y,
        vx,
        vy,
        pinch: pinching,
        pinchRatio,
        open,
        extended,
        wave,
        label,
      });
    }

    for (const key of [...this._smooth.keys()]) {
      if (!seen.has(key)) { this._smooth.delete(key); this._hist.delete(key); this._pinch.delete(key); }
    }

    this._prevHands = out.map((h) => ({ id: h.id, x: h.x, y: h.y }));
    this.hands = out;
    return out;
  }
}
