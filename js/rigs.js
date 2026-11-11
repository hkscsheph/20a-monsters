/* ============================================================
   Rigs — a bone skeleton per monster, in normalised image space.
   Joint positions were traced from the drawings; radii control how
   much flesh each bone owns. Order matters: parents come first.
   ============================================================ */

/* bones: name, parent, a → b (normalised), r = influence radius
   (as a fraction of image height), bias = weight multiplier. */

const skeleton = {
  /* ---- Grasp: black owl-eyed rat with skull face ---- */
  grasp: {
    cols: 34, rows: 46, pad: 0.09,
    bones: [
      { name: 'root',   a: [0.42, 0.66], b: [0.42, 0.55], r: 0.17 },
      { name: 'spine',  parent: 'root',  a: [0.42, 0.55], b: [0.42, 0.44], r: 0.16 },
      { name: 'chest',  parent: 'spine', a: [0.42, 0.44], b: [0.42, 0.36], r: 0.16 },
      { name: 'neck',   parent: 'chest', a: [0.42, 0.36], b: [0.42, 0.32], r: 0.10 },
      { name: 'head',   parent: 'neck',  a: [0.42, 0.32], b: [0.42, 0.10], r: 0.30, bias: 1.4 },
      { name: 'eyeL',   parent: 'head',  a: [0.25, 0.225], b: [0.25, 0.225], r: 0.12 },
      { name: 'eyeR',   parent: 'head',  a: [0.53, 0.225], b: [0.53, 0.225], r: 0.12 },
      { name: 'jaw',    parent: 'head',  a: [0.41, 0.275], b: [0.41, 0.34], r: 0.075 },
      { name: 'armL',   parent: 'chest', a: [0.21, 0.45], b: [0.09, 0.43], r: 0.055 },
      { name: 'foreL',  parent: 'armL',  a: [0.09, 0.43], b: [0.05, 0.54], r: 0.05 },
      { name: 'armR',   parent: 'chest', a: [0.62, 0.45], b: [0.71, 0.53], r: 0.055 },
      { name: 'foreR',  parent: 'armR',  a: [0.71, 0.53], b: [0.70, 0.63], r: 0.05 },
      { name: 'thighL', parent: 'root',  a: [0.27, 0.70], b: [0.25, 0.84], r: 0.06 },
      { name: 'shinL',  parent: 'thighL', a: [0.25, 0.84], b: [0.24, 0.96], r: 0.055 },
      { name: 'thighR', parent: 'root',  a: [0.49, 0.70], b: [0.50, 0.84], r: 0.06 },
      { name: 'shinR',  parent: 'thighR', a: [0.50, 0.84], b: [0.53, 0.96], r: 0.055 },
      { name: 'tail1',  parent: 'root',  a: [0.63, 0.66], b: [0.76, 0.68], r: 0.05 },
      { name: 'tail2',  parent: 'tail1', a: [0.76, 0.68], b: [0.85, 0.62], r: 0.045 },
      { name: 'tail3',  parent: 'tail2', a: [0.85, 0.62], b: [0.89, 0.52], r: 0.04 },
      { name: 'tail4',  parent: 'tail3', a: [0.89, 0.52], b: [0.86, 0.44], r: 0.035 },
    ],
    character: { idle: 1.0, yaw: 0.2, armSway: 0.07, tailSpeed: 2.2, blink: 3.4, chatter: 0.5 },
  },

  /* ---- Drowse: brown, sleepy, sitting ---- */
  drowse: {
    cols: 34, rows: 46, pad: 0.09,
    bones: [
      { name: 'root',   a: [0.42, 0.70], b: [0.42, 0.56], r: 0.18 },
      { name: 'spine',  parent: 'root',  a: [0.42, 0.56], b: [0.41, 0.44], r: 0.17 },
      { name: 'chest',  parent: 'spine', a: [0.41, 0.44], b: [0.41, 0.36], r: 0.16 },
      { name: 'neck',   parent: 'chest', a: [0.41, 0.36], b: [0.41, 0.33], r: 0.10 },
      { name: 'head',   parent: 'neck',  a: [0.41, 0.33], b: [0.41, 0.10], r: 0.30, bias: 1.4 },
      { name: 'eyeL',   parent: 'head',  a: [0.28, 0.19], b: [0.28, 0.19], r: 0.12 },
      { name: 'eyeR',   parent: 'head',  a: [0.53, 0.19], b: [0.53, 0.19], r: 0.12 },
      { name: 'jaw',    parent: 'head',  a: [0.42, 0.25], b: [0.43, 0.31], r: 0.07 },
      { name: 'armL',   parent: 'chest', a: [0.24, 0.45], b: [0.28, 0.55], r: 0.05 },
      { name: 'foreL',  parent: 'armL',  a: [0.28, 0.55], b: [0.33, 0.60], r: 0.045 },
      { name: 'armR',   parent: 'chest', a: [0.60, 0.45], b: [0.57, 0.55], r: 0.05 },
      { name: 'foreR',  parent: 'armR',  a: [0.57, 0.55], b: [0.52, 0.60], r: 0.045 },
      { name: 'thighL', parent: 'root',  a: [0.31, 0.72], b: [0.28, 0.80], r: 0.06 },
      { name: 'shinL',  parent: 'thighL', a: [0.28, 0.80], b: [0.26, 0.87], r: 0.05 },
      { name: 'thighR', parent: 'root',  a: [0.52, 0.72], b: [0.54, 0.80], r: 0.06 },
      { name: 'shinR',  parent: 'thighR', a: [0.54, 0.80], b: [0.56, 0.87], r: 0.05 },
      { name: 'tail1',  parent: 'root',  a: [0.60, 0.78], b: [0.73, 0.84], r: 0.05 },
      { name: 'tail2',  parent: 'tail1', a: [0.73, 0.84], b: [0.85, 0.86], r: 0.045 },
      { name: 'tail3',  parent: 'tail2', a: [0.85, 0.86], b: [0.94, 0.78], r: 0.04 },
      { name: 'tail4',  parent: 'tail3', a: [0.94, 0.78], b: [0.95, 0.66], r: 0.035 },
    ],
    character: { idle: 0.7, yaw: 0.17, armSway: 0.045, tailSpeed: 1.5, blink: 5.5, chatter: 0.25 },
  },

  /* ---- Waver: purple, one arm up in a wave ---- */
  waver: {
    cols: 34, rows: 46, pad: 0.10,
    bones: [
      { name: 'root',   a: [0.55, 0.63], b: [0.55, 0.50], r: 0.16 },
      { name: 'spine',  parent: 'root',  a: [0.55, 0.50], b: [0.54, 0.41], r: 0.15 },
      { name: 'chest',  parent: 'spine', a: [0.54, 0.41], b: [0.53, 0.33], r: 0.14 },
      { name: 'neck',   parent: 'chest', a: [0.53, 0.33], b: [0.53, 0.30], r: 0.09 },
      { name: 'head',   parent: 'neck',  a: [0.53, 0.30], b: [0.53, 0.08], r: 0.26, bias: 1.4 },
      { name: 'eyeL',   parent: 'head',  a: [0.47, 0.13], b: [0.47, 0.13], r: 0.1 },
      { name: 'eyeR',   parent: 'head',  a: [0.63, 0.12], b: [0.63, 0.12], r: 0.1 },
      { name: 'jaw',    parent: 'head',  a: [0.55, 0.20], b: [0.56, 0.27], r: 0.07 },
      { name: 'armL',   parent: 'chest', a: [0.43, 0.38], b: [0.36, 0.49], r: 0.05 },
      { name: 'foreL',  parent: 'armL',  a: [0.36, 0.49], b: [0.38, 0.61], r: 0.045 },
      { name: 'armR',   parent: 'chest', a: [0.66, 0.38], b: [0.77, 0.33], r: 0.05 },
      { name: 'foreR',  parent: 'armR',  a: [0.77, 0.33], b: [0.80, 0.20], r: 0.045 },
      { name: 'thighL', parent: 'root',  a: [0.48, 0.64], b: [0.46, 0.77], r: 0.055 },
      { name: 'shinL',  parent: 'thighL', a: [0.46, 0.77], b: [0.42, 0.90], r: 0.05 },
      { name: 'thighR', parent: 'root',  a: [0.62, 0.64], b: [0.64, 0.78], r: 0.055 },
      { name: 'shinR',  parent: 'thighR', a: [0.64, 0.78], b: [0.68, 0.90], r: 0.05 },
      { name: 'tail1',  parent: 'root',  a: [0.62, 0.66], b: [0.74, 0.73], r: 0.045 },
      { name: 'tail2',  parent: 'tail1', a: [0.74, 0.73], b: [0.82, 0.66], r: 0.04 },
      { name: 'tail3',  parent: 'tail2', a: [0.82, 0.66], b: [0.83, 0.58], r: 0.035 },
      { name: 'tail4',  parent: 'tail3', a: [0.83, 0.58], b: [0.79, 0.54], r: 0.03 },
    ],
    character: { idle: 1.15, yaw: 0.22, armSway: 0.09, tailSpeed: 2.6, blink: 2.8, chatter: 0.8 },
  },

  /* ---- Grin: purple, huge ears, toothy grin ---- */
  grin: {
    cols: 34, rows: 46, pad: 0.09,
    bones: [
      { name: 'root',   a: [0.50, 0.55], b: [0.50, 0.45], r: 0.15 },
      { name: 'spine',  parent: 'root',  a: [0.50, 0.45], b: [0.50, 0.38], r: 0.14 },
      { name: 'chest',  parent: 'spine', a: [0.50, 0.38], b: [0.50, 0.32], r: 0.13 },
      { name: 'neck',   parent: 'chest', a: [0.50, 0.32], b: [0.50, 0.30], r: 0.09 },
      { name: 'head',   parent: 'neck',  a: [0.50, 0.30], b: [0.50, 0.08], r: 0.32, bias: 1.4 },
      { name: 'eyeL',   parent: 'head',  a: [0.30, 0.17], b: [0.30, 0.17], r: 0.12 },
      { name: 'eyeR',   parent: 'head',  a: [0.72, 0.17], b: [0.72, 0.17], r: 0.12 },
      { name: 'jaw',    parent: 'head',  a: [0.50, 0.235], b: [0.50, 0.30], r: 0.08 },
      { name: 'armL',   parent: 'chest', a: [0.38, 0.37], b: [0.27, 0.50], r: 0.045 },
      { name: 'foreL',  parent: 'armL',  a: [0.27, 0.50], b: [0.23, 0.63], r: 0.04 },
      { name: 'armR',   parent: 'chest', a: [0.62, 0.37], b: [0.73, 0.50], r: 0.045 },
      { name: 'foreR',  parent: 'armR',  a: [0.73, 0.50], b: [0.77, 0.63], r: 0.04 },
      { name: 'thighL', parent: 'root',  a: [0.45, 0.55], b: [0.43, 0.73], r: 0.05 },
      { name: 'shinL',  parent: 'thighL', a: [0.43, 0.73], b: [0.41, 0.92], r: 0.045 },
      { name: 'thighR', parent: 'root',  a: [0.55, 0.55], b: [0.57, 0.73], r: 0.05 },
      { name: 'shinR',  parent: 'thighR', a: [0.57, 0.73], b: [0.60, 0.92], r: 0.045 },
    ],
    character: { idle: 0.85, yaw: 0.19, armSway: 0.075, tailSpeed: 2.0, blink: 4.2, chatter: 0.7 },
  },
};

export default skeleton;
