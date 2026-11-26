// Whether the overlay is on, and the view values that draw it. On or off is
// this window's alone, for the session: it starts off, and stays as it is from
// photo to photo so frames can be compared. Turning it on hands the live view
// the stage's values (api.develop.setViewValues), which never reach the edit,
// so the photo isn't marked as edited and nothing reaches the history,
// presets, copied settings, thumbnails or exports.

import { edgeGate, sharpRatio2 } from "./measure";
import { COLOURS, readPrefs, type Prefs } from "./prefs";
import { GATE_KEY, RATIO_KEY, SHOW_EDGES, SHOW_KEY, SHOW_TINT, qualified } from "./ids";
import { api } from "./rt";
import type { AppStore, CatalogPhoto } from "./safelight";

export interface ViewState {
  on: boolean;
  prefs: Prefs;
  toggle(): void;
}

/** The stage's values for `prefs`, for a photo shot at `iso`. */
export function viewValues(prefs: Prefs, iso: number | undefined): Record<string, unknown> {
  return {
    [qualified(SHOW_KEY)]: [...COLOURS[prefs.colour].rgb, prefs.style === "edges" ? SHOW_EDGES : SHOW_TINT],
    [qualified(RATIO_KEY)]: sharpRatio2(prefs.sensitivity),
    [qualified(GATE_KEY)]: edgeGate(iso),
  };
}

let current: AppStore<ViewState> | null = null;
let stops: (() => void)[] = [];

export function viewStore(): AppStore<ViewState> {
  if (!current) throw new Error("[focus-mask] viewStore() called before activate()");
  return current;
}

function activePhoto(): CatalogPhoto | undefined {
  const id = api.stores.useDevelopStore.getState().photoId;
  return id ? api.stores.useCatalogStore.getState().photos.find((p) => p.id === id) : undefined;
}

// The last values handed over, so an unrelated change hands nothing.
let shown = "null";

function apply(): void {
  const { on, prefs } = viewStore().getState();
  const values = on ? viewValues(prefs, activePhoto()?.exif.iso) : null;
  const key = JSON.stringify(values);
  if (key === shown) return;
  shown = key;
  api.develop.setViewValues(values);
}

// How long an ask to build ahead waits for the window to fall idle at most.
const WARM_WAIT_MS = 2000;

// The photo the passes were last asked to be built for, and a pending ask's cancel.
let warmedFor: string | null = null;
let cancelWarm: (() => void) | null = null;

function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(fn, { timeout: WARM_WAIT_MS });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, WARM_WAIT_MS);
  return () => clearTimeout(id);
}

// Once Develop is idle with a photo, the live view is asked to build the
// programs the passes need, so the first toggle draws at once. Asked once a
// photo (its processing version picks the programs); turning the mask on
// builds them anyway.
function warmSoon(): void {
  const photoId = api.stores.useDevelopStore.getState().photoId;
  if (cancelWarm || !photoId || photoId === warmedFor || !inDevelop()) return;
  cancelWarm = whenIdle(() => {
    cancelWarm = null;
    const now = api.stores.useDevelopStore.getState().photoId;
    if (!now || !inDevelop()) return;
    warmedFor = now;
    if (!viewStore().getState().on) api.develop.prewarmStages();
  });
}

export function initView(): void {
  shown = "null";
  current = api.stores.create<ViewState>((set, get) => ({
    on: false,
    prefs: readPrefs(api.settings),
    toggle: () => set({ on: !get().on }),
  }));
  const store = current;
  stops = [
    store.subscribe(apply),
    api.settings.onChange(() => store.setState({ prefs: readPrefs(api.settings) })),
    api.stores.useDevelopStore.subscribe((s, prev) => {
      if (s.photoId === prev.photoId) return;
      if (store.getState().on) apply();
      warmSoon();
    }),
    api.stores.useUIStore.subscribe((s, prev) => {
      if (s.activeModule !== prev.activeModule) warmSoon();
    }),
    // A RAW imported from its camera preview learns its ISO later.
    api.stores.useCatalogStore.subscribe((s, prev) => {
      if (s.photos !== prev.photos && store.getState().on) apply();
    }),
  ];
  warmSoon();
}

export function stopView(): void {
  for (const stop of stops) stop();
  stops = [];
  cancelWarm?.();
  cancelWarm = null;
  warmedFor = null;
  if (current?.getState().on) api.develop.setViewValues(null);
  current = null;
  shown = "null";
}

/** True with Develop the module this window shows (popped out or not) and a photo open. */
export function inDevelop(): boolean {
  return api.navigation.current() === "develop" && !!api.stores.useDevelopStore.getState().photoId;
}
