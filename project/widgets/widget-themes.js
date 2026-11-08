(() => {
  "use strict";
  const root = window;
  const BODY = '"Microsoft YaHei", "PingFang SC", sans-serif';
  const NUMBERS = 'Georgia, "Times New Roman", serif';
  const COMIC = '"Flower Manga Comic", "Microsoft YaHei", "PingFang SC", sans-serif';
  const MODERN = '"Bahnschrift", "Segoe UI", "Microsoft YaHei", sans-serif';
  const FONT_SPEC = '40px "Flower Manga Comic"';
  const FONT_PROBE = "更新 04 天";
  const FONT_TIMEOUT_MS = 5000;
  let inFlight = null;
  let loadedResult = null;

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }
  function theme(id, colors, shadow, fontBody, fontNumbers, active, idle) {
    return deepFreeze({ id,
      countdown: { event: colors[0], days: colors[1], unit: colors[2], clock: colors[3],
        status: colors[4], shadow, fontBody, fontNumbers },
      spectrum: { active, idle }
    });
  }
  const forest = theme("forest", Array(5).fill("#f1e7d3"),
    "0 1px 12px rgba(16, 23, 13, 0.34)", BODY, NUMBERS,
    [240, 231, 205, 0.82], [240, 231, 205, 0.30]);
  const manga = theme("manga", ["#cbd5ff", "#e7e9ff", "#c3ccf5", "#d7dfff", "#b4c2eb"],
    "0 1px 12px rgba(15, 20, 43, 0.42)", COMIC, COMIC,
    [211, 222, 255, 0.88], [173, 190, 241, 0.36]);
  const metro = theme("metro", ["#2b4b59", "#203845", "#385865", "#2a4b5b", "#365866"],
    "none", BODY, MODERN, [39, 77, 92, 0.90], [39, 77, 92, 0.40]);
  const metroTop = theme("metro", ["#d8e6ee", "#edf3f7", "#d8e6ee", "#edf3f7", "#d8e6ee"],
    "0 1px 12px rgba(11, 24, 32, 0.55)", BODY, MODERN,
    [39, 77, 92, 0.90], [39, 77, 92, 0.40]);

  function get(id, position = "leftmiddle") {
    if (id === "manga") return manga;
    if (id === "metro") return position === "lefttop" ? metroTop : metro;
    return forest;
  }
  function apply(element, id, position) {
    const resolvedPosition = position === undefined && element && element.dataset
      ? element.dataset.countdownPosition : position;
    const result = get(id, resolvedPosition);
    if (!element || !element.style || typeof element.style.setProperty !== "function") return result;
    if (element.dataset) element.dataset.widgetTheme = result.id;
    else if (typeof element.setAttribute === "function") element.setAttribute("data-widget-theme", result.id);
    const values = result.countdown;
    for (const key of ["event", "days", "unit", "clock", "status", "shadow"]) {
      element.style.setProperty("--widget-" + key, values[key]);
    }
    element.style.setProperty("--widget-font-body", values.fontBody);
    element.style.setProperty("--widget-font-numbers", values.fontNumbers);
    return result;
  }
  function preparation(status, error) {
    return deepFreeze({ id: "manga", status, loaded: status === "loaded", error: error || null });
  }
  function reportFailure(result) {
    try {
      if (root.console && typeof root.console.warn === "function") {
        root.console.warn("[FlowerWidgetThemes] Local manga font " + result.status + ": " + result.error);
      }
    } catch (_) { /* A diagnostic logger must never block the font preparation barrier. */ }
  }
  function prepare(id) {
    const selected = get(id).id;
    if (selected !== "manga") {
      return Promise.resolve(deepFreeze({ id: selected, status: "not-required", loaded: false, error: null }));
    }
    if (loadedResult) return Promise.resolve(loadedResult);
    if (inFlight) return inFlight;
    const fonts = root.document && root.document.fonts;
    if (!fonts || typeof fonts.load !== "function") {
      const result = preparation("unavailable", "FontFaceSet.load is unavailable; local font loading was not confirmed.");
      reportFailure(result);
      return Promise.resolve(result);
    }
    inFlight = new Promise(resolve => {
      let finished = false;
      let timeout = 0;
      function finish(result) {
        if (finished) return;
        finished = true;
        if (timeout) root.clearTimeout(timeout);
        if (result.loaded) loadedResult = result;
        else reportFailure(result);
        inFlight = null;
        resolve(result);
      }
      timeout = root.setTimeout(() => {
        finish(preparation("timeout", "Local font loading was not confirmed within " + FONT_TIMEOUT_MS + "ms."));
      }, FONT_TIMEOUT_MS);
      Promise.resolve().then(() => fonts.load(FONT_SPEC, FONT_PROBE)).then(faces => {
        const matches = Array.from(faces || []);
        const confirmed = matches.length > 0 && matches.every(face =>
          face && face.status === "loaded" && typeof face.family === "string" &&
          face.family.replace(/^["']|["']$/g, "") === "Flower Manga Comic");
        const checked = typeof fonts.check !== "function" || fonts.check(FONT_SPEC, FONT_PROBE);
        finish(confirmed && checked ? preparation("loaded")
          : preparation("failed", "FontFaceSet did not confirm the requested local Flower Manga Comic face."));
      }, error => {
        finish(preparation("failed", error && error.message ? error.message : String(error)));
      }).catch(error => {
        finish(preparation("failed", error && error.message ? error.message : String(error)));
      });
    });
    return inFlight;
  }

  root.FlowerWidgetThemes = Object.freeze({ get, apply, prepare });
})();