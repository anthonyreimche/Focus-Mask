// The stage's GLSL, written out from measure.ts so the shader and the CPU
// model (model.ts) share every constant. Six three-channel passes in source
// space, at the size Develop draws from:
//   1  luma      √ of the luminance, in linear light
//   2  blur x    the fine and coarse blurs along x (r, g)
//   3  blur y    the same along y
//   4  classify  the gradient ratio and the edge gate: the in-focus weight (r, g)
//   5  spread x  the weight spread along x (g), r kept
//   6  spread y  the same along y
// The taps are written out rather than looped (no loop reaches a filtered
// read, which Direct3D 11 would make every draw pay for), and each draw reads
// at most MAX_TAPS_PER_DRAW texels.

import {
  BLUR_RADIUS,
  BLUR_STEP,
  COARSE_SIGMA,
  FINE_SIGMA,
  GRADIENT_STEP,
  NOISE_FADE,
  NOISE_RATIO2,
  RATIO_BAND,
  SPREAD_RADIUS,
  SPREAD_SIGMA,
  SPREAD_STEP,
  TINT_DENSITY,
  TINT_OPACITY,
  gaussianTaps,
} from "./measure";
import { GATE_KEY, RATIO_KEY, SHOW_KEY, SHOW_OFF, SHOW_TINT, STAGE_ID, resultSampler } from "./ids";

export const MAX_TAPS_PER_DRAW = 25;

/** A GLSL float literal that always carries a decimal point. */
export function glslLiteral(v: number): string {
  const s = v.toPrecision(10);
  if (/e/i.test(s)) {
    const [mantissa, exponent] = s.split(/e/i);
    const m = mantissa.includes(".") ? mantissa : `${mantissa}.0`;
    return `${m}e${Number(exponent)}`;
  }
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, ".0") : `${s}.0`;
}

const lit = glslLiteral;

/** Texels per reference pixel, never below one. */
export function passHelpers(refEdge: number): string {
  return `float fmTexelsPerRef() { return max(max(1.0 / uTexel.x, 1.0 / uTexel.y) / ${lit(refEdge)}, 1.0); }`;
}

// The stage's perceptual values back to linear light, then the square root of
// the luminance, which evens out shot noise across the tones.
export const LUMA_GLSL = `vec3 fmLin = sign(c) * srgbToLinear(abs(c));
c = vec3(sqrt(max(luma(fmLin), 0.0)), 0.0, 0.0);`;

const offset = (i: number, radius: number): string => lit(i - radius);

/** The fine and coarse blurs along `axis`, read from r alone (`fromLuma`) or r and g. */
export function blurGlsl(axis: "x" | "y", fromLuma: boolean): string {
  const fine = gaussianTaps(FINE_SIGMA, BLUR_STEP, BLUR_RADIUS);
  const coarse = gaussianTaps(COARSE_SIGMA, BLUR_STEP, BLUR_RADIUS);
  const step = axis === "x" ? `vec2(uTexel.x, 0.0)` : `vec2(0.0, uTexel.y)`;
  const lines = [
    `vec2 fmStep = ${step} * (fmTexelsPerRef() * ${lit(BLUR_STEP)});`,
    "float fmFine = 0.0;",
    "float fmCoarse = 0.0;",
    "vec2 fmTap;",
  ];
  for (let i = 0; i < fine.length; i++) {
    const read = `readPrev(vUv + ${offset(i, BLUR_RADIUS)} * fmStep)`;
    lines.push(fromLuma ? `fmTap = vec2(${read}.r);` : `fmTap = ${read}.rg;`);
    lines.push(`fmFine += ${lit(fine[i])} * fmTap.x;`, `fmCoarse += ${lit(coarse[i])} * fmTap.y;`);
  }
  lines.push("c = vec3(fmFine, fmCoarse, 0.0);");
  return lines.join("\n");
}

/** The in-focus weight: a coarse gradient past the edge gate, and a fine-to-coarse
 *  ratio past the sensitivity's but short of noise's. */
export function classifyGlsl(): string {
  return `vec2 fmDx = vec2(uTexel.x, 0.0) * (fmTexelsPerRef() * ${lit(GRADIENT_STEP)});
vec2 fmDy = vec2(0.0, uTexel.y) * (fmTexelsPerRef() * ${lit(GRADIENT_STEP)});
vec2 fmGx = 0.5 * (readPrev(vUv + fmDx).rg - readPrev(vUv - fmDx).rg);
vec2 fmGy = 0.5 * (readPrev(vUv + fmDy).rg - readPrev(vUv - fmDy).rg);
float fmFine2 = fmGx.x * fmGx.x + fmGy.x * fmGy.x;
float fmCoarse2 = fmGx.y * fmGx.y + fmGy.y * fmGy.y;
float fmR2 = fmFine2 / max(fmCoarse2, 1e-20);
float fmWeight = smoothstep(${GATE_KEY}, 2.0 * ${GATE_KEY}, sqrt(fmCoarse2))
  * smoothstep(${RATIO_KEY} * ${lit(1 - RATIO_BAND)}, ${RATIO_KEY} * ${lit(1 + RATIO_BAND)}, fmR2)
  * (1.0 - smoothstep(${lit(NOISE_RATIO2)}, ${lit(NOISE_RATIO2 * NOISE_FADE)}, fmR2));
c = vec3(fmWeight, fmWeight, 0.0);`;
}

/** The weight spread along `axis` into g; r keeps the edges. */
export function spreadGlsl(axis: "x" | "y"): string {
  const taps = gaussianTaps(SPREAD_SIGMA, SPREAD_STEP, SPREAD_RADIUS);
  const step = axis === "x" ? `vec2(uTexel.x, 0.0)` : `vec2(0.0, uTexel.y)`;
  const lines = [`vec2 fmStep = ${step} * (fmTexelsPerRef() * ${lit(SPREAD_STEP)});`, "float fmSpread = 0.0;"];
  for (let i = 0; i < taps.length; i++) {
    lines.push(`fmSpread += ${lit(taps[i])} * readPrev(vUv + ${offset(i, SPREAD_RADIUS)} * fmStep).g;`);
  }
  lines.push("c = vec3(c.r, fmSpread, 0.0);");
  return lines.join("\n");
}

/** Offsets across a screen pixel, in thirds of its footprint in the source. */
const FOOTPRINT: readonly (readonly [number, number])[] = [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((x) => [x, y] as const));

/** The overlay over the finished look, in display values. The edges are read
 *  at nine points across the screen pixel and the strongest kept, so a fitted
 *  view that shows several source pixels per screen pixel doesn't lose them. */
export function inlineGlsl(stageId: string = STAGE_ID): string {
  const sampler = resultSampler(stageId);
  const taps = FOOTPRINT.map(
    ([x, y]) => `  fmEdge = max(fmEdge, textureLod(${sampler}, srcUv + fmFoot * vec2(${lit(x)}, ${lit(y)}), 0.0).r);`,
  );
  return [
    `if (${SHOW_KEY}.a > ${lit(SHOW_OFF + 0.5)}) {`,
    "  vec2 fmFoot = fwidth(srcUv) * (1.0 / 3.0);",
    "  float fmEdge = 0.0;",
    ...taps,
    `  float fmAlpha = ${SHOW_KEY}.a > ${lit(SHOW_TINT + 0.5)}`,
    "    ? clamp(fmEdge, 0.0, 1.0)",
    `    : ${lit(TINT_OPACITY)} * smoothstep(${lit(TINT_DENSITY[0])}, ${lit(TINT_DENSITY[1])}, textureLod(${sampler}, srcUv, 0.0).g);`,
    `  if (fmAlpha > 0.0) c = mix(c, ${SHOW_KEY}.rgb, fmAlpha);`,
    "}",
  ].join("\n");
}
