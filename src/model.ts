// The focus measure on the CPU, draw for draw as the stage's passes run it
// (glsl.ts): the same taps, read with the GPU's bilinear filter clamped to
// the edge, so the GPU spec can hold the shader to it and the unit tests can
// check what reads as in focus.

import {
  BLUR_RADIUS,
  BLUR_STEP,
  COARSE_SIGMA,
  FINE_SIGMA,
  GRADIENT_STEP,
  NOISE_FADE,
  NOISE_RATIO2,
  RATIO_BAND,
  REF_EDGE,
  SPREAD_RADIUS,
  SPREAD_SIGMA,
  SPREAD_STEP,
  gaussianTaps,
  smoothstep,
  texelsPerRef,
} from "./measure";

export interface MeasureInput {
  width: number;
  height: number;
  /** Linear Rec.709 RGB, rows from the top, three numbers a pixel. */
  rgb: Float32Array;
}

export interface MeasureParams {
  sharpRatio2: number;
  edgeGate: number;
  refEdge?: number;
  /** What a draw's target keeps of each value (half float on the GPU). */
  store?: (v: number) => number;
}

export interface FocusMap {
  width: number;
  height: number;
  /** How surely each pixel is an in-focus edge, 0 to 1 (the edges style). */
  edge: Float32Array;
  /** The in-focus edges spread into areas (the tint style). */
  density: Float32Array;
}

type Plane = Float32Array;

/** A bilinear read of `plane` at (u, v), clamped to the edge, as texture() reads. */
export function bilinear(plane: Plane, w: number, h: number, u: number, v: number): number {
  const x = u * w - 0.5;
  const y = v * h - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const cx = (i: number) => Math.min(Math.max(i, 0), w - 1);
  const cy = (j: number) => Math.min(Math.max(j, 0), h - 1);
  const at = (i: number, j: number) => plane[cy(j) * w + cx(i)];
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Each texel's value from `texel(u, v, x, y)`, kept as a draw's target keeps it. */
function draw(w: number, h: number, store: (v: number) => number, texel: (u: number, v: number) => number): Plane {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = store(texel((x + 0.5) / w, (y + 0.5) / h));
  }
  return out;
}

/** A blur along one axis: `weights` taps `step` reference pixels apart. */
function blur(plane: Plane, w: number, h: number, dx: number, dy: number, weights: readonly number[], store: (v: number) => number): Plane {
  const radius = (weights.length - 1) / 2;
  return draw(w, h, store, (u, v) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += weights[i] * bilinear(plane, w, h, u + (i - radius) * dx, v + (i - radius) * dy);
    return sum;
  });
}

export function measureFocus(input: MeasureInput, p: MeasureParams): FocusMap {
  const { width: w, height: h, rgb } = input;
  const store = p.store ?? ((v: number) => v);
  const k = texelsPerRef(w, h, p.refEdge ?? REF_EDGE);
  const tx = 1 / w;
  const ty = 1 / h;

  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const y = 0.2126 * rgb[3 * i] + 0.7152 * rgb[3 * i + 1] + 0.0722 * rgb[3 * i + 2];
    luma[i] = store(Math.sqrt(Math.max(y, 0)));
  }

  const fineTaps = gaussianTaps(FINE_SIGMA, BLUR_STEP, BLUR_RADIUS);
  const coarseTaps = gaussianTaps(COARSE_SIGMA, BLUR_STEP, BLUR_RADIUS);
  const bx = BLUR_STEP * k * tx;
  const by = BLUR_STEP * k * ty;
  const fine = blur(blur(luma, w, h, bx, 0, fineTaps, store), w, h, 0, by, fineTaps, store);
  const coarse = blur(blur(luma, w, h, bx, 0, coarseTaps, store), w, h, 0, by, coarseTaps, store);

  const gx = GRADIENT_STEP * k * tx;
  const gy = GRADIENT_STEP * k * ty;
  const lo = p.sharpRatio2 * (1 - RATIO_BAND);
  const hi = p.sharpRatio2 * (1 + RATIO_BAND);
  const edge = draw(w, h, store, (u, v) => {
    const grad = (plane: Plane): number => {
      const ax = 0.5 * (bilinear(plane, w, h, u + gx, v) - bilinear(plane, w, h, u - gx, v));
      const ay = 0.5 * (bilinear(plane, w, h, u, v + gy) - bilinear(plane, w, h, u, v - gy));
      return ax * ax + ay * ay;
    };
    const fine2 = grad(fine);
    const coarse2 = grad(coarse);
    const r2 = fine2 / Math.max(coarse2, 1e-20);
    return (
      smoothstep(p.edgeGate, 2 * p.edgeGate, Math.sqrt(coarse2)) *
      smoothstep(lo, hi, r2) *
      (1 - smoothstep(NOISE_RATIO2, NOISE_RATIO2 * NOISE_FADE, r2))
    );
  });

  const spreadTaps = gaussianTaps(SPREAD_SIGMA, SPREAD_STEP, SPREAD_RADIUS);
  const sx = SPREAD_STEP * k * tx;
  const sy = SPREAD_STEP * k * ty;
  const density = blur(blur(edge, w, h, sx, 0, spreadTaps, store), w, h, 0, sy, spreadTaps, store);
  return { width: w, height: h, edge, density };
}
