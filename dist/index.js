//#region src/ids.ts
var e = "focus-mask", t = `${e}.stage`, n = `${e}.toggle`, r = `${e}.toolbar`, i = "fmShow", a = "fmSharpRatio2", o = "fmEdgeGate", s = (e) => `${t}.${e}`;
function c(e) {
	let t = 0;
	for (let n = 0; n < e.length; n++) t = (t << 5) - t + e.charCodeAt(n) | 0;
	return `u_${(t >>> 0).toString(36).slice(0, 4)}_stageResult`;
}
//#endregion
//#region src/measure.ts
var l = 3072, u = .5, ee = .5, d = [.03, .15], f = .06, p = 1.15, te = 1.3, m = .001, h = [.5, 3];
function ne(e) {
	let t = 1 / (1 + .3275911 * Math.abs(e)), n = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-e * e);
	return e < 0 ? -n : n;
}
var g = (e) => .5 * (1 + ne(e / Math.SQRT2));
function _(e) {
	let t = Math.hypot(1, e), n = Math.hypot(2, e);
	return (g(1 / t) - .5) / (g(1 / n) - .5);
}
function v(e) {
	let t = Math.min(Math.max(e, 0), 100) / 100;
	return h[0] + t * (h[1] - h[0]);
}
var y = (e) => _(v(e)) ** 2, b = (p * _(0)) ** 2;
function x(e) {
	return m * Math.sqrt((e !== void 0 && Number.isFinite(e) && e > 100 ? e : 100) / 100);
}
function S(e, t, n) {
	let r = Array.from({ length: 2 * n + 1 }, (r, i) => Math.exp(-(((i - n) * t) ** 2) / (2 * e * e))), i = r.reduce((e, t) => e + t, 0);
	return r.map((e) => e / i);
}
//#endregion
//#region src/prefs.ts
var C = {
	green: {
		label: "Green",
		rgb: [
			.2,
			1,
			.2
		]
	},
	red: {
		label: "Red",
		rgb: [
			1,
			.15,
			.15
		]
	},
	yellow: {
		label: "Yellow",
		rgb: [
			1,
			.9,
			.1
		]
	},
	cyan: {
		label: "Cyan",
		rgb: [
			.1,
			.85,
			1
		]
	},
	white: {
		label: "White",
		rgb: [
			1,
			1,
			1
		]
	}
}, w = {
	sensitivity: "sensitivity",
	style: "style",
	colour: "colour"
}, T = {
	sensitivity: 40,
	style: "tint",
	colour: "green"
}, E = {
	tint: "Tint",
	edges: "Edges"
}, D = (e) => e === "tint" || e === "edges", re = (e) => typeof e == "string" && Object.hasOwn(C, e);
function O(e) {
	let t = e.get(w.sensitivity, T.sensitivity), n = e.get(w.style, T.style), r = e.get(w.colour, T.colour);
	return {
		sensitivity: typeof t == "number" && Number.isFinite(t) ? Math.min(Math.max(t, 0), 100) : T.sensitivity,
		style: D(n) ? n : T.style,
		colour: re(r) ? r : T.colour
	};
}
var k = [
	{
		key: w.sensitivity,
		label: "Sensitivity",
		hint: "Higher lets slightly soft detail count as in focus.",
		type: "number",
		default: T.sensitivity,
		min: 0,
		max: 100,
		step: 1
	},
	{
		key: w.style,
		label: "Style",
		type: "select",
		default: T.style,
		options: Object.keys(E).map((e) => ({
			value: e,
			label: E[e]
		}))
	},
	{
		key: w.colour,
		label: "Colour",
		type: "select",
		default: T.colour,
		options: Object.keys(C).map((e) => ({
			value: e,
			label: C[e].label
		}))
	}
], A, j;
function ie(e) {
	j = e, A = e.react;
}
//#endregion
//#region src/glsl.ts
function ae(e) {
	let t = e.toPrecision(10);
	if (/e/i.test(t)) {
		let [e, n] = t.split(/e/i);
		return `${e.includes(".") ? e : `${e}.0`}e${Number(n)}`;
	}
	return t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, ".0") : `${t}.0`;
}
var M = ae;
function oe(e) {
	return `float fmTexelsPerRef() { return max(max(1.0 / uTexel.x, 1.0 / uTexel.y) / ${M(e)}, 1.0); }`;
}
var se = "vec3 fmLin = sign(c) * srgbToLinear(abs(c));\nc = vec3(sqrt(max(luma(fmLin), 0.0)), 0.0, 0.0);", N = (e, t) => M(e - t);
function P(e, t) {
	let n = S(1, u, 12), r = S(2, u, 12), i = [
		`vec2 fmStep = ${e === "x" ? "vec2(uTexel.x, 0.0)" : "vec2(0.0, uTexel.y)"} * (fmTexelsPerRef() * ${M(u)});`,
		"float fmFine = 0.0;",
		"float fmCoarse = 0.0;",
		"vec2 fmTap;"
	];
	for (let e = 0; e < n.length; e++) {
		let a = `readPrev(vUv + ${N(e, 12)} * fmStep)`;
		i.push(t ? `fmTap = vec2(${a}.r);` : `fmTap = ${a}.rg;`), i.push(`fmFine += ${M(n[e])} * fmTap.x;`, `fmCoarse += ${M(r[e])} * fmTap.y;`);
	}
	return i.push("c = vec3(fmFine, fmCoarse, 0.0);"), i.join("\n");
}
function ce() {
	return `vec2 fmDx = vec2(uTexel.x, 0.0) * (fmTexelsPerRef() * ${M(1)});
vec2 fmDy = vec2(0.0, uTexel.y) * (fmTexelsPerRef() * ${M(1)});
vec2 fmGx = 0.5 * (readPrev(vUv + fmDx).rg - readPrev(vUv - fmDx).rg);
vec2 fmGy = 0.5 * (readPrev(vUv + fmDy).rg - readPrev(vUv - fmDy).rg);
float fmFine2 = fmGx.x * fmGx.x + fmGy.x * fmGy.x;
float fmCoarse2 = fmGx.y * fmGx.y + fmGy.y * fmGy.y;
float fmR2 = fmFine2 / max(fmCoarse2, 1e-20);
float fmWeight = smoothstep(${o}, 2.0 * ${o}, sqrt(fmCoarse2))
  * smoothstep(${a} * ${M(1 - f)}, ${a} * ${M(1 + f)}, fmR2)
  * (1.0 - smoothstep(${M(b)}, ${M(b * te)}, fmR2));
c = vec3(fmWeight, fmWeight, 0.0);`;
}
function F(e) {
	let t = S(4, 1, 12), n = [`vec2 fmStep = ${e === "x" ? "vec2(uTexel.x, 0.0)" : "vec2(0.0, uTexel.y)"} * (fmTexelsPerRef() * ${M(1)});`, "float fmSpread = 0.0;"];
	for (let e = 0; e < t.length; e++) n.push(`fmSpread += ${M(t[e])} * readPrev(vUv + ${N(e, 12)} * fmStep).g;`);
	return n.push("c = vec3(c.r, fmSpread, 0.0);"), n.join("\n");
}
var I = [
	-1,
	0,
	1
].flatMap((e) => [
	-1,
	0,
	1
].map((t) => [t, e]));
function L(e = t) {
	let n = c(e), r = I.map(([e, t]) => `  fmEdge = max(fmEdge, textureLod(${n}, srcUv + fmFoot * vec2(${M(e)}, ${M(t)}), 0.0).r);`);
	return [
		`if (${i}.a > ${M(.5)}) {`,
		"  vec2 fmFoot = fwidth(srcUv) * (1.0 / 3.0);",
		"  float fmEdge = 0.0;",
		...r,
		`  float fmAlpha = ${i}.a > ${M(1.5)}`,
		"    ? clamp(fmEdge, 0.0, 1.0)",
		`    : ${M(ee)} * smoothstep(${M(d[0])}, ${M(d[1])}, textureLod(${n}, srcUv, 0.0).g);`,
		`  if (fmAlpha > 0.0) c = mix(c, ${i}.rgb, fmAlpha);`,
		"}"
	].join("\n");
}
//#endregion
//#region src/stage.ts
var R = 1e3;
function z(e = l, n = t) {
	let r = oe(e), s = (e, t = {}) => ({
		glsl: e,
		helpers: r,
		...t
	});
	return {
		id: n,
		name: "Focus Mask",
		phase: "output-encode",
		priority: R,
		space: { encoding: "perceptual" },
		viewOnly: !0,
		presetScope: "per-image",
		glsl: L(n),
		uniforms: [{
			key: i,
			glslType: "vec4",
			default: [
				0,
				0,
				0,
				0
			]
		}],
		passes: [
			s(se),
			s(P("x", !0)),
			s(P("y", !1)),
			s(ce(), { uniforms: [{
				key: a,
				glslType: "float",
				default: y(40)
			}, {
				key: o,
				glslType: "float",
				default: x(void 0)
			}] }),
			s(F("x")),
			s(F("y"))
		]
	};
}
//#endregion
//#region src/view.ts
function B(e, t) {
	return {
		[s(i)]: [...C[e.colour].rgb, e.style === "edges" ? 2 : 1],
		[s(a)]: y(e.sensitivity),
		[s(o)]: x(t)
	};
}
var V = null, H = [];
function U() {
	if (!V) throw Error("[focus-mask] viewStore() called before activate()");
	return V;
}
function W() {
	let e = j.stores.useDevelopStore.getState().photoId;
	return e ? j.stores.useCatalogStore.getState().photos.find((t) => t.id === e) : void 0;
}
var G = "null";
function K() {
	let { on: e, prefs: t } = U().getState(), n = e ? B(t, W()?.exif.iso) : null, r = JSON.stringify(n);
	r !== G && (G = r, j.develop.setViewValues(n));
}
var q = 2e3, J = null, Y = null;
function le(e) {
	if (typeof requestIdleCallback == "function") {
		let t = requestIdleCallback(e, { timeout: q });
		return () => cancelIdleCallback(t);
	}
	let t = setTimeout(e, q);
	return () => clearTimeout(t);
}
function X() {
	let e = j.stores.useDevelopStore.getState().photoId;
	!Y && e && e !== J && Z() && (Y = le(() => {
		Y = null;
		let e = j.stores.useDevelopStore.getState().photoId;
		e && Z() && (J = e, U().getState().on || j.develop.prewarmStages());
	}));
}
function ue() {
	G = "null", V = j.stores.create((e, t) => ({
		on: !1,
		prefs: O(j.settings),
		toggle: () => e({ on: !t().on })
	}));
	let e = V;
	H = [
		e.subscribe(K),
		j.settings.onChange(() => e.setState({ prefs: O(j.settings) })),
		j.stores.useDevelopStore.subscribe((t, n) => {
			t.photoId !== n.photoId && (e.getState().on && K(), X());
		}),
		j.stores.useUIStore.subscribe((e, t) => {
			e.activeModule !== t.activeModule && X();
		}),
		j.stores.useCatalogStore.subscribe((t, n) => {
			t.photos !== n.photos && e.getState().on && K();
		})
	], X();
}
function de() {
	for (let e of H) e();
	H = [], Y?.(), Y = null, J = null, V?.getState().on && j.develop.setViewValues(null), V = null, G = "null";
}
function Z() {
	return j.navigation.current() === "develop" && !!j.stores.useDevelopStore.getState().photoId;
}
//#endregion
//#region src/Toolbar.tsx
function Q(e) {
	let [t, n] = A.useState(!1), { tokens: r } = j.ui, i = e.pressed === !0 || e.expanded === !0 || t;
	return /* @__PURE__ */ A.createElement("button", {
		type: "button",
		onClick: e.onClick,
		onMouseEnter: () => n(!0),
		onMouseLeave: () => n(!1),
		title: e.title,
		"aria-label": e.label,
		"aria-pressed": e.pressed,
		"aria-expanded": e.expanded,
		style: {
			fontSize: 10,
			color: i ? r.textPrimary : r.textMuted
		}
	}, e.children);
}
function fe(e) {
	let { Field: t, SegmentedControl: n, Select: r, Stack: i, tokens: a } = j.ui, { Slider: o } = j.components, s = U()((e) => e.prefs), c = A.useRef(null), { onClose: l } = e;
	return A.useEffect(() => {
		let e = (e) => {
			let t = c.current?.parentElement;
			t && e.target instanceof Node && !t.contains(e.target) && l();
		};
		document.addEventListener("pointerdown", e, !0);
		let t = j.ui.onEscape(l);
		return () => {
			document.removeEventListener("pointerdown", e, !0), t();
		};
	}, [l]), /* @__PURE__ */ A.createElement("div", {
		ref: c,
		role: "dialog",
		"aria-label": "Focus mask options",
		style: {
			position: "absolute",
			bottom: "calc(100% + 8px)",
			right: 0,
			width: 232,
			zIndex: 60,
			padding: 10,
			borderRadius: 6,
			border: `1px solid ${a.border}`,
			background: a.surface2,
			color: a.textPrimary,
			boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)"
		}
	}, /* @__PURE__ */ A.createElement(i, { gap: 8 }, /* @__PURE__ */ A.createElement(o, {
		label: "Sensitivity",
		value: s.sensitivity,
		min: 0,
		max: 100,
		step: 1,
		defaultValue: 40,
		compact: !0,
		onChange: (e) => j.settings.set(w.sensitivity, e)
	}), /* @__PURE__ */ A.createElement(t, { label: "Style" }, /* @__PURE__ */ A.createElement(n, {
		value: s.style,
		onChange: (e) => j.settings.set(w.style, e),
		options: Object.keys(E).map((e) => ({
			value: e,
			label: E[e]
		}))
	})), /* @__PURE__ */ A.createElement(t, { label: "Colour" }, /* @__PURE__ */ A.createElement(r, {
		value: s.colour,
		ariaLabel: "Highlight colour",
		onChange: (e) => j.settings.set(w.colour, e),
		options: Object.keys(C).map((e) => ({
			value: e,
			label: C[e].label
		}))
	}))));
}
function pe() {
	let e = U(), t = e((e) => e.on), r = e((e) => e.toggle), [i, a] = A.useState(!1), o = A.useCallback(() => a(!1), []), s = j.keybindings.getBinding(n);
	return /* @__PURE__ */ A.createElement("span", { style: {
		position: "relative",
		display: "inline-flex",
		alignItems: "center",
		gap: 3
	} }, /* @__PURE__ */ A.createElement(Q, {
		pressed: t,
		onClick: r,
		label: "Toggle focus mask",
		title: `Focus mask${s ? ` (${s})` : ""}: highlight what is in sharp focus`
	}, "Focus"), /* @__PURE__ */ A.createElement(Q, {
		expanded: i,
		onClick: () => a(!i),
		label: "Focus mask options",
		title: "Focus mask options"
	}, "▾"), i && /* @__PURE__ */ A.createElement(fe, { onClose: o }));
}
//#endregion
//#region src/index.tsx
var $ = null;
function me(e) {
	ie(e), ue(), $ = e, e.registerProcessingStage(z()), e.registerSlot({
		id: r,
		slot: "develop-toolbar",
		component: pe
	}), e.registerKeybinding({
		id: n,
		label: "Focus mask",
		category: "Develop",
		defaultCombo: "Shift+F",
		handler: () => {
			Z() && U().getState().toggle();
		}
	}), e.registerSettings({
		title: "Focus Mask",
		fields: k,
		keywords: [
			"focus",
			"peaking",
			"sharpness"
		]
	});
}
function he() {
	let e = $;
	if (e) {
		$ = null;
		try {
			de(), e.unregisterProcessingStage(t);
		} catch (e) {
			console.warn("[focus-mask] deactivate failed:", e);
		}
	}
}
//#endregion
export { e as EXTENSION_ID, me as activate, he as deactivate };

//# sourceMappingURL=index.js.map