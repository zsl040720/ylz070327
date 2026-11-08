/* Wallpaper Engine sends 64 frequency bins per channel; no microphone or network is used. */
(() => {
  "use strict";
  const root = window;
  const EPSILON = 0.0015;
  const STALE_SECONDS = 1.2;
  const THEME_IDS = ["forest", "manga", "metro"];
  const FALLBACK_PALETTES = {
    forest: { active: [240, 231, 205, 0.82], idle: [240, 231, 205, 0.30] },
    manga: { active: [211, 222, 255, 0.88], idle: [173, 190, 241, 0.36] },
    metro: { active: [39, 77, 92, 0.90], idle: [39, 77, 92, 0.40] }
  };

  function themeName(id) { return THEME_IDS.includes(id) ? id : "forest"; }
  function validColor(value) {
    return Array.isArray(value) && value.length === 4 && value.every((channel, index) =>
      typeof channel === "number" && Number.isFinite(channel) && channel >= 0 && channel <= (index === 3 ? 1 : 255));
  }
  function palette(id) {
    try {
      const module = root.FlowerWidgetThemes;
      const value = module && typeof module.get === "function" ? module.get(id).spectrum : null;
      if (value && validColor(value.active) && validColor(value.idle)) {
        return { active: value.active.slice(), idle: value.idle.slice() };
      }
    } catch (_) {}
    return FALLBACK_PALETTES[themeName(id)];
  }
  function rgba(color) {
    const alpha = color[3];
    const text = alpha === Math.round(alpha * 100) / 100 ? alpha.toFixed(2) : String(alpha);
    return `rgba(${color[0]},${color[1]},${color[2]},${text})`;
  }
  function mixPalette(from, to, progress) {
    const mix = key => from[key].map((value, index) => value + (to[key][index] - value) * progress);
    return { active: mix("active"), idle: mix("idle") };
  }
  function transitionSnapshot(value, width, height) {
    try {
      if (!value || typeof value !== "object" || Array.isArray(value) ||
          !THEME_IDS.includes(value.from) || !THEME_IDS.includes(value.to) ||
          !["circle", "fade"].includes(value.mode) || typeof value.progress !== "number" ||
          !Number.isFinite(value.progress) || value.progress < 0 || value.progress > 1) return null;
      const result = { from: value.from, to: value.to, mode: value.mode, progress: value.progress };
      if (value.mode === "circle") {
        result.direction = value.direction === undefined ? "out" : value.direction;
        if (result.direction !== "out" && result.direction !== "in") return null;
        const circle = value.circle;
        if (!circle || ["x", "y", "radius", "width", "height"].some(key => typeof circle[key] !== "number" || !Number.isFinite(circle[key])) ||
            circle.radius < 0 || circle.width <= 0 || circle.height <= 0 ||
            Math.abs(circle.width - width) > 0.001 || Math.abs(circle.height - height) > 0.001 ||
            circle.x < 0 || circle.x > width || circle.y < 0 || circle.y > height) return null;
        result.circle = Object.freeze({ x: circle.x, y: circle.y, radius: circle.radius, width: circle.width, height: circle.height });
      }
      return Object.freeze(result);
    } catch (_) { return null; }
  }

  function bounded(value, minimum, maximum, fallback) {
    if (value === null || typeof value === "boolean" || Array.isArray(value)) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }
  function sample(value) {
    return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  }
  function clock() {
    return root.performance && typeof root.performance.now === "function"
      ? root.performance.now() / 1000 : Date.now() / 1000;
  }

  function create(options = {}) {
    const settings = {
      spectrumenabled: true, spectrumgain: 160, spectrumbars: 96,
      spectrumheight: 8, spectrumwidth: 36, spectrumposition: "left"
    };
    const bins = new Float32Array(64);
    let targets = new Float32Array(settings.spectrumbars);
    let levels = new Float32Array(settings.spectrumbars);
    let available = false;
    let disposed = false;
    let lastInput = -Infinity;
    let targetEnergy = 0;
    let smoothEnergy = 0;
    let lastLayout = null;
    let error = null;
    let themeId = "forest";
    let lastPaint = null;
    let paintSequence = 0;

    function clearLevels() {
      targets.fill(0);
      levels.fill(0);
      targetEnergy = smoothEnergy = 0;
    }
    function forgetStaleInput() {
      if (clock() - lastInput > STALE_SECONDS) {
        bins.fill(0);
        targets.fill(0);
        targetEnergy = 0;
      }
    }
    function rebuildTargets() {
      forgetStaleInput();
      if (!settings.spectrumenabled || settings.spectrumgain === 0) {
        clearLevels();
        return;
      }
      targetEnergy = 0;
      const gain = settings.spectrumgain / 100;
      for (let i = 0; i < targets.length; i += 1) {
        const position = i / Math.max(1, targets.length - 1) * 63;
        const lower = Math.floor(position);
        const upper = Math.min(63, lower + 1);
        const fraction = position - lower;
        const input = bins[lower] * (1 - fraction) + bins[upper] * fraction;
        const value = Math.pow(Math.min(1, input * gain), 0.72);
        targets[i] = value < EPSILON ? 0 : value;
        targetEnergy = Math.max(targetEnergy, targets[i]);
      }
    }
    function hasActivity() {
      if (disposed || !available || !settings.spectrumenabled || settings.spectrumgain === 0) return false;
      forgetStaleInput();
      return targetEnergy > EPSILON || smoothEnergy > EPSILON;
    }
    function wake() {
      if (hasActivity() && typeof options.onWake === "function") {
        try { options.onWake(); }
        catch (exception) { error = "The wallpaper animation could not be awakened: " + exception.message; }
      }
    }
    function audioListener(audioArray) {
      if (disposed) return;
      const valid = audioArray && typeof audioArray.length === "number" && audioArray.length >= 128;
      for (let i = 0; i < 64; i += 1) {
        bins[i] = valid ? (sample(audioArray[i]) + sample(audioArray[i + 64])) * 0.5 : 0;
      }
      lastInput = clock();
      rebuildTargets();
      wake();
    }
    function applyProperties(properties) {
      if (disposed || !properties || typeof properties !== "object") return;
      if (properties.spectrumenabled) {
        const value = properties.spectrumenabled.value;
        settings.spectrumenabled = value === true || value === 1;
      }
      if (properties.spectrumgain) settings.spectrumgain = bounded(properties.spectrumgain.value, 0, 400, settings.spectrumgain);
      if (properties.spectrumbars) {
        const count = Math.round(bounded(properties.spectrumbars.value, 16, 128, settings.spectrumbars));
        if (count !== settings.spectrumbars) {
          settings.spectrumbars = count;
          targets = new Float32Array(count);
          levels = new Float32Array(count);
          smoothEnergy = 0;
        }
      }
      if (properties.spectrumheight) settings.spectrumheight = bounded(properties.spectrumheight.value, 3, 18, settings.spectrumheight);
      if (properties.spectrumwidth) settings.spectrumwidth = bounded(properties.spectrumwidth.value, 20, 90, settings.spectrumwidth);
      if (properties.spectrumposition) {
        const value = properties.spectrumposition.value;
        if (value === "left" || value === "bottom") settings.spectrumposition = value;
      }
      rebuildTargets();
      wake();
    }
    function layout(width, height) {
      const bottom = settings.spectrumposition === "bottom";
      const span = width * (bottom ? 0.9 : settings.spectrumwidth / 100);
      return {
        x: bottom ? width * 0.05 : Math.min(width * 0.12, width * 0.97 - span),
        baseline: height * (bottom ? 0.97 : 0.93),
        width: span,
        height: height * settings.spectrumheight / 100,
        count: settings.spectrumbars,
        pitch: span / settings.spectrumbars
      };
    }
    function draw(context, width, height, delta, reducedMotion, transition) {
      if (disposed || !settings.spectrumenabled || !context || typeof context.fillRect !== "function") return;
      if (typeof context.save !== "function" || typeof context.restore !== "function") return;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      forgetStaleInput();
      const rect = layout(width, height);
      lastLayout = { x: rect.x, baseline: rect.baseline, width: rect.width, height: rect.height, count: rect.count };
      const step = bounded(delta, 0, 0.25, 0);
      const baselineHeight = Math.max(0.6, height / 1440 * 0.75);
      const barWidth = Math.max(0.25, Math.min(rect.pitch * 0.48, width / 2560 * 6));
      const animated = available && !reducedMotion && settings.spectrumgain > 0;
      smoothEnergy = 0;
      for (let i = 0; i < rect.count; i += 1) {
        if (animated) {
          const target = targets[i];
          const tau = target > levels[i] ? 0.035 : 0.22;
          levels[i] += (target - levels[i]) * (1 - Math.exp(-step / tau));
          if (levels[i] < EPSILON && target < EPSILON) levels[i] = 0;
        } else levels[i] = 0;
        smoothEnergy = Math.max(smoothEnergy, levels[i]);
      }
      // Advance the envelope above exactly once; both clipped paints read the same levels.
      function paint(colors) {
        const activeInk = rgba(colors.active);
        const idleInk = rgba(colors.idle);
        for (let i = 0; i < rect.count; i += 1) {
          const barHeight = Math.max(baselineHeight, Math.min(rect.height, levels[i] * rect.height));
          context.fillStyle = levels[i] > EPSILON ? activeInk : idleInk;
          context.fillRect(rect.x + i * rect.pitch + (rect.pitch - barWidth) / 2,
            rect.baseline - barHeight, barWidth, barHeight);
        }
      }
      let snapshot = transitionSnapshot(transition, width, height);
      let fallback = transition != null && !snapshot ? "invalid-transition" : null;
      const canClip = ["beginPath", "rect", "moveTo", "arc", "clip"].every(key => typeof context[key] === "function");
      if (snapshot && snapshot.mode === "circle" && !canClip) {
        snapshot = null;
        fallback = "clip-unavailable";
      }
      context.save();
      context.globalAlpha = 1;
      let passes = 1;
      if (snapshot && snapshot.mode === "circle") {
        const circle = snapshot.circle;
        const outsideTheme = snapshot.direction === "in" ? snapshot.to : snapshot.from;
        const insideTheme = snapshot.direction === "in" ? snapshot.from : snapshot.to;
        context.save();
        context.beginPath();
        context.rect(0, 0, width, height);
        context.moveTo(circle.x + circle.radius, circle.y);
        context.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
        context.clip("evenodd");
        paint(palette(outsideTheme));
        context.restore();
        context.save();
        context.beginPath();
        context.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
        context.clip();
        paint(palette(insideTheme));
        context.restore();
        passes = 2;
      } else if (snapshot) {
        paint(mixPalette(palette(snapshot.from), palette(snapshot.to), snapshot.progress));
      } else paint(palette(themeId));
      context.restore();
      lastPaint = Object.freeze({ sequence: ++paintSequence, theme: themeId,
        mode: snapshot ? snapshot.mode : "single", passes, advanced: 1,
        transition: snapshot, fallback });
    }
    function getState() {
      const active = hasActivity();
      return {
        available, disposed, active, error, theme: themeId, lastPaint,
        targetEnergy, energy: smoothEnergy,
        settings: { ...settings }, layout: lastLayout ? { ...lastLayout } : null
      };
    }
    function destroy() {
      if (disposed) return;
      disposed = true;
      bins.fill(0);
      clearLevels();
    }

    if (typeof root.wallpaperRegisterAudioListener === "function") {
      available = true;
      try { root.wallpaperRegisterAudioListener(audioListener); }
      catch (exception) {
        available = false;
        error = "System audio listener is unavailable: " + exception.message;
      }
    }
    function setTheme(id) { if (!disposed) themeId = themeName(id); }
    return Object.freeze({ applyProperties, hasActivity, draw, getState, destroy, setTheme });
  }

  root.FlowerSpectrum = Object.freeze({ create });
})();
