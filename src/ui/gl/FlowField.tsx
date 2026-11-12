import { useEffect, useRef } from 'react';
import { PALETTE, rgb } from '../format';
import { useShader } from './useShader';

const MAX_LANES = 7;

/**
 * The flow, drawn as what it does. One lane per source, level with its row in the list
 * beside it. In Streamhouse mode the lanes bend into Flink and leave as one line, the
 * governed record; in the before-world they never meet, and what moves along them moves in
 * clumps, the way a nightly extract does.
 *
 * Nothing moves here that is not moving in the stack. A lane carries particles only while
 * its source is producing records; a lane whose source is quiet is a still line, and a bead
 * runs along it only when the presenter picks that source's record to follow. The two
 * narrative events come in on the centre line, because they arrive on a topic of their own.
 */
const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uConverge;
uniform int uCount;
uniform float uTone[${MAX_LANES}];
uniform float uFlow[${MAX_LANES}];
uniform vec3 uFresh;
uniform vec3 uStale;
uniform vec3 uDim;
uniform vec3 uText;
uniform float uReject;
uniform float uFill;
uniform float uPulseLane;
uniform float uPulse;
out vec4 o;

const float NODE = 0.5;

float laneY(int i) { return (float(i) + 0.5) / float(uCount); }
float yAt(int i, float x, float c) { return mix(laneY(i), 0.5, smoothstep(0.04, 0.46, x) * c); }
float dlqY(float x) { return 0.5 - smoothstep(0.6, 0.8, x) * 0.38; }

/** Pixel distance from the fragment to a curve y(x), corrected for its slope. */
float curveDist(vec2 uv, float y, float y2, float dx) {
  float slope = (y2 - y) / dx * (uRes.y / uRes.x);
  return abs(uv.y - y) * uRes.y / sqrt(1.0 + slope * slope);
}

float glow(vec2 frag, vec2 p, float r) {
  float d = length(frag - p * uRes);
  return exp(-(d * d) / (r * r));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  float c = uConverge;
  vec3 col = vec3(0.0);
  float a = 0.0;
  vec3 plain = mix(uDim, uText, 0.25);
  float anyFlow = 0.0;

  for (int i = 0; i < ${MAX_LANES}; i++) {
    if (i >= uCount) break;
    // 0 is live, a half is a feed with nothing to say about its age, 1 is the stalest input.
    float t = uTone[i];
    vec3 tint = t <= 0.5 ? mix(uFresh, plain, t * 2.0) : mix(plain, uStale, (t - 0.5) * 2.0);
    float flowing = uFlow[i];
    anyFlow = max(anyFlow, flowing);

    if (uv.x < NODE) {
      float y = yAt(i, uv.x, c);
      float d = curveDist(uv, y, yAt(i, uv.x + 0.002, c), 0.002);
      // A nightly feed is a dashed line: it arrives in pieces.
      float dash = mix(step(0.45, fract(uv.x * 22.0 - uTime * 0.05 - float(i) * 0.3)), 1.0, c);
      // A producing lane is drawn brighter than a quiet one; nothing glows around it.
      float ln = smoothstep(1.3, 0.0, d) * mix(0.22, 0.62, flowing) * dash;
      col += mix(uDim, tint, mix(0.55, 0.8, flowing)) * ln;
      a += ln;
    }

    if (flowing > 0.5) {
      float speed = mix(0.018, 0.12, c);
      float spacing = mix(0.016, 1.0 / 9.0, c);
      for (int k = 0; k < 9; k++) {
        float tt = fract(uTime * speed + float(k) * spacing + float(i) * 0.217);
        float x = tt * NODE;
        vec2 p = vec2(x, yAt(i, x, c));
        float edge = smoothstep(0.0, 0.05, x) * smoothstep(NODE, NODE - 0.04, x);
        float g = glow(frag, p, 2.6) * edge * mix(0.55, 0.95, c);
        col += tint * g;
        a += g;
      }
    }

    // One record, followed on request: a bead along its own lane into Flink.
    if (uPulse < 1.2 && abs(uPulseLane - float(i)) < 0.5) {
      float x = clamp(uPulse / 0.7, 0.0, 1.0) * NODE;
      vec2 p = vec2(x, yAt(i, x, c));
      float fade = smoothstep(1.2, 0.7, uPulse);
      float g = (glow(frag, p, 3.4) + glow(frag, p, 14.0) * 0.4) * fade;
      col += uText * g;
      a += g;
    }
  }

  // The governed record, leaving Flink as one line.
  if (uv.x > NODE) {
    float d = abs(uv.y - 0.5) * uRes.y;
    float ln = smoothstep(1.6, 0.0, d) * mix(0.12, 0.7, c);
    vec3 outTint = mix(uStale, uFresh, c);
    col += outTint * ln;
    a += ln;
    for (int k = 0; k < 14; k++) {
      float t = fract(uTime * 0.16 + float(k) / 14.0);
      float x = NODE + t * (1.0 - NODE);
      float g = glow(frag, vec2(x, 0.5), 2.8) * c * anyFlow * smoothstep(1.0, 0.94, x);
      col += uFresh * g;
      a += g;
    }
    // The dead letter branch, quiet until something is turned down it.
    if (uv.x > 0.6 && uv.x < 0.9) {
      float y = dlqY(uv.x);
      float dd = curveDist(uv, y, dlqY(uv.x + 0.002), 0.002);
      float dash = step(0.5, fract(uv.x * 60.0));
      float ln2 = smoothstep(1.2, 0.0, dd) * 0.3 * dash * c;
      col += uDim * ln2;
      a += ln2;
    }
  }

  // Flink, where the lanes meet.
  float node = glow(frag, vec2(NODE, 0.5), 5.0) * mix(0.25, 0.9, c);
  col += uText * node;
  a += node;
  // In the streamhouse it is ringed: one drawn mark for the place the six become one.
  float ringD = length(frag - vec2(NODE, 0.5) * uRes) - 13.0;
  float ring = exp(-(ringD * ringD) / 2.2) * 0.45 * c;
  col += uText * ring;
  a += ring;

  // A fat finger: in on the centre line, then turned down the dead letter branch.
  if (uReject < 4.0) {
    float r = uReject;
    vec2 p = r < 1.4
      ? vec2(mix(0.2, NODE, r / 1.4), 0.5)
      : vec2(mix(NODE, 0.9, clamp((r - 1.4) / 1.6, 0.0, 1.0)), 0.0);
    if (r >= 1.4) p.y = p.x < 0.6 ? 0.5 : dlqY(p.x);
    float fade = smoothstep(0.0, 0.3, r) * smoothstep(4.0, 3.2, r);
    float g = (glow(frag, p, 3.6) + glow(frag, p, 12.0) * 0.35) * fade;
    col += uText * g;
    a += g;
  }

  // A fill: the one record that rides all the way to the served table.
  if (uFill < 6.0) {
    float f = uFill;
    float x = f < 1.6 ? mix(0.2, NODE, f / 1.6) : mix(NODE, 1.0, clamp((f - 1.6) / 2.4, 0.0, 1.0));
    vec2 p = vec2(x, 0.5);
    float fade = smoothstep(0.0, 0.3, f) * smoothstep(6.0, 4.2, f);
    float g = (glow(frag, p, 3.4) + glow(frag, p, 16.0) * 0.45) * fade;
    col += uText * g;
    a += g;
    // The node answers when it arrives.
    float pulse = exp(-pow((f - 1.6) * 3.0, 2.0)) * glow(frag, vec2(NODE, 0.5), 22.0);
    col += uFresh * pulse * 0.8;
    a += pulse * 0.8;
  }

  a = clamp(a, 0.0, 1.0);
  o = vec4(min(col, vec3(1.0)), a);
}`;

export interface Lane {
  /** 0 live, 0.5 neutral, 1 the stalest input. */
  tone: number;
  /** Whether this source is producing records right now. */
  flow: boolean;
}

interface Props {
  /** True when the feeds meet in one governed record; false in the before-world. */
  converged: boolean;
  /** One per source, in the order the list beside the canvas shows them, top first. */
  lanes: Lane[];
  /** When the last rejected record was seen, in ms since the epoch, or null. */
  rejectAt: number | null;
  /** When the last fill landed, in ms since the epoch, or null. */
  fillAt: number | null;
  /** A source the presenter picked to follow: its row in the list, and when. */
  pulse: { lane: number; at: number } | null;
}

export function FlowField({ converged, lanes, rejectAt, fillAt, pulse }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Eased toward its target in the loop, so the flip between worlds is a transition the
  // room watches happen rather than a cut.
  // It always starts apart: the stage for today's world is a different drawing now, so this
  // one only mounts in the streamhouse, and the lanes are seen coming together as it does.
  const conv = useRef(0);
  const target = useRef(converged ? 1 : 0);
  useEffect(() => {
    target.current = converged ? 1 : 0;
  }, [converged]);

  const fresh = rgb(PALETTE.fresh);
  const stale = rgb(PALETTE.stale);
  const dim = rgb(PALETTE.dim);
  const text = rgb(PALETTE.text);
  const tones = new Float32Array(MAX_LANES);
  const flows = new Float32Array(MAX_LANES);
  let last = 0;

  const ok = useShader(canvas, FRAG, ({ gl, time, width, height, uniform }) => {
    const dt = Math.min(0.05, time - last);
    last = time;
    conv.current += (target.current - conv.current) * (1 - Math.exp(-dt * 2.6));
    const now = Date.now();
    const count = Math.min(MAX_LANES, lanes.length);
    // The shader counts from the bottom of the canvas; the list reads from the top.
    for (let i = 0; i < count; i++) {
      const lane = lanes[count - 1 - i]!;
      tones[i] = lane.tone;
      flows[i] = lane.flow ? 1 : 0;
    }
    gl.uniform2f(uniform('uRes'), width, height);
    gl.uniform1f(uniform('uTime'), time);
    gl.uniform1f(uniform('uConverge'), conv.current);
    gl.uniform1i(uniform('uCount'), count);
    gl.uniform1fv(uniform('uTone'), tones);
    gl.uniform1fv(uniform('uFlow'), flows);
    gl.uniform3f(uniform('uFresh'), ...fresh);
    gl.uniform3f(uniform('uStale'), ...stale);
    gl.uniform3f(uniform('uDim'), ...dim);
    gl.uniform3f(uniform('uText'), ...text);
    gl.uniform1f(uniform('uReject'), rejectAt === null ? 99 : (now - rejectAt) / 1000);
    gl.uniform1f(uniform('uFill'), fillAt === null ? 99 : (now - fillAt) / 1000);
    gl.uniform1f(uniform('uPulseLane'), pulse ? count - 1 - pulse.lane : -1);
    gl.uniform1f(uniform('uPulse'), pulse ? (now - pulse.at) / 1000 : 99);
  });

  return <canvas ref={canvas} className="gl-canvas" aria-hidden="true" data-gl={ok.current ? 'on' : 'off'} />;
}
