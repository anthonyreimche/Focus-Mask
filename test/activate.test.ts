// What activate() registers, all named under the manifest's id, and what
// deactivate() takes down.

import { afterEach, describe, expect, it } from "vitest";
import manifest from "../safelight.json";
import pkg from "../package.json";
import { activate, deactivate } from "../src/index";
import { EXTENSION_ID, STAGE_ID, TOGGLE_ACTION, TOOLBAR_SLOT } from "../src/ids";
import { SETTINGS_FIELDS } from "../src/prefs";
import { FocusToolbar } from "../src/Toolbar";
import { viewStore } from "../src/view";
import { fakeApi } from "./support/fake-api";

afterEach(() => deactivate());

describe("activate", () => {
  it("registers the view-only stage", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.stages.map((s) => [s.id, s.viewOnly])).toEqual([[STAGE_ID, true]]);
  });

  it("puts the toggle in the Develop status bar", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.slots).toEqual([{ id: TOOLBAR_SLOT, slot: "develop-toolbar", component: FocusToolbar }]);
  });

  it("binds Shift+F, which toggles the mask in Develop only", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.keys.map((k) => [k.id, k.defaultCombo, k.category])).toEqual([[TOGGLE_ACTION, "Shift+F", "Develop"]]);
    rig.keys[0].handler();
    expect(viewStore().getState().on).toBe(true);
    rig.nav.module = "library";
    rig.keys[0].handler();
    expect(viewStore().getState().on).toBe(true);
  });

  it("offers the options in Preferences too", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.settingsSections).toHaveLength(1);
    expect(rig.settingsSections[0].fields).toBe(SETTINGS_FIELDS);
  });

  it("takes the overlay down when stopped", () => {
    const rig = fakeApi();
    activate(rig.api);
    viewStore().getState().toggle();
    deactivate();
    expect(rig.viewValues.at(-1)).toBeNull();
    expect(rig.unregistered).toEqual([STAGE_ID]);
  });
});

describe("the manifest", () => {
  it("names the contributions' id and needs the build with view-only stages", () => {
    expect(EXTENSION_ID).toBe(manifest.id);
    expect(STAGE_ID.startsWith(`${manifest.id}.`)).toBe(true);
    expect(manifest.minAppVersion).toBe("3.2.8");
  });

  it("says the same version as package.json", () => {
    expect(manifest.version).toBe("1.0.1");
    expect(pkg.version).toBe(manifest.version);
  });
});
