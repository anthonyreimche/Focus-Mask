// The Develop status bar's Focus toggle, styled as the view toggles beside it
// (Assess, Proof), with a small options card above it: sensitivity, style and
// colour, saved as view preferences.

import { React, api } from "./rt";
import { TOGGLE_ACTION } from "./ids";
import { DEFAULT_SENSITIVITY } from "./measure";
import { COLOURS, PREF_KEYS, STYLE_LABELS, type ColourId, type Style } from "./prefs";
import { viewStore } from "./view";

/** A text button in the status bar's look: muted, primary when on or hovered. */
function BarButton(props: {
  pressed?: boolean;
  expanded?: boolean;
  label: string;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = React.useState(false);
  const { tokens } = api.ui;
  const lit = props.pressed === true || props.expanded === true || hover;
  return (
    <button
      type="button"
      onClick={props.onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={props.title}
      aria-label={props.label}
      aria-pressed={props.pressed}
      aria-expanded={props.expanded}
      style={{ fontSize: 10, color: lit ? tokens.textPrimary : tokens.textMuted }}
    >
      {props.children}
    </button>
  );
}

function Options(props: { onClose: () => void }) {
  const { Field, SegmentedControl, Select, Stack, tokens } = api.ui;
  const { Slider } = api.components;
  const prefs = viewStore()((s) => s.prefs);
  const card = React.useRef<HTMLDivElement>(null);
  const { onClose } = props;

  React.useEffect(() => {
    const away = (e: PointerEvent) => {
      const anchor = card.current?.parentElement;
      if (anchor && e.target instanceof Node && !anchor.contains(e.target)) onClose();
    };
    // Captured ahead of the app's own Escape handling, which would act as well.
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", escape, true);
    };
  }, [onClose]);

  return (
    <div
      ref={card}
      role="dialog"
      aria-label="Focus mask options"
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        right: 0,
        width: 232,
        zIndex: 60,
        padding: 10,
        borderRadius: 6,
        border: `1px solid ${tokens.border}`,
        background: tokens.surface2,
        color: tokens.textPrimary,
        boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
      }}
    >
      <Stack gap={8}>
        <Slider
          label="Sensitivity"
          value={prefs.sensitivity}
          min={0}
          max={100}
          step={1}
          defaultValue={DEFAULT_SENSITIVITY}
          compact
          onChange={(v) => api.settings.set(PREF_KEYS.sensitivity, v)}
        />
        <Field label="Style">
          <SegmentedControl
            value={prefs.style}
            onChange={(v) => api.settings.set(PREF_KEYS.style, v)}
            options={(Object.keys(STYLE_LABELS) as Style[]).map((value) => ({ value, label: STYLE_LABELS[value] }))}
          />
        </Field>
        <Field label="Colour">
          <Select
            value={prefs.colour}
            ariaLabel="Highlight colour"
            onChange={(v) => api.settings.set(PREF_KEYS.colour, v)}
            options={(Object.keys(COLOURS) as ColourId[]).map((value) => ({ value, label: COLOURS[value].label }))}
          />
        </Field>
      </Stack>
    </div>
  );
}

export function FocusToolbar() {
  const store = viewStore();
  const on = store((s) => s.on);
  const toggle = store((s) => s.toggle);
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const combo = api.keybindings.getBinding(TOGGLE_ACTION);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 3 }}>
      <BarButton
        pressed={on}
        onClick={toggle}
        label="Toggle focus mask"
        title={`Focus mask${combo ? ` (${combo})` : ""}: highlight what is in sharp focus`}
      >
        Focus
      </BarButton>
      <BarButton expanded={open} onClick={() => setOpen(!open)} label="Focus mask options" title="Focus mask options">
        ▾
      </BarButton>
      {open && <Options onClose={close} />}
    </span>
  );
}
