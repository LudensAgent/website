import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, OrthographicCamera,
  Mesh, PlaneGeometry, Points, Scene, ShaderMaterial, Texture, Vector2, WebGLRenderer,
} from 'three';

/** Samples an alpha PNG once, then renders its colored pixels as independent WebGL points. */
export async function createParticlePortrait({ canvas, image, anchor, reducedMotion, theme, onUpdate }) {
  await image.decode();
  const sample = document.createElement('canvas');
  const sampleWidth = matchMedia('(max-width: 700px)').matches ? 360 : 800;
  sample.width = sampleWidth;
  sample.height = Math.round(sampleWidth * image.naturalHeight / image.naturalWidth);
  const sampling = sample.getContext('2d', { willReadFrequently: true });
  sampling.drawImage(image, 0, 0, sample.width, sample.height);
  const pixels = sampling.getImageData(0, 0, sample.width, sample.height).data;
  const samples = [];
  const colors = [];
  const alphas = [];
  // Tight loops avoid allocating a per-pixel object in the image boundary and animation hot path.
  const step = 2;
  for (let y = 0; y < sample.height; y += step) {
    for (let x = 0; x < sample.width; x += step) {
      const offset = (y * sample.width + x) * 4;
      if (pixels[offset + 3] < 32) continue;
      samples.push(x / sample.width, y / sample.height);
      colors.push(pixels[offset] / 255, pixels[offset + 1] / 255, pixels[offset + 2] / 255);
      alphas.push(pixels[offset + 3] / 255);
    }
  }

  const context = canvas.getContext('webgl2', { alpha: true, antialias: false });
  if (!context) throw new Error('WebGL 2 is unavailable');
  const renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, -100, 100);
  camera.position.z = 10;
  const count = alphas.length;
  const positions = new Float32Array(count * 3);
  const targets = new Float32Array(count * 3);
  const formed = new Float32Array(count * 3);
  const scattered = new Float32Array(count * 3);
  const origins = new Float32Array(count * 3);
  const starts = new Float32Array(count * 3);
  const offsets = new Float32Array(count * 2);
  const velocities = new Float32Array(count * 2);
  const haze = new Float32Array(count);
  const seeds = Float32Array.from({ length: count }, () => Math.random());
  const scatterX = Float32Array.from({ length: count }, () => Math.random());
  const scatterY = Float32Array.from({ length: count }, () => Math.random());
  const geometry = new BufferGeometry();
  const positionAttribute = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('alpha', new BufferAttribute(new Float32Array(alphas), 1));
  geometry.setAttribute('seed', new BufferAttribute(seeds, 1));
  geometry.setAttribute('sourceUv', new BufferAttribute(new Float32Array(samples), 2));
  const targetAttribute = new BufferAttribute(targets, 3);
  geometry.setAttribute('home', targetAttribute);
  // The texture and sampled points share one continuous, irregular material boundary.
  const transitionShader = `
    float reality(vec2 uv, vec3 color) {
      float edge = .25 + sin(uv.y * 15.) * .025;
      float grain = fract(sin(dot(floor(uv * 430.), vec2(12.9898,78.233))) * 43758.5453);
      float outerHair = 1. - smoothstep(edge - .11, edge + .11, uv.x + (grain - .5) * .025);
      float heightMask = smoothstep(.06, .18, uv.y) * (1. - smoothstep(.55, .70, uv.y));
      float blueHair = smoothstep(.035, .12, color.b - color.r) * smoothstep(.015, .09, color.b - color.g);
      return 1. - outerHair * heightMask * blueHair * .9;
    }
    float pointerHole(vec2 point, vec2 mouse, float strength) {
      return (1. - smoothstep(12., 70., distance(point, mouse))) * strength * .55;
    }
  `;
  const mouseUniform = { value: new Vector2(-10000, -10000) };
  const pointerUniform = { value: 0 };
  const assemblyUniform = { value: 0 };
  const material = new ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { pointSize: { value: 2 }, assembly: assemblyUniform, dark: { value: theme === 'dark' ? 1 : 0 }, mouse: mouseUniform, pointerActive: pointerUniform },
    vertexShader: `
      attribute vec3 color;
      attribute float alpha;
      attribute float seed;
      attribute vec2 sourceUv;
      attribute vec3 home;
      uniform float pointSize;
      uniform float assembly;
      uniform vec2 mouse;
      uniform float pointerActive;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vHaze;
      ${transitionShader}
      void main() {
        float solid = reality(sourceUv, color);
        float detail = smoothstep(.68, .99, assembly);
        float hole = pointerHole(home.xy, mouse, pointerActive);
        vHaze = (1. - solid) * assembly;
        vColor = mix(color, vec3(.35,.61,.95), vHaze * .25);
        vAlpha = alpha * (1. - solid * detail * (1. - hole));
        vAlpha *= mix(.035 + pow(seed, 6.) * .32, 1., assembly);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = pointSize * mix(.3 + seed * .5, 1.0, assembly) * mix(1., .4 + seed * .46, vHaze);
      }`,
    fragmentShader: `
      uniform float assembly;
      uniform float dark;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vHaze;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        float edge = 1.0 - smoothstep(mix(.43,.22,vHaze), .5, radius);
        if (edge < 0.01) discard;
        vec3 blue = mix(vec3(0.19, 0.43, 0.82), vec3(0.38, 0.64, 1.0), dark);
        gl_FragColor = vec4(mix(blue, vColor, assembly), vAlpha * edge);
      }`,
  });
  const portrait = new Points(geometry, material);
  portrait.frustumCulled = false;
  const texture = new Texture(image);
  texture.needsUpdate = true;
  const detailGeometry = new PlaneGeometry(1, 1);
  const detailMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    uniforms: { portrait: { value: texture }, assembly: assemblyUniform, mouse: mouseUniform, pointerActive: pointerUniform },
    vertexShader: `
      varying vec2 vUv; varying vec2 vPoint;
      void main() {
        vUv = vec2(uv.x, 1. - uv.y);
        vec4 point = modelMatrix * vec4(position, 1.);
        vPoint = point.xy;
        gl_Position = projectionMatrix * viewMatrix * point;
      }`,
    fragmentShader: `
      uniform sampler2D portrait; uniform float assembly;
      uniform vec2 mouse; uniform float pointerActive;
      varying vec2 vUv; varying vec2 vPoint;
      ${transitionShader}
      void main() {
        vec4 color = texture2D(portrait, vec2(vUv.x, 1. - vUv.y));
        float mask = reality(vUv, color.rgb) * smoothstep(.68, .99, assembly);
        color.a *= mask * (1. - pointerHole(vPoint, mouse, pointerActive));
        gl_FragColor = color;
      }`,
  });
  const detail = new Mesh(detailGeometry, detailMaterial);
  scene.add(detail);
  portrait.renderOrder = 1;
  scene.add(portrait);

  const dustCount = sampleWidth === 360 ? 140 : 380;
  const dustSeeds = Float32Array.from({ length: dustCount * 3 }, () => Math.random());
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute('position', new BufferAttribute(dustSeeds, 3));
  const dustMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    uniforms: { time: { value: 0 }, width: { value: 1 }, height: { value: 1 }, ratio: { value: 1 }, dark: { value: theme === 'dark' ? 1 : 0 } },
    vertexShader: `
      uniform float time; uniform float width; uniform float height; uniform float ratio;
      varying float intensity;
      void main() {
        intensity = 0.12 + position.z * 0.38;
        vec3 p = vec3((position.x - .5) * width, (position.y - .5) * height, 0.);
        p.x += sin(time * .18 + position.z * 42.) * 10.;
        p.y += cos(time * .14 + position.x * 20.) * 9.;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (0.8 + pow(position.z, 8.) * 3.5) * ratio;
      }`,
    fragmentShader: `
      uniform float dark; varying float intensity;
      void main() { gl_FragColor = vec4(mix(vec3(.24,.46,.81),vec3(.5,.74,1.),dark),intensity); }`,
  });
  const dust = new Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  scene.add(dust);

  const pointer = { x: -10000, y: -10000, active: false };
  const events = new AbortController();
  let width = 1;
  let height = 1;
  let clock = 0;
  let transitionStart = 0;
  let duration = reducedMotion ? 0 : 3.6;
  let lastTime = 0;
  let lastUpdate = -1;
  let assembled = true;
  let paused = reducedMotion;
  let settled = false;
  let progress = reducedMotion ? 1 : 0;
  let startProgress = progress;
  let frameId = 0;
  let disposed = false;
  canvas.dataset.particleCount = String(count);

  function resize(initial = false) {
    const bounds = canvas.getBoundingClientRect();
    const figure = anchor.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(devicePixelRatio, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.left = -width / 2; camera.right = width / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    material.uniforms.pointSize.value = step * figure.width / sampleWidth * ratio * 1.55;
    detail.position.set(figure.left - bounds.left + figure.width / 2 - width / 2, height / 2 - (figure.top - bounds.top + figure.height / 2), 0);
    detail.scale.set(figure.width, figure.height, 1);
    dustMaterial.uniforms.width.value = width;
    dustMaterial.uniforms.height.value = height;
    dustMaterial.uniforms.ratio.value = ratio;
    for (let i = 0; i < count; i++) {
      const index = i * 3;
      targets[index] = figure.left - bounds.left + samples[i * 2] * figure.width - width / 2;
      targets[index + 1] = height / 2 - (figure.top - bounds.top + samples[i * 2 + 1] * figure.height);
      const edge = .25 + Math.sin(samples[i * 2 + 1] * 15) * .025;
      const blend = Math.max(0, Math.min(1, (samples[i * 2] - edge + .11) / .22));
      const upper = Math.max(0, Math.min(1, (samples[i * 2 + 1] - .06) / .12));
      const lower = Math.max(0, Math.min(1, (samples[i * 2 + 1] - .55) / .15));
      const blueRed = Math.max(0, Math.min(1, (colors[index + 2] - colors[index] - .035) / .085));
      const blueGreen = Math.max(0, Math.min(1, (colors[index + 2] - colors[index + 1] - .015) / .075));
      haze[i] = (1 - blend * blend * (3 - 2 * blend)) * upper * upper * (3 - 2 * upper)
        * (1 - lower * lower * (3 - 2 * lower)) * blueRed * blueRed * (3 - 2 * blueRed)
        * blueGreen * blueGreen * (3 - 2 * blueGreen) * .9;
      const drift = Math.pow(haze[i], 1.5) * (.12 + Math.pow(seeds[i], 6) * .88) * figure.width / 760;
      formed[index] = targets[index] - drift * (30 + scatterX[i] * 160);
      formed[index + 1] = targets[index + 1] + drift * (scatterY[i] - .5) * 110;
      scattered[index] = (scatterX[i] - .5) * width * 1.08;
      scattered[index + 1] = (scatterY[i] - .5) * height * 1.08;
      const side = i % 4;
      origins[index] = side === 0 ? -width * .65 : side === 1 ? width * .65 : (scatterX[i] - .5) * width * 1.5;
      origins[index + 1] = side === 2 ? -height * .65 : side === 3 ? height * .65 : (scatterY[i] - .5) * height * 1.5;
    }
    targetAttribute.needsUpdate = true;
    if (initial) {
      positions.set(reducedMotion ? formed : origins);
      starts.set(positions);
    } else transition(assembled, .65);
    positionAttribute.needsUpdate = true;
    renderer.render(scene, camera);
  }

  function transition(nextAssembled, seconds = 2.8) {
    assembled = nextAssembled;
    starts.set(positions);
    offsets.fill(0); velocities.fill(0);
    transitionStart = clock;
    startProgress = progress;
    duration = reducedMotion ? 0 : seconds;
    settled = false;
    if (paused || reducedMotion) {
      positions.set(assembled ? formed : scattered);
      starts.set(positions);
      progress = assembled ? 1 : 0;
      startProgress = progress;
      duration = 0;
      settled = true;
      material.uniforms.assembly.value = progress;
      positionAttribute.needsUpdate = true;
      renderer.render(scene, camera);
    }
    onUpdate({ assembled, paused, progress, settled });
  }

  function animate(now) {
    if (disposed) return;
    const delta = Math.min((now - (lastTime || now)) / 1000, .04);
    lastTime = now;
    clock += delta;
    const elapsed = clock - transitionStart;
    const fraction = duration ? Math.min(elapsed / duration, 1) : 1;
    progress = startProgress + ((assembled ? 1 : 0) - startProgress) * fraction;
    settled = fraction === 1;
    const damping = Math.exp(-10 * delta);
    const radius = width < 701 ? 50 : 75;
    const destinations = assembled ? formed : scattered;
    pointerUniform.value += ((pointer.active && !reducedMotion ? 1 : 0) - pointerUniform.value) * Math.min(1, delta * 12);
    mouseUniform.value.set(pointer.x, pointer.y);
    for (let i = 0; i < count; i++) {
      const index = i * 3;
      const offset = i * 2;
      const delayed = duration ? Math.max(0, Math.min(1, (elapsed - seeds[i] * duration * .26) / (duration * .74))) : 1;
      const ease = 1 - Math.pow(1 - delayed, 3);
      const arc = Math.sin(delayed * Math.PI) * (seeds[i] - .5) * 130;
      let x = starts[index] + (destinations[index] - starts[index]) * ease + arc;
      let y = starts[index + 1] + (destinations[index + 1] - starts[index + 1]) * ease;
      if (!assembled) {
        x += Math.sin(clock * .45 + seeds[i] * 40) * 6 * ease;
        y += Math.cos(clock * .35 + seeds[i] * 30) * 6 * ease;
      } else {
        x += Math.sin(clock * .4 + seeds[i] * 40) * haze[i] * seeds[i] * 3 * ease;
        y += Math.cos(clock * .3 + seeds[i] * 30) * haze[i] * seeds[i] * 2 * ease;
      }
      let forceX = -offsets[offset] * 46;
      let forceY = -offsets[offset + 1] * 46;
      if (pointer.active && !reducedMotion) {
        const dx = x + offsets[offset] - pointer.x;
        const dy = y + offsets[offset + 1] - pointer.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < radius * radius) {
          const distance = Math.max(Math.sqrt(distanceSquared), 1);
          const force = (1 - distance / radius) * 1000;
          forceX += dx / distance * force;
          forceY += dy / distance * force;
        }
      }
      velocities[offset] = (velocities[offset] + forceX * delta) * damping;
      velocities[offset + 1] = (velocities[offset + 1] + forceY * delta) * damping;
      offsets[offset] += velocities[offset] * delta;
      offsets[offset + 1] += velocities[offset + 1] * delta;
      positions[index] = x + offsets[offset];
      positions[index + 1] = y + offsets[offset + 1];
    }
    positionAttribute.needsUpdate = true;
    material.uniforms.assembly.value = progress;
    dustMaterial.uniforms.time.value = clock;
    renderer.render(scene, camera);
    if (clock - lastUpdate > .08) {
      onUpdate({ assembled, paused, progress, settled });
      lastUpdate = clock;
    }
    if (!paused && !document.hidden) frameId = requestAnimationFrame(animate);
  }

  function schedule() {
    cancelAnimationFrame(frameId);
    lastTime = 0;
    if (!paused && !document.hidden) frameId = requestAnimationFrame(animate);
  }

  window.addEventListener('pointermove', event => {
    if (event.target.closest('a, button')) { pointer.active = false; return; }
    const bounds = canvas.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left - width / 2;
    pointer.y = height / 2 - (event.clientY - bounds.top);
    pointer.active = true;
  }, { signal: events.signal, passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; }, { signal: events.signal });
  window.addEventListener('blur', () => { pointer.active = false; }, { signal: events.signal });
  window.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') pointer.active = false; }, { signal: events.signal });
  window.addEventListener('pointercancel', () => { pointer.active = false; }, { signal: events.signal });
  document.addEventListener('visibilitychange', schedule, { signal: events.signal });
  resize(true);
  material.uniforms.assembly.value = progress;
  settled = reducedMotion;
  onUpdate({ assembled, paused, progress, settled });
  if (paused) renderer.render(scene, camera);
  schedule();
  let previousWidth = width;
  let previousHeight = height;
  const observer = new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === previousWidth && entry.contentRect.height === previousHeight) return;
    previousWidth = entry.contentRect.width; previousHeight = entry.contentRect.height;
    resize();
  });
  observer.observe(canvas.parentElement);

  return {
    toggle() { transition(!assembled); return assembled; },
    replay() {
      // Replay is an explicit request for motion even when autoplay was skipped.
      reducedMotion = false;
      paused = false;
      positions.set(origins);
      progress = 0;
      transition(true, 3.6);
      schedule();
    },
    togglePause() {
      paused = !paused;
      if (!paused) reducedMotion = false;
      pointer.active = false;
      pointerUniform.value = 0;
      renderer.render(scene, camera);
      onUpdate({ assembled, paused, progress, settled });
      schedule();
    },
    setTheme(nextTheme) {
      material.uniforms.dark.value = nextTheme === 'dark' ? 1 : 0;
      dustMaterial.uniforms.dark.value = nextTheme === 'dark' ? 1 : 0;
      renderer.render(scene, camera);
    },
    setReducedMotion(value) {
      reducedMotion = value;
      paused = value;
      pointer.active = false;
      transition(assembled);
      schedule();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      events.abort(); observer.disconnect();
      geometry.dispose(); material.dispose(); dustGeometry.dispose(); dustMaterial.dispose();
      detailGeometry.dispose(); detailMaterial.dispose(); texture.dispose(); renderer.dispose();
    },
  };
}
