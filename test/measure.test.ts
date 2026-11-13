// What reads as in focus. The scenes are drawn in linear light: steps blurred
// by a known Gaussian (an out-of-focus edge), with and without high-ISO noise.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SENSITIVITY,
  NOISE_RATIO2,
  blurLimit,
  edgeGate,
  edgeRatio,
  erf,
  gaussianTaps,
  phi,
  sharpRatio2,
  texelsPerRef,
} from "../src/measure";
import { measureFocus, type FocusMap, type MeasureInput } from "../src/model";

/** A seeded normal deviate (Box-Muller over a small LCG). */
function normals(seed: number): () => number {
  let s = seed >>> 0;
  const uniform = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 0.5) / 2 ** 32;
  };
  return () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}

interface Scene {
  width: number;
  height: number;
  /** Vertical edges: centre and blur as fractions of the width, linear levels. */
  edges: { at: number; blur: number; from: number; to: number }[];
  /** Noise σ on the square-root luminance, as high ISO adds it. */
  noise?: number;
}

function render(scene: Scene): MeasureInput {
  const { width: w, height: h } = scene;
  const rgb = new Float32Array(w * h * 3);
  const gauss = normals(7);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / w;
      const edge = scene.edges.reduce((best, e) => (Math.abs(e.at - fx) < Math.abs(best.at - fx) ? e : best));
      const t = phi((fx - edge.at) / Math.max(edge.blur, 1e-6));
      let l = edge.from + (edge.to - edge.from) * t;
      if (scene.noise) l = Math.max(Math.sqrt(l) + scene.noise * gauss(), 0) ** 2;
      rgb.set([l, l, l], 3 * (y * w + x));
    }
  }
  return { width: w, height: h, rgb };
}

/** The strongest edge weight in the columns within `half` of `at` (fractions of the width). */
function peakNear(map: FocusMap, at: number, half = 0.03): number {
  let best = 0;
  for (let y = 8; y < map.height - 8; y++) {
    for (let x = 0; x < map.width; x++) {
      if (Math.abs((x + 0.5) / map.width - at) <= half) best = Math.max(best, map.edge[y * map.width + x]);
    }
  }
  return best;
}

const defaults = (iso?: number) => ({ sharpRatio2: sharpRatio2(DEFAULT_SENSITIVITY), edgeGate: edgeGate(iso), refEdge: 256 });

describe("the ratio a blurred edge has", () => {
  it("falls from a perfect step's towards 1 as the blur grows", () => {
    const ratios = [0, 0.5, 1, 2, 4, 8].map(edgeRatio);
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeLessThan(ratios[i - 1]);
    expect(ratios[0]).toBeCloseTo(1.782, 2);
    expect(ratios[5]).toBeLessThan(1.05);
  });

  it("lets more blur count as in focus at a higher sensitivity", () => {
    expect(blurLimit(0)).toBe(0.5);
    expect(blurLimit(100)).toBe(3);
    expect(blurLimit(DEFAULT_SENSITIVITY)).toBeCloseTo(1.5, 10);
    expect(sharpRatio2(100)).toBeLessThan(sharpRatio2(DEFAULT_SENSITIVITY));
    expect(sharpRatio2(DEFAULT_SENSITIVITY)).toBeLessThan(sharpRatio2(0));
    expect(sharpRatio2(-20)).toBe(sharpRatio2(0));
  });

  it("puts noise well above any edge", () => {
    expect(NOISE_RATIO2).toBeGreaterThan(edgeRatio(0) ** 2);
  });

  it("uses a correct error function", () => {
    expect(erf(0)).toBeCloseTo(0, 6);
    expect(erf(1)).toBeCloseTo(0.8427008, 6);
    expect(erf(-0.5)).toBeCloseTo(-0.5204999, 6);
  });
});

describe("the edge gate", () => {
  it("rises with the square root of the ISO", () => {
    expect(edgeGate(100)).toBeCloseTo(0.001, 12);
    expect(edgeGate(6400)).toBeCloseTo(0.008, 12);
    expect(edgeGate(50)).toBe(edgeGate(100));
    expect(edgeGate(undefined)).toBe(edgeGate(100));
    expect(edgeGate(Number.NaN)).toBe(edgeGate(100));
  });
});

describe("the taps", () => {
  it("are symmetric Gaussian weights summing to 1", () => {
    const w = gaussianTaps(2, 0.5, 12);
    expect(w).toHaveLength(25);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    for (let i = 0; i < 12; i++) expect(w[i]).toBeCloseTo(w[24 - i], 15);
  });

  it("count reference pixels in texels, never below one", () => {
    expect(texelsPerRef(4096, 2731)).toBeCloseTo(4096 / 3072, 12);
    expect(texelsPerRef(1600, 1200)).toBe(1);
    expect(texelsPerRef(512, 256, 256)).toBe(2);
  });
});

describe("what reads as in focus", () => {
  const twoEdges: Scene = {
    width: 256,
    height: 48,
    edges: [
      { at: 0.25, blur: 0.5 / 256, from: 0.05, to: 0.4 },
      { at: 0.75, blur: 3 / 256, from: 0.4, to: 0.05 },
    ],
  };

  it("marks a sharp edge and leaves a blurred one", () => {
    const map = measureFocus(render(twoEdges), defaults());
    expect(peakNear(map, 0.25)).toBeGreaterThan(0.9);
    expect(peakNear(map, 0.75)).toBeLessThan(0.05);
  });

  it("marks the blurred edge too at full sensitivity", () => {
    const map = measureFocus(render({ ...twoEdges, edges: [twoEdges.edges[0], { ...twoEdges.edges[1], blur: 2.5 / 256 }] }), {
      ...defaults(),
      sharpRatio2: sharpRatio2(100),
    });
    expect(peakNear(map, 0.75)).toBeGreaterThan(0.9);
  });

  it("judges a faint sharp edge as sharp, whatever its contrast", () => {
    const faint: Scene = { ...twoEdges, edges: twoEdges.edges.map((e) => ({ ...e, from: e.from < e.to ? 0.16 : 0.2, to: e.from < e.to ? 0.2 : 0.16 })) };
    const map = measureFocus(render(faint), defaults());
    expect(peakNear(map, 0.25)).toBeGreaterThan(0.9);
    expect(peakNear(map, 0.75)).toBeLessThan(0.05);
  });

  it("marks nothing in flat high-ISO noise", () => {
    const flat: Scene = { width: 256, height: 128, edges: [{ at: 2, blur: 1, from: 0.18, to: 0.18 }], noise: 0.012 };
    const map = measureFocus(render(flat), defaults(6400));
    const marked = map.edge.filter((v) => v > 0.5).length;
    expect(marked / map.edge.length).toBeLessThan(0.001);
  });

  it("still finds the sharp edge through that noise and not the blurred one", () => {
    const map = measureFocus(render({ ...twoEdges, height: 96, noise: 0.012 }), defaults(6400));
    expect(peakNear(map, 0.25)).toBeGreaterThan(0.9);
    expect(peakNear(map, 0.75)).toBeLessThan(0.5);
  });

  it("reads the same scene alike at twice the resolution", () => {
    const small = measureFocus(render(twoEdges), defaults());
    const large = measureFocus(render({ ...twoEdges, width: 512, height: 96 }), defaults());
    expect(peakNear(large, 0.25)).toBeGreaterThan(0.9);
    expect(peakNear(large, 0.75)).toBeLessThan(0.05);
    // The marked band is as wide a part of the frame at either size.
    const band = (m: FocusMap) => {
      const row = Math.floor(m.height / 2) * m.width;
      let n = 0;
      for (let x = 0; x < m.width / 2; x++) if (m.edge[row + x] > 0.5) n++;
      return n / m.width;
    };
    expect(Math.abs(band(large) - band(small))).toBeLessThan(2 / 256);
  });

  it("spreads the marked edges into an area for the tint", () => {
    const map = measureFocus(render(twoEdges), defaults());
    const row = Math.floor(map.height / 2) * map.width;
    const near = map.density[row + Math.round(0.25 * map.width) + 6];
    const far = map.density[row + Math.round(0.5 * map.width)];
    expect(near).toBeGreaterThan(0.05);
    expect(far).toBeLessThan(1e-4);
  });
});
