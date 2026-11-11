/* ============================================================
   Monster Shadow Theatre
   Four drawn monsters that behave like shadow puppets on strings,
   hanging in front of your webcam image.
   ============================================================ */

import { Puppet } from './puppet.js';
import { Camera } from './camera.js';
import { Sfx } from './audio.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const MONSTERS = [
  { id: 'grasp',  name: 'Grasp',  src: 'assets/monster1.png', grip: 0.11, size: 1.04, nx: 0.17, ny: 0.47 },
  { id: 'grin',   name: 'Grin',   src: 'assets/monster2.png', grip: 0.10, size: 1.0,  nx: 0.39, ny: 0.43 },
  { id: 'waver',  name: 'Waver',  src: 'assets/monster3.png', grip: 0.13, size: 0.94, nx: 0.62, ny: 0.46 },
  { id: 'drowse', name: 'Drowse', src: 'assets/monster4.png', grip: 0.16, size: 0.9,  nx: 0.84, ny: 0.50 },
];

const stage     = document.getElementById('stage');
const layer     = document.getElementById('puppets');
const video     = document.getElementById('cam');
const rig       = document.getElementById('rig');
const stringsEl = document.getElementById('strings');
const handsEl   = document.getElementById('handmarks');
const toastEl   = document.getElementById('toast');
const hintEl    = document.getElementById('hint');
const introEl   = document.getElementById('intro');

const camera = new Camera(video);
const sfx = new Sfx();

const state = {
  w: window.innerWidth,
  h: window.innerHeight,
  puppets: [],
  pointer: null,                 // { id, puppet, lastX, lastY, moved }
  handGrabs: new Map(),          // hand id → puppet
  active: null,                  // puppet with visible strings
  mode: 'shadow',
  started: false,
  lastT: 0,
};

/* ---------------------------------------------------------------- utils */

function toast(message, ms = 3600) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function baseHeight() {
  const portrait = state.h > state.w;
  const limit = portrait ? state.w * 0.56 : state.w * 0.52;
  return Math.max(130, Math.min(state.h * 0.42, limit, 470));
}

/* ------------------------------------------------------------ puppets */

async function buildPuppets() {
  const metas = await Promise.all(
    MONSTERS.map(async (m) => {
      const img = await loadImage(m.src);
      return { ...m, aspect: img.naturalWidth / img.naturalHeight };
    }),
  );

  state.puppets = metas.map((m) => {
    const p = new Puppet({
      id: m.id,
      name: m.name,
      src: m.src,
      aspect: m.aspect,
      height: baseHeight() * m.size,
      grip: m.grip,
      nx: m.nx,
      ny: m.ny,
    });
    p.size = m.size;
    layer.appendChild(p.el);
    return p;
  });

  // Tall screens have room below: settle the troupe a little lower.
  if (state.h > state.w) {
    for (const p of state.puppets) {
      p.homeNy = Math.min(0.78, p.homeNy + 0.07);
      p.ny = p.homeNy;
    }
  }

  layoutPuppets();
}

function layoutPuppets() {
  state.w = window.innerWidth;
  state.h = window.innerHeight;
  const base = baseHeight();
  for (const p of state.puppets) p.layout(state.w, state.h, base * p.size);
}

function pick(px, py, slack = 10) {
  for (let i = state.puppets.length - 1; i >= 0; i -= 1) {
    if (state.puppets[i].hitTest(px, py, slack)) return state.puppets[i];
  }
  return null;
}

function bringToFront(puppet) {
  const i = state.puppets.indexOf(puppet);
  if (i >= 0 && i !== state.puppets.length - 1) {
    state.puppets.splice(i, 1);
    state.puppets.push(puppet);
  }
  puppet.toFront();
}

/* ------------------------------------------------------------- pointer */

function onPointerDown(e) {
  if (!state.started) return;
  if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;

  const p = pick(e.clientX, e.clientY, 14);
  if (!p) return;

  e.preventDefault();
  // if a tracked hand is holding it, let the pointer take over
  for (const [handId, held] of [...state.handGrabs]) {
    if (held === p) {
      held.release();
      state.handGrabs.delete(handId);
    }
  }
  bringToFront(p);
  p.grab(e.clientX, e.clientY);
  state.pointer = { id: e.pointerId, puppet: p };
  state.active = p;
  stage.classList.add('grabbing');
  sfx.whoosh();
}

function onPointerMove(e) {
  if (!state.started) return;

  if (state.pointer && state.pointer.id === e.pointerId) {
    state.pointer.puppet.moveTo(e.clientX, e.clientY);
    return;
  }
  if (e.pointerType === 'touch') return;

  const over = pick(e.clientX, e.clientY, 8);
  stage.classList.toggle('grabbable', Boolean(over));
  if (over) state.active = over;
}

function onPointerUp(e) {
  if (!state.pointer || state.pointer.id !== e.pointerId) return;
  const p = state.pointer.puppet;
  p.release();
  state.pointer = null;
  if (state.active === p) state.active = null;
  stage.classList.remove('grabbing');
  sfx.pluck(240 + Math.random() * 120);
}

function onPointerLeave() {
  stage.classList.remove('grabbable');
}

function onWheel(e) {
  if (!state.started) return;
  const p = pick(e.clientX, e.clientY, 8);
  if (!p) return;
  e.preventDefault();
  p.scale = clamp(p.scale * (e.deltaY > 0 ? 0.94 : 1.06), 0.45, 2.4);
  state.active = p;
}

function onDoubleClick(e) {
  if (!state.started) return;
  const p = pick(e.clientX, e.clientY, 12);
  if (!p) return;
  bringToFront(p);
  p.spin(18 + Math.random() * 8);
  sfx.spin();
}

/* --------------------------------------------------------------- hands */

function syncHands(dt) {
  const seen = new Set();
  const hands = camera.handsOn ? camera.hands : [];

  for (const hand of hands) {
    seen.add(hand.id);
    const grabbed = state.handGrabs.get(hand.id);

    if (hand.pinch) {
      if (grabbed) {
        grabbed.moveTo(hand.x, hand.y);
      } else if (!state.pointer) {
        let best = null;
        let bestDist = 190;
        for (const p of state.puppets) {
          const d = Math.hypot(p.bodyX - hand.x, p.bodyY - hand.y);
          if (d < bestDist) { bestDist = d; best = p; }
        }
        if (best) {
          bringToFront(best);
          best.grab(hand.x, hand.y);
          state.handGrabs.set(hand.id, best);
          state.active = best;
          sfx.whoosh();
        }
      }
    } else if (grabbed) {
      grabbed.release();
      state.handGrabs.delete(hand.id);
      sfx.pluck(200 + Math.random() * 90);
    }
  }

  for (const [id, p] of [...state.handGrabs]) {
    if (!seen.has(id)) {
      p.release();
      state.handGrabs.delete(id);
      if (state.active === p) state.active = null;
    }
  }
}

/* ----------------------------------------------------------------- rig */

function buildRig() {
  for (let i = 0; i < 2; i += 1) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 0);
    line.setAttribute('y1', 0);
    line.setAttribute('x2', 0);
    line.setAttribute('y2', 0);
    stringsEl.appendChild(line);
  }
  for (let i = 0; i < 2; i += 1) {
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('r', 26);
    ring.setAttribute('cx', -99);
    ring.setAttribute('cy', -99);
    const core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    core.setAttribute('r', 3.5);
    core.setAttribute('class', 'core');
    core.setAttribute('cx', -99);
    core.setAttribute('cy', -99);
    handsEl.append(ring, core);
  }
}

function updateRig() {
  const lines = stringsEl.children;
  const p = state.active;

  if (p && (p.grabbed || stage.classList.contains('grabbable'))) {
    const gx = p.lx;
    const gy = p.ly;
    const spread = Math.max(70, p.w * 0.5);
    const anchors = [
      [gx - spread, -60],
      [gx + spread * 1.15, -60],
    ];
    for (let i = 0; i < 2; i += 1) {
      const line = lines[i];
      line.setAttribute('x1', anchors[i][0].toFixed(1));
      line.setAttribute('y1', anchors[i][1]);
      line.setAttribute('x2', gx.toFixed(1));
      line.setAttribute('y2', gy.toFixed(1));
      line.classList.add('on');
    }
  } else {
    for (const line of lines) line.classList.remove('on');
  }

  const circles = handsEl.children;
  const hands = camera.handsOn ? camera.hands : [];
  for (let i = 0; i < 2; i += 1) {
    const ring = circles[i * 2];
    const core = circles[i * 2 + 1];
    const hand = hands[i];
    if (hand) {
      ring.setAttribute('cx', hand.x.toFixed(1));
      ring.setAttribute('cy', hand.y.toFixed(1));
      ring.setAttribute('r', hand.pinch ? 18 : 28);
      ring.classList.add('on');
      core.setAttribute('cx', hand.x.toFixed(1));
      core.setAttribute('cy', hand.y.toFixed(1));
      core.classList.add('on');
    } else {
      ring.classList.remove('on');
      core.classList.remove('on');
    }
  }
}

/* ---------------------------------------------------------------- loop */

function frame(t) {
  const elapsed = state.lastT ? t - state.lastT : 16.7;
  state.lastT = t;
  const dt = clamp(elapsed / 1000, 0.001, 1 / 30);

  if (camera.handsOn) camera.update(t, state.w, state.h);
  syncHands(dt);

  for (const p of state.puppets) {
    p.update(dt, t, state.w, state.h);
    p.render(t);
  }
  updateRig();

  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ ui */

const btnCam = document.getElementById('btnCam');
const btnLight = document.getElementById('btnLight');
const btnLightLabel = document.getElementById('btnLightLabel');
const btnHands = document.getElementById('btnHands');
const btnSound = document.getElementById('btnSound');
const btnSoundLabel = document.getElementById('btnSoundLabel');
const btnReset = document.getElementById('btnReset');
const statusCam = document.getElementById('statusCam');
const statusHands = document.getElementById('statusHands');

function setPressed(btn, on) {
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function syncUI() {
  setPressed(btnCam, camera.on);
  setPressed(btnLight, state.mode === 'spirit');
  setPressed(btnHands, camera.handsOn);
  setPressed(btnSound, sfx.enabled);
  btnLightLabel.textContent = state.mode === 'spirit' ? 'Spirit' : 'Shadow';
  btnSoundLabel.textContent = sfx.enabled ? 'Sound on' : 'Sound off';
  statusCam.textContent = camera.on ? 'camera live' : 'camera off';
  statusCam.classList.toggle('on', camera.on);
  statusHands.textContent = camera.handsOn
    ? 'hands live'
    : camera.handsLoading
      ? 'hands loading'
      : 'hands off';
  statusHands.classList.toggle('on', camera.handsOn);
}

async function enableCamera() {
  btnCam.classList.add('busy');
  try {
    await camera.start();
    stage.classList.remove('no-cam');
  } catch ( err ) {
    stage.classList.add('no-cam');
    toast(
      err && err.code === 'unsupported'
        ? 'This browser has no camera access. You can still drag the monsters.'
        : 'Camera blocked. Allow it in your browser, or just drag the monsters.',
    );
  } finally {
    btnCam.classList.remove('busy');
    syncUI();
  }
}

function disableCamera() {
  camera.stop();
  stage.classList.add('no-cam');
  syncUI();
  toast('Camera off.');
}

async function toggleHands() {
  if (camera.handsOn) {
    camera.disableHands();
    syncUI();
    toast('Hand tracking off.');
    return;
  }
  if (!camera.on) {
    toast('Turn the camera on first, then hands can grab the monsters.');
    return;
  }
  btnHands.classList.add('busy');
  syncUI();
  try {
    await camera.enableHands();
    toast('Hold a hand up and pinch to grab a monster.', 4500);
  } catch (err) {
    camera.disableHands();
    toast('Hand tracking needs an internet connection the first time. Dragging still works.', 5200);
  } finally {
    btnHands.classList.remove('busy');
    syncUI();
  }
}

function toggleLight() {
  state.mode = state.mode === 'shadow' ? 'spirit' : 'shadow';
  stage.classList.toggle('spirit', state.mode === 'spirit');
  syncUI();
}

function resetStage() {
  for (const p of state.puppets) {
    p.release();
    p.goHome();
    p.scale = 1;
  }
  state.handGrabs.clear();
  state.pointer = null;
  sfx.whoosh();
  toast('Stage reset.');
}

function toggleSound() {
  sfx.toggle();
  syncUI();
}

/* -------------------------------------------------------------- wiring */

function wire() {
  buildRig();

  stage.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('pointerleave', onPointerLeave);
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('dblclick', onDoubleClick);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  btnCam.addEventListener('click', () => (camera.on ? disableCamera() : enableCamera()));
  btnLight.addEventListener('click', toggleLight);
  btnHands.addEventListener('click', toggleHands);
  btnSound.addEventListener('click', toggleSound);
  btnReset.addEventListener('click', resetStage);

  document.getElementById('btnStart').addEventListener('click', async (e) => {
    e.currentTarget.blur();
    hideIntro();
    await enableCamera();
    if (camera.on) toast('Camera live. Grab a monster.', 3000);
  });
  document.getElementById('btnStartNoCam').addEventListener('click', (e) => {
    e.currentTarget.blur();
    hideIntro();
    toast('No camera — the monsters are all yours.', 3000);
  });

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'c') camera.on ? disableCamera() : enableCamera();
    else if (k === 'h') toggleHands();
    else if (k === 's') toggleLight();
    else if (k === 'm') toggleSound();
    else if (k === 'r') resetStage();
    else if (k === 'escape') hideIntro();
  });

  window.addEventListener('resize', () => {
    layoutPuppets();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) state.lastT = 0;
  });

  window.addEventListener('beforeunload', () => camera.stop());
}

function hideIntro() {
  if (introEl.classList.contains('hide')) return;
  introEl.classList.add('hide');
  state.started = true;
  setTimeout(() => {
    introEl.setAttribute('aria-hidden', 'true');
    introEl.style.display = 'none';
  }, 700);
  hintEl.classList.add('show');
  setTimeout(() => hintEl.classList.remove('show'), 12000);

  // curtains up: the monsters drop onto their marks, one after another
  state.puppets.forEach((p, i) => {
    setTimeout(() => p.dropIn(), 380 + i * 110);
  });
}

/* ----------------------------------------------------------------- boot */

async function boot() {
  wire();
  try {
    await buildPuppets();
  } catch (err) {
    console.error(err);
    toast('Some monsters could not be loaded. Check the assets folder.');
  }
  syncUI();
  requestAnimationFrame(frame);

  // Warm up the pictures so the first grab feels instant.
  for (const p of state.puppets) p.el.getBoundingClientRect();

  // Small handle for debugging / automated checks.
  window.__theatre = { state, camera, sfx };
}

boot();
