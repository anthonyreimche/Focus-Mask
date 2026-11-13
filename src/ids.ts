// The extension's ids and its stage's keys. Every key starts with `fm`: the
// host rewrites uniform keys wherever they appear as whole words in the
// stage's GLSL, so a key must not collide with a GLSL name.

export const EXTENSION_ID = "focus-mask";
export const STAGE_ID = `${EXTENSION_ID}.stage`;
export const TOGGLE_ACTION = `${EXTENSION_ID}.toggle`;
export const TOOLBAR_SLOT = `${EXTENSION_ID}.toolbar`;

/** The inline's one uniform, which the live view binds every frame, on or off:
 *  the colour in rgb and the style in a (SHOW_OFF, SHOW_TINT or SHOW_EDGES). */
export const SHOW_KEY = "fmShow";
export const SHOW_OFF = 0;
export const SHOW_TINT = 1;
export const SHOW_EDGES = 2;
/** The classifying pass's uniforms. */
export const RATIO_KEY = "fmSharpRatio2";
export const GATE_KEY = "fmEdgeGate";

export const qualified = (key: string): string => `${STAGE_ID}.${key}`;

/** The host's name for a stage's prepass result sampler, `u_{hash}_stageResult`:
 *  the inline reads it at several points across a screen pixel. The hash is the
 *  host's own (shader-compiler.ts hashStageId). */
export function resultSampler(stageId: string): string {
  let h = 0;
  for (let i = 0; i < stageId.length; i++) h = ((h << 5) - h + stageId.charCodeAt(i)) | 0;
  return `u_${(h >>> 0).toString(36).slice(0, 4)}_stageResult`;
}
