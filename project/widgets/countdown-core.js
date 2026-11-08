(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.window === root) root.FlowerCountdownCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    targetDate: "2026-11-05T12:00:00", repeatEnabled: true, repeatDays: 7
  });
  const DAY_MS = 86400000;

  function checkedDate(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      throw new RangeError("日期无效。");
    }
    if (date.getFullYear() < 1970 || date.getFullYear() > 9999) {
      throw new RangeError("年份必须在 1970 至 9999 之间。");
    }
    return date;
  }

  function parseLocalDate(input) {
    if (typeof input !== "string") throw new TypeError("目标日期必须是本地日期文字。");
    const text = input.trim();
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
    if (!match || (match[4] === undefined && (match[2].length !== 2 || match[3].length !== 2))) {
      throw new RangeError("日期格式应为 YYYY-MM-DD 或 YYYY-M-D HH:mm[:ss]。");
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const second = Number(match[6] || 0);
    if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 ||
        hour > 23 || minute > 59 || second > 59) {
      throw new RangeError("年月日、时分秒超出有效范围。");
    }
    const date = new Date(year, month - 1, day, hour, minute, second, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 ||
        date.getDate() !== day || date.getHours() !== hour ||
        date.getMinutes() !== minute || date.getSeconds() !== second) {
      throw new RangeError("日期不存在，或该本地时间被夏令时跳过。");
    }
    return checkedDate(date);
  }

  function addLocalDays(anchor, days) {
    checkedDate(anchor);
    if (!Number.isSafeInteger(days)) throw new RangeError("日历天数必须为安全整数。");
    // Rebuild from the original wall-clock fields; DST must not shift later cycles.
    return checkedDate(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + days,
      anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds()));
  }

  function repeatInterval(value) {
    if ((typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && value.trim() === "")) {
      throw new RangeError("循环间隔必须为大于 0 的整数天。");
    }
    const days = Number(value);
    if (!Number.isSafeInteger(days) || days < 1) {
      throw new RangeError("循环间隔必须为大于 0 的整数天。");
    }
    return days;
  }

  function calendarDay(date) {
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
  }

  function calculateCountdown(options, now) {
    const config = options === undefined ? {} : options;
    if (!config || typeof config !== "object") throw new TypeError("倒数日设置无效。");
    const targetText = config.targetDate === undefined ? DEFAULTS.targetDate : config.targetDate;
    const anchor = parseLocalDate(targetText);
    const current = now === undefined ? new Date() :
      now instanceof Date ? new Date(now.getTime()) :
        typeof now === "number" ? new Date(now) : null;
    if (!current || !Number.isFinite(current.getTime())) throw new RangeError("当前时间无效。");
    const repeating = config.repeatEnabled === undefined ? DEFAULTS.repeatEnabled : config.repeatEnabled;
    if (typeof repeating !== "boolean") throw new TypeError("循环开关必须为布尔值。");
    const interval = repeating ? repeatInterval(config.repeatDays === undefined ? DEFAULTS.repeatDays : config.repeatDays) : null;
    let cycle = 0;
    let target = anchor;
    if (repeating && anchor.getTime() <= current.getTime()) {
      cycle = Math.max(0, Math.floor((calendarDay(current) - calendarDay(anchor)) / interval));
      target = addLocalDays(anchor, cycle * interval);
      // A local date may be skipped by a timezone transition; always seek a strictly future instant.
      while (target.getTime() <= current.getTime()) {
        cycle += 1;
        target = addLocalDays(anchor, cycle * interval);
      }
    }
    const remainingMs = Math.max(0, target.getTime() - current.getTime());
    const totalSeconds = Math.ceil(remainingMs / 1000);
    return Object.freeze({
      anchorTimestamp: anchor.getTime(), targetTimestamp: target.getTime(), remainingMs,
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor(totalSeconds / 3600) % 24,
      minutes: Math.floor(totalSeconds / 60) % 60,
      seconds: totalSeconds % 60,
      expired: !repeating && remainingMs === 0,
      cycle, repeatEnabled: repeating, repeatDays: interval
    });
  }

  return Object.freeze({ DEFAULTS, parseLocalDate, addLocalDays, calculateCountdown });
});
