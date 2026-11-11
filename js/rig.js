/* ============================================================
   Rig — a 2D bone skeleton bound to a triangle mesh, deformed on
   the CPU and drawn with WebGL (the same idea Live2D uses: the
   artwork is warped by bones instead of being cut into pieces).
   ============================================================ */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------- 2D affine helpers (m = [a,b,c,d,e,f]) ---------- */

function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  if (len < 1e-6) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export class Rig {
  constructor(image, config) {
    this.image = image;
    this.W = image.naturalWidth || image.width || 1;
    this.H = image.naturalHeight || image.height || 1;
    this.config = config;
    this.pad = config.pad ?? 0.08;

    this.bones = config.bones.map((b) => ({
      name: b.name,
      parent: b.parent ? config.bones.findIndex((o) => o.name === b.parent) : -1,
      ax: b.a[0] * this.W,
      ay: b.a[1] * this.H,
      bx: b.b[0] * this.W,
      by: b.b[1] * this.H,
      r: (b.r ?? 0.06) * this.H,
      bias: b.bias ?? 1,
    }));
    this.byName = new Map(this.bones.map((b, i) => [b.name, i]));
    this.count = this.bones.length;
    this.pose = this.bones.map(() => ({ rot: 0, sx: 1, sy: 1, tx: 0, ty: 0 }));
    this.world = new Float64Array(this.count * 6);
    this.local = new Float64Array(this.count * 6);
    this.character = config.character || {};

    this.buildMesh();
    this.buildSkin();
  }

  boneIndex(name) {
    const i = this.byName.get(name);
    return i === undefined ? -1 : i;
  }

  /* ---------- mesh ---------- */

  buildMesh() {
    const { W, H } = this;
    const cols = this.config.cols ?? 34;
    const rows = this.config.rows ?? 46;
    const nx = cols + 1;
    const ny = rows + 1;
    const n = nx * ny;

    const pos = new Float32Array(n * 2);
    const uv = new Float32Array(n * 2);
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const i = y * nx + x;
        const px = (x / cols) * W;
        const py = (y / rows) * H;
        pos[i * 2] = px;
        pos[i * 2 + 1] = py;
        uv[i * 2] = px / W;
        uv[i * 2 + 1] = py / H;
      }
    }

    // low-res alpha map, used to drop empty cells
    const ah = 200;
    const aw = Math.max(1, Math.round((ah * W) / H));
    const c = document.createElement('canvas');
    c.width = aw;
    c.height = ah;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    let data = null;
    try {
      ctx.drawImage(this.image, 0, 0, aw, ah);
      data = ctx.getImageData(0, 0, aw, ah).data;
    } catch (err) {
      data = null;
    }
    const alphaAt = (px, py) => {
      if (!data) return 255;
      const ax = clamp(Math.round((px / W) * (aw - 1)), 0, aw - 1);
      const ay = clamp(Math.round((py / H) * (ah - 1)), 0, ah - 1);
      return data[(ay * aw + ax) * 4 + 3];
    };

    const idx = [];
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const x0 = (x / cols) * W;
        const x1 = ((x + 1) / cols) * W;
        const y0 = (y / rows) * H;
        const y1 = ((y + 1) / rows) * H;
        let solid = false;
        for (let sy = 0; sy <= 2 && !solid; sy += 1) {
          for (let sx = 0; sx <= 2 && !solid; sx += 1) {
            if (alphaAt(x0 + ((x1 - x0) * sx) / 2, y0 + ((y1 - y0) * sy) / 2) > 8) solid = true;
          }
        }
        if (!solid) continue;
        const a = y * nx + x;
        const b = a + 1;
        const d = a + nx;
        const e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }

    this.pos = pos;
    this.uv = uv;
    this.vertexCount = n;
    this.index = new Uint16Array(idx);
    this.positions = new Float32Array(n * 2);
  }

  /* ---------- skin weights ----------
     Bones compete by distance: a vertex is shared by the bones that are
     nearly as close to it as the closest one, so a big head bone can own
     the ears without dragging the belly. The result is then smoothed
     across the mesh, which is what keeps the skin from tearing. */

  buildSkin() {
    const n = this.vertexCount;
    const nb = this.count;
    const raw = new Float32Array(n * nb);
    const dist = new Float32Array(nb);
    const eff = new Float32Array(nb);

    for (let v = 0; v < n; v += 1) {
      const px = this.pos[v * 2];
      const py = this.pos[v * 2 + 1];
      let dmin = Infinity;
      let closest = 0;
      let closestD = Infinity;

      // a bone owns a region roughly the size of its radius, so distance is
      // measured in "bone widths" rather than pixels
      for (let b = 0; b < nb; b += 1) {
        const bone = this.bones[b];
        const d = pointSegDist(px, py, bone.ax, bone.ay, bone.bx, bone.by);
        dist[b] = d;
        if (d < closestD) { closestD = d; closest = b; }
        const e = d / Math.max(1, bone.r * bone.bias);
        eff[b] = e;
        if (e < dmin) dmin = e;
      }

      // far out in the empty margins nothing really owns the vertex: bind it
      // rigidly to the closest bone so it travels with the silhouette instead
      // of being dragged by whatever bone happens to be the fattest.
      if (dmin > 0.95) {
        raw[v * nb + closest] = 1;
        continue;
      }

      const reach = Math.min(0.28 + dmin * 1.6, 1.3);
      let total = 0;
      for (let b = 0; b < nb; b += 1) {
        const q = eff[b] / reach;
        let w = 0;
        if (q < 1) {
          const t = 1 - q * q;
          w = t * t * t;
        }
        raw[v * nb + b] = w;
        total += w;
      }

      if (total < 1e-5) raw[v * nb + closest] = 1;
    }

    // --- smooth the weights over the grid (keeps neighbouring vertices
    //     from being pulled apart by different bones) ---
    const cols = this.config.cols ?? 34;
    const rows = this.config.rows ?? 46;
    const nx = cols + 1;
    const tmp = new Float32Array(n * nb);

    for (let iter = 0; iter < 8; iter += 1) {
      tmp.set(raw);
      for (let y = 0; y <= rows; y += 1) {
        for (let x = 0; x <= cols; x += 1) {
          const i = y * nx + x;
          const o = i * nb;
          let count = 0;
          for (let b = 0; b < nb; b += 1) tmp[o + b] = raw[o + b] * 1.6;
          const gather = (j) => {
            if (j < 0 || j >= n) return;
            const q = j * nb;
            for (let b = 0; b < nb; b += 1) tmp[o + b] += raw[q + b];
            count += 1;
          };
          if (x > 0) gather(i - 1);
          if (x < cols) gather(i + 1);
          if (y > 0) gather(i - nx);
          if (y < rows) gather(i + nx);
          const k = 1.6 + count;
          for (let b = 0; b < nb; b += 1) tmp[o + b] /= k;
        }
      }
      raw.set(tmp);
    }

    // --- keep the four strongest bones per vertex ---
    const skIdx = new Uint16Array(n * 4);
    const skW = new Float32Array(n * 4);
    for (let v = 0; v < n; v += 1) {
      const o = v * nb;
      let i0 = 0; let i1 = 0; let i2 = 0; let i3 = 0;
      let w0 = -1; let w1 = -1; let w2 = -1; let w3 = -1;
      for (let b = 0; b < nb; b += 1) {
        const w = raw[o + b];
        if (w > w0) { i3 = i2; w3 = w2; i2 = i1; w2 = w1; i1 = i0; w1 = w0; i0 = b; w0 = w; }
        else if (w > w1) { i3 = i2; w3 = w2; i2 = i1; w2 = w1; i1 = b; w1 = w; }
        else if (w > w2) { i3 = i2; w3 = w2; i2 = b; w2 = w; }
        else if (w > w3) { i3 = b; w3 = w; }
      }
      const sum = w0 + Math.max(0, w1) + Math.max(0, w2) + Math.max(0, w3) || 1;
      skIdx[v * 4] = i0; skW[v * 4] = Math.max(0, w0) / sum;
      skIdx[v * 4 + 1] = i1; skW[v * 4 + 1] = Math.max(0, w1) / sum;
      skIdx[v * 4 + 2] = i2; skW[v * 4 + 2] = Math.max(0, w2) / sum;
      skIdx[v * 4 + 3] = i3; skW[v * 4 + 3] = Math.max(0, w3) / sum;
    }

    this.skIdx = skIdx;
    this.skW = skW;
  }

  /* ---------- posing ---------- */

  resetPose() {
    for (const p of this.pose) {
      p.rot = 0; p.sx = 1; p.sy = 1; p.tx = 0; p.ty = 0;
    }
  }

  set(name, rot = 0, sx = 1, sy = 1, tx = 0, ty = 0) {
    const i = this.byName.get(name);
    if (i === undefined) return;
    const p = this.pose[i];
    p.rot = rot; p.sx = sx; p.sy = sy; p.tx = tx; p.ty = ty;
  }

  solve() {
    const { bones, pose, world, local } = this;
    for (let i = 0; i < bones.length; i += 1) {
      const b = bones[i];
      const p = pose[i];
      const cs = Math.cos(p.rot);
      const sn = Math.sin(p.rot);
      const a = cs * p.sx;
      const bb = sn * p.sx;
      const c = -sn * p.sy;
      const d = cs * p.sy;
      const e = b.ax + p.tx - (a * b.ax + c * b.ay);
      const f = b.ay + p.ty - (bb * b.ax + d * b.ay);
      const o = i * 6;
      local[o] = a; local[o + 1] = bb; local[o + 2] = c; local[o + 3] = d; local[o + 4] = e; local[o + 5] = f;

      const pi = b.parent;
      if (pi < 0) {
        for (let k = 0; k < 6; k += 1) world[o + k] = local[o + k];
      } else {
        const q = pi * 6;
        const A = world[q]; const B = world[q + 1]; const C = world[q + 2];
        const D = world[q + 3]; const E = world[q + 4]; const F = world[q + 5];
        world[o] = A * a + C * bb;
        world[o + 1] = B * a + D * bb;
        world[o + 2] = A * c + C * d;
        world[o + 3] = B * c + D * d;
        world[o + 4] = A * e + C * f + E;
        world[o + 5] = B * e + D * f + F;
      }
    }
  }

  skin(out = this.positions) {
    const M = this.world;
    const { skIdx, skW, pos } = this;
    const n = this.vertexCount;
    for (let v = 0; v < n; v += 1) {
      const x = pos[v * 2];
      const y = pos[v * 2 + 1];
      let ox = 0;
      let oy = 0;
      for (let k = 0; k < 4; k += 1) {
        const w = skW[v * 4 + k];
        if (w === 0) continue;
        const m = skIdx[v * 4 + k] * 6;
        ox += w * (M[m] * x + M[m + 2] * y + M[m + 4]);
        oy += w * (M[m + 1] * x + M[m + 3] * y + M[m + 5]);
      }
      out[v * 2] = ox;
      out[v * 2 + 1] = oy;
    }
    return out;
  }

  /** World position of a bone's pivot, in image space. */
  pivotOf(name, out = { x: 0, y: 0 }) {
    const i = this.byName.get(name);
    if (i === undefined) return out;
    const b = this.bones[i];
    const m = i * 6;
    out.x = this.world[m] * b.ax + this.world[m + 2] * b.ay + this.world[m + 4];
    out.y = this.world[m + 1] * b.ax + this.world[m + 3] * b.ay + this.world[m + 5];
    return out;
  }
}

/* ============================================================
   WebGL renderer: one canvas per puppet, textured mesh, either
   painted or as a flat silhouette.
   ============================================================ */

const VS = `
attribute vec2 aPos;
attribute vec2 aUV;
uniform vec4 uMap;
varying vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = vec4(aPos * uMap.xy + uMap.zw, 0.0, 1.0);
}`;

const FS = `
precision mediump float;
uniform sampler2D uTex;
uniform float uMode;
uniform vec3 uColor;
varying vec2 vUV;
void main() {
  vec4 t = texture2D(uTex, vUV);
  if (t.a < 0.004) discard;
  if (uMode > 0.5) {
    gl_FragColor = t;
  } else {
    gl_FragColor = vec4(uColor * t.a, t.a);
  }
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('shader error', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export class MeshRenderer {
  constructor(canvas, image, rig) {
    this.canvas = canvas;
    this.rig = rig;
    this.ok = false;
    this.mode = 0;
    this.map = new Float32Array([0, 0, 0, 0]);

    const attrs = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    };
    const gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) return;
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('program error', gl.getProgramInfoLog(prog));
      return;
    }
    this.prog = prog;
    this.aPos = gl.getAttribLocation(prog, 'aPos');
    this.aUV = gl.getAttribLocation(prog, 'aUV');
    this.uMap = gl.getUniformLocation(prog, 'uMap');
    this.uMode = gl.getUniformLocation(prog, 'uMode');
    this.uColor = gl.getUniformLocation(prog, 'uColor');
    this.uTex = gl.getUniformLocation(prog, 'uTex');

    gl.useProgram(prog);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    // texture
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);

    // buffers
    this.posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, rig.positions, gl.DYNAMIC_DRAW);

    this.uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, rig.uv, gl.STATIC_DRAW);

    this.idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, rig.index, gl.STATIC_DRAW);
    this.idxCount = rig.index.length;

    gl.uniform3f(this.uColor, 0.02, 0.015, 0.012);

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; }, false);

    this.ok = true;
  }

  /** Canvas CSS size / padding in image units. */
  setSize(cssW, cssH, dpr = 1) {
    if (!this.ok) return;
    const { gl, canvas, rig } = this;
    const px = rig.pad * rig.W;
    const py = rig.pad * rig.H;
    const devW = Math.max(1, Math.round(cssW * dpr));
    const devH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== devW) canvas.width = devW;
    if (canvas.height !== devH) canvas.height = devH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    gl.viewport(0, 0, devW, devH);

    const kx = cssW / (rig.W + px * 2);
    const ky = cssH / (rig.H + py * 2);
    this.map[0] = (2 * kx) / cssW;
    this.map[1] = (-2 * ky) / cssH;
    this.map[2] = (2 * kx * px) / cssW - 1;
    this.map[3] = 1 - (2 * ky * py) / cssH;
  }

  setMode(mode) {
    this.mode = mode;
  }

  draw() {
    if (!this.ok) return;
    try {
      this.drawNow();
    } catch (err) {
      console.warn('rig draw failed', err);
      this.ok = false;
    }
  }

  drawNow() {
    const { gl, rig } = this;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, rig.positions);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.enableVertexAttribArray(this.aUV);
    gl.vertexAttribPointer(this.aUV, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform4fv(this.uMap, this.map);
    gl.uniform1f(this.uMode, this.mode);
    gl.drawElements(gl.TRIANGLES, this.idxCount, gl.UNSIGNED_SHORT, 0);
  }

  dispose() {
    if (!this.gl) return;
    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    this.ok = false;
  }
}

export function webglSupported() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    return true;
  } catch (err) {
    return false;
  }
}
