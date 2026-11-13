// The focus measure's constants and the maths behind its thresholds.
//
// Sharpness is measured on the decoded source, before any edit, so the user's
// sharpening, clarity and noise reduction don't change what reads as in focus.
// The luminance goes through a square root first: shot noise then has about
// the same spread in the shadows as in the highlights, so one edge threshold
// fits every tone.
//
// At each pixel the luminance is blurred twice, by a fine and a coarse
// Gaussian, and the ratio of the two gradients says how blurred the edge
// under it is: a step blurred by b has gradients in the ratio
// R(b) = (Φ(h / s₁) − ½) / (Φ(h / s₂) − ½), sᵢ = √(σᵢ² + b²), for central
// differences h apart (the re-blur estimate of Zhuo and Sim, "Defocus map
// estimation from a single image", 2011). R falls from R(0) for a perfect
// step towards 1 as the blur grows, whatever the edge's contrast. Noise has
// no edge under it: its fine gradient is far larger than its coarse one, so a
// ratio well above R(0) is noise, and a coarse gradient below the edge gate is
// too faint to judge. The gate rises with ISO, as the noise does.
//
// Every distance is in reference pixels, 1 / REF_EDGE of the source's long
// edge (never less than a texel), so the measure reads the same image at fit
// view and at 100 %, and whether Develop draws from a 3072 px cached preview
// or a 4096 px decode.

/** The long edge the measure's pixel scale is anchored to: Safelight's
 *  default RAW cache size, so a cached open measures at its own pixels. */
export const REF_EDGE = 3072;

/** The fine and coarse blurs, Gaussian σ in reference pixels. */
export const FINE_SIGMA = 1;
export const COARSE_SIGMA = 2;
/** The blur taps: BLUR_RADIUS on each side, BLUR_STEP apart (25 per draw). */
export const BLUR_STEP = 0.5;
export const BLUR_RADIUS = 12;
/** The gradient's central differences are taken this far on each side. */
export const GRADIENT_STEP = 1;

/** How far the in-focus edges are spread into areas for the tint, Gaussian σ
 *  in reference pixels; taps SPREAD_STEP apart, SPREAD_RADIUS on each side. */
export const SPREAD_SIGMA = 4;
export const SPREAD_STEP = 1;
export const SPREAD_RADIUS = 12;

/** The tint's opacity, and the spread edge density over which it fades in. */
export const TINT_OPACITY = 0.5;
export const TINT_DENSITY: readonly [number, number] = [0.03, 0.15];

/** The ratio band around a threshold, as a fraction of R². */
export const RATIO_BAND = 0.06;
/** Ratios this far above a perfect step's are noise, not an edge. */
export const NOISE_MARGIN = 1.15;
/** The noise cut fades out over this factor of R². */
export const NOISE_FADE = 1.3;

/** The coarse gradient (square-root luminance per reference pixel) an edge
 *  must pass at ISO 100; it scales with √(ISO / 100). Fully open at twice it. */
export const EDGE_GATE_ISO100 = 0.001;

/** Sensitivity 0 to 100 maps to the most blur, in reference pixels, that
 *  still counts as in focus. */
export const SENSITIVITY_BLUR: readonly [number, number] = [0.5, 3];
export const DEFAULT_SENSITIVITY = 40;

/** The error function, to 1.5e-7 (Abramowitz and Stegun 7.1.26). */
export function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x < 0 ? -y : y;
}

/** The standard normal distribution function. */
export const phi = (x: number): number => 0.5 * (1 + erf(x / Math.SQRT2));

/** The fine-to-coarse gradient ratio at the centre of a step blurred by `blur`. */
export function edgeRatio(blur: number): number {
  const fine = Math.hypot(FINE_SIGMA, blur);
  const coarse = Math.hypot(COARSE_SIGMA, blur);
  return (phi(GRADIENT_STEP / fine) - 0.5) / (phi(GRADIENT_STEP / coarse) - 0.5);
}

/** The most blur that counts as in focus at `sensitivity` (0 to 100). */
export function blurLimit(sensitivity: number): number {
  const s = Math.min(Math.max(sensitivity, 0), 100) / 100;
  return SENSITIVITY_BLUR[0] + s * (SENSITIVITY_BLUR[1] - SENSITIVITY_BLUR[0]);
}

/** The squared ratio an edge must reach at `sensitivity`. */
export const sharpRatio2 = (sensitivity: number): number => edgeRatio(blurLimit(sensitivity)) ** 2;

/** The squared ratio above which a pixel reads as noise. */
export const NOISE_RATIO2 = (NOISE_MARGIN * edgeRatio(0)) ** 2;

/** The edge gate for a photo shot at `iso`; one without an ISO is taken as 100. */
export function edgeGate(iso: number | undefined): number {
  const speed = iso !== undefined && Number.isFinite(iso) && iso > 100 ? iso : 100;
  return EDGE_GATE_ISO100 * Math.sqrt(speed / 100);
}

/** Gaussian weights for taps `step` apart, `radius` on each side, summing to 1. */
export function gaussianTaps(sigma: number, step: number, radius: number): number[] {
  const raw = Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-(((i - radius) * step) ** 2) / (2 * sigma * sigma)));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

/** GLSL's smoothstep. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Texels per reference pixel for a pass `width` × `height`. */
export const texelsPerRef = (width: number, height: number, refEdge = REF_EDGE): number =>
  Math.max(Math.max(width, height) / refEdge, 1);
