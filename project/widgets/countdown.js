(function (window) {
  "use strict";
  const DEFAULTS = Object.freeze({
    countdownenabled: true,
    eventname: "辅助更新",
    targetdate: "2026-11-05T12:00:00",
    repeatenabled: true,
    repeatdays: 7,
    countdownposition: "leftmiddle"
  });
  const POSITIONS = new Set(["leftmiddle", "lefttop", "leftbottom"]);
  const ABSENT = Symbol("absent");

  function property(properties, key) {
    if (!properties || !Object.prototype.hasOwnProperty.call(properties, key)) return ABSENT;
    const candidate = properties[key];
    return candidate && typeof candidate === "object" &&
      Object.prototype.hasOwnProperty.call(candidate, "value") ? candidate.value : candidate;
  }
  function enabled(value) { return value === true || value === 1 || value === "true" || value === "1"; }
  function pad(value) { return String(value).padStart(2, "0"); }
  function shortened(value, length) {
    const characters = Array.from(value);
    return characters.length > length ? characters.slice(0, length - 1).join("") + "…" : value;
  }

  function create(options) {
    const element = options && options.element;
    if (!element || typeof element.replaceChildren !== "function" || !element.ownerDocument) {
      throw new TypeError("倒数日需要一个有效的 element 容器。");
    }
    const document = element.ownerDocument;
    const settings = { ...DEFAULTS };
    let paused = false;
    let destroyed = false;
    let timer = null;
    let result = null;
    let error = null;

    function node(tag, className) {
      const created = document.createElement(tag);
      created.className = className;
      return created;
    }
    const name = node("div", "flower-countdown__event");
    const figure = node("div", "flower-countdown__figure");
    const days = node("span", "flower-countdown__days");
    const unit = node("span", "flower-countdown__unit");
    unit.textContent = "天";
    figure.append(days, unit);
    const clock = node("div", "flower-countdown__clock");
    const status = node("div", "flower-countdown__status");
    const message = node("div", "flower-countdown__error");
    message.setAttribute("role", "status");
    element.classList.add("flower-countdown");
    element.setAttribute("role", "group");
    element.replaceChildren(name, figure, clock, status, message);

    function stopTimer() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    }
    function canRun() {
      return !destroyed && settings.countdownenabled && !paused && !document.hidden;
    }
    function render() {
      element.hidden = !settings.countdownenabled;
      element.dataset.countdownPosition = settings.countdownposition;
      const fullName = settings.eventname.trim() || "未命名事件";
      name.textContent = shortened(fullName, 20);
      name.title = fullName;
      element.setAttribute("aria-label", fullName + "倒数日");
      try {
        if (!window.FlowerCountdownCore) throw new Error("倒数日核心未加载，请检查本地文件。");
        result = window.FlowerCountdownCore.calculateCountdown({
          targetDate: settings.targetdate,
          repeatEnabled: settings.repeatenabled,
          repeatDays: settings.repeatdays
        }, Date.now());
        error = null;
        days.textContent = pad(result.days);
        clock.textContent = pad(result.hours) + " : " + pad(result.minutes) + " : " + pad(result.seconds);
        status.textContent = result.expired ? "已到期" :
          settings.repeatenabled ? "每 " + result.repeatDays + " 天循环" : "单次倒数";
        const next = new Date(result.targetTimestamp);
        status.title = "目标：" + next.getFullYear() + "-" + pad(next.getMonth() + 1) + "-" +
          pad(next.getDate()) + " " + pad(next.getHours()) + ":" + pad(next.getMinutes()) + ":" + pad(next.getSeconds());
      } catch (failure) {
        result = null;
        error = failure && failure.message ? failure.message : "倒数日设置无效。";
        message.textContent = "倒数日设置有误：" + error;
        message.title = message.textContent;
      }
      figure.hidden = clock.hidden = status.hidden = Boolean(error);
      message.hidden = !error;
      element.dataset.countdownValid = error ? "false" : "true";
    }
    function refresh() {
      stopTimer();
      if (destroyed) return;
      render();
      if (canRun() && !error) {
        // Align to the real clock, not the duration of the previous callback.
        const delay = Math.max(50, 1015 - (Date.now() % 1000));
        timer = window.setTimeout(() => { timer = null; refresh(); }, delay);
      }
    }
    function onVisibilityChange() {
      if (document.hidden) stopTimer();
      else refresh();
    }
    function applyProperties(properties) {
      if (destroyed) return;
      for (const key of ["countdownenabled", "repeatenabled"]) {
        const value = property(properties, key);
        if (value !== ABSENT) settings[key] = enabled(value);
      }
      for (const key of ["eventname", "targetdate"]) {
        const value = property(properties, key);
        if (value !== ABSENT) settings[key] = value === null || value === undefined ? "" : String(value);
      }
      const interval = property(properties, "repeatdays");
      if (interval !== ABSENT) settings.repeatdays = interval;
      const position = property(properties, "countdownposition");
      if (position !== ABSENT) settings.countdownposition = POSITIONS.has(position) ? position : "leftmiddle";
      refresh();
    }
    function setPaused(value) {
      if (destroyed) return;
      paused = Boolean(value);
      if (paused) stopTimer();
      else refresh();
    }
    function getState() {
      return {
        settings: { ...settings }, paused, destroyed, running: timer !== null,
        hidden: !settings.countdownenabled || Boolean(document.hidden),
        error, countdown: result ? { ...result } : null
      };
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      element.replaceChildren();
      element.classList.remove("flower-countdown");
      element.removeAttribute("data-countdown-position");
      element.removeAttribute("data-countdown-valid");
      element.removeAttribute("aria-label");
      element.removeAttribute("role");
      element.hidden = true;
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    refresh();
    return Object.freeze({ applyProperties, setPaused, getState, destroy });
  }

  window.FlowerCountdown = Object.freeze({ create });
})(window);
