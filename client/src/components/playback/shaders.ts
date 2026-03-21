export const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SRGB_CONVERSION = `
vec3 linearToSRGB(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}
`;

const auroraFragment = `
uniform float uTime;
varying vec2 vUv;
${SRGB_CONVERSION}
float hash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  float t = uTime * 0.15;
  vec2 uv = vUv;
  uv.x *= 16.0 / 9.0;

  float n1 = fbm(uv * 3.0 + vec2(t, t * 0.7));
  float n2 = fbm(uv * 2.0 - vec2(t * 0.5, t * 1.1));
  float n3 = fbm(uv * 4.0 + vec2(t * 0.3, -t * 0.6));

  float wave = sin(uv.y * 6.0 + n1 * 4.0 + t) * 0.5 + 0.5;
  float wave2 = sin(uv.y * 8.0 + n2 * 3.0 - t * 1.3) * 0.5 + 0.5;

  vec3 c1 = vec3(0.05, 0.1, 0.3) * wave;
  vec3 c2 = vec3(0.1, 0.4, 0.3) * wave2;
  vec3 c3 = vec3(0.3, 0.1, 0.5) * n3;

  float glow = smoothstep(0.2, 0.8, wave * n1) * 0.6;
  vec3 color = c1 + c2 + c3 + vec3(0.05, 0.15, 0.2) * glow;

  float vignette = 1.0 - length((vUv - 0.5) * 1.5);
  color *= smoothstep(0.0, 0.7, vignette);

  color = clamp(color, vec3(0.0), vec3(1.0));

  gl_FragColor = vec4(linearToSRGB(color), 1.0);
}
`;

const nebulaFragment = `
uniform float uTime;
varying vec2 vUv;
${SRGB_CONVERSION}
float hash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    value += amp * noise(p);
    p *= 2.2;
    amp *= 0.45;
  }
  return value;
}

void main() {
  float t = uTime * 0.06;
  vec2 uv = vUv;
  uv.x *= 16.0 / 9.0;

  float n1 = fbm(uv * 2.5 + vec2(t, t * 0.4));
  float n2 = fbm(uv * 3.0 + vec2(-t * 0.3, t * 0.7) + n1 * 0.5);
  float n3 = fbm(uv * 1.8 - vec2(t * 0.2, -t * 0.5));

  vec3 purple = vec3(0.12, 0.03, 0.18) * n1 * 1.8;
  vec3 teal = vec3(0.02, 0.08, 0.12) * n2 * 1.5;
  vec3 dust = vec3(0.08, 0.04, 0.02) * n3 * 0.8;

  vec3 color = purple + teal + dust;

  float glow = smoothstep(0.45, 0.75, n1 * n2) * 0.3;
  color += vec3(0.08, 0.04, 0.15) * glow;

  float vignette = 1.0 - length((vUv - 0.5) * 1.6);
  color *= smoothstep(0.0, 0.6, vignette);

  color = clamp(color, vec3(0.0), vec3(0.45));

  gl_FragColor = vec4(linearToSRGB(color), 1.0);
}
`;

const plasmaFragment = `
uniform float uTime;
varying vec2 vUv;
${SRGB_CONVERSION}
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  float t = uTime * 0.1;
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= 16.0 / 9.0;

  vec3 color = vec3(0.0);
  vec2 uv0 = uv;

  for (int i = 0; i < 3; i++) {
    uv = fract(uv * 1.2) - 0.5;

    float d = length(uv) * exp(-length(uv0));
    vec3 col = palette(
      length(uv0) + float(i) * 0.4 + t,
      vec3(0.03, 0.02, 0.06),
      vec3(0.1, 0.1, 0.18),
      vec3(1.0, 1.0, 1.0),
      vec3(0.263, 0.416, 0.557)
    );

    d = sin(d * 5.0 + t) / 5.0;
    d = abs(d);
    d = pow(0.006 / d, 1.05);

    color += col * d;
  }

  color = clamp(color * 0.45, vec3(0.0), vec3(0.5));

  gl_FragColor = vec4(linearToSRGB(color), 1.0);
}
`;

const starfieldFragment = `
uniform float uTime;
varying vec2 vUv;
${SRGB_CONVERSION}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float starLayer(vec2 uv, float scale, float brightness, float speed) {
  vec2 grid = uv * scale;
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - 0.5;

  float stars = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 neighbor = cell + offset;
      float rnd = hash21(neighbor);
      vec2 pos = vec2(hash21(neighbor + 100.0) - 0.5, hash21(neighbor + 200.0) - 0.5);
      float d = length(local - offset - pos * 0.7);
      float twinkle = sin(uTime * speed * (rnd * 3.0 + 1.0) + rnd * 6.28) * 0.5 + 0.5;
      float size = rnd * 0.03 + 0.008;
      stars += smoothstep(size, 0.0, d) * brightness * (0.5 + 0.5 * twinkle);
    }
  }
  return stars;
}

void main() {
  vec2 uv = vUv;
  uv.x *= 16.0 / 9.0;

  vec2 drift = vec2(uTime * 0.008, uTime * 0.003);

  float stars = 0.0;
  stars += starLayer(uv + drift, 12.0, 0.6, 0.8);
  stars += starLayer(uv + drift * 0.5, 24.0, 0.35, 1.2);
  stars += starLayer(uv + drift * 0.2, 48.0, 0.15, 1.6);

  vec3 bgGrad = mix(
    vec3(0.01, 0.01, 0.04),
    vec3(0.04, 0.02, 0.06),
    uv.y
  );

  vec3 color = bgGrad + vec3(0.7, 0.8, 1.0) * stars;
  color = clamp(color, vec3(0.0), vec3(0.6));

  gl_FragColor = vec4(linearToSRGB(color), 1.0);
}
`;

const wavesFragment = `
uniform float uTime;
varying vec2 vUv;
${SRGB_CONVERSION}
void main() {
  float t = uTime * 0.4;
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= 16.0 / 9.0;

  vec3 color = vec3(0.0);

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float waveY = sin(uv.x * (2.0 + fi * 0.5) + t * (0.8 + fi * 0.15) + fi * 1.2) * 0.15;
    float dist = abs(uv.y - waveY - (fi - 2.5) * 0.2);
    float intensity = 0.012 / dist;

    float hue = fi / 6.0 + t * 0.05;
    float r = 0.5 + 0.5 * cos(6.28318 * (hue + 0.0));
    float g = 0.5 + 0.5 * cos(6.28318 * (hue + 0.333));
    float b = 0.5 + 0.5 * cos(6.28318 * (hue + 0.667));

    color += vec3(r, g, b) * intensity * 0.4;
  }

  vec3 bg = vec3(0.02, 0.02, 0.06);
  color += bg;

  color = clamp(color, vec3(0.0), vec3(1.0));

  gl_FragColor = vec4(linearToSRGB(color), 1.0);
}
`;

export interface ShaderDefinition {
  name: string;
  fragmentShader: string;
}

export const shaders: ShaderDefinition[] = [
  { name: "Plasma", fragmentShader: plasmaFragment },
  { name: "Aurora", fragmentShader: auroraFragment },
  { name: "Waves", fragmentShader: wavesFragment },
  { name: "Nebula", fragmentShader: nebulaFragment },
  { name: "Starfield", fragmentShader: starfieldFragment },
];
