// The view preferences, kept in api.settings: how sharp counts as in focus,
// the highlight's colour and its style. They are the person's, not the
// photo's, so they never reach an edit, a preset or the history.

import { DEFAULT_SENSITIVITY } from "./measure";
import type { SafelightAPI, SettingsField } from "./safelight";

export type Style = "tint" | "edges";

export const COLOURS = {
  green: { label: "Green", rgb: [0.2, 1, 0.2] },
  red: { label: "Red", rgb: [1, 0.15, 0.15] },
  yellow: { label: "Yellow", rgb: [1, 0.9, 0.1] },
  cyan: { label: "Cyan", rgb: [0.1, 0.85, 1] },
  white: { label: "White", rgb: [1, 1, 1] },
} as const satisfies Record<string, { label: string; rgb: readonly [number, number, number] }>;

export type ColourId = keyof typeof COLOURS;

export interface Prefs {
  /** 0 to 100: higher lets more blur count as in focus. */
  sensitivity: number;
  style: Style;
  colour: ColourId;
}

export const PREF_KEYS = { sensitivity: "sensitivity", style: "style", colour: "colour" } as const;

export const DEFAULT_PREFS: Prefs = { sensitivity: DEFAULT_SENSITIVITY, style: "tint", colour: "green" };

export const STYLE_LABELS: Readonly<Record<Style, string>> = { tint: "Tint", edges: "Edges" };

const isStyle = (v: unknown): v is Style => v === "tint" || v === "edges";
const isColour = (v: unknown): v is ColourId => typeof v === "string" && Object.hasOwn(COLOURS, v);

/** The stored preferences, each one that is missing or malformed at its default. */
export function readPrefs(settings: SafelightAPI["settings"]): Prefs {
  const sensitivity: unknown = settings.get(PREF_KEYS.sensitivity, DEFAULT_PREFS.sensitivity);
  const style: unknown = settings.get(PREF_KEYS.style, DEFAULT_PREFS.style);
  const colour: unknown = settings.get(PREF_KEYS.colour, DEFAULT_PREFS.colour);
  return {
    sensitivity:
      typeof sensitivity === "number" && Number.isFinite(sensitivity)
        ? Math.min(Math.max(sensitivity, 0), 100)
        : DEFAULT_PREFS.sensitivity,
    style: isStyle(style) ? style : DEFAULT_PREFS.style,
    colour: isColour(colour) ? colour : DEFAULT_PREFS.colour,
  };
}

/** The same preferences in Preferences ▸ Extensions. */
export const SETTINGS_FIELDS: SettingsField[] = [
  {
    key: PREF_KEYS.sensitivity,
    label: "Sensitivity",
    hint: "Higher lets slightly soft detail count as in focus.",
    type: "number",
    default: DEFAULT_PREFS.sensitivity,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: PREF_KEYS.style,
    label: "Style",
    type: "select",
    default: DEFAULT_PREFS.style,
    options: (Object.keys(STYLE_LABELS) as Style[]).map((value) => ({ value, label: STYLE_LABELS[value] })),
  },
  {
    key: PREF_KEYS.colour,
    label: "Colour",
    type: "select",
    default: DEFAULT_PREFS.colour,
    options: (Object.keys(COLOURS) as ColourId[]).map((value) => ({ value, label: COLOURS[value].label })),
  },
];
