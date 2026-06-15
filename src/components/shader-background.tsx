'use client';

import { useEffect, useRef, useState } from 'react';

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// A single continuous field. There are no discrete "effect types": swirl, rings
// and cellular structure are layered onto domain-warped fbm with continuous
// weights, so every look morphs into every other through plain fbm ("mist") in
// the middle. Color is HSV with a slowly drifting base hue and a usually-small
// hue spread (rainbow only when the spread occasionally spikes).
const FRAG = `
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform float u_swirl;     // polar rotation strength
uniform float u_warp;      // domain-warp intensity
uniform float u_scale;     // zoom
uniform float u_speed;     // motion speed
uniform float u_ring;      // 0..1 ring modulation weight
uniform float u_cell;      // 0..1 cellular modulation weight
uniform float u_hueBase;   // dominant hue (wraps)
uniform float u_hueSpread; // how far hue varies across the field
uniform float u_sat;       // saturation (kept muted)
uniform float u_val;       // brightness ceiling

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return s;
}

float voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md = 1.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash21(n + g), hash21(n + g + vec2(31.0, 17.0)));
      vec2 r = g + o - f;
      md = min(md, dot(r, r));
    }
  }
  return sqrt(md);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 1.0 / 3.0, 2.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
  p *= u_scale;

  float t = u_time * u_speed;

  // Swirl: rotate by an angle that depends on radius (gentle vortex).
  float r = length(p);
  float ang = u_swirl * (1.0 / (r + 0.4) - r * 0.3) + t * 0.05;
  p *= rot(ang);

  // Domain-warped fbm — the "mist" that everything else layers onto.
  vec2 q = p + u_warp * vec2(
    fbm(p * 1.3 + t * 0.10),
    fbm(p * 1.3 + 5.2 - t * 0.12)
  );
  float f = fbm(q + u_warp * fbm(q * 1.7));

  // Ring + cellular ingredients, blended in by continuous weights.
  float rings = 0.5 + 0.5 * sin(r * 5.0 - t * 1.2 + f * 3.0);
  f = mix(f, rings, u_ring);
  // Sharpen the cellular distance a touch so tiling reads as structure.
  float cells = pow(voronoi(q * 1.8 + t * 0.1), 0.8);
  f = mix(f, cells, u_cell);

  // Muted HSV coloring; brightness rises with the field for soft depth.
  float hue = u_hueBase + (f - 0.5) * u_hueSpread;
  float val = mix(u_val * 0.45, u_val, f);
  vec3 col = hsv2rgb(vec3(hue, u_sat, val));

  col *= 0.8 + 0.2 * smoothstep(1.8, 0.1, length(p)); // gentle vignette
  gl_FragColor = vec4(col, 1.0);
}
`;

type Params = {
  swirl: number;
  warp: number;
  scale: number;
  speed: number;
  ring: number;
  cell: number;
  hueBase: number;
  hueSpread: number;
  sat: number;
  val: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

// One random-walk step per variable. Each mean-reverts toward a calm baseline
// (so the field stays muted and never runs away), except hueBase which wanders
// freely around the color wheel. hueSpread reverts to a small value, so a wide
// rainbow only happens on the rare excursions — stumbled upon, not constant.
const walk = (
  v: number,
  mean: number,
  step: number,
  pull: number,
  lo: number,
  hi: number,
) => clamp(v + (Math.random() * 2 - 1) * step + (mean - v) * pull, lo, hi);

function initialKey(): Params {
  return {
    swirl: 0.9,
    warp: 0.6,
    scale: 1.4,
    speed: 1.0,
    ring: 0.4,
    cell: 0.35,
    hueBase: Math.random() * 10,
    hueSpread: 0.7,
    sat: 0.5,
    val: 1.0,
  };
}

// Weaker mean-reversion (low pull) + bigger steps + mid-range means, so the
// walk genuinely roams the whole space — swirls, rings and tiling all get their
// turn instead of collapsing back to plain mist.
function nextKey(p: Params): Params {
  return {
    swirl: walk(p.swirl, 0.9, 0.65, 0.12, 0, 2.4),
    warp: walk(p.warp, 0.6, 0.4, 0.12, 0, 1.6),
    scale: walk(p.scale, 1.4, 0.4, 0.12, 0.7, 2.0),
    speed: walk(p.speed, 1.0, 0.35, 0.2, 0.4, 1.8),
    ring: walk(p.ring, 0.45, 0.45, 0.1, 0, 1.0),
    cell: walk(p.cell, 0.4, 0.45, 0.1, 0, 1.0),
    hueBase: p.hueBase + (Math.random() * 2 - 1) * 0.18, // free wander (wraps)
    hueSpread: walk(p.hueSpread, 0.7, 0.25, 0.15, 0.2, 0.8),
    sat: walk(p.sat, 0.5, 0.1, 0.22, 0.3, 0.65),
    val: 1.0, // always full brightness
  };
}

function lerpKey(a: Params, b: Params, t: number): Params {
  return {
    swirl: lerp(a.swirl, b.swirl, t),
    warp: lerp(a.warp, b.warp, t),
    scale: lerp(a.scale, b.scale, t),
    speed: lerp(a.speed, b.speed, t),
    ring: lerp(a.ring, b.ring, t),
    cell: lerp(a.cell, b.cell, t),
    hueBase: lerp(a.hueBase, b.hueBase, t),
    hueSpread: lerp(a.hueSpread, b.hueSpread, t),
    sat: lerp(a.sat, b.sat, t),
    val: lerp(a.val, b.val, t),
  };
}

// ---- control panel config ----
const PARAM_KEYS = [
  'swirl',
  'warp',
  'scale',
  'speed',
  'ring',
  'cell',
  'hueBase',
  'hueSpread',
  'sat',
  'val',
] as const;
type Key = (typeof PARAM_KEYS)[number];

const PARAM_META: Record<Key, { label: string; min: number; max: number; step: number }> = {
  swirl: { label: 'swirl', min: 0, max: 2.4, step: 0.01 },
  warp: { label: 'warp', min: 0, max: 1.6, step: 0.01 },
  scale: { label: 'zoom', min: 0.7, max: 2.0, step: 0.01 },
  speed: { label: 'speed', min: 0.2, max: 1.8, step: 0.01 },
  ring: { label: 'ring', min: 0, max: 1.0, step: 0.01 },
  cell: { label: 'cell', min: 0, max: 1.0, step: 0.01 },
  hueBase: { label: 'hue', min: 0, max: 1, step: 0.005 },
  hueSpread: { label: 'hue spread', min: 0, max: 0.8, step: 0.005 },
  sat: { label: 'saturation', min: 0, max: 0.65, step: 0.005 },
  val: { label: 'brightness', min: 0, max: 1.0, step: 0.005 },
};

function hsv2rgbCss(h: number, s: number, v: number): string {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const u = v * (1 - (1 - f) * s);
  let r = 0,
    g = 0,
    b = 0;
  switch (i % 6) {
    case 0: r = v; g = u; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = u; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = u; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  const to = (x: number) => Math.round(x * 255);
  return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
}

export default function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const inputs = useRef<Partial<Record<Key, HTMLInputElement | null>>>({});
  const vals = useRef<Partial<Record<Key, HTMLSpanElement | null>>>({});
  const rows = useRef<Partial<Record<Key, HTMLDivElement | null>>>({});
  const swatchRef = useRef<HTMLDivElement>(null);
  const overrides = useRef<Partial<Record<Key, number>>>({});
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    const g = gl;

    const compile = (type: number, src: string) => {
      const sh = g.createShader(type)!;
      g.shaderSource(sh, src);
      g.compileShader(sh);
      if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) {
        console.error(g.getShaderInfoLog(sh));
      }
      return sh;
    };

    const prog = g.createProgram()!;
    g.attachShader(prog, compile(g.VERTEX_SHADER, VERT));
    g.attachShader(prog, compile(g.FRAGMENT_SHADER, FRAG));
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
      console.error(g.getProgramInfoLog(prog));
    }
    g.useProgram(prog);

    const buf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(
      g.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      g.STATIC_DRAW,
    );
    const aPos = g.getAttribLocation(prog, 'a_pos');
    g.enableVertexAttribArray(aPos);
    g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 0, 0);

    const u = (name: string) => g.getUniformLocation(prog, name);
    const uRes = u('u_res');
    const uTime = u('u_time');
    const uSwirl = u('u_swirl');
    const uWarp = u('u_warp');
    const uScale = u('u_scale');
    const uSpeed = u('u_speed');
    const uRing = u('u_ring');
    const uCell = u('u_cell');
    const uHueBase = u('u_hueBase');
    const uHueSpread = u('u_hueSpread');
    const uSat = u('u_sat');
    const uVal = u('u_val');

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      g.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    // Infinite scroll: grow the spacer as we approach the bottom.
    let spacerH = window.innerHeight * 8;
    if (spacerRef.current) spacerRef.current.style.height = spacerH + 'px';
    const maybeGrow = () => {
      if (window.scrollY + window.innerHeight * 3 > spacerH) {
        spacerH += window.innerHeight * 8;
        if (spacerRef.current) spacerRef.current.style.height = spacerH + 'px';
      }
    };

    // Recorded random walk: one keyframe per viewport of scroll. Generated on
    // demand going down, kept forever so scrolling up retraces the same path
    // back to the start (segment 0) — "back in time".
    const keys: Params[] = [initialKey()];
    const ensure = (n: number) => {
      while (keys.length <= n) keys.push(nextKey(keys[keys.length - 1]));
    };
    let segView = Math.max(0, window.scrollY / window.innerHeight); // eased
    ensure(Math.floor(segView) + 1);

    let raf = 0;
    let startTs = 0;
    let lastTs = 0;

    const frame = (ts: number) => {
      if (!startTs) startTs = ts;
      const time = (ts - startTs) / 1000;
      const dt = lastTs ? (ts - lastTs) / 1000 : 0;
      lastTs = ts;

      // Ease the displayed segment toward the scroll position so jumps morph.
      const segTarget = Math.max(0, window.scrollY / window.innerHeight);
      segView += (segTarget - segView) * Math.min(1, dt * 2.5);
      if (segView < 0) segView = 0;
      maybeGrow();

      const i0 = Math.max(0, Math.floor(segView));
      ensure(i0 + 1);
      const walkP = lerpKey(keys[i0], keys[i0 + 1], smooth(segView - i0));

      // Manual overrides from the control panel win over the walk.
      const o = overrides.current;
      const eff: Params = {
        swirl: o.swirl ?? walkP.swirl,
        warp: o.warp ?? walkP.warp,
        scale: o.scale ?? walkP.scale,
        speed: o.speed ?? walkP.speed,
        ring: o.ring ?? walkP.ring,
        cell: o.cell ?? walkP.cell,
        hueBase: o.hueBase ?? walkP.hueBase,
        hueSpread: o.hueSpread ?? walkP.hueSpread,
        sat: o.sat ?? walkP.sat,
        val: o.val ?? walkP.val,
      };

      g.uniform2f(uRes, canvas.width, canvas.height);
      g.uniform1f(uTime, time);
      g.uniform1f(uSwirl, eff.swirl);
      g.uniform1f(uWarp, eff.warp);
      g.uniform1f(uScale, eff.scale);
      g.uniform1f(uSpeed, eff.speed);
      g.uniform1f(uRing, eff.ring);
      g.uniform1f(uCell, eff.cell);
      g.uniform1f(uHueBase, eff.hueBase);
      g.uniform1f(uHueSpread, eff.hueSpread);
      g.uniform1f(uSat, eff.sat);
      g.uniform1f(uVal, eff.val);
      g.drawArrays(g.TRIANGLES, 0, 3);

      // Reflect live values into the panel without triggering React re-renders.
      for (const k of PARAM_KEYS) {
        const display = k === 'hueBase' ? ((eff[k] % 1) + 1) % 1 : eff[k];
        const inp = inputs.current[k];
        if (inp && o[k] === undefined && document.activeElement !== inp) {
          inp.value = String(display);
        }
        const vs = vals.current[k];
        if (vs) vs.textContent = display.toFixed(PARAM_META[k].step < 0.01 ? 3 : 2);
        rows.current[k]?.classList.toggle('frozen', o[k] !== undefined);
      }
      if (swatchRef.current) {
        swatchRef.current.style.background = hsv2rgbCss(
          ((eff.hueBase % 1) + 1) % 1,
          eff.sat,
          eff.val,
        );
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      g.deleteProgram(prog);
      g.deleteBuffer(buf);
    };
  }, []);

  const setOverride = (k: Key, v: number) => {
    overrides.current[k] = v;
  };
  const clearOverride = (k: Key) => {
    delete overrides.current[k];
  };
  const clearAll = () => {
    overrides.current = {};
  };
  const randomizeAll = () => {
    for (const k of PARAM_KEYS) {
      const m = PARAM_META[k];
      const v = m.min + Math.random() * (m.max - m.min);
      overrides.current[k] = v;
      const inp = inputs.current[k];
      if (inp) inp.value = String(v);
    }
  };

  return (
    <>
      <canvas ref={canvasRef} className="shader-canvas" />
      <div ref={spacerRef} className="scroll-spacer" aria-hidden />

      {panelOpen ? (
        <div className="param-panel">
          <div className="param-head">
            <span>parameters</span>
            <span className="param-head-btns">
              <button onClick={randomizeAll}>randomize</button>
              <button onClick={clearAll}>auto all</button>
              <button onClick={() => setPanelOpen(false)}>hide</button>
            </span>
          </div>

          {PARAM_KEYS.map((k) => (
            <div
              className="param-row"
              key={k}
              ref={(el) => {
                rows.current[k] = el;
              }}
            >
              <label>{PARAM_META[k].label}</label>
              <input
                type="range"
                min={PARAM_META[k].min}
                max={PARAM_META[k].max}
                step={PARAM_META[k].step}
                ref={(el) => {
                  inputs.current[k] = el;
                }}
                onInput={(e) =>
                  setOverride(k, parseFloat((e.target as HTMLInputElement).value))
                }
              />
              <span
                className="param-val"
                ref={(el) => {
                  vals.current[k] = el;
                }}
              />
              <button
                className="param-auto"
                title="release back to scroll control"
                onClick={() => clearOverride(k)}
              >
                ×
              </button>
            </div>
          ))}

          <div className="param-color">
            <span>color</span>
            <div className="param-swatch" ref={swatchRef} />
          </div>
        </div>
      ) : (
        <button className="param-show" onClick={() => setPanelOpen(true)}>
          params
        </button>
      )}
    </>
  );
}
