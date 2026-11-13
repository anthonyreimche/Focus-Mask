// The stage contract the host relies on, and what a draw may cost. Unit tests
// can't run GLSL; the GPU spec (test/gpu) renders it.

import { describe, expect, it } from "vitest";
import { GATE_KEY, RATIO_KEY, SHOW_KEY, STAGE_ID, resultSampler } from "../src/ids";
import { MAX_TAPS_PER_DRAW, glslLiteral, inlineGlsl } from "../src/glsl";
import { PASS_COUNT, STAGE_PRIORITY, focusStage } from "../src/stage";

const stage = focusStage();
const passes = stage.passes ?? [];

/** Texture reads in a piece of GLSL. */
const reads = (glsl: string): number => (glsl.match(/\b(readPrev|readSource|fetchInput|texture|textureLod|texelFetch)\(/g) ?? []).length;

describe("the stage", () => {
  it("is a view aid drawn last, over the finished look", () => {
    expect(stage).toMatchObject({ id: STAGE_ID, phase: "output-encode", priority: STAGE_PRIORITY, viewOnly: true });
  });

  it("works in display values, so nothing after it is clipped", () => {
    expect(stage.space).toEqual({ encoding: "perceptual" });
  });

  it("measures the decoded source, before any edit", () => {
    expect(stage.reads ?? "source").toBe("source");
  });

  it("stays in the live view's program while off, so turning it on builds none, and draws nothing until then", () => {
    expect(stage.dormantWhen).toBeUndefined();
    expect(stage.uniforms).toEqual([{ key: SHOW_KEY, glslType: "vec4", default: [0, 0, 0, 0] }]);
    expect(stage.glsl.trim().startsWith(`if (${SHOW_KEY}.a > 0.5) {`)).toBe(true);
  });

  it("declares the inline's one key on the stage and the classifier's on its pass", () => {
    expect(stage.uniforms.map((u) => u.key)).toEqual([SHOW_KEY]);
    expect(passes.map((p) => (p.uniforms ?? []).map((u) => u.key))).toEqual([[], [], [], [RATIO_KEY, GATE_KEY], [], []]);
  });

  it("is kept out of presets", () => {
    expect(stage.presetScope).toBe("per-image");
  });

  it("reads its result by the host's name for it", () => {
    expect(resultSampler("acme.look")).toMatch(/^u_[0-9a-z]{1,4}_stageResult$/);
    expect(stage.glsl).toContain(resultSampler(STAGE_ID));
    expect(inlineGlsl("other.stage")).toContain(resultSampler("other.stage"));
  });
});

describe("a draw's cost", () => {
  it("runs six passes of one draw each", () => {
    expect(passes).toHaveLength(PASS_COUNT);
    for (const p of passes) expect(p.iterations ?? 1).toBe(1);
  });

  it("reads at most 25 texels in any pass draw", () => {
    const counts = passes.map((p) => reads(p.glsl) + reads(p.helpers ?? ""));
    expect(counts).toEqual([0, 25, 25, 4, 25, 25]);
    expect(Math.max(...counts)).toBeLessThanOrEqual(MAX_TAPS_PER_DRAW);
  });

  it("reads ten points of its result per screen pixel in the inline, inside its switch", () => {
    expect(reads(stage.glsl)).toBe(10);
  });

  // The host fetches stageResult for every pixel of a block that names it, and
  // the live view runs the block with the mask off too.
  it("never names stageResult, so nothing is fetched while it is off", () => {
    expect(stage.glsl).not.toMatch(/\bstageResult\b/);
  });

  it("has no loops, constant arrays or branches around a read", () => {
    for (const glsl of [stage.glsl, ...passes.map((p) => p.glsl), passes[0].helpers ?? ""]) {
      expect(glsl).not.toMatch(/\b(for|while)\s*\(/);
      expect(glsl).not.toMatch(/const\s+\w+\s+\w+\s*\[/);
    }
  });

  it("writes float literals GLSL ES accepts", () => {
    expect(glslLiteral(1)).toBe("1.0");
    expect(glslLiteral(-12)).toBe("-12.0");
    expect(Number(glslLiteral(1.5e-9))).toBe(1.5e-9);
    expect(glslLiteral(1.5e-9)).toMatch(/^\d\.\d+e-9$/);
    for (const glsl of [stage.glsl, ...passes.map((p) => p.glsl)]) {
      // A bare integer next to a float operator is a compile error in GLSL ES.
      expect(glsl).not.toMatch(/(?<![\deE])[*+/-]\s*\d+\s*[*;)]/);
    }
  });
});
