(() => {
  "use strict";
  const IDS = new Set(["forest", "manga", "metro"]);
  const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const numberPattern = "([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?)";
  const circlePattern = new RegExp("^circle\\(\\s*" + numberPattern + "(px|%)?\\s+at\\s+" + numberPattern + "(px|%)?\\s+" + numberPattern + "(px|%)?\\s*\\)$", "i");

  function create(options) {
    const element = options && options.element;
    const transitionLayer = options && options.transitionLayer;
    if (!element || !element.ownerDocument || !element.parentNode || !transitionLayer) throw new TypeError("Widget cascade requires mounted countdown and transition elements.");
    const document = element.ownerDocument;
    const parent = element.parentNode;
    const marker = document.createComment("countdown-cascade-position");
    const oldViewport = document.createElement("div");
    const nextViewport = document.createElement("div");
    oldViewport.className = "flower-widget-viewport flower-widget-viewport-old";
    nextViewport.className = "flower-widget-viewport flower-widget-viewport-next";
    nextViewport.setAttribute("aria-hidden", "true");
    nextViewport.hidden = true;
    parent.insertBefore(marker, element);
    parent.insertBefore(oldViewport, element);
    parent.insertBefore(nextViewport, element);
    oldViewport.appendChild(element);
    const readStyle = typeof options.readStyle === "function" ? options.readStyle : target =>
      typeof window.getComputedStyle === "function" ? window.getComputedStyle(target) : target.style;
    let current = IDS.has(element.dataset.widgetTheme) ? element.dataset.widgetTheme : "forest";
    let active = null;
    let snapshot = null;
    let clone = null;
    let disposed = false;
    let propertyPosition = "leftmiddle";
    let styleReads = 0;
    let mirrorCount = 0;
    let prepared = null;
    let error = null;
    const themes = () => window.FlowerWidgetThemes;
    const validId = id => IDS.has(id) ? id : "forest";
    const position = () => element.dataset.countdownPosition || propertyPosition;
    function applyTheme(target, id) {
      const api = themes();
      if (api && typeof api.apply === "function") api.apply(target, validId(id), position());
      else target.dataset.widgetTheme = validId(id);
    }
    function resetMasks() {
      oldViewport.style.maskImage = oldViewport.style.webkitMaskImage = "none";
      oldViewport.style.clipPath = "none";
      oldViewport.style.opacity = "1";
      nextViewport.style.clipPath = "none";
      nextViewport.style.opacity = "1";
      nextViewport.style.maskImage = nextViewport.style.webkitMaskImage = "none";
    }
    function sanitize(root) {
      for (const node of [root, ...root.querySelectorAll("*")]) {
        node.removeAttribute("id");
        for (const attribute of ["aria-live", "aria-labelledby", "aria-describedby", "aria-controls", "for", "autofocus"]) node.removeAttribute(attribute);
        if (node.hasAttribute("role")) node.removeAttribute("role");
        if (node.hasAttribute("tabindex") || /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(node.tagName)) node.setAttribute("tabindex", "-1");
      }
      root.setAttribute("aria-hidden", "true");
      root.setAttribute("aria-live", "off");
      root.setAttribute("inert", "");
    }
    function mirror() {
      if (disposed || !active) return;
      const replacement = element.cloneNode(true);
      sanitize(replacement);
      applyTheme(replacement, active.to);
      nextViewport.replaceChildren(replacement);
      clone = replacement;
      mirrorCount += 1;
    }
    const Observer = window.MutationObserver || (typeof MutationObserver !== "undefined" ? MutationObserver : null);
    const observer = Observer ? new Observer(mirror) : null;
    if (observer) observer.observe(element, { subtree: true, childList: true, characterData: true, attributes: true });
    async function prepare(id) {
      if (disposed) return null;
      const target = validId(id);
      try {
        const api = themes();
        const result = api && typeof api.prepare === "function" ? await api.prepare(target) : { id: target, status: "unavailable", loaded: false, error: "Widget theme loader is unavailable." };
        if (!disposed) prepared = result;
        return result;
      } catch (failure) {
        error = failure && failure.message ? failure.message : String(failure);
        throw failure;
      }
    }
    function dimensions() {
      return { width: Math.max(1, Number(window.innerWidth) || 1), height: Math.max(1, Number(window.innerHeight) || 1) };
    }
    function parseCircle(value, width, height) {
      const match = typeof value === "string" ? value.match(circlePattern) : null;
      if (!match) return null;
      const radius = Number(match[1]) * (match[2] === "%" ? Math.hypot(width, height) / Math.SQRT2 / 100 : 1);
      const x = Number(match[3]) * (match[4] === "%" ? width / 100 : 1);
      const y = Number(match[5]) * (match[6] === "%" ? height / 100 : 1);
      return [radius, x, y].every(Number.isFinite) && radius >= 0 ? { x, y, radius, width, height } : null;
    }
    function tick() {
      if (disposed || !active) return null;
      const clipElement = active.clipElement || transitionLayer;
      let style;
      try { styleReads += 1; style = readStyle(clipElement) || clipElement.style; }
      catch (_) { style = clipElement.style; }
      const { width, height } = dimensions();
      if (active.mode === "fade") {
        const opacity = Number.parseFloat(style.opacity);
        const progress = clamp(Number.isFinite(opacity) ? opacity : 0);
        oldViewport.style.opacity = String(1 - progress);
        nextViewport.style.opacity = String(progress);
        snapshot = Object.freeze({ from: active.from, to: active.to, direction: active.direction, mode: "fade", progress, circle: null });
      } else {
        const clipPath = style.clipPath || style.webkitClipPath || "none";
        const inward = active.direction === "in";
        const parsed = inward && clipElement.hidden ? null : parseCircle(clipPath, width, height);
        const circle = parsed || { x: active.origin.x, y: active.origin.y, radius: inward ? 0 : clipPath === "none" && !transitionLayer.hidden ? active.origin.radius : 0, width, height };
        const exactClip = parsed ? clipPath : `circle(${circle.radius}px at ${circle.x}px ${circle.y}px)`;
        const inverse = `radial-gradient(circle at ${circle.x}px ${circle.y}px, transparent 0px, transparent ${circle.radius}px, #000 ${circle.radius}px)`;
        oldViewport.style.clipPath = inward ? exactClip : "none";
        oldViewport.style.maskImage = oldViewport.style.webkitMaskImage = inward ? "none" : inverse;
        nextViewport.style.clipPath = inward ? "none" : exactClip;
        nextViewport.style.maskImage = nextViewport.style.webkitMaskImage = inward ? inverse : "none";
        oldViewport.style.opacity = nextViewport.style.opacity = "1";
        const progress = inward ? clamp((active.origin.radius - circle.radius) / Math.max(1, active.origin.radius - active.endRadius)) : clamp(circle.radius / active.origin.radius);
        snapshot = Object.freeze({ from: active.from, to: active.to, direction: active.direction, mode: "circle", progress, circle: Object.freeze(circle) });
      }
      return snapshot;
    }
    function begin(detail) {
      if (disposed || !detail) return false;
      const supplied = detail.origin || {};
      if (![supplied.x, supplied.y, supplied.radius].every(Number.isFinite) || supplied.radius <= 0) return false;
      if (active) commit(active.to);
      current = validId(detail.from);
      applyTheme(element, current);
      resetMasks();
      active = { from: current, to: validId(detail.to), mode: detail.reducedMotion ? "fade" : "circle", direction: detail.direction === "in" ? "in" : "out", endRadius: Math.max(0, Number(detail.endRadius) || 0), clipElement: detail.clipElement || transitionLayer, origin: { x: supplied.x, y: supplied.y, radius: supplied.radius }, duration: detail.duration, easing: detail.easing, animation: detail.animation || null };
      mirror();
      nextViewport.hidden = false;
      tick();
      return true;
    }
    function getTransition() { return snapshot; }
    function commit(id) {
      if (disposed) return;
      current = validId(id);
      active = null;
      snapshot = null;
      clone = null;
      nextViewport.replaceChildren();
      nextViewport.hidden = true;
      resetMasks();
      applyTheme(element, current);
    }
    function applyProperties(properties) {
      if (disposed || !properties) return;
      const item = properties.countdownposition;
      const candidate = item && typeof item === "object" ? item.value : item;
      if (["leftmiddle", "lefttop", "leftbottom"].includes(candidate)) propertyPosition = candidate;
      applyTheme(element, active ? active.from : current);
      mirror();
    }
    function getState() {
      return { active: Boolean(active), current, from: active ? active.from : null, to: active ? active.to : null,
        mode: active ? active.mode : null, direction: active ? active.direction : null, hasClone: Boolean(clone), progress: snapshot ? snapshot.progress : 0,
        styleReads, mirrorCount, prepared, error, disposed };
    }
    function destroy() {
      if (disposed) return;
      if (observer) observer.disconnect();
      commit(active ? active.to : current);
      if (marker.parentNode) {
        marker.parentNode.insertBefore(element, marker);
        marker.remove();
      }
      oldViewport.remove();
      nextViewport.remove();
      disposed = true;
    }
    return Object.freeze({ prepare, begin, tick, getTransition, commit, applyProperties, destroy, getState });
  }
  window.FlowerWidgetCascade = Object.freeze({ create });
})();
