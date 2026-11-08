(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.window === root) root.FlowerAlbumCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ASSET_IDS = Object.freeze(["forest", "manga", "metro"]);
  const SLOT_KEYS = Object.freeze(["first", "third"]);

  function dataRecord(value, expectedKeys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expectedKeys.length || keys.some(key =>
      typeof key !== "string" || !expectedKeys.includes(key))) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of expectedKeys) {
      if (!descriptors[key] || !Object.prototype.hasOwnProperty.call(descriptors[key], "value")) return null;
    }
    return descriptors;
  }

  function freezeDeck(current, first, third) {
    return Object.freeze({ version: 1, current,
      slots: Object.freeze({ first, third }) });
  }

  function makeInitialState() {
    return freezeDeck("forest", "manga", "metro");
  }

  function validateDeck(input) {
    try {
      const record = dataRecord(input, ["version", "current", "slots"]);
      if (!record || record.version.value !== 1) return null;
      const slots = dataRecord(record.slots.value, SLOT_KEYS);
      if (!slots) return null;
      const current = record.current.value;
      const first = slots.first.value;
      const third = slots.third.value;
      const values = [current, first, third];
      if (values.some(value => typeof value !== "string" || !ASSET_IDS.includes(value)) ||
          new Set(values).size !== ASSET_IDS.length) return null;
      return freezeDeck(current, first, third);
    } catch (_) {
      return null;
    }
  }

  function swapDeck(state, slotKey) {
    if (!SLOT_KEYS.includes(slotKey)) throw new RangeError("Only the first and third album cards can switch wallpapers.");
    const deck = validateDeck(state);
    if (!deck) throw new TypeError("Invalid album deck state.");
    return slotKey === "first"
      ? freezeDeck(deck.slots.first, deck.current, deck.slots.third)
      : freezeDeck(deck.slots.third, deck.slots.first, deck.current);
  }

  function positiveDimension(value, name) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new RangeError(name + " must be a finite positive number.");
    }
    return value;
  }

  function circleGeometry(x, y, width, height) {
    positiveDimension(width, "width");
    positiveDimension(height, "height");
    x = typeof x === "number" && Number.isFinite(x) ? Math.min(width, Math.max(0, x)) : width / 2;
    y = typeof y === "number" && Number.isFinite(y) ? Math.min(height, Math.max(0, y)) : height / 2;
    const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 2;
    if (!Number.isFinite(radius)) throw new RangeError("The circular reveal radius is outside the numeric range.");
    return Object.freeze({ x, y, radius, width, height });
  }

  function readPoint(point) {
    if (!point || typeof point !== "object") throw new TypeError("Each quad point must contain finite x and y coordinates.");
    if (Array.isArray(point) && point.length !== 2) throw new TypeError("An array quad point must contain exactly two coordinates.");
    const x = Array.isArray(point) ? point[0] : point.x;
    const y = Array.isArray(point) ? point[1] : point.y;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError("Each quad point must contain finite x and y coordinates.");
    }
    return { x, y };
  }

  function quadMatrix(width, height, points) {
    positiveDimension(width, "width");
    positiveDimension(height, "height");
    if (!Array.isArray(points) || points.length !== 4) throw new TypeError("A quadrilateral needs exactly four ordered points.");
    const quad = points.map(readPoint);
    const origin = quad[0];
    const span = Math.max(
      Math.max(...quad.map(point => point.x)) - Math.min(...quad.map(point => point.x)),
      Math.max(...quad.map(point => point.y)) - Math.min(...quad.map(point => point.y))
    );
    if (!Number.isFinite(span) || span <= 0) throw new RangeError("The quadrilateral is degenerate.");
    // Normalize the destination before solving, so viewport translations do not harm precision.
    const p = quad.map(point => ({ x: (point.x - origin.x) / span, y: (point.y - origin.y) / span }));
    let winding = 0;
    for (let i = 0; i < 4; i += 1) {
      const a = p[i];
      const b = p[(i + 1) % 4];
      const c = p[(i + 2) % 4];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) <= 1e-10) throw new RangeError("Quad edges must form a non-degenerate convex polygon.");
      const sign = Math.sign(cross);
      if (winding && sign !== winding) throw new RangeError("Quad points must be ordered around a convex polygon.");
      winding = sign;
    }

    const dx1 = p[1].x - p[2].x;
    const dx2 = p[3].x - p[2].x;
    const dx3 = p[0].x - p[1].x + p[2].x - p[3].x;
    const dy1 = p[1].y - p[2].y;
    const dy2 = p[3].y - p[2].y;
    const dy3 = p[0].y - p[1].y + p[2].y - p[3].y;
    let g = 0;
    let h = 0;
    if (Math.abs(dx3) + Math.abs(dy3) > 1e-12) {
      const denominator = dx1 * dy2 - dx2 * dy1;
      if (Math.abs(denominator) <= 1e-12) throw new RangeError("The quadrilateral cannot be projected reliably.");
      g = (dx3 * dy2 - dx2 * dy3) / denominator;
      h = (dx1 * dy3 - dx3 * dy1) / denominator;
    }
    if ([1, 1 + g, 1 + g + h, 1 + h].some(value => !Number.isFinite(value) || value <= 1e-10)) {
      throw new RangeError("The projection crosses or approaches its perspective horizon.");
    }
    const a = p[1].x - p[0].x + g * p[1].x;
    const b = p[3].x - p[0].x + h * p[3].x;
    const d = p[1].y - p[0].y + g * p[1].y;
    const e = p[3].y - p[0].y + h * p[3].y;
    const matrix = [
      (span * a + origin.x * g) / width, (span * d + origin.y * g) / width, 0, g / width,
      (span * b + origin.x * h) / height, (span * e + origin.y * h) / height, 0, h / height,
      0, 0, 1, 0,
      origin.x, origin.y, 0, 1
    ];
    if (matrix.some(value => !Number.isFinite(value))) throw new RangeError("The projection matrix is outside the numeric range.");
    return Object.freeze(matrix.map(value => Object.is(value, -0) ? 0 : value));
  }

  function makeCssQuadTransform(width, height, points) {
    return "matrix3d(" + quadMatrix(width, height, points).join(",") + ")";
  }

  return Object.freeze({ ASSET_IDS, SLOT_KEYS, makeInitialState, validateDeck, swapDeck,
    circleGeometry, quadMatrix, makeCssQuadTransform });
});
