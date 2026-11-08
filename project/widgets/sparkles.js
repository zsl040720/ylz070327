(() => {
  "use strict";
  const root = window;
  const COLOR = "rgb(240,230,202)";

  function clamp(value, minimum, maximum, fallback) {
    if (value === null || typeof value === "boolean" || Array.isArray(value)) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }
  function smoothstep(start, end, value) {
    const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
    return t * t * (3 - 2 * t);
  }
  function protectionOpacity(x, y) {
    const edge = Math.min(x, y, 1 - x, 1 - y);
    if (edge <= 0 || x >= 0.76) return 0;
    const face = ((x - 0.65) / 0.155) ** 2 + ((y - 0.47) / 0.32) ** 2;
    if (face <= 1) return 0;
    // This union protects all three countdown placements and the left spectrum.
    const dx = Math.max(0.105 - x, 0, x - 0.495);
    const dy = Math.max(0.145 - y, 0, y - 0.95);
    if (dx === 0 && dy === 0) return 0;
    const widgetDistance = Math.sqrt(dx * dx + dy * dy);
    return smoothstep(0, 0.02, edge) *
      (1 - smoothstep(0.72, 0.76, x)) *
      smoothstep(1, 1.35, face) * smoothstep(0, 0.02, widgetDistance);
  }

  function create() {
    const settings = { sparklesenabled: true, sparklesamount: 12 };
    const points = [];
    let seed = 431960;
    let disposed = false;
    let lastTime = 0;
    let visibleCount = 0;
    let maxOpacity = 0;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    for (let i = 0; i < 40; i += 1) {
      let x = 0.05;
      let y = 0.08;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        x = 0.02 + random() * 0.73;
        y = 0.025 + random() * 0.94;
        if (protectionOpacity(x, y) > 0.9) break;
      }
      points.push({ x, y, phase: random() * Math.PI * 2,
        phase2: random() * Math.PI * 2, radius: 0.75 + random() * 0.75,
        opacity: 0.12 + random() * 0.18, star: i % 13 === 0 });
    }
    function hasActivity() {
      return !disposed && settings.sparklesenabled && settings.sparklesamount > 0;
    }
    function applyProperties(properties) {
      if (disposed || !properties || typeof properties !== "object") return;
      if (properties.sparklesenabled) {
        const value = properties.sparklesenabled.value;
        settings.sparklesenabled = value === true || value === 1;
      }
      if (properties.sparklesamount) {
        settings.sparklesamount = Math.round(clamp(properties.sparklesamount.value, 0, 40, settings.sparklesamount));
      }
    }
    function draw(context, rect, delta, time, reducedMotion) {
      visibleCount = 0;
      maxOpacity = 0;
      if (!hasActivity() || reducedMotion || !context || !rect) return;
      if (!["save", "restore", "beginPath", "arc", "fill", "moveTo", "lineTo", "stroke"].every(method => typeof context[method] === "function")) return;
      if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return;
      const step = clamp(delta, 0, 0.25, 0);
      lastTime = Number.isFinite(time) ? Math.max(0, time) : lastTime + step;
      const scale = Math.min(4, Math.max(0.05, Math.min(rect.width / 2560, rect.height / 1440)));
      context.save();
      try {
        context.fillStyle = COLOR;
        context.strokeStyle = COLOR;
        context.lineWidth = Math.max(0.35, 0.55 * scale);
        for (let i = 0; i < settings.sparklesamount; i += 1) {
          const point = points[i];
          const x = point.x + Math.sin(lastTime * 0.035 + point.phase) * 0.008 + Math.sin(lastTime * 0.011 + point.phase2) * 0.002;
          const y = point.y + Math.cos(lastTime * 0.027 + point.phase2) * 0.005;
          const mask = protectionOpacity(x, y);
          if (mask <= 0.0001) continue;
          const breath = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(lastTime * 0.36 + point.phase));
          const opacity = point.opacity * breath * mask;
          const px = rect.x + x * rect.width;
          const py = rect.y + y * rect.height;
          const radius = point.radius * scale;
          if (![px, py, radius, opacity].every(Number.isFinite)) continue;
          visibleCount += 1;
          maxOpacity = Math.max(maxOpacity, opacity);
          context.globalAlpha = opacity;
          context.beginPath();
          context.arc(px, py, radius, 0, Math.PI * 2);
          context.fill();
          if (point.star) {
            const rayOpacity = opacity * smoothstep(0.4, 0.95, breath) * 0.65;
            if (rayOpacity <= 0.0001) continue;
            const ray = (2.8 + point.radius) * scale;
            context.globalAlpha = rayOpacity;
            context.beginPath();
            context.moveTo(px - ray, py);
            context.lineTo(px + ray, py);
            context.moveTo(px, py - ray);
            context.lineTo(px, py + ray);
            context.stroke();
          }
        }
      } finally { context.restore(); }
    }
    function getState() {
      return { settings: { ...settings }, active: hasActivity(), allocated: points.length,
        visibleCount, maxOpacity, lastTime, disposed };
    }
    function destroy() { disposed = true; visibleCount = 0; maxOpacity = 0; }
    return Object.freeze({ applyProperties, hasActivity, draw, getState, destroy });
  }
  root.FlowerSparkles = Object.freeze({ create });
})();
