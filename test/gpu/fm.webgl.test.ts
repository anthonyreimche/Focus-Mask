// The stage on the real renderer. Run via `npm run test:gpu` (run.cjs copies
// this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//  • core's stage contract takes the stage without a warning, and the inline
//    names the result sampler the host declares;
//  • the six passes, compiled with the host's namespacing and run on its
//    half-float targets, land on the CPU model (model.ts), at one texel per
//    reference pixel and at two;
//  • the overlay drawn over the live view is the model's, in both styles;
//  • the overlay is a view aid: a measuring frame, a float capture, the
//    histogram and any renderer that doesn't draw for the eye (the export's,
//    the thumbnails') draw the photo exactly as without the stage, even with
//    the overlay's values in their bag;
//  • what a full-size frame costs with the overlay on.

import { describe, expect, it } from "vitest";
import { EXTENSION_ID, STAGE_ID, resultSampler } from "@fm/ids";
import { DEFAULT_SENSITIVITY, TINT_DENSITY, TINT_OPACITY, edgeGate, sharpRatio2, smoothstep } from "@fm/measure";
import { bilinear, measureFocus, type FocusMap } from "@fm/model";
import { DEFAULT_PREFS, type Prefs } from "@fm/prefs";
import { PASS_COUNT, focusStage } from "@fm/stage";
import { viewValues } from "@fm/view";
import { CURRENT_PROCESS_VERSION } from "@/catalog/process-version";
import { checkStageContract } from "@/extensions/stage-validation";
import type { ProcessingStageContribution } from "@/extensions/types";
import type { WebGLRenderer, WebGLRendererOpts } from "@/rendering/webgl/renderer";
import { uniformPrefix } from "@/rendering/webgl/shader-compiler";
import {
  OPEN_PROBE,
  floatImage,
  glHarness,
  identityParams,
  toHalf,
  trackGlObjects,
  withRenderer,
  type FloatImage,
} from "@/rendering/webgl/webgl.test-support";

const AS_DRAWN = { encoding: "perceptual", primaries: "rec709" } as const;
const PARAMS = identityParams({ processVersion: CURRENT_PROCESS_VERSION });

/** A seeded uniform deviate. */
function uniforms(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 0.5) / 2 ** 32;
  };
}

const Phi = (x: number) => 0.5 * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x ** 3)));

/** Sharp and soft edges, a sharp diagonal, a faint sharp edge and a little noise,
 *  drawn for a frame `scale` texels per reference pixel. */
function scene(w: number, h: number, scale: number): FloatImage {
  const rand = uniforms(11);
  return floatImage(w, h, (x, y) => {
    const u = (x + 0.5) / scale;
    const v = (y + 0.5) / scale;
    const sharp = Phi((u - 20) / 0.5);
    const soft = Phi((u - 50) / 3);
    const diagonal = Phi((u - v - 70) / (0.6 * Math.SQRT2));
    const faint = Phi((v - 40) / 0.5);
    const l = 0.04 + 0.3 * sharp - 0.2 * soft + 0.15 * diagonal + 0.03 * faint + 0.004 * (rand() - 0.5);
    return [l * 1.1, l, l * 0.9];
  });
}

const STAGE_BAG = (prefs: Prefs = DEFAULT_PREFS) => viewValues(prefs, 100);

/** The passes' result as a probe stage hands it on: (edge, density) per pixel. */
function probeStage(refEdge: number): ProcessingStageContribution {
  const real = focusStage(refEdge, "fmtest.probe");
  return { ...real, viewOnly: false, dormantWhen: undefined, glsl: "c = stageResult;" };
}

function probeBag(): Record<string, unknown> {
  return Object.fromEntries(Object.entries(STAGE_BAG()).map(([k, v]) => [k.replace(STAGE_ID, "fmtest.probe"), v]));
}

function cpuModel(image: FloatImage, refEdge: number): FocusMap {
  const rgb = new Float32Array(image.width * image.height * 3);
  for (let i = 0; i < image.width * image.height; i++) {
    for (let c = 0; c < 3; c++) rgb[3 * i + c] = toHalf(image.data[4 * i + c]);
  }
  return measureFocus(
    { width: image.width, height: image.height, rgb },
    { sharpRatio2: sharpRatio2(DEFAULT_SENSITIVITY), edgeGate: edgeGate(100), refEdge, store: toHalf },
  );
}

function withScene<T>(image: FloatImage, opts: Partial<WebGLRendererOpts>, bag: Record<string, unknown>, fn: (r: WebGLRenderer) => T): T {
  return withRenderer({ pipeline: OPEN_PROBE, stages: [], ...opts }, (renderer) => {
    renderer.setImage(image);
    renderer.setParams(PARAMS);
    renderer.setContributedParams(bag);
    return fn(renderer);
  });
}

/** The canvas, RGBA8 rows from the top. */
function canvasPixels(): { data: Uint8Array; width: number; height: number } {
  const { canvas, gl } = glHarness();
  const { width, height } = canvas;
  const raw = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const data = new Uint8Array(raw.length);
  for (let y = 0; y < height; y++) data.set(raw.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
  return { data, width, height };
}

function stats(diffs: number[]): { max: number; p99: number } {
  const sorted = [...diffs].sort((a, b) => b - a);
  return { max: sorted[0], p99: sorted[Math.floor(sorted.length / 100)] };
}

describe("Focus Mask on the GPU", () => {
  it("passes core's stage contract without a warning", () => {
    expect(checkStageContract(focusStage(), EXTENSION_ID)).toMatchObject({ error: null, warnings: [] });
  });

  it("reads its result by the name the host declares", () => {
    expect(resultSampler(STAGE_ID)).toBe(`${uniformPrefix(STAGE_ID)}stageResult`);
  });

  it.each([
    ["one texel per reference pixel", 96, 64, 96, 1],
    ["two texels per reference pixel", 192, 128, 96, 2],
  ])("lands on the CPU model at %s", (_, w, h, refEdge, scale) => {
    const image = scene(w, h, scale);
    const frame = withScene(image, { stages: [probeStage(refEdge)] }, probeBag(), (r) => r.readFloatFrame("pre-output", Infinity, AS_DRAWN));
    expect(frame).not.toBeNull();
    if (!frame) return;
    expect([frame.width, frame.height]).toEqual([w, h]);
    const want = cpuModel(image, refEdge);
    const edge: number[] = [];
    const density: number[] = [];
    for (let i = 0; i < w * h; i++) {
      edge.push(Math.abs(frame.data[4 * i] - want.edge[i]));
      density.push(Math.abs(frame.data[4 * i + 1] - want.density[i]));
    }
    const e = stats(edge);
    const d = stats(density);
    const marked = want.edge.filter((v) => v > 0.5).length;
    console.log(`[fm-gpu] ${_}: edge max ${e.max.toExponential(2)} p99 ${e.p99.toExponential(2)}; density max ${d.max.toExponential(2)} p99 ${d.p99.toExponential(2)}; ${marked} px marked`);
    expect(marked).toBeGreaterThan(h);
    expect(e.p99).toBeLessThan(0.02);
    expect(e.max).toBeLessThan(0.2);
    expect(d.max).toBeLessThan(0.01);
  });

  describe("the overlay over the live view", () => {
    const W = 96;
    const H = 64;
    const image = scene(W, H, 1);
    const plain = withScene(image, {}, {}, (r) => {
      r.render();
      return canvasPixels();
    });
    const model = cpuModel(image, 3072);

    function overlaid(prefs: Prefs): ReturnType<typeof canvasPixels> {
      return withScene(image, { stages: [focusStage()], drawsViewStages: true }, STAGE_BAG(prefs), (r) => {
        r.render();
        return canvasPixels();
      });
    }

    /** The model's opacity at pixel (x, y) for `style`. */
    function alpha(style: Prefs["style"], x: number, y: number): number {
      if (style === "tint") return TINT_OPACITY * smoothstep(TINT_DENSITY[0], TINT_DENSITY[1], model.density[y * W + x]);
      let edge = 0;
      for (const dy of [-1, 0, 1]) {
        for (const dx of [-1, 0, 1]) {
          edge = Math.max(edge, bilinear(model.edge, W, H, (x + 0.5 + dx / 3) / W, (y + 0.5 + dy / 3) / H));
        }
      }
      return Math.min(Math.max(edge, 0), 1);
    }

    it.each(["edges", "tint"] as const)("is the model's, in the %s style", (style) => {
      const prefs: Prefs = { ...DEFAULT_PREFS, style, colour: "red" };
      const got = overlaid(prefs);
      expect([got.width, got.height]).toEqual([W, H]);
      const colour = [1, 0.15, 0.15].map((v) => v * 255);
      const diffs: number[] = [];
      let covered = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const a = alpha(style, x, y);
          if (a > 0.2) covered++;
          for (let c = 0; c < 3; c++) {
            const i = 4 * (y * W + x) + c;
            const want = plain.data[i] + (colour[c] - plain.data[i]) * a;
            diffs.push(Math.abs(got.data[i] - want));
          }
        }
      }
      const s = stats(diffs);
      console.log(`[fm-gpu] overlay ${style}: max ${s.max.toFixed(1)} p99 ${s.p99.toFixed(1)} (8-bit levels); ${covered} px above 0.2`);
      expect(covered).toBeGreaterThan(0);
      expect(s.p99).toBeLessThanOrEqual(3);
      expect(s.max).toBeLessThanOrEqual(40);
    });

    it("draws nothing while off", () => {
      const off = withScene(image, { stages: [focusStage()], drawsViewStages: true }, {}, (r) => {
        r.render();
        return canvasPixels();
      });
      expect(Array.from(off.data)).toEqual(Array.from(plain.data));
    });
  });

  describe("as a view aid", () => {
    const image = scene(96, 64, 1);
    const ON = STAGE_BAG({ ...DEFAULT_PREFS, style: "edges" });

    it("stays out of a float capture and the histogram of the live view", () => {
      const without = withScene(image, {}, {}, (r) => {
        r.render();
        return { frame: r.readFloatFrame("output"), histogram: r.computeHistogram() };
      });
      const withOverlay = withScene(image, { stages: [focusStage()], drawsViewStages: true }, ON, (r) => {
        r.render();
        return { frame: r.readFloatFrame("output"), histogram: r.computeHistogram() };
      });
      expect(Array.from(withOverlay.frame?.data ?? [])).toEqual(Array.from(without.frame?.data ?? [1]));
      expect(Array.from(withOverlay.histogram.r)).toEqual(Array.from(without.histogram.r));
      expect(Array.from(withOverlay.histogram.g)).toEqual(Array.from(without.histogram.g));
    });

    it("stays out of an export or a thumbnail, even with its values in the bag", () => {
      const exported = (stages: ProcessingStageContribution[], bag: Record<string, unknown>) =>
        withScene(image, { stages }, bag, (r) => {
          r.render();
          return canvasPixels();
        });
      const plain = exported([], {});
      const withValues = exported([focusStage()], ON);
      expect(withValues.data.length).toBe(plain.data.length);
      expect(Array.from(withValues.data)).toEqual(Array.from(plain.data));
    });

    it("draws in the live view's frame from the same bag", () => {
      const live = withScene(image, { stages: [focusStage()], drawsViewStages: true }, ON, (r) => {
        r.render();
        return canvasPixels();
      });
      const plain = withScene(image, {}, {}, (r) => {
        r.render();
        return canvasPixels();
      });
      expect(Array.from(live.data)).not.toEqual(Array.from(plain.data));
    });
  });

  // The live view's renderer, as the worker makes it.
  const LIVE: Partial<WebGLRendererOpts> = { stages: [focusStage()], drawsViewStages: true, skipDormantStages: true, keepPassCheckpoints: true };

  describe("turned on and off", () => {
    const image = scene(96, 64, 1);

    /** Program builds and time of turning the overlay on, after `ahead`, and of
     *  turning it on again later with its passes to run again. */
    function toggles(ahead: (r: WebGLRenderer) => void): { builds: number; later: number; firstMs: number; laterMs: number; dormant: readonly string[] } {
      const { canvas, gl } = glHarness();
      const tally = trackGlObjects(gl);
      try {
        return withRenderer(
          { pipeline: OPEN_PROBE, ...LIVE },
          (r) => {
            r.setImage(image);
            r.setParams(PARAMS);
            r.render();
            ahead(r);
            const toggled = (bag: Record<string, unknown>): number => {
              const t0 = performance.now();
              r.setContributedParams(bag);
              r.render();
              gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
              return performance.now() - t0;
            };
            const before = tally.created.program;
            const firstMs = toggled(STAGE_BAG());
            const builds = tally.created.program - before;
            toggled({});
            const laterMs = toggled(viewValues({ ...DEFAULT_PREFS, style: "edges", sensitivity: 70 }, 100));
            return { builds, later: tally.created.program - before - builds, firstMs, laterMs, dormant: r.dormantStages };
          },
          canvas,
        );
      } finally {
        tally.restore();
      }
    }

    const log = (what: string, t: ReturnType<typeof toggles>) =>
      console.log(`[fm-gpu] 96×64 toggle on ${what}, ms: first ${t.firstMs.toFixed(1)} (builds ${t.builds}), later with the passes rerun ${t.laterMs.toFixed(1)}`);

    it("builds no develop program, only its passes' own the first time, and nothing after", () => {
      const t = toggles(() => {});
      log("unprepared", t);
      expect(t.builds).toBe(PASS_COUNT);
      expect(t.later).toBe(0);
      expect(t.dormant).toEqual([]);
    });

    it("builds nothing at all once the idle hint built its passes ahead", () => {
      const t = toggles((r) => r.prewarmStages([STAGE_ID]));
      // SwiftShader turns each program into machine code at its first draw, so
      // the time here doesn't show what the hint saves a hardware driver.
      const parallel = glHarness().gl.getExtension("KHR_parallel_shader_compile") !== null;
      log(`after the hint (parallel compile ${parallel ? "on" : "off"})`, t);
      expect(t.builds).toBe(0);
      expect(t.later).toBe(0);
    });

    it("costs no draw or target while off, and binds only its switch and its result's unit", () => {
      const { canvas, gl } = glHarness();
      const frameCalls = (stages: ProcessingStageContribution[]) => {
        const tally = trackGlObjects(gl);
        const counts = { draws: 0, uniforms: 0, framebuffers: 0 };
        const drawArrays = gl.drawArrays;
        const uniformNames = Object.getOwnPropertyNames(WebGL2RenderingContext.prototype).filter((n) => /^uniform(\d|Matrix)/.test(n));
        try {
          return withRenderer(
            { pipeline: OPEN_PROBE, ...LIVE, stages },
            (r) => {
              r.setImage(image);
              r.setParams(PARAMS);
              r.render();
              const framebuffers = tally.created.framebuffer;
              gl.drawArrays = (...args) => {
                counts.draws++;
                drawArrays.apply(gl, args);
              };
              for (const name of uniformNames) {
                const original = Reflect.get(gl, name) as (...args: unknown[]) => void;
                Reflect.set(gl, name, (...args: unknown[]) => {
                  counts.uniforms++;
                  original.apply(gl, args);
                });
              }
              r.render();
              counts.framebuffers = tally.created.framebuffer - framebuffers;
              return counts;
            },
            canvas,
          );
        } finally {
          gl.drawArrays = drawArrays;
          for (const name of uniformNames) Reflect.deleteProperty(gl, name);
          tally.restore();
        }
      };
      const without = frameCalls([]);
      const off = frameCalls([focusStage()]);
      console.log(`[fm-gpu] a frame while off: ${JSON.stringify(off)}, without the extension: ${JSON.stringify(without)}`);
      expect(off.draws).toBe(without.draws);
      expect(off.framebuffers).toBe(0);
      expect(off.uniforms - without.uniforms).toBeLessThanOrEqual(2);
    });
  });

  it("costs a full-size frame no more than a few times the idle one", () => {
    const big = scene(1536, 1024, 0.5);
    const timed: Record<string, number> = {};
    // A one-pixel read waits for the frame, which render() alone doesn't.
    const drawn = () => glHarness().gl.readPixels(0, 0, 1, 1, glHarness().gl.RGBA, glHarness().gl.UNSIGNED_BYTE, new Uint8Array(4));
    withScene(big, { stages: [focusStage()], drawsViewStages: true }, {}, (renderer) => {
      const time = (name: string, bag: Record<string, unknown>, warm: boolean) => {
        renderer.setContributedParams(bag);
        if (warm) {
          renderer.render();
          drawn();
        }
        const t0 = performance.now();
        renderer.setContributedParams({ ...bag });
        renderer.render();
        drawn();
        timed[name] = performance.now() - t0;
      };
      time("off", {}, true);
      time("on, passes cached", STAGE_BAG(), true);
      time("on, passes rerun", viewValues({ ...DEFAULT_PREFS, sensitivity: 70 }, 100), false);
    });
    console.log(`[fm-gpu] 1536×1024 frame, ms: ${JSON.stringify(timed)}`);
    expect(timed["on, passes cached"]).toBeLessThan(Math.max(10 * timed.off, 5000));
    expect(timed["on, passes rerun"]).toBeLessThan(15_000);
  });
});
