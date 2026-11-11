/* ============================================================
   RigPuppet — a monster with bones.

   Every frame it builds a pose (breathing, head tracking, arm
   reaches and waves, tail chain, blinks, jaw), the rig skins the
   mesh, and WebGL draws the warped artwork. Gestures detected by
   the camera decide what the pose should be.
   ============================================================ */

import { Puppet } from './puppet.js';
import { Rig, MeshRenderer } from './rig.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => {
  let d = a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class RigPuppet extends Puppet {
  constructor(opts) {
    const rig = new Rig(opts.image, opts.rigConfig);
    super({ ...opts, rig });
    this.char = this.rig.character || {};
    this.focus = null;
    this.wave = 0;
    this.excite = 0;
    this.blinkTimer = 1 + Math.random() * 4;
    this.blinkT = 0;
    this.blink = 0;
    this.mode = 'shadow';
    this.firstDraw = true;
    this.pet = 0;
  }

  /* ---- canvas instead of stacked pictures ---- */
  buildVisual() {
    const canvas = document.createElement('canvas');
    canvas.className = 'rig-canvas';
    this.el.appendChild(canvas);
    this.canvas = canvas;
    this.renderer = new MeshRenderer(canvas, this.image, this.rig);
  }

  get ok() {
    return Boolean(this.renderer && this.renderer.ok);
  }

  onLayout() {
    if (!this.renderer || !this.renderer.ok) return;
    const p = this.rig.pad;
    const cssW = this.w * (1 + 2 * p);
    const cssH = this.h * (1 + 2 * p);
    this.canvas.style.position = 'absolute';
    this.canvas.style.left = `${(-this.w * p).toFixed(2)}px`;
    this.canvas.style.top = `${(-this.h * p).toFixed(2)}px`;
    this.renderer.setSize(cssW, cssH, Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setMode(this.mode === 'spirit' ? 1 : 0);
  }

  setMode(mode) {
    this.mode = mode;
    if (this.renderer) this.renderer.setMode(mode === 'spirit' ? 1 : 0);
  }

  /** { focus: {x, y} | null, wave: 0..1, excite: 0..1 } in stage px */
  setContext(ctx) {
    const k = Math.min(1, (ctx.dt || 0.016) * 8);
    this.wave += ((ctx.wave || 0) - this.wave) * k;
    this.excite += ((ctx.excite || 0) - this.excite) * k;
    this.pet += ((ctx.pet || 0) - this.pet) * k;
    this.focus = ctx.focus || null;
  }

  update(dt, time, stageW, stageH) {
    super.update(dt, time, stageW, stageH);

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = 2 + Math.random() * 4.5;
      this.blinkT = 0.15;
      // the calm one blinks slowly, twice
      if (this.char.blink > 4) this.blinkT = 0.22;
    }
    if (this.blinkT > 0) {
      this.blinkT -= dt;
      const p = clamp(1 - this.blinkT / 0.15, 0, 1);
      this.blink = Math.sin(p * Math.PI);
    } else {
      this.blink *= 0.8;
    }
  }

  /* ------------------------------------------------------------ pose */

  armRaise(boneName) {
    const i = this.rig.boneIndex(boneName);
    if (i < 0) return 0;
    const b = this.rig.bones[i];
    const dx = b.bx - b.ax;
    const dy = b.by - b.ay;
    if (Math.hypot(dx, dy) < 1e-3) return 0;
    const outward = dx >= 0 ? 1 : -1;
    const rest = Math.atan2(dy, dx);
    const target = Math.atan2(-1.05, outward * 0.85);
    return clamp(wrapPi(target - rest), -0.85, 0.85);
  }

  /** Angle needed to point an arm bone at the focus, in image space. */
  armReach(boneName, focusImage) {
    const i = this.rig.boneIndex(boneName);
    if (i < 0 || !focusImage) return 0;
    const b = this.rig.bones[i];
    const rest = Math.atan2(b.by - b.ay, b.bx - b.ax);
    const want = Math.atan2(focusImage.y - b.ay, focusImage.x - b.ax);
    return clamp(wrapPi(want - rest), -1.1, 1.1);
  }

  pose(time) {
    const rig = this.rig;
    const c = this.char;
    const t = time * 0.001;
    const ph = this.phase;
    const u = rig.H / 768;                       // image-scale unit
    const idle = c.idle ?? 1;
    const speed = clamp(Math.hypot(this.lvx, this.lvy) / 1100, 0, 1);
    const lean = clamp(this.lvx * 0.00026, -0.24, 0.24);
    const sink = clamp(this.lvy * 0.00012, -0.08, 0.12);
    const excited = clamp(this.excite + this.wave * 0.6, 0, 1);
    const held = this.grabbed ? 1 : 0;

    // where to look: a hand, the cursor, or just the audience
    let yaw;
    let pitch;
    let focusImage = null;
    if (this.focus) {
      const s = this.w / rig.W || 1;
      const dx = (this.focus.x - this.lx) / s;
      const dy = (this.focus.y - this.ly) / s;
      yaw = clamp(dx / 260, -1, 1);
      pitch = clamp(dy / 300, -1, 1);
      focusImage = { x: rig.W / 2 + dx, y: rig.H * this.grip + dy };
    } else {
      yaw = Math.sin(t * 0.45 + ph) * 0.5;
      pitch = Math.sin(t * 0.29 + ph * 1.7) * 0.25;
    }

    rig.resetPose();

    // --- breath + weight shift -------------------------------------
    const breath = Math.sin(t * 1.7 + ph) * 0.014 * idle;
    const bob = Math.sin(t * 1.31 + ph) * 2.4 * u * idle;
    const attend = yaw * 0.025 + this.pet * yaw * 0.02;
    rig.set('root', lean * 0.45 - sink * 0.3 + attend * 0.5, 1 - breath * 0.5, 1 + breath, 0, bob);
    rig.set('spine', lean * 0.55 + attend + Math.sin(t * 1.05 + ph) * 0.012 * idle, 1, 1 + breath * 0.6, 0, bob * 0.4);
    rig.set('chest', lean * 0.45 + attend * 0.8 - held * 0.03, 1, 1 + breath * 0.5, 0, 0);

    // --- head: track the focus, counter the lean --------------------
    const headYaw = yaw * (c.yaw ?? 0.3);
    const headPitch = pitch * 0.16;
    rig.set('neck', headYaw * 0.15, 1, 1, 0, 0);
    rig.set('head',
      headYaw - lean * 0.85 - headPitch * 0.4 + Math.sin(t * 0.9 + ph) * 0.015 * idle,
      1 + Math.abs(headYaw) * 0.02,
      1 - Math.abs(headYaw) * 0.015,
      headYaw * 22 * u,
      -pitch * 7 * u + bob * 0.5);

    // --- eyes & jaw -------------------------------------------------
    const blink = this.blink;
    // a hand close to the face is read as petting: eyes close, head leans in
    const widen = 1 + 0.12 * excited - 0.92 * blink - 0.6 * this.pet;
    rig.set('eyeL', 0, 1 + blink * 0.12, widen, 0, 0);
    rig.set('eyeR', 0, 1 + blink * 0.12, widen, 0, 0);

    const chatterRate = 4.5 + (c.chatter ?? 0.5) * 5;
    const chatter = Math.pow(Math.max(0, Math.sin(t * chatterRate + ph)), 3) * (c.chatter ?? 0.5);
    const talk = clamp(chatter * (0.35 + excited * 0.9) + held * 0.35 + this.wave * 0.35, 0, 1.2);
    rig.set('jaw', talk * 0.16, 1 + talk * 0.05, 1 + talk * 0.1, 0, talk * 7 * u);

    // --- arms: wave back, reach for a nearby hand, flail when held ---
    const shouldReach = !held && this.wave < 0.25 && this.focus && speed < 0.6;
    for (const side of ['L', 'R']) {
      const arm = `arm${side}`;
      const fore = `fore${side}`;
      if (rig.boneIndex(arm) < 0) continue;

      const lift = this.armRaise(arm);
      const waveAmt = this.wave;
      let rot = 0;

      const sideSign = side === 'L' ? 1 : -1;
      const swing = Math.sin(t * 1.6 + ph + (side === 'L' ? 0 : 1.1)) * (c.armSway ?? 0.06) * idle;
      rot += swing + (-lean * 1.4 + speed * 0.12 * sideSign);

      if (waveAmt > 0.02) {
        rot += lift * (0.45 + 0.35 * waveAmt);
        rot += Math.sin(t * 9.5 + ph + (side === 'R' ? Math.PI : 0)) * 0.32 * waveAmt;
      }
      if (shouldReach) {
        const reach = this.armReach(arm, focusImage);
        rot += reach * 0.55;
      }
      if (held) {
        rot += Math.sin(t * 13 + ph + (side === 'L' ? 0 : 2)) * 0.22 + 0.12 * sideSign;
      }
      if (excited > 0.05 && waveAmt < 0.02) {
        rot += lift * 0.25 * excited;
      }

      rig.set(arm, rot);
      rig.set(fore, rot * 0.35 + Math.sin(t * 9.5 + ph + (side === 'R' ? Math.PI : 0)) * 0.16 * waveAmt + (held ? Math.sin(t * 15 + ph) * 0.14 : 0));
    }

    // --- legs: mostly planted, they kick when the monster is yanked ---
    const kick = (speed * 0.2 + held * 0.08) * (c.idle ?? 1);
    rig.set('thighL', -lean * 0.5 + Math.sin(t * 9 + ph) * kick, 1, 1, 0, 0);
    rig.set('thighR', -lean * 0.5 - Math.sin(t * 9 + ph) * kick, 1, 1, 0, 0);
    rig.set('shinL', Math.sin(t * 9 + ph + 0.9) * kick * 0.8, 1, 1, 0, 0);
    rig.set('shinR', -Math.sin(t * 9 + ph + 0.9) * kick * 0.8, 1, 1, 0, 0);

    // --- tail: a chain that follows the body with a lag --------------
    const tailAmp = 0.09 * idle + 0.16 * speed + 0.13 * excited;
    const ts = c.tailSpeed ?? 2;
    for (let i = 1; i <= 4; i += 1) {
      if (rig.boneIndex(`tail${i}`) < 0) continue;
      const lag = i * 0.85;
      rig.set(`tail${i}`,
        Math.sin(t * ts + ph - lag) * tailAmp * (0.65 + i * 0.16)
        - lean * 0.22 * i
        - this.lvx * 0.00006 * i);
    }
  }

  /* ----------------------------------------------------------- draw */

  render(time) {
    if (!this.renderer || !this.renderer.ok) return;

    this.pose(time);
    this.rig.solve();
    this.rig.skin();
    this.renderer.draw();

    if (this.firstDraw) {
      this.firstDraw = false;
      this.el.style.opacity = '1';
    }

    const calm = this.grabbed ? 0 : 1;
    const bobX = Math.sin(time * 0.00085 + this.phase) * 4 * calm;
    const bobY = Math.cos(time * 0.00125 + this.phase * 1.7) * 5 * calm;
    const deg = this.rot + (this.spinAngle * 180) / Math.PI;
    this.applyTransform(this.lx + bobX, this.ly + bobY, deg);
  }
}
