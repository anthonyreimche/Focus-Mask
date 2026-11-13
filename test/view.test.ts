// The overlay is a view aid: on and off reach the live view as view values
// alone, never the photo's edit, so the photo isn't marked as edited and no
// history step, preset or copied setting can carry it.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activate, deactivate } from "../src/index";
import { GATE_KEY, RATIO_KEY, SHOW_EDGES, SHOW_KEY, SHOW_TINT, qualified } from "../src/ids";
import { edgeGate, sharpRatio2 } from "../src/measure";
import { COLOURS, DEFAULT_PREFS, PREF_KEYS, readPrefs } from "../src/prefs";
import { viewStore, viewValues } from "../src/view";
import { fakeApi, photo, type Rig } from "./support/fake-api";

let rig: Rig;
beforeEach(() => {
  rig = fakeApi();
  activate(rig.api);
});
afterEach(() => deactivate());

const toggle = () => viewStore().getState().toggle();
const last = () => rig.viewValues.at(-1);

describe("turning the mask on and off", () => {
  it("starts off and hands the view nothing", () => {
    expect(viewStore().getState().on).toBe(false);
    expect(rig.viewValues).toEqual([]);
  });

  it("hands the view the stage's values, and clears them again", () => {
    toggle();
    expect(last()).toEqual(viewValues(DEFAULT_PREFS, 3200));
    toggle();
    expect(last()).toBeNull();
  });

  it("never touches the photo's edit", () => {
    toggle();
    rig.api.settings.set(PREF_KEYS.sensitivity, 80);
    toggle();
    expect(rig.develop.getState().paramBag).toEqual({});
    expect(rig.commits).toEqual([]);
  });
});

describe("the values handed over", () => {
  it("carry the colour and style in one switch, the sensitivity and the photo's edge gate", () => {
    expect(viewValues({ sensitivity: 70, style: "edges", colour: "red" }, 1600)).toEqual({
      [qualified(SHOW_KEY)]: [...COLOURS.red.rgb, SHOW_EDGES],
      [qualified(RATIO_KEY)]: sharpRatio2(70),
      [qualified(GATE_KEY)]: edgeGate(1600),
    });
    expect(viewValues(DEFAULT_PREFS, 100)[qualified(SHOW_KEY)]).toEqual([...COLOURS.green.rgb, SHOW_TINT]);
  });

  it("follow the preferences while on", () => {
    toggle();
    rig.api.settings.set(PREF_KEYS.style, "edges");
    rig.api.settings.set(PREF_KEYS.colour, "yellow");
    expect(last()?.[qualified(SHOW_KEY)]).toEqual([...COLOURS.yellow.rgb, SHOW_EDGES]);
  });

  it("wait while off", () => {
    rig.api.settings.set(PREF_KEYS.style, "edges");
    expect(rig.viewValues).toEqual([]);
  });

  it("follow the open photo's ISO", () => {
    toggle();
    rig.develop.setState({ photoId: "p2" });
    expect(last()?.[qualified(GATE_KEY)]).toBe(edgeGate(100));
    rig.catalog.setState({ photos: [photo("p1"), photo("p2", 6400)] });
    expect(last()?.[qualified(GATE_KEY)]).toBe(edgeGate(6400));
  });

  it("aren't handed again for a change that changes none of them", () => {
    toggle();
    const calls = rig.viewValues.length;
    rig.catalog.setState({ photos: [...rig.catalog.getState().photos] });
    rig.develop.setState({ paramBag: { other: 1 } });
    expect(rig.viewValues).toHaveLength(calls);
  });
});

describe("stored preferences", () => {
  it("fall back to the defaults when missing or malformed", () => {
    expect(readPrefs(rig.api.settings)).toEqual(DEFAULT_PREFS);
    rig.api.settings.set(PREF_KEYS.sensitivity, "lots");
    rig.api.settings.set(PREF_KEYS.style, "glow");
    rig.api.settings.set(PREF_KEYS.colour, "toString");
    expect(readPrefs(rig.api.settings)).toEqual(DEFAULT_PREFS);
    rig.api.settings.set(PREF_KEYS.sensitivity, 140);
    expect(readPrefs(rig.api.settings).sensitivity).toBe(100);
  });
});
