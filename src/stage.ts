// The processing stage: the focus measure's passes (glsl.ts) on the decoded
// source, and the overlay drawn last, over the finished look. It is a view
// aid (viewOnly): exports, thumbnails, captures, colour pickers and the
// histogram draw the photo without it, and its values come from
// api.develop.setViewValues alone, never the photo's edit. While it is off its
// passes don't run (the bag holds none of its values) and its block stays in
// the live view's program behind one uniform, so turning it on builds no
// program: no dormantWhen, which would leave it out and rebuild the program
// on the first toggle.

import { DEFAULT_SENSITIVITY, REF_EDGE, edgeGate, sharpRatio2 } from "./measure";
import { blurGlsl, classifyGlsl, inlineGlsl, LUMA_GLSL, passHelpers, spreadGlsl } from "./glsl";
import { GATE_KEY, RATIO_KEY, SHOW_KEY, STAGE_ID } from "./ids";
import type { ProcessingStageContribution, StagePass } from "./safelight";

/** The last of every output-encode stage, so the overlay covers the finished look. */
export const STAGE_PRIORITY = 1000;

export const PASS_COUNT = 6;

/** The stage, its distances anchored to `refEdge` (REF_EDGE but in tests). */
export function focusStage(refEdge: number = REF_EDGE, id: string = STAGE_ID): ProcessingStageContribution {
  const helpers = passHelpers(refEdge);
  const pass = (glsl: string, extra: Partial<StagePass> = {}): StagePass => ({ glsl, helpers, ...extra });
  return {
    id,
    name: "Focus Mask",
    phase: "output-encode",
    priority: STAGE_PRIORITY,
    space: { encoding: "perceptual" },
    viewOnly: true,
    presetScope: "per-image",
    glsl: inlineGlsl(id),
    uniforms: [{ key: SHOW_KEY, glslType: "vec4", default: [0, 0, 0, 0] }],
    passes: [
      pass(LUMA_GLSL),
      pass(blurGlsl("x", true)),
      pass(blurGlsl("y", false)),
      pass(classifyGlsl(), {
        uniforms: [
          { key: RATIO_KEY, glslType: "float", default: sharpRatio2(DEFAULT_SENSITIVITY) },
          { key: GATE_KEY, glslType: "float", default: edgeGate(undefined) },
        ],
      }),
      pass(spreadGlsl("x")),
      pass(spreadGlsl("y")),
    ],
  };
}
