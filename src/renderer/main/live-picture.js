import { h, setText } from './dom.js';
import { reducedMotion } from '../shared/spring.js';

// A picture that feels alive, without redrawing it: one small WebGL pass over the cut-out.
//   Breathing: the figure stretches up from its feet by about 1%, slowly.
//   Wind: hair and sleeves near the sides sway in a soft travelling wave; the face (centre)
//   and the bottom edge (where the figure meets the card) stay still.
//   Glint: now and then a band of light slides across the figure, only where it is opaque.
// Around it: the figure leans a little toward the pointer, waves hello (a sway from the hips),
// says things in a speech bubble, and a few sparkles drift up behind it.
// Reduced motion, no WebGL, or a lost context all fall back to the plain picture. The loop
// runs at 30 fps and rests while the window isn't in use, like the app's other idle loops.

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_canvas;
uniform vec4 u_box;
uniform float u_t;
uniform float u_glint;
varying vec2 v_uv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 uv = (v_uv * u_canvas - u_box.xy) / u_box.zw;

  float breath = sin(u_t * 1.3) * 0.5 + 0.5;
  uv.y = 1.0 - (1.0 - uv.y) / (1.0 + 0.01 * breath);
  uv.x = 0.5 + (uv.x - 0.5) / (1.0 + 0.008 * breath * (1.0 - uv.y));

  float side = smoothstep(0.14, 0.5, abs(uv.x - 0.5));
  float hang = smoothstep(0.06, 0.42, uv.y) * (1.0 - smoothstep(0.8, 1.0, uv.y));
  float w = side * hang;
  float wave = sin(uv.y * 9.0 - u_t * 1.7) * 0.6 + (noise(vec2(uv.y * 4.0, u_t * 0.55)) - 0.5) * 0.9;
  uv.x += w * 0.013 * wave;
  uv.y += w * 0.004 * sin(u_t * 1.1 + uv.x * 6.0);

  vec4 c = vec4(0.0);
  if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) c = texture2D(u_tex, uv);
  float band = exp(-pow((uv.x * 0.8 + uv.y * 0.5 - u_glint) * 6.0, 2.0));
  c.rgb += band * 0.18 * c.a;
  gl_FragColor = c;
}`;

const PAD_X = 0.06;
const PAD_TOP = 0.05;
const FRAME = 1000 / 30;
const GLINT_EVERY = 7000;
const GLINT_FOR = 1400;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  for (const [k, v] of [
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
  ]) {
    gl.texParameteri(gl.TEXTURE_2D, k, v);
  }
  // Premultiplied on upload, so soft edges blend without dark fringes.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const u = Object.fromEntries(['u_canvas', 'u_box', 'u_t', 'u_glint'].map((n) => [n, gl.getUniformLocation(program, n)]));
  return {
    upload(img) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    },
    draw({ width, height, box, t, glint }) {
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(u.u_canvas, width, height);
      gl.uniform4f(u.u_box, box.x, box.y, box.w, box.h);
      gl.uniform1f(u.u_t, t);
      gl.uniform1f(u.u_glint, glint);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

export function livePicture({ className = '' } = {}) {
  const img = h('img', { class: 'live-img', alt: '', draggable: 'false' });
  const canvas = h('canvas', { class: 'live-canvas', 'aria-hidden': 'true' });
  const sparkles = h('span', { class: 'live-sparkles', 'aria-hidden': 'true' }, ...Array.from({ length: 6 }, (_, i) => h('i', { style: `--i:${i}` })));
  const text = h('span', { class: 'live-bubble-text' });
  const bubble = h('span', { class: 'live-bubble', role: 'status', hidden: true }, text);
  const figure = h('span', { class: `live-figure ${className}` }, sparkles, img, canvas, bubble);

  let renderer = null;
  let ready = false;
  let raf = 0;
  let last = 0;
  let start = performance.now();
  let bubbleTimer = 0;
  let observer = null;
  let size = { width: 0, height: 0, box: { x: 0, y: 0, w: 1, h: 1 } };

  const active = () => !document.hidden && document.hasFocus() && figure.isConnected;

  function setLive(on) {
    figure.classList.toggle('live', on);
  }

  // The bubble and sparkles follow the picture's own box inside the figure.
  function anchor() {
    figure.style.setProperty('--img-top', `${img.offsetTop}px`);
    figure.style.setProperty('--img-left', `${img.offsetLeft}px`);
    figure.style.setProperty('--img-width', `${img.clientWidth}px`);
  }

  function measure() {
    anchor();
    if (!renderer) return;
    const w = img.clientWidth;
    const hgt = img.clientHeight;
    if (!w || !hgt) return;
    const padX = Math.round(w * PAD_X);
    const padTop = Math.round(hgt * PAD_TOP);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    Object.assign(canvas.style, { left: `${img.offsetLeft - padX}px`, top: `${img.offsetTop - padTop}px`, width: `${w + 2 * padX}px`, height: `${hgt + padTop}px` });
    canvas.width = Math.round((w + 2 * padX) * dpr);
    canvas.height = Math.round((hgt + padTop) * dpr);
    size = { width: canvas.width, height: canvas.height, box: { x: padX * dpr, y: padTop * dpr, w: w * dpr, h: hgt * dpr } };
    upload(Math.round(w * dpr), Math.round(hgt * dpr));
    frame(performance.now(), true);
  }

  function frame(now, force = false) {
    if (!renderer || !ready || !size.width) return;
    if (!force && now - last < FRAME) return;
    last = now;
    const t = (now - start) / 1000;
    const phase = (now - start) % GLINT_EVERY;
    const glint = phase < GLINT_FOR ? -0.4 + (phase / GLINT_FOR) * 2.2 : -9;
    renderer.draw({ ...size, t, glint });
  }

  function loop(now) {
    raf = 0;
    if (!active()) return;
    frame(now);
    raf = requestAnimationFrame(loop);
  }

  function wake() {
    if (!raf && renderer && ready && active()) raf = requestAnimationFrame(loop);
  }

  function init() {
    if (renderer || reducedMotion()) return;
    try {
      renderer = createRenderer(canvas);
    } catch {
      renderer = null;
    }
    if (!renderer) return;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      renderer = null;
      setLive(false);
    });
    observer = new ResizeObserver(measure);
    observer.observe(img);
    observer.observe(figure);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
  }

  // The pictures are up to 720px tall and drawn at ~250. WebGL1 can't mipmap them, so they are
  // scaled down once with the browser's smooth resampling and the GPU gets a texture at the
  // size it's drawn (re-made only when that size changes or the picture does).
  const scaled = document.createElement('canvas');
  let uploaded = '';
  function upload(w, hgt) {
    const key = `${img.currentSrc}|${w}x${hgt}`;
    if (!renderer || !w || !hgt || key === uploaded) return;
    scaled.width = w;
    scaled.height = hgt;
    const ctx = scaled.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, w, hgt);
    ctx.drawImage(img, 0, 0, w, hgt);
    renderer.upload(scaled);
    uploaded = key;
    ready = true;
  }

  img.addEventListener('load', () => {
    init();
    requestAnimationFrame(anchor);
    if (!renderer) return setLive(false);
    try {
      uploaded = '';
      setLive(true);
      measure();
      wake();
    } catch {
      setLive(false);
    }
  });

  return {
    el: figure,
    img,
    get loaded() {
      return img.complete && img.naturalWidth > 0;
    },
    setSource(src, alt = '') {
      img.alt = alt;
      if (img.getAttribute('src') === src) return;
      // The old texture stays up until the new picture has loaded and replaced it.
      img.src = src;
    },
    // A sway from the hips and a little hop: hello.
    wave() {
      if (reducedMotion()) return;
      figure.animate(
        [
          { rotate: '0deg', translate: '0 0' },
          { rotate: '-5deg', translate: '0 -6px', offset: 0.18 },
          { rotate: '4deg', translate: '0 -3px', offset: 0.38 },
          { rotate: '-3.5deg', translate: '0 -2px', offset: 0.58 },
          { rotate: '2deg', translate: '0 0', offset: 0.78 },
          { rotate: '0deg', translate: '0 0' },
        ],
        { duration: 1500, easing: 'ease-in-out', composite: 'add' },
      );
    },
    hop() {
      if (reducedMotion()) return;
      figure.animate([{ translate: '0 0', scale: 1 }, { translate: '0 -10px', scale: '1.03 0.98', offset: 0.35 }, { translate: '0 0', scale: 1 }], {
        duration: 480,
        easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)',
        composite: 'add',
      });
    },
    say(line, ms = 4200) {
      clearTimeout(bubbleTimer);
      setText(text, line);
      const wasHidden = bubble.hidden;
      bubble.hidden = false;
      if (!reducedMotion()) {
        bubble.animate(
          wasHidden
            ? [{ opacity: 0, scale: 0.6, translate: '8px 8px' }, { opacity: 1, scale: 1.04, translate: '0 0', offset: 0.6 }, { opacity: 1, scale: 1, translate: '0 0' }]
            : [{ scale: 1 }, { scale: 1.06, offset: 0.4 }, { scale: 1 }],
          { duration: 460, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
        );
      }
      bubbleTimer = setTimeout(() => {
        const hide = () => (bubble.hidden = true);
        if (reducedMotion()) return hide();
        bubble.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.85 }], { duration: 220, easing: 'ease-in' }).finished.then(hide, hide);
      }, ms);
    },
    // Leans a few degrees toward a point (client coordinates); null stands it back up.
    lean(x, y) {
      if (reducedMotion()) return;
      if (x == null) {
        figure.style.rotate = '';
        figure.style.translate = '';
        return;
      }
      const r = img.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / 360));
      const dy = Math.max(-1, Math.min(1, (y - (r.top + r.height * 0.3)) / 360));
      figure.style.rotate = `${(dx * 3).toFixed(2)}deg`;
      figure.style.translate = `${(dx * 4).toFixed(1)}px ${(Math.abs(dx) * -2 + dy * 2).toFixed(1)}px`;
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(bubbleTimer);
      observer?.disconnect();
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
      if (renderer) canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();
      renderer = null;
    },
  };
}
