import { useRef } from 'react';
import { PALETTE, rgb } from '../format';
import { useShader } from './useShader';

/**
 * The hero's ground: a dot matrix, the trading floor's LED board, lit by six currents that
 * come in apart on the left and leave as one on the right. Our own stand-in for React Bits
 * Pro's Chroma Current, until its licensed source replaces this file.
 */
const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uDpr;
uniform vec3 uDot;
uniform vec3 uLit;
uniform vec3 uHot;
out vec4 o;

float laneY(float i) { return 0.14 + i * 0.12; }

void main() {
  float pitch = 9.0 * uDpr;
  vec2 cell = floor(gl_FragCoord.xy / pitch);
  vec2 center = (cell + 0.5) * pitch;
  vec2 uv = center / uRes;
  float t = uTime;

  // Six currents, each meandering, all drawn toward one line as they cross the frame.
  float glow = 0.0;
  float meet = smoothstep(0.45, 1.0, uv.x);
  for (int k = 0; k < 6; k++) {
    float i = float(k);
    float base = mix(laneY(i), 0.44, meet);
    float wave = sin(uv.x * (5.0 + i * 0.7) - t * (0.35 + i * 0.05) + i * 1.7) * 0.03 * (1.0 - meet * 0.7)
               + sin(uv.x * 13.0 + t * 0.6 + i) * 0.012;
    float d = abs(uv.y - base - wave);
    float width = mix(0.016, 0.042, meet);
    float pulse = 0.6 + 0.4 * sin(uv.x * 9.0 - t * 1.6 + i * 2.3);
    glow = max(glow, exp(-(d * d) / (width * width)) * pulse);
  }
  // The joined current is brighter than any feed alone.
  glow = clamp(glow * (0.75 + meet * 0.55), 0.0, 1.0);

  vec2 local = gl_FragCoord.xy - center;
  float radius = pitch * (0.16 + glow * 0.26);
  float dotMask = smoothstep(radius, radius - 1.2 * uDpr, length(local));

  vec3 c = mix(uDot, uLit, smoothstep(0.08, 0.7, glow));
  c = mix(c, uHot, smoothstep(0.7, 1.0, glow) * 0.6);
  float a = dotMask * mix(0.16, 1.0, smoothstep(0.02, 0.9, glow));
  // Fade the matrix out under the copy on the left and at the edges.
  a *= smoothstep(0.0, 0.08, uv.y) * smoothstep(1.0, 0.9, uv.y);
  o = vec4(c * a, a);
}`;

export function HeroGround() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dot = rgb('#5B6470');
  const lit = rgb(PALETTE.fresh);
  const hot = rgb('#C9F7DF');
  useShader(canvas, FRAG, ({ gl, time, width, height, uniform }) => {
    gl.uniform2f(uniform('uRes'), width, height);
    gl.uniform1f(uniform('uTime'), time);
    gl.uniform1f(uniform('uDpr'), Math.min(2, window.devicePixelRatio || 1));
    gl.uniform3f(uniform('uDot'), ...dot);
    gl.uniform3f(uniform('uLit'), ...lit);
    gl.uniform3f(uniform('uHot'), ...hot);
  });
  return <canvas ref={canvas} className="gl-canvas" aria-hidden="true" />;
}
