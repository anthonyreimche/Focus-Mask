// The status bar's Focus toggle and its options card.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activate, deactivate } from "../src/index";
import { DEFAULT_SENSITIVITY } from "../src/measure";
import { PREF_KEYS } from "../src/prefs";
import { React } from "../src/rt";
import { FocusToolbar } from "../src/Toolbar";
import { viewStore } from "../src/view";
import { fakeApi, type Rig } from "./support/fake-api";

let rig: Rig;
beforeEach(() => {
  rig = fakeApi();
  activate(rig.api);
});
afterEach(() => {
  cleanup();
  deactivate();
});

const toggleButton = () => screen.getByRole("button", { name: "Toggle focus mask" });
const optionsButton = () => screen.getByRole("button", { name: "Focus mask options" });

describe("the Focus toggle", () => {
  it("turns the mask on and off, and shows which", () => {
    render(<FocusToolbar />);
    expect(toggleButton().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggleButton());
    expect(viewStore().getState().on).toBe(true);
    expect(toggleButton().getAttribute("aria-pressed")).toBe("true");
    expect(rig.viewValues).toHaveLength(1);
    fireEvent.click(toggleButton());
    expect(rig.viewValues.at(-1)).toBeNull();
  });

  it("names its shortcut", () => {
    render(<FocusToolbar />);
    expect(toggleButton().title).toContain("Shift+F");
  });

  it("follows the shortcut", () => {
    render(<FocusToolbar />);
    act(() => rig.keys[0].handler());
    expect(toggleButton().getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the options card", () => {
  it("opens with the sensitivity, style and colour", () => {
    render(<FocusToolbar />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(optionsButton());
    const card = screen.getByRole("dialog", { name: "Focus mask options" });
    const [slider] = rig.sliders(card);
    expect(slider).toMatchObject({ label: "Sensitivity", value: DEFAULT_SENSITIVITY, min: 0, max: 100, defaultValue: DEFAULT_SENSITIVITY });
    expect(screen.getByRole("button", { name: "Tint" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("combobox", { name: "Highlight colour" }) as HTMLSelectElement).value).toBe("green");
  });

  it("saves each change as a view preference", () => {
    render(<FocusToolbar />);
    fireEvent.click(optionsButton());
    const card = screen.getByRole("dialog");
    act(() => rig.sliders(card)[0].onChange(75));
    fireEvent.click(screen.getByRole("button", { name: "Edges" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Highlight colour" }), { target: { value: "red" } });
    expect(Object.fromEntries(rig.settings)).toEqual({
      [PREF_KEYS.sensitivity]: 75,
      [PREF_KEYS.style]: "edges",
      [PREF_KEYS.colour]: "red",
    });
    expect(viewStore().getState().prefs).toEqual({ sensitivity: 75, style: "edges", colour: "red" });
    expect(screen.getByRole("button", { name: "Edges" }).getAttribute("aria-pressed")).toBe("true");
    expect(rig.develop.getState().paramBag).toEqual({});
  });

  it("closes on Escape through the app's Escape stack, and gives the key back", () => {
    render(<FocusToolbar />);
    expect(rig.escapeHolders()).toBe(0);
    fireEvent.click(optionsButton());
    expect(rig.escapeHolders()).toBe(1);
    act(() => rig.pressEscape());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(rig.escapeHolders()).toBe(0);
  });

  it("closes on a press outside it, and stays open for one inside", () => {
    render(
      <div>
        <FocusToolbar />
        <p>canvas</p>
      </div>,
    );
    fireEvent.click(optionsButton());
    fireEvent.pointerDown(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.pointerDown(screen.getByText("canvas"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
