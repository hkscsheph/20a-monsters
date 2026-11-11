/* ============================================================
   Puppet — the physics body every monster hangs from.
   The grip point (x, y) is where you hold it; the body lags behind
   and swings, which is what makes it read as a puppet. Rendering
   lives in buildVisual()/render(), so a rigged monster and a plain
   picture share the same feel.
   ============================================================ */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

export class Puppet {
  constructor(opts) {
    const { id, name, src, image, aspect, height, grip = 0.12, nx = 0.5, ny = 0.5 } = opts;
    this.rig = opts.rig || null;
    this.id = id;
    this.name = name;
    this.src = src;
    this.image = image || null;
    this.aspect = aspect;      // art width / height
    this.baseH = height;       // desired on-screen height, px
    this.grip = grip;          // grip point, fraction of height from the top
    this.nx = nx;              // current position, normalised
    this.ny = ny;
    this.homeNx = nx;          // where a reset puts it back
    this.homeNy = ny;

    // grip position (px)
    this.x = 0;
    this.y = 0;
    // lagged body position (px) — what actually gets drawn
    this.lx = 0;
    this.ly = 0;
    this.lvx = 0;
    this.lvy = 0;

    this.rot = 0;          // swing angle, degrees
    this.spinAngle = 0;    // extra rotation from a fling / double tap
    this.spinVel = 0;

    this.scale = 1;         // drawn scale (eased toward scaleTarget)
    this.scaleTarget = 1;
    this.calm = 1;          // 1 when idling, 0 while held — fades the idle bob
    this.glide = null;      // eased move toward a target point
    this.drive = null;      // follow-mode direction from a person on camera
    this.placed = false;    // has the puppet been positioned once?
    this.revealAt = 0;      // timestamp for the fade-in after a jump
    this.phase = Math.random() * TAU;
    this.grabbed = false;
    this.gx = 0;           // grab offset, px
    this.gy = 0;
    this.pvx = 0;          // last movement, px/frame
    this.pvy = 0;

    this.w = 1;
    this.h = 1;
    this.mask = null;
    this.maskW = 0;
    this.maskH = 0;

    const root = document.createElement('div');
    root.className = 'puppet';
    root.dataset.name = name;
    root.style.opacity = '0';
    root.style.transition = 'opacity .6s ease';
    this.el = root;

    this.buildVisual();
    this.buildMask();
  }

  /* ---- what hangs in the air ---- */
  buildVisual() {
    const layer = (cls) => {
      const img = document.createElement('img');
      img.className = cls;
      img.src = this.src;
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      return img;
    };
    this.haloEl = layer('l-halo');
    this.shadowEl = layer('l-shadow');
    this.colorEl = layer('l-color');
    this.el.append(this.haloEl, this.shadowEl, this.colorEl);
    this.shadowEl.addEventListener('load', () => { this.el.style.opacity = '1'; }, { once: true });
  }

  /* ---- alpha mask, so you can only grab the monster itself ---- */
  buildMask() {
    const img = this.image || document.createElement('img');
    const draw = () => {
      const H = 200;
      const W = Math.max(1, Math.round((H * img.naturalWidth) / img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      try {
        ctx.drawImage(img, 0, 0, W, H);
        this.mask = ctx.getImageData(0, 0, W, H).data;
        this.maskW = W;
        this.maskH = H;
      } catch (err) {
        this.mask = null; // tainted canvas — fall back to bounding box
      }
    };
    if (this.image && this.image.naturalWidth) draw();
    else img.addEventListener('load', draw, { once: true });
    if (!this.image) img.src = this.src;
  }

  /* ---- sizing / home position ---- */
  layout(stageW, stageH, baseH, snap = false) {
    this.h = Math.max(60, baseH);
    this.w = this.h * this.aspect;
    this.el.style.width = `${this.w}px`;
    this.el.style.height = `${this.h}px`;
    this.el.style.transformOrigin = `${this.w / 2}px ${this.h * this.grip}px`;

    const tx = this.nx * stageW;
    const ty = this.ny * stageH;

    if (snap || !this.placed) {
      this.placed = true;
      this.glide = null;
      this.x = tx;
      this.y = ty;
      this.lx = tx;
      this.ly = ty;
      this.lvx = 0;
      this.lvy = 0;
    } else {
      // a resize (or a phone's address bar sliding away) shouldn't teleport
      this.glideTo(tx, ty, 320);
      this.lvx *= 0.4;
      this.lvy *= 0.4;
    }
    this.onLayout();
  }

  /** Direction from the follow-mode choreographer (see follow.js). */
  setDrive(drive) {
    this.drive = drive;
  }

  /** Ease the grip toward a point instead of snapping to it. */
  glideTo(x, y, ms = 420) {
    this.glide = { fx: this.x, fy: this.y, tx: x, ty: y, t: 0, dur: Math.max(0.05, ms / 1000) };
  }

  /** Fade in over the next frame — used after a teleport nobody should see. */
  reveal(ms = 520) {
    this.el.style.opacity = '0';
    this.revealAt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 60;
    this.revealMs = ms;
  }

  /* hook for subclasses (canvas sizing) */
  onLayout() {}

  /** Rough centre of the creature's body — nicer target for hand grabs than the grip. */
  get bodyX() { return this.lx; }
  get bodyY() { return this.ly + this.h * 0.42; }

  get homeX() { return this.homeNx * window.innerWidth; }
  get homeY() { return this.homeNy * window.innerHeight; }

  toFront() {
    const parent = this.el.parentNode;
    if (parent && parent.lastElementChild !== this.el) parent.appendChild(this.el);
  }

  /* ---- interaction ---- */
  grab(px, py) {
    this.grabbed = true;
    this.glide = null;
    this.gx = this.x - px;
    this.gy = this.y - py;
    this.pvx = 0;
    this.pvy = 0;
    this.el.classList.add('held');
  }

  moveTo(px, py) {
    const nx = px + this.gx;
    const ny = py + this.gy;
    this.pvx = nx - this.x;
    this.pvy = ny - this.y;
    this.x = nx;
    this.y = ny;
    this.nx = clamp(nx / window.innerWidth, -0.1, 1.1);
    this.ny = clamp(ny / window.innerHeight, -0.1, 1.1);
  }

  release(vx = 0, vy = 0) {
    if (!this.grabbed) return;
    this.grabbed = false;
    this.el.classList.remove('held');
    // throw the lag point, so the body swings after the hand stops — gently,
    // because a hard velocity kick reads as a teleport. The total is capped so
    // a violent flick can never whip the body further than it can follow.
    const kickX = clamp(this.pvx * 1.8, -520, 520) + clamp(vx * 0.25, -260, 260);
    const kickY = clamp(this.pvy * 1.8, -520, 520) + clamp(vy * 0.25, -260, 260);
    this.lvx = clamp(this.lvx * 0.6 + kickX, -1000, 1000);
    this.lvy = clamp(this.lvy * 0.6 + kickY, -1000, 1000);
    this.pvx = 0;
    this.pvy = 0;
  }

  spin(power = 20) {
    this.spinVel = power;
  }

  /** Drop in from above the stage and swing on the strings. */
  dropIn() {
    this.glide = null;
    this.reveal(560);
    this.lx = this.x;
    this.ly = this.y - Math.min(560, window.innerHeight * 0.8);
    this.lvx = 0;
    this.lvy = 0;
    this.calm = 1;
    this.rot = -8 + Math.random() * 16;
    this.spinAngle = 0;
    this.spinVel = 0;
  }

  goHome() {
    this.nx = this.homeNx;
    this.ny = this.homeNy;
    this.scaleTarget = 1;
    this.spinVel = 0;          // keep the angle: the settle eases it upright
    this.lvx *= 0.3;
    this.lvy *= 0.3;
    this.glideTo(this.homeX, this.homeY, 520);
  }

  /* ---- physics ---- */
  update(dt, time, stageW, stageH) {
    // eased moves (reset, resize, re-layout)
    if (this.glide) {
      const g = this.glide;
      g.t += dt;
      const u = Math.min(1, g.t / g.dur);
      const e = 1 - Math.pow(1 - u, 2.2);
      this.x = g.fx + (g.tx - g.fx) * e;
      this.y = g.fy + (g.ty - g.fy) * e;
      this.nx = clamp(this.x / window.innerWidth, -0.1, 1.1);
      this.ny = clamp(this.y / window.innerHeight, -0.1, 1.1);
      if (u >= 1) this.glide = null;
    }

    // follow mode: drift toward the person's position. A monster you are
    // holding (or one that is gliding home) ignores the direction.
    if (this.drive && this.drive.active && !this.grabbed && !this.glide) {
      const kf = Math.min(1, dt * 9);
      this.x += (this.drive.tx - this.x) * kf;
      this.y += (this.drive.ty - this.y) * kf;
      this.nx = clamp(this.x / window.innerWidth, -0.1, 1.1);
      this.ny = clamp(this.y / window.innerHeight, -0.1, 1.1);
    }

    // the idle bob fades out when you grab, instead of snapping off
    this.calm += ((this.grabbed ? 0 : 1) - this.calm) * Math.min(1, dt * 5);
    this.scale += (this.scaleTarget - this.scale) * Math.min(1, dt * 11);

    // critically-ish damped spring: body chases the grip, overshoots a touch
    const k = 165;
    const damp = 14;
    const ax = (this.x - this.lx) * k - this.lvx * damp;
    const ay = (this.y - this.ly) * k - this.lvy * damp;

    this.lvx += ax * dt;
    this.lvy += ay * dt;
    this.lx += this.lvx * dt;
    this.ly += this.lvy * dt;

    // keep a runaway puppet from leaving the world
    const pad = this.h * 0.6;
    if (this.lx < -pad) { this.lx = -pad; this.lvx *= -0.4; }
    if (this.lx > stageW + pad) { this.lx = stageW + pad; this.lvx *= -0.4; }
    if (this.ly < -pad) { this.ly = -pad; this.lvy *= -0.4; }
    if (this.ly > stageH + pad) { this.ly = stageH + pad; this.lvy *= -0.4; }

    // the body hangs behind the grip, so lateral lag becomes tilt
    const devX = this.lx - this.x;
    const devY = this.ly - this.y;
    const sway = Math.sin(time * 0.0011 + this.phase) * (this.grabbed ? 1.5 : 3.6);
    const target = clamp(devX * 0.3 + devY * 0.05, -32, 32) + sway;
    this.rot += (target - this.rot) * Math.min(1, dt * 13);

    // spin from a fling / double tap: keep turning, then settle on a whole turn
    this.spinVel *= Math.exp(-1.9 * dt);
    this.spinAngle += this.spinVel * dt;
    if (Math.abs(this.spinVel) < 0.6) {
      const nearest = Math.round(this.spinAngle / TAU) * TAU;
      this.spinAngle += (nearest - this.spinAngle) * Math.min(1, dt * 5);
    }
  }

  /* ---- drawing ---- */
  applyReveal(time) {
    if (this.revealAt && time >= this.revealAt) {
      this.revealAt = 0;
      this.el.style.transition = `opacity ${(this.revealMs || 520)}ms ease`;
      this.el.style.opacity = '1';
    }
  }

  applyTransform(px, py, deg) {
    const w = this.w;
    const gy = this.h * this.grip;
    this.el.style.transform =
      `translate3d(${(px - w / 2).toFixed(2)}px, ${(py - gy).toFixed(2)}px, 0)` +
      ` rotate(${deg.toFixed(2)}deg) scale(${this.scale.toFixed(3)})`;
  }

  render(time) {
    this.applyReveal(time);
    const calm = this.calm;
    const bobX = Math.sin(time * 0.00085 + this.phase) * 5 * calm;
    const bobY = Math.cos(time * 0.00125 + this.phase * 1.7) * 7 * calm;
    const tiltDeg = this.drive && this.drive.active ? this.drive.tilt * 34 : 0;
    const deg = this.rot + tiltDeg + (this.spinAngle * 180) / Math.PI;
    this.applyTransform(this.lx + bobX, this.ly + bobY, deg);
  }

  /* ---- hit test in real pixels, ignoring transparent areas ---- */
  hitTest(px, py, slack = 0) {
    const w = this.w;
    const h = this.h;
    const gy = h * this.grip;

    const dx = px - this.lx;
    const dy = py - this.ly;
    const th = (this.rot * Math.PI) / 180;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    const s = this.scale || 1;

    // undo translate, rotate, scale → local element coordinates
    const ux = (dx * cos + dy * sin) / s;
    const uy = (-dx * sin + dy * cos) / s;

    const localX = w / 2 + ux;
    const localY = gy + uy;
    if (localX < -slack || localX > w + slack || localY < -slack || localY > h + slack) return false;
    if (!this.mask) return true;

    const mx = (localX / w) * this.maskW;
    const my = (localY / h) * this.maskH;
    const check = (sx, sy) => {
      const ix = Math.round(sx);
      const iy = Math.round(sy);
      if (ix < 0 || iy < 0 || ix >= this.maskW || iy >= this.maskH) return false;
      return this.mask[(iy * this.maskW + ix) * 4 + 3] > 40;
    };

    // a little forgiveness, so thin fingers on thin limbs still work
    const r = Math.max(2, slack * 0.5);
    return (
      check(mx, my) ||
      check(mx + r, my) || check(mx - r, my) ||
      check(mx, my + r) || check(mx, my - r) ||
      check(mx + r, my + r) || check(mx - r, my - r) ||
      check(mx + r, my - r) || check(mx - r, my + r)
    );
  }
}
