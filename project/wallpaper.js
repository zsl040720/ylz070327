/* Local backgrounds are reused; the two exchangeable album cards are an independent layer. */
(() => {
  "use strict";
  const settings = {
    motion: true, parallax: 20, dust: 35, light: 25, speed: 35,
    brightness: 100, fit: "contain", petalsenabled: true, petalsamount: 14, petalsspeed: 100,
    particledirection: "down"
  };
  // Preserve the old default drift without coupling petals to the other ambience.
  const PETAL_BASE_RATE = 0.62;
  const state = {
    ready: false, paused: false, fps: 30, frames: 0, time: 0, petalsTime: 0,
    width: 0, height: 0, dpr: 1, reducedMotion: false, error: null,
    theme: "forest", transitioning: false
  };
  const artwork = document.getElementById("artwork");
  const canvas = document.getElementById("atmosphere");
  const errorLabel = document.getElementById("load-error");
  const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointer = { x: 0, y: 0, easedX: 0, easedY: 0 };
  const particles = [];
  const petals = [];
  const petalAtlas = new Image();
  let frameHandle = 0;
  let previous = 0;
  let accumulator = 0;
  let renderElapsed = 0;
  let disposed = false;
  let seed = 431960;
  let countdown = null;
  let spectrum = null;
  let sparkles = null;
  let album = null;
  let widgetCascade = null;

  if (window.FlowerCountdown) {
    countdown = window.FlowerCountdown.create({ element: document.getElementById("countdown") });
  }
  if (window.FlowerSpectrum) {
    spectrum = window.FlowerSpectrum.create({ onWake() { if (!frameHandle) syncLoop(); } });
  }
  if (window.FlowerSparkles) {
    sparkles = window.FlowerSparkles.create();
  }
  if (window.FlowerWidgetCascade) {
    widgetCascade = window.FlowerWidgetCascade.create({
      element: document.getElementById("countdown"),
      transitionLayer: document.getElementById("album-transition")
    });
  }
  if (window.FlowerAlbum) {
    album = window.FlowerAlbum.create({
      artwork,
      layer: document.getElementById("album-layer"),
      transitionLayer: document.getElementById("album-transition"),
      statusElement: document.getElementById("album-status"),
      onPrepareTransition(detail) {
        return widgetCascade ? widgetCascade.prepare(detail.to) : Promise.resolve();
      },
      onTransitionStart(detail) {
        if (widgetCascade) widgetCascade.begin(detail);
        if (!frameHandle) syncLoop();
      },
      onCommit(id) {
        state.theme = id;
        if (document.body && document.body.dataset) document.body.dataset.wallpaperTheme = id;
        if (spectrum && spectrum.setTheme) spectrum.setTheme(id);
        if (widgetCascade) widgetCascade.commit(id);
        syncLoop();
      },
      onBusyChange(busy) {
        state.transitioning = Boolean(busy);
        if (!busy) syncLoop();
      }
    });
  }

  function particleSource() {
    return petalAtlas.naturalWidth > 0 ? {
      image: petalAtlas, width: petalAtlas.naturalWidth, height: petalAtlas.naturalHeight,
      columns: 2, rows: 2, sizeScale: 1
    } : null;
  }

  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }
  function isEnabled(value) { return value === true || value === 1; }
  function petalsVisible() {
    return settings.motion && !state.reducedMotion && settings.petalsenabled &&
      settings.petalsamount > 0 && Boolean(particleSource());
  }
  function ambientMoving() {
    return settings.motion && !state.reducedMotion &&
      (settings.dust > 0 || settings.light > 0 || settings.parallax > 0 ||
        (petalsVisible() && settings.petalsspeed > 0) || Boolean(sparkles && sparkles.hasActivity()));
  }
  function moving() {
    return ambientMoving() || (!state.reducedMotion && Boolean(spectrum && spectrum.hasActivity())) ||
      Boolean(widgetCascade && widgetCascade.getTransition());
  }
  function canRun() {
    return !disposed && state.ready && context && !state.paused && !document.hidden && moving();
  }
  function clearAtmosphere() {
    if (context) {
      context.clearRect(0, 0, state.width, state.height);
      if (state.ready && state.width > 0 && state.height > 0 && petalsVisible()) {
        const rect = imageRect();
        context.save();
        context.beginPath();
        context.rect(rect.x, rect.y, rect.width, rect.height);
        context.clip();
        drawPetals(rect, 0);
        context.restore();
      }
      if (spectrum) spectrum.draw(context, state.width, state.height, 0, true,
        widgetCascade ? widgetCascade.getTransition() : null);
    }
  }
  function syncLoop() {
    cancelAnimationFrame(frameHandle);
    frameHandle = 0;
    previous = 0;
    accumulator = 0;
    renderElapsed = 0;
    if (!moving()) {
      artwork.style.transform = "none";
      if (album) album.setTransform("none");
      clearAtmosphere();
    }
    if (canRun()) frameHandle = requestAnimationFrame(tick);
  }
  function syncAppearance() {
    document.documentElement.style.setProperty("--wallpaper-brightness", settings.brightness / 100);
    artwork.style.objectFit = settings.fit;
    syncLoop();
  }

  // The host sends partial updates, including explicit false and zero values.
  window.wallpaperPropertyListener = {
    applyUserProperties(properties) {
      if (!properties || typeof properties !== "object") return;
      if (properties.motion) settings.motion = isEnabled(properties.motion.value);
      if (properties.petalsenabled) settings.petalsenabled = isEnabled(properties.petalsenabled.value);
      if (properties.petalsamount) settings.petalsamount = clamp(properties.petalsamount.value, 0, 60, settings.petalsamount);
      if (properties.petalsspeed) settings.petalsspeed = clamp(properties.petalsspeed.value, 0, 300, settings.petalsspeed);
      if (properties.particledirection && ["down", "downleft", "downright", "random"].includes(properties.particledirection.value)) {
        settings.particledirection = properties.particledirection.value;
      }
      for (const key of ["parallax", "dust", "light", "speed"]) {
        if (properties[key]) settings[key] = clamp(properties[key].value, 0, 100, settings[key]);
      }
      if (properties.brightness) {
        settings.brightness = clamp(properties.brightness.value, 60, 120, settings.brightness);
      }
      if (properties.fit) settings.fit = properties.fit.value === "cover" ? "cover" : "contain";
      if (countdown) countdown.applyProperties(properties);
      if (spectrum) spectrum.applyProperties(properties);
      if (sparkles) sparkles.applyProperties(properties);
      if (widgetCascade) widgetCascade.applyProperties(properties);
      if (album) album.applyProperties(properties);
      syncAppearance();
    },
    applyGeneralProperties(properties) {
      if (properties && properties.fps !== undefined) {
        const value = typeof properties.fps === "object" ? properties.fps.value : properties.fps;
        state.fps = clamp(value, 0, 240, state.fps);
        syncLoop();
      }
    },
    setPaused(paused) {
      state.paused = Boolean(paused);
      if (countdown) countdown.setPaused(state.paused);
      if (album) album.setPaused(state.paused);
      syncLoop();
    }
  };

  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  const spriteContext = sprite.getContext("2d");
  if (spriteContext) {
    const gradient = spriteContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,245,212,0.9)");
    gradient.addColorStop(0.12, "rgba(248,230,185,0.6)");
    gradient.addColorStop(0.42, "rgba(226,205,156,0.12)");
    gradient.addColorStop(1, "rgba(226,205,156,0)");
    spriteContext.fillStyle = gradient;
    spriteContext.fillRect(0, 0, 64, 64);
  }
  for (let i = 0; i < 120; i += 1) {
    particles.push({
      x: random(), y: random(), phase: random() * Math.PI * 2,
      depth: 0.35 + random() * 0.65, drift: random() * 2 - 1,
      opacity: 0.12 + random() * 0.24
    });
  }
  for (let i = 0; i < 60; i += 1) {
    petals.push({
      x: random(), y: random(), phase: random() * Math.PI * 2,
      depth: 0.45 + random() * 0.55, drift: -0.002 - random() * 0.005,
      rotation: random() * Math.PI * 2, spin: (random() - 0.5) * 0.5,
      sprite: Math.floor(random() * 4)
    });
  }
  for (const petal of petals) {
    petal.direction = ["down", "downleft", "downright"][Math.floor(petal.phase / (Math.PI * 2) * 3)];
  }

  function drawPetals(rect, delta) {
    if (!petalsVisible() || !context) return;
    const source = particleSource();
    const cellWidth = source.width / source.columns;
    const cellHeight = source.height / source.rows;
    const scale = Math.min(rect.width / 2560, rect.height / 1440);
    const count = Math.round(settings.petalsamount);
    for (let i = 0; i < count; i += 1) {
      const petal = petals[i];
      const fall = 0.009 + petal.depth * 0.01;
      const randomDirection = settings.particledirection === "random";
      const direction = randomDirection ? petal.direction : settings.particledirection;
      const velocityX = direction === "down" ? 0 : direction === "downright" ? Math.abs(petal.drift) : -Math.abs(petal.drift);
      petal.y += delta * fall;
      petal.x += delta * velocityX;
      petal.rotation += delta * petal.spin;
      let respawned = false;
      if (petal.y > 1.05) { petal.y = -0.05; petal.x = random(); respawned = true; }
      if (petal.x < -0.05) { petal.x = 1.05; respawned = true; }
      if (petal.x > 1.05) { petal.x = -0.05; respawned = true; }
      if (respawned && randomDirection) petal.direction = ["down", "downleft", "downright"][Math.floor(random() * 3)];
      const sway = Math.sin(state.petalsTime * 0.45 + petal.phase) * 0.014;
      const x = petal.x + sway;
      const y = petal.y;
      const faceDistance = Math.sqrt(faceDistanceSquared(x, y));
      let opacity = clamp((faceDistance - 1) / 0.3, 0, 1, 0) * (0.32 + petal.depth * 0.4);
      if (x > 0.76 && y < 0.96) opacity *= 0.25;
      if (x > 0.1 && x < 0.49 && y > 0.5) opacity *= 0.18;
      if (opacity < 0.01) continue;
      const size = (28 + petal.depth * 24) * scale * (source.sizeScale || 1);
      const spriteIndex = petal.sprite % (source.columns * source.rows);
      const width = size * Math.min(1, cellWidth / cellHeight);
      const height = size * Math.min(1, cellHeight / cellWidth);
      const flip = 0.5 + 0.5 * Math.abs(Math.sin(state.petalsTime * 0.48 + petal.phase));
      context.save();
      context.translate(rect.x + x * rect.width, rect.y + y * rect.height);
      context.rotate(petal.rotation + Math.sin(state.petalsTime * 0.22 + petal.phase) * 0.2);
      context.scale(flip, 1);
      context.globalAlpha = opacity;
      context.drawImage(source.image, (spriteIndex % source.columns) * cellWidth,
        Math.floor(spriteIndex / source.columns) * cellHeight, cellWidth, cellHeight,
        -width / 2, -height / 2, width, height);
      context.restore();
    }
  }

  function imageRect() {
    const naturalWidth = artwork.naturalWidth || 2560;
    const naturalHeight = artwork.naturalHeight || 1440;
    const scale = settings.fit === "cover"
      ? Math.max(state.width / naturalWidth, state.height / naturalHeight)
      : Math.min(state.width / naturalWidth, state.height / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    return { x: (state.width - width) / 2, y: (state.height - height) / 2, width, height };
  }
  function faceDistanceSquared(x, y) {
    const face = state.theme === "manga" ? [0.77, 0.36, 0.12, 0.29] :
      state.theme === "metro" ? [0.51, 0.37, 0.125, 0.29] : [0.65, 0.47, 0.15, 0.31];
    return ((x - face[0]) / face[2]) ** 2 + ((y - face[1]) / face[3]) ** 2;
  }
  function resize() {
    state.width = Math.max(1, window.innerWidth);
    state.height = Math.max(1, window.innerHeight);
    // A capped backing buffer bounds GPU memory even on high-DPI 4K displays.
    state.dpr = Math.min(window.devicePixelRatio || 1, 1.25,
      Math.sqrt(4608000 / (state.width * state.height)));
    canvas.width = Math.max(1, Math.round(state.width * state.dpr));
    canvas.height = Math.max(1, Math.round(state.height * state.dpr));
    if (context) context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (album) album.resize();
    syncLoop();
  }
  function drawLight(rect) {
    if (!settings.light || !context) return;
    const amount = settings.light / 100;
    const strength = (0.027 + Math.sin(state.time * 0.19) * 0.014) * amount;
    const x = rect.x + rect.width * 0.85;
    const y = rect.y + rect.height * 0.06;
    const radius = rect.height * 0.78;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(247,225,174,${strength})`);
    gradient.addColorStop(0.55, `rgba(234,219,178,${strength * 0.35})`);
    gradient.addColorStop(1, "rgba(234,219,178,0)");
    context.fillStyle = gradient;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  function drawDust(rect, delta) {
    if (!settings.dust || !context || !spriteContext) return;
    const count = Math.round(settings.dust * 1.2);
    const scale = Math.min(rect.width / 2560, rect.height / 1440);
    for (let i = 0; i < count; i += 1) {
      const particle = particles[i];
      particle.y -= delta * (0.003 + particle.depth * 0.004);
      particle.x += delta * particle.drift * 0.0007;
      if (particle.y < -0.025) particle.y = 1.025;
      if (particle.x < -0.025) particle.x = 1.025;
      if (particle.x > 1.025) particle.x = -0.025;
      const x = particle.x + Math.sin(state.time * 0.12 + particle.phase) * 0.007;
      const y = particle.y;
      // Keep the face and all four album prints free from overlay specks.
      const face = faceDistanceSquared(x, y) < 1;
      if (face || x > 0.76) continue;
      const size = (3.5 + particle.depth * 8) * scale;
      context.globalAlpha = particle.opacity * (0.72 + 0.28 * Math.sin(state.time * 0.5 + particle.phase));
      context.drawImage(sprite, rect.x + x * rect.width - size / 2,
        rect.y + y * rect.height - size / 2, size, size);
    }
    context.globalAlpha = 1;
  }
  function render(delta) {
    const rate = 0.2 + settings.speed * 0.012;
    const step = delta * rate;
    const ambient = ambientMoving();
    if (ambient) state.time += step;
    const petalsStep = petalsVisible() ? delta * PETAL_BASE_RATE * settings.petalsspeed / 100 : 0;
    state.petalsTime += petalsStep;
    state.frames += 1;
    const smoothing = 1 - Math.exp(-delta * 3.5);
    pointer.easedX += (pointer.x - pointer.easedX) * smoothing;
    pointer.easedY += (pointer.y - pointer.easedY) * smoothing;
    const intensity = settings.parallax / 100;
    if (ambient && intensity > 0 && !state.transitioning) {
      const extent = Math.min(state.width, state.height) * 0.006 * intensity;
      const driftX = Math.sin(state.time * 0.11) * 0.2;
      const driftY = Math.cos(state.time * 0.09) * 0.15;
      const x = (pointer.easedX + driftX) * extent;
      const y = (pointer.easedY + driftY) * extent;
      const zoom = 1 + 0.016 * intensity;
      artwork.style.transform = `translate3d(${x.toFixed(3)}px,${y.toFixed(3)}px,0) scale(${zoom.toFixed(5)})`;
    } else if (!state.transitioning) artwork.style.transform = "none";
    if (album) album.setTransform(artwork.style.transform || "none");
    if (context) {
      context.clearRect(0, 0, state.width, state.height);
      const rect = imageRect();
      context.save();
      context.beginPath();
      context.rect(rect.x, rect.y, rect.width, rect.height);
      context.clip();
      if (ambient) {
        drawLight(rect);
        drawDust(rect, step);
        if (sparkles) sparkles.draw(context, rect, step, state.time, state.reducedMotion);
      }
      drawPetals(rect, petalsStep);
      context.restore();
      if (spectrum) spectrum.draw(context, state.width, state.height, delta, state.reducedMotion,
        widgetCascade ? widgetCascade.getTransition() : null);
    }
  }
  function tick(timestamp) {
    frameHandle = 0;
    if (!canRun()) return;
    if (widgetCascade) widgetCascade.tick();
    if (!previous) previous = timestamp;
    const delta = Math.min(Math.max(0, (timestamp - previous) / 1000), 0.1);
    previous = timestamp;
    accumulator += delta;
    renderElapsed += delta;
    const interval = state.fps > 0 ? 1 / state.fps : 0;
    if (interval === 0 || accumulator + 0.000001 >= interval) {
      const intervals = interval > 0 ? Math.floor((accumulator + 0.000001) / interval) : 0;
      accumulator = interval > 0 ? Math.max(0, accumulator - intervals * interval) : 0;
      render(renderElapsed);
      renderElapsed = 0;
    }
    if (canRun()) frameHandle = requestAnimationFrame(tick);
  }
  function onPointer(event) {
    pointer.x = Math.min(1, Math.max(-1, event.clientX / state.width * 2 - 1));
    pointer.y = Math.min(1, Math.max(-1, event.clientY / state.height * 2 - 1));
  }
  function resetPointer() { pointer.x = pointer.y = 0; }
  function onReducedMotion() { state.reducedMotion = reducedMotion.matches; syncLoop(); }
  function loaded() {
    state.ready = true;
    state.error = context ? null : "Canvas unavailable; displaying the static wallpaper.";
    errorLabel.hidden = true;
    syncLoop();
  }
  function failed() {
    state.ready = false;
    state.error = "Wallpaper image could not be loaded.";
    errorLabel.hidden = false;
    syncLoop();
  }
  artwork.addEventListener("load", loaded);
  artwork.addEventListener("error", failed);
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointermove", onPointer, { passive: true });
  document.addEventListener("mouseleave", resetPointer, { passive: true });
  document.addEventListener("visibilitychange", syncLoop);
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", onReducedMotion);
  else reducedMotion.addListener(onReducedMotion);
  window.addEventListener("pagehide", () => {
    disposed = true;
    artwork.removeEventListener("load", loaded);
    artwork.removeEventListener("error", failed);
    cancelAnimationFrame(frameHandle);
    if (countdown) countdown.destroy();
    if (spectrum) spectrum.destroy();
    if (sparkles) sparkles.destroy();
    if (widgetCascade) widgetCascade.destroy();
    if (album) album.destroy();
  }, { once: true });
  window.flowerWallpaper = Object.freeze({
    getState: () => ({
      ...state, settings: { ...settings }, running: Boolean(frameHandle),
      imageWidth: artwork.naturalWidth, imageHeight: artwork.naturalHeight,
      canvasWidth: canvas.width, canvasHeight: canvas.height,
      transform: artwork.style.transform,
      petalsReady: petalAtlas.naturalWidth > 0,
      countdown: countdown ? countdown.getState() : null,
      spectrum: spectrum ? spectrum.getState() : null,
      sparkles: sparkles ? sparkles.getState() : null,
      album: album ? album.getState() : null,
      widgets: widgetCascade ? widgetCascade.getState() : null,
      widgetTransition: widgetCascade ? widgetCascade.getTransition() : null,
      pointer: { ...pointer }
    })
  });
  if (!context) state.error = "Canvas unavailable; displaying the static wallpaper.";
  state.reducedMotion = reducedMotion.matches;
  petalAtlas.addEventListener("load", syncLoop, { once: true });
  petalAtlas.src = "assets/petals-atlas.png";
  resize();
  if (artwork.complete) {
    if (artwork.naturalWidth > 0) loaded();
    else failed();
  }
})();
