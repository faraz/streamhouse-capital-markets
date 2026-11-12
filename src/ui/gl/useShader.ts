import { useEffect, useRef, type RefObject } from 'react';

const VERTEX = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

export interface Frame {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  /** Seconds since the shader started. */
  time: number;
  width: number;
  height: number;
  uniform(name: string): WebGLUniformLocation | null;
}

/**
 * One full-screen fragment shader on a canvas. Draws only while the tab is visible and the
 * canvas is on screen, caps the pixel ratio at 2, and gives the context back on unmount, so
 * two of these can sit on a laptop's GPU for the length of a talk without the fans noticing.
 *
 * Returns false when WebGL2 or the shader is unavailable; the caller keeps its still.
 */
export function useShader(
  canvas: RefObject<HTMLCanvasElement | null>,
  fragment: string,
  draw: (f: Frame) => void,
): RefObject<boolean> {
  const ok = useRef(true);
  // The latest draw closure, so props reach the loop without rebuilding the program.
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const gl = el.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) {
      ok.current = false;
      return;
    }

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('shader:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram()!;
    if (!vs || !fs) {
      ok.current = false;
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      ok.current = false;
      return;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);

    const cache = new Map<string, WebGLUniformLocation | null>();
    const uniform = (name: string) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
      return cache.get(name)!;
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(el.clientWidth * dpr));
      const h = Math.max(1, Math.round(el.clientHeight * dpr));
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let onScreen = true;
    const io = new IntersectionObserver(([e]) => {
      onScreen = !!e?.isIntersecting;
    });
    io.observe(el);

    const start = performance.now();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !onScreen) return;
      gl.viewport(0, 0, el.width, el.height);
      drawRef.current({
        gl,
        program,
        time: (performance.now() - start) / 1000,
        width: el.width,
        height: el.height,
        uniform,
      });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [canvas, fragment]);

  return ok;
}
