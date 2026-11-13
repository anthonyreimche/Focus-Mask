// Focus Mask, a Safelight extension (GPL-3.0-or-later).
//
// Highlights the parts of the photo in sharp focus on the Develop canvas, as a
// tint over in-focus areas or as coloured edges, so focus can be judged and
// frames compared without zooming to 100 %. Registers the view-only stage
// (stage.ts), the status bar toggle with its options (Toolbar.tsx), a
// shortcut and the same options in Preferences.

import { EXTENSION_ID, STAGE_ID, TOGGLE_ACTION, TOOLBAR_SLOT } from "./ids";
import { SETTINGS_FIELDS } from "./prefs";
import { initRuntime } from "./rt";
import type { SafelightAPI } from "./safelight";
import { focusStage } from "./stage";
import { FocusToolbar } from "./Toolbar";
import { inDevelop, initView, stopView, viewStore } from "./view";

export { EXTENSION_ID };

// Null until activate() runs.
let activeHost: SafelightAPI | null = null;

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  initView();
  activeHost = host;
  host.registerProcessingStage(focusStage());
  host.registerSlot({ id: TOOLBAR_SLOT, slot: "develop-toolbar", component: FocusToolbar });
  host.registerKeybinding({
    id: TOGGLE_ACTION,
    label: "Focus mask",
    category: "Develop",
    defaultCombo: "Shift+F",
    handler: () => {
      if (inDevelop()) viewStore().getState().toggle();
    },
  });
  host.registerSettings({ title: "Focus Mask", fields: SETTINGS_FIELDS, keywords: ["focus", "peaking", "sharpness"] });
}

export function deactivate(): void {
  const host = activeHost;
  if (!host) return;
  activeHost = null;
  // A throw here would skip the host's sweep of this extension's
  // registrations, so a failure is logged instead.
  try {
    stopView();
    host.unregisterProcessingStage(STAGE_ID);
  } catch (err) {
    console.warn("[focus-mask] deactivate failed:", err);
  }
}
