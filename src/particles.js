import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, OrthographicCamera, Points, Scene,
  ShaderMaterial, Vector2, Vector4, WebGLRenderer,
} from 'three';

/** GPU entrance and ambient motion, with the original spring interaction on nearby pixels. */
export async function createParticlePortrait({ canvas, image, anchor, reducedMotion, theme, onUpdate }) {
  await image.decode();
  const compact = matchMedia('(max-width: 700px)').matches;
  const sample = document.createElement('canvas');
  const density = Math.min(devicePixelRatio, 1.5);
  // Match the displayed portrait instead of oversampling every desktop at 960px.
  const sampleWidth = Math.round(Math.max(384, Math.min(compact ? 480 : 960, anchor.getBoundingClientRect().width * density)) / 2) * 2;
  sample.width = sampleWidth;
  sample.height = Math.round(sampleWidth * image.naturalHeight / image.naturalWidth);
  const sampling = sample.getContext('2d', { willReadFrequently: true });
  sampling.drawImage(image, 0, 0, sample.width, sample.height);
  const pixels = sampling.getImageData(0, 0, sample.width, sample.height).data;
  const step = 2;
  const capacity = Math.ceil(sample.width / step) * Math.ceil(sample.height / step);
  const positions = new Float32Array(capacity * 3);
  const colors = new Uint8Array(capacity * 4);
  const randoms = new Float32Array(capacity * 3);
  const haze = new Float32Array(capacity);
  const formedPositions = new Float32Array(capacity * 2);
  const formedGrid = new Map();
  const scatteredGrid = new Map();
  let count = 0;
  let sliceStarted = performance.now();
  // Typed buffers avoid large temporary JS arrays. Yield during setup, never per particle.
  for (let y = 0; y < sample.height; y += step) {
    for (let x = 0; x < sample.width; x += step) {
      const offset = (y * sample.width + x) * 4;
      if (pixels[offset + 3] < 32) continue;
      const index = count * 3;
      const u = x / sample.width;
      const v = y / sample.height;
      positions[index] = u;
      positions[index + 1] = v;
      positions[index + 2] = count % 4;
      colors[count * 4] = pixels[offset];
      colors[count * 4 + 1] = pixels[offset + 1];
      colors[count * 4 + 2] = pixels[offset + 2];
      colors[count * 4 + 3] = pixels[offset + 3];
      randoms[index] = Math.random();
      randoms[index + 1] = Math.random();
      randoms[index + 2] = Math.random();
      const edge = .25 + Math.sin(v * 15) * .025;
      const blend = Math.max(0, Math.min(1, (u - edge + .11) / .22));
      const upper = Math.max(0, Math.min(1, (v - .06) / .12));
      const lower = Math.max(0, Math.min(1, (v - .55) / .15));
      const blueRed = Math.max(0, Math.min(1, ((pixels[offset + 2] - pixels[offset]) / 255 - .035) / .085));
      const blueGreen = Math.max(0, Math.min(1, ((pixels[offset + 2] - pixels[offset + 1]) / 255 - .015) / .075));
      haze[count] = (1 - blend * blend * (3 - 2 * blend)) * upper * upper * (3 - 2 * upper)
        * (1 - lower * lower * (3 - 2 * lower)) * blueRed * blueRed * (3 - 2 * blueRed)
        * blueGreen * blueGreen * (3 - 2 * blueGreen) * .9;
      const drift = Math.pow(haze[count], 1.5) * (.12 + Math.pow(randoms[index + 2], 6) * .88) / 760;
      const formedX = u - drift * (30 + randoms[index] * 160);
      const formedY = v - drift * (randoms[index + 1] - .5) * 110 * image.naturalWidth / image.naturalHeight;
      formedPositions[count * 2] = formedX;
      formedPositions[count * 2 + 1] = formedY;
      const formedKey = `${Math.floor(formedX * 24)}:${Math.floor(formedY * 24)}`;
      const formedCell = formedGrid.get(formedKey);
      if (formedCell) formedCell.push(count);
      else formedGrid.set(formedKey, [count]);
      const scatteredKey = `${Math.floor(randoms[index] * 24)}:${Math.floor(randoms[index + 1] * 24)}`;
      const scatteredCell = scatteredGrid.get(scatteredKey);
      if (scatteredCell) scatteredCell.push(count);
      else scatteredGrid.set(scatteredKey, [count]);
      count++;
    }
    if (y % 32 === 0 && performance.now() - sliceStarted > 6) {
      if (window.scheduler?.yield) await window.scheduler.yield();
      else await new Promise(resolve => setTimeout(resolve, 0));
      sliceStarted = performance.now();
    }
  }

  const context = canvas.getContext('webgl2', { alpha: true, antialias: false, powerPreference: 'high-performance' });
  if (!context) throw new Error('WebGL 2 is unavailable');
  const renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: false });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, -100, 100);
  camera.position.z = 10;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions.subarray(0, count * 3), 3));
  geometry.setAttribute('rgba', new BufferAttribute(colors.subarray(0, count * 4), 4, true));
  geometry.setAttribute('randoms', new BufferAttribute(randoms.subarray(0, count * 3), 3));
  geometry.setAttribute('haze', new BufferAttribute(haze.subarray(0, count), 1));
  const offsets = new Float32Array(count * 2);
  const velocities = new Float32Array(count * 2);
  const interactionAttribute = new BufferAttribute(offsets, 2).setUsage(DynamicDrawUsage);
  geometry.setAttribute('interactionOffset', interactionAttribute);
  const activeParticles = new Set();
  const dirtyBlocks = new Set();
  const entryModes = ['converge', 'vortex', 'stream'];
  const entryDuration = 4.2;
  let entryMode = Math.floor(Math.random() * entryModes.length);
  const material = new ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      pointSize: { value: 2 }, assembly: { value: 0 }, dark: { value: theme === 'dark' ? 1 : 0 },
      time: { value: 0 }, intro: { value: 0 }, spread: { value: 0 }, entryMode: { value: entryMode },
      viewport: { value: new Vector2(1, 1) }, figure: { value: new Vector4() },
      motion: { value: reducedMotion ? .25 : 1 },
    },
    vertexShader: `
      attribute vec4 rgba;
      attribute vec3 randoms;
      attribute float haze;
      attribute vec2 interactionOffset;
      uniform float pointSize, assembly, time, intro, spread, entryMode, motion;
      uniform vec2 viewport;
      uniform vec4 figure;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vHaze;
      void main() {
        float seed = randoms.z;
        vec2 target = figure.xy + vec2(position.x * figure.z, -position.y * figure.w);
        float drift = pow(haze, 1.5) * (.12 + pow(seed, 6.) * .88) * figure.z / 760.;
        target += vec2(-30. - randoms.x * 160., (randoms.y - .5) * 110.) * drift;
        target += vec2(sin(time * .4 + seed * 40.) * 3., cos(time * .3 + seed * 30.) * 2.) * haze * seed * motion;
        vec2 p = target;
        // Uniform branches skip all entrance math once the portrait has settled.
        if (intro < 1.) {
          float delay = seed * .16;
          if (entryMode > 1.5) delay = position.y * .24 + seed * .06;
          float t = clamp((intro - delay) / (1. - delay), 0., 1.);
          float ease = 1. - pow(1. - t, 4.);
          // Both the main path and its sideways arc arrive with zero velocity.
          float arc = sin(t * 3.14159265) * (1. - t) * 1.35;
          if (entryMode < .5) {
            vec2 origin = (randoms.xy - .5) * viewport * 1.5;
            if (position.z < .5) origin.x = -viewport.x * .65;
            else if (position.z < 1.5) origin.x = viewport.x * .65;
            else if (position.z < 2.5) origin.y = -viewport.y * .65;
            else origin.y = viewport.y * .65;
            p = mix(origin, target, ease) + vec2(arc * (seed - .5) * 130., 0.);
          } else if (entryMode < 1.5) {
            float angle = randoms.x * 6.2831853 + t * 5.5;
            float radius = max(viewport.x, viewport.y) * (.55 + randoms.y * .3);
            vec2 center = figure.xy + vec2(figure.z * .5, -figure.w * .42);
            vec2 orbit = center + vec2(cos(angle), sin(angle) * .7) * radius;
            p = mix(orbit, target, ease);
          } else {
            vec2 origin = viewport * vec2(.6 + randoms.x * .55, .55 + randoms.y * .45);
            p = mix(origin, target, ease);
            p += vec2(-arc * viewport.x * .18, sin(t * 6.2831853 + seed * 3.) * arc * 65.);
          }
        }
        if (spread > 0.) {
          vec2 scattered = (randoms.xy - .5) * viewport * 1.08;
          scattered += vec2(sin(time * .45 + seed * 40.), cos(time * .35 + seed * 30.)) * 6.;
          p = mix(p, scattered, spread);
        }
        p += interactionOffset;
        vHaze = haze * assembly;
        vColor = mix(rgba.rgb, vec3(.35,.61,.95), vHaze * .25);
        vAlpha = rgba.a * mix(1., .75, vHaze);
        vAlpha *= mix(.035 + pow(seed, 6.) * .32, 1., assembly);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0., 1.);
        gl_PointSize = pointSize * mix(.3 + seed * .5, 1., assembly) * mix(1., .4 + seed * .46, vHaze);
      }`,
    fragmentShader: `
      uniform float assembly;
      uniform float dark;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vHaze;
      void main() {
        float radius = length(gl_PointCoord - vec2(.5));
        float edge = 1. - smoothstep(mix(.43,.22,vHaze), .5, radius);
        if (edge < .01) discard;
        vec3 blue = mix(vec3(.19,.43,.82), vec3(.38,.64,1.), dark);
        gl_FragColor = vec4(mix(blue, vColor, assembly), vAlpha * edge);
      }`,
  });
  const portrait = new Points(geometry, material);
  portrait.frustumCulled = false;
  scene.add(portrait);
  const uniforms = material.uniforms;

  const dustCount = compact ? 140 : 380;
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
        intensity = .12 + position.z * .38;
        vec3 p = vec3((position.x - .5) * width, (position.y - .5) * height, 0.);
        p.x += sin(time * .18 + position.z * 42.) * 10.;
        p.y += cos(time * .14 + position.x * 20.) * 9.;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (.8 + pow(position.z, 8.) * 3.5) * ratio;
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
  let bounds;
  let width = 1;
  let height = 1;
  let clock = 0;
  let entryStartedAt = 0;
  let spreadStartedAt = 0;
  let spreadFrom = 0;
  let spreadTarget = 0;
  let lastTime = 0;
  let lastUpdate = -1;
  let assembled = true;
  let paused = false;
  let settled = false;
  let started = false;
  let progress = 0;
  let frameId = 0;
  let disposed = false;
  let themeFrom = theme === 'dark' ? 1 : 0;
  let themeTarget = themeFrom;
  let themeStartedAt = 0;
  canvas.dataset.particleCount = String(count);
  canvas.dataset.entryMode = entryModes[entryMode];

  function clearInteraction() {
    pointer.active = false;
    if (!activeParticles.size) return;
    for (const i of activeParticles) {
      offsets[i * 2] = 0; offsets[i * 2 + 1] = 0;
      velocities[i * 2] = 0; velocities[i * 2 + 1] = 0;
    }
    activeParticles.clear();
    interactionAttribute.clearUpdateRanges();
    interactionAttribute.needsUpdate = true;
  }

  function resize() {
    bounds = canvas.getBoundingClientRect();
    const figure = anchor.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    // Cap fill rate on dense mobile screens; sample density is bounded independently.
    const ratio = Math.min(devicePixelRatio, compact ? 1.5 : 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.left = -width / 2; camera.right = width / 2;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    uniforms.figure.value.set(figure.left - bounds.left - width / 2, height / 2 - (figure.top - bounds.top), figure.width, figure.height);
    uniforms.viewport.value.set(width, height);
    uniforms.pointSize.value = step * figure.width / sampleWidth * ratio * 1.55;
    dustMaterial.uniforms.width.value = width;
    dustMaterial.uniforms.height.value = height;
    dustMaterial.uniforms.ratio.value = ratio;
    clearInteraction();
  }

  function transition(nextAssembled) {
    clearInteraction();
    assembled = nextAssembled;
    spreadFrom = uniforms.spread.value;
    spreadTarget = assembled ? 0 : 1;
    spreadStartedAt = clock;
    settled = false;
    if (paused || reducedMotion) {
      uniforms.intro.value = 1;
      entryStartedAt = clock - entryDuration;
      uniforms.spread.value = spreadTarget;
      spreadFrom = spreadTarget;
      progress = assembled ? 1 : 0;
      settled = true;
      uniforms.assembly.value = progress;
      renderer.render(scene, camera);
    }
    onUpdate({ assembled, paused, progress, settled, time: clock });
  }

  function animate(now) {
    if (disposed) return;
    const delta = Math.min((now - (lastTime || now)) / 1000, .04);
    lastTime = now;
    if (!paused) {
      clock += delta;
      uniforms.intro.value = Math.min((clock - entryStartedAt) / entryDuration, 1);
      const fraction = Math.min((clock - spreadStartedAt) / 2.4, 1);
      const ease = fraction * fraction * (3 - 2 * fraction);
      uniforms.spread.value = spreadFrom + (spreadTarget - spreadFrom) * ease;
      progress = uniforms.intro.value * (1 - uniforms.spread.value);
      settled = assembled ? progress === 1 : uniforms.spread.value === 1;
      const appearance = uniforms.intro.value * uniforms.intro.value * (3 - 2 * uniforms.intro.value);
      uniforms.assembly.value = appearance * (1 - uniforms.spread.value);
      uniforms.time.value = clock;
      uniforms.motion.value = reducedMotion ? .25 : 1;
      const radius = width < 701 ? 50 : 75;
      const figure = uniforms.figure.value;
      // The spatial grid activates only the pointer neighborhood, not every PNG sample.
      if (pointer.active && settled) {
        const grid = assembled ? formedGrid : scatteredGrid;
        const scaleX = assembled ? figure.z : width * 1.08;
        const scaleY = assembled ? figure.w : height * 1.08;
        const centerX = assembled ? (pointer.x - figure.x) / scaleX : pointer.x / scaleX + .5;
        const centerY = assembled ? (figure.y - pointer.y) / scaleY : pointer.y / scaleY + .5;
        const marginX = (radius + 6) / scaleX;
        const marginY = (radius + 6) / scaleY;
        for (let x = Math.floor((centerX - marginX) * 24); x <= Math.floor((centerX + marginX) * 24); x++) {
          for (let y = Math.floor((centerY - marginY) * 24); y <= Math.floor((centerY + marginY) * 24); y++) {
            const cell = grid.get(`${x}:${y}`);
            if (cell) for (const i of cell) activeParticles.add(i);
          }
        }
      }
      const damping = Math.exp(-10 * delta);
      dirtyBlocks.clear();
      for (const i of activeParticles) {
        const offset = i * 2;
        const index = i * 3;
        const seed = randoms[index + 2];
        const oldX = offsets[offset];
        const oldY = offsets[offset + 1];
        let forceX = -oldX * 46;
        let forceY = -oldY * 46;
        if (pointer.active && settled) {
          const motion = uniforms.motion.value;
          const x = assembled
            ? figure.x + formedPositions[offset] * figure.z + Math.sin(clock * .4 + seed * 40) * haze[i] * seed * 3 * motion
            : (randoms[index] - .5) * width * 1.08 + Math.sin(clock * .45 + seed * 40) * 6;
          const y = assembled
            ? figure.y - formedPositions[offset + 1] * figure.w + Math.cos(clock * .3 + seed * 30) * haze[i] * seed * 2 * motion
            : (randoms[index + 1] - .5) * height * 1.08 + Math.cos(clock * .35 + seed * 30) * 6;
          const dx = x + oldX - pointer.x;
          const dy = y + oldY - pointer.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < radius * radius) {
            const distance = Math.max(Math.sqrt(distanceSquared), 1);
            const force = (1 - distance / radius) * 1000;
            forceX += dx / distance * force;
            forceY += dy / distance * force;
          }
        }
        // These spring, repulsion and damping constants match commit 193fae7.
        velocities[offset] = (velocities[offset] + forceX * delta) * damping;
        velocities[offset + 1] = (velocities[offset + 1] + forceY * delta) * damping;
        offsets[offset] += velocities[offset] * delta;
        offsets[offset + 1] += velocities[offset + 1] * delta;
        if (Math.abs(offsets[offset]) + Math.abs(offsets[offset + 1]) + Math.abs(velocities[offset]) + Math.abs(velocities[offset + 1]) < .015) {
          offsets[offset] = 0; offsets[offset + 1] = 0;
          velocities[offset] = 0; velocities[offset + 1] = 0;
          activeParticles.delete(i);
        }
        if (offsets[offset] !== oldX || offsets[offset + 1] !== oldY) dirtyBlocks.add(Math.floor(i / 512));
      }
      if (dirtyBlocks.size) {
        interactionAttribute.clearUpdateRanges();
        for (const block of dirtyBlocks) interactionAttribute.addUpdateRange(block * 1024, Math.min(1024, offsets.length - block * 1024));
        interactionAttribute.needsUpdate = true;
      }
      dustMaterial.uniforms.time.value = clock * (reducedMotion ? .25 : 1);
    }
    const themeProgress = Math.min((now - themeStartedAt) / 800, 1);
    const themeEase = themeProgress * themeProgress * (3 - 2 * themeProgress);
    const dark = themeProgress === 1 ? themeTarget : themeFrom + (themeTarget - themeFrom) * themeEase;
    uniforms.dark.value = dark;
    dustMaterial.uniforms.dark.value = dark;
    renderer.render(scene, camera);
    if (clock - lastUpdate > .08) {
      onUpdate({ assembled, paused, progress, settled, time: clock });
      lastUpdate = clock;
    }
    if ((!paused || themeProgress < 1) && !document.hidden) frameId = requestAnimationFrame(animate);
  }

  function schedule() {
    cancelAnimationFrame(frameId);
    lastTime = 0;
    if (started && (!paused || uniforms.dark.value !== themeTarget) && !document.hidden) frameId = requestAnimationFrame(animate);
  }

  window.addEventListener('pointermove', event => {
    if (event.target.closest('a, button')) { pointer.active = false; return; }
    pointer.x = event.clientX - bounds.left - width / 2;
    pointer.y = height / 2 - (event.clientY - bounds.top);
    pointer.active = true;
  }, { signal: events.signal, passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; }, { signal: events.signal });
  window.addEventListener('blur', () => { pointer.active = false; }, { signal: events.signal });
  window.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') pointer.active = false; }, { signal: events.signal });
  window.addEventListener('pointercancel', () => { pointer.active = false; }, { signal: events.signal });
  document.addEventListener('visibilitychange', schedule, { signal: events.signal });
  window.addEventListener('scroll', () => { bounds = canvas.getBoundingClientRect(); }, { signal: events.signal, passive: true });
  resize();
  // Compile and upload before starting the visible entrance, so its first frame is warm.
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  const observer = new ResizeObserver(() => {
    const nextBounds = canvas.getBoundingClientRect();
    if (nextBounds.width === width && nextBounds.height === height) return;
    resize();
    renderer.render(scene, camera);
  });
  observer.observe(canvas.parentElement);

  return {
    start() {
      started = true;
      onUpdate({ assembled, paused, progress, settled, time: clock });
      schedule();
    },
    toggle() { reducedMotion = false; transition(!assembled); return assembled; },
    replay() {
      reducedMotion = false;
      paused = false;
      assembled = true;
      settled = false;
      progress = 0;
      entryStartedAt = clock;
      spreadFrom = 0;
      spreadTarget = 0;
      uniforms.intro.value = 0;
      uniforms.spread.value = 0;
      uniforms.assembly.value = 0;
      clearInteraction();
      // Pick a different entrance on replay without recompiling shaders or resampling pixels.
      entryMode = (entryMode + 1 + Math.floor(Math.random() * (entryModes.length - 1))) % entryModes.length;
      uniforms.entryMode.value = entryMode;
      canvas.dataset.entryMode = entryModes[entryMode];
      onUpdate({ assembled, paused, progress, settled, time: clock });
      schedule();
    },
    togglePause() {
      paused = !paused;
      if (!paused) reducedMotion = false;
      pointer.active = false;
      onUpdate({ assembled, paused, progress, settled, time: clock });
      schedule();
    },
    setTheme(nextTheme) {
      themeFrom = uniforms.dark.value;
      themeTarget = nextTheme === 'dark' ? 1 : 0;
      themeStartedAt = performance.now();
      schedule();
    },
    setReducedMotion(value) {
      reducedMotion = value;
      pointer.active = false;
      transition(assembled);
      schedule();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      events.abort(); observer.disconnect();
      geometry.dispose(); material.dispose(); dustGeometry.dispose(); dustMaterial.dispose();
      renderer.dispose();
    },
  };
}
