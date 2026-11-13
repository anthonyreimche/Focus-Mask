// A stand-in Safelight API for unit tests, over real React and zustand. It has
// only what this extension uses: reading any other member throws, naming it,
// so a test shows what to add here when the extension starts using more.
//
// The develop, catalog and UI stores are zustand stores holding the fields the
// extension reads. The develop store also holds the photo's param bag and
// counts its commits, so a test can tell that the extension never edits the
// photo. setViewValues records each call, prewarmStages counts its calls, the settings are a Map that tells
// its listeners of each write, and core's Slider is a stub that keeps the
// props it was last drawn with. The UI kit's SegmentedControl is a row of
// buttons and its Select a native select.

import * as React from "react";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  CatalogPhoto,
  KeyActionContribution,
  ProcessingStageContribution,
  SafelightAPI,
  SegmentedControlProps,
  SelectProps,
  SettingsContribution,
  SliderProps,
  SlotContribution,
  UITokens,
} from "../../src/safelight";
import { EXTENSION_ID } from "../../src/ids";

interface DevelopSlice {
  photoId: string | null;
  paramBag: Record<string, unknown>;
  setDynParams(patch: Record<string, unknown>): void;
  commitEdit(label: string): Promise<void>;
}
interface CatalogSlice {
  photos: CatalogPhoto[];
}
interface UiSlice {
  activeModule: string;
}

type Store<T> = UseBoundStore<StoreApi<T>>;

/** The members of SafelightAPI this fake implements, typed against the real thing. */
type FakeMembers = Pick<
  SafelightAPI,
  "version" | "extensionId" | "react" | "registerProcessingStage" | "registerSlot" | "registerKeybinding" | "registerSettings" | "unregisterProcessingStage"
> & {
  settings: SafelightAPI["settings"];
  keybindings: Pick<SafelightAPI["keybindings"], "getBinding">;
  components: Pick<SafelightAPI["components"], "Slider">;
  ui: Pick<SafelightAPI["ui"], "Field" | "SegmentedControl" | "Select" | "Stack" | "tokens">;
  develop: Pick<SafelightAPI["develop"], "setViewValues" | "prewarmStages">;
  stores: { useDevelopStore: Store<DevelopSlice>; useCatalogStore: Store<CatalogSlice>; useUIStore: Store<UiSlice>; create: SafelightAPI["stores"]["create"] };
};

export interface Rig {
  api: SafelightAPI;
  stages: ProcessingStageContribution[];
  unregistered: string[];
  slots: SlotContribution[];
  keys: KeyActionContribution[];
  settingsSections: SettingsContribution[];
  /** Every setViewValues call, in order. */
  viewValues: (Record<string, unknown> | null)[];
  /** How many prewarmStages calls were made. */
  prewarms(): number;
  settings: Map<string, unknown>;
  develop: Store<DevelopSlice>;
  catalog: Store<CatalogSlice>;
  ui: Store<UiSlice>;
  /** The labels of the undo steps the extension made. */
  commits: string[];
  /** The latest props of each slider drawn in `root`, in document order. */
  sliders(root: ParentNode): SliderProps[];
}

const TOKENS = {
  textPrimary: "var(--color-text-primary)",
  textMuted: "var(--color-text-muted)",
  surface2: "var(--color-surface-2)",
  border: "var(--color-border)",
} as Partial<UITokens> as UITokens;

export function photo(id: string, iso?: number): CatalogPhoto {
  return { id, filename: `${id}.NEF`, exif: iso === undefined ? {} : { iso } } as CatalogPhoto;
}

export function fakeApi(): Rig {
  const stages: ProcessingStageContribution[] = [];
  const unregistered: string[] = [];
  const slots: SlotContribution[] = [];
  const keys: KeyActionContribution[] = [];
  const settingsSections: SettingsContribution[] = [];
  const viewValues: (Record<string, unknown> | null)[] = [];
  const commits: string[] = [];
  let prewarms = 0;
  const settings = new Map<string, unknown>();
  const settingListeners = new Set<(key: string, value: unknown) => void>();
  const sliderProps = new Map<number, SliderProps>();
  let nextSlider = 0;

  const develop = create<DevelopSlice>()((set) => ({
    photoId: "p1",
    paramBag: {},
    setDynParams: (patch) => set((s) => ({ paramBag: { ...s.paramBag, ...patch } })),
    commitEdit: (label) => {
      commits.push(label);
      return Promise.resolve();
    },
  }));
  const catalog = create<CatalogSlice>()(() => ({ photos: [photo("p1", 3200), photo("p2", 100)] }));
  const ui = create<UiSlice>()(() => ({ activeModule: "develop" }));

  function Slider(props: SliderProps) {
    const id = React.useRef(nextSlider++).current;
    sliderProps.set(id, props);
    return React.createElement("div", { "data-slider": id }, `${props.label} ${props.value}`);
  }

  function SegmentedControl({ value, onChange, options }: SegmentedControlProps) {
    return React.createElement(
      "div",
      { role: "group" },
      options.map((o) =>
        React.createElement("button", { key: o.value, type: "button", "aria-pressed": o.value === value, onClick: () => onChange(o.value) }, o.label),
      ),
    );
  }

  function Select({ value, onChange, options, ariaLabel }: SelectProps) {
    return React.createElement(
      "select",
      { value, "aria-label": ariaLabel, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) },
      (options ?? []).map((o) => React.createElement("option", { key: o.value, value: o.value }, o.label)),
    );
  }

  const members: FakeMembers = {
    version: 1,
    extensionId: EXTENSION_ID,
    react: React,
    registerProcessingStage: (c) => void stages.push(c),
    unregisterProcessingStage: (id) => void unregistered.push(id),
    registerSlot: (c) => void slots.push(c),
    registerKeybinding: (c) => void keys.push(c),
    registerSettings: (c) => void settingsSections.push(c),
    settings: {
      get: <T,>(key: string, fallback: T): T => (settings.has(key) ? (settings.get(key) as T) : fallback),
      set: (key, value) => {
        settings.set(key, value);
        for (const l of settingListeners) l(key, value);
      },
      onChange: (cb) => {
        settingListeners.add(cb);
        return () => void settingListeners.delete(cb);
      },
    },
    keybindings: { getBinding: (id) => keys.find((k) => k.id === id)?.defaultCombo ?? "" },
    components: { Slider },
    ui: {
      Field: ({ label, children }) => React.createElement("div", null, label, children),
      SegmentedControl,
      Select,
      Stack: ({ children }) => React.createElement("div", null, children),
      tokens: TOKENS,
    },
    develop: {
      setViewValues: (values) => void viewValues.push(values),
      prewarmStages: () => void prewarms++,
    },
    stores: { useDevelopStore: develop, useCatalogStore: catalog, useUIStore: ui, create },
  };

  return {
    // The fake implements a typed subset; the strict proxy turns any other
    // member's read into a test failure that names it.
    api: strict(members, "api") as unknown as SafelightAPI,
    stages,
    unregistered,
    slots,
    keys,
    settingsSections,
    viewValues,
    prewarms: () => prewarms,
    settings,
    develop,
    catalog,
    ui,
    commits,
    sliders: (root) =>
      [...root.querySelectorAll("[data-slider]")].map((el) => {
        const props = sliderProps.get(Number(el.getAttribute("data-slider")));
        if (!props) throw new Error("a slider without props");
        return props;
      }),
  };
}

/** Wraps a plain object so reading a member it lacks throws, naming the member. */
function strict<T extends object>(target: T, path: string): T {
  return new Proxy(target, {
    get(obj, key, receiver) {
      if (typeof key === "symbol" || key === "then" || key === "toJSON") return Reflect.get(obj, key, receiver);
      if (!(key in obj)) throw new Error(`The fake API has no ${path}.${key}. Add it to test/support/fake-api.ts.`);
      const value: unknown = Reflect.get(obj, key, receiver);
      const isPlainObject = typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
      return isPlainObject && key !== "react" ? strict(value, `${path}.${key}`) : value;
    },
  });
}
