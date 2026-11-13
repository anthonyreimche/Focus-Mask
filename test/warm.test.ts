// The first toggle draws at once: while the mask is off, once Develop is idle
// with a photo, the extension asks the live view to build the programs its
// passes need (api.develop.prewarmStages), in the background.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activate, deactivate } from "../src/index";
import { viewStore } from "../src/view";
import { fakeApi, type Rig } from "./support/fake-api";

let rig: Rig;
beforeEach(() => {
  vi.useFakeTimers();
  rig = fakeApi();
});
afterEach(() => {
  deactivate();
  vi.useRealTimers();
});

const idle = () => vi.runAllTimers();

describe("building ahead", () => {
  it("asks once Develop is idle with a photo open", () => {
    activate(rig.api);
    expect(rig.prewarms()).toBe(0);
    idle();
    expect(rig.prewarms()).toBe(1);
  });

  it("asks again for another photo, and not again for the same one", () => {
    activate(rig.api);
    idle();
    rig.ui.setState({ activeModule: "library" });
    rig.ui.setState({ activeModule: "develop" });
    idle();
    expect(rig.prewarms()).toBe(1);
    rig.develop.setState({ photoId: "p2" });
    idle();
    expect(rig.prewarms()).toBe(2);
  });

  it("waits for Develop and a photo", () => {
    rig.ui.setState({ activeModule: "library" });
    activate(rig.api);
    idle();
    rig.ui.setState({ activeModule: "develop" });
    rig.develop.setState({ photoId: null });
    idle();
    expect(rig.prewarms()).toBe(0);
    rig.develop.setState({ photoId: "p1" });
    idle();
    expect(rig.prewarms()).toBe(1);
  });

  it("doesn't ask while the mask is on, which builds them anyway", () => {
    activate(rig.api);
    viewStore().getState().toggle();
    idle();
    expect(rig.prewarms()).toBe(0);
  });

  it("asks nothing once stopped", () => {
    activate(rig.api);
    deactivate();
    idle();
    expect(rig.prewarms()).toBe(0);
  });
});
