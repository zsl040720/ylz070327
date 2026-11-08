(() => {
  "use strict";
  const STORAGE_KEY = "flower-album-deck-v1";
  const ASSETS = Object.freeze({
    forest: { backgroundSrc: "assets/backgrounds/forest-clean.png", thumbnailSrc: "assets/photos/forest.jpg", thumbnailRatio: 1080 / 1920, name: "花墙相册", description: "女孩躺在暗绿花墙间，右侧摆放四张复古相册。" },
    manga: { backgroundSrc: "assets/backgrounds/manga.png", thumbnailSrc: "assets/photos/manga.jpg", thumbnailRatio: 1440 / 2563, name: "黑裙漫画", description: "黑裙女孩与漫画背景的宽屏壁纸。" },
    metro: { backgroundSrc: "assets/backgrounds/metro-hd.png", thumbnailSrc: "assets/photos/metro.png", thumbnailRatio: 364 / 647, name: "地铁走廊", description: "戴眼镜的女孩站在地铁走廊，保留原图录像取景框。" }
  });
  const FIXED_PHOTOS = Object.freeze({
    camera: { thumbnailSrc: "assets/photos/camera.png", thumbnailRatio: 364 / 647, name: "相机留影" },
    longhair: { thumbnailSrc: "assets/photos/longhair.png", thumbnailRatio: 364 / 647, name: "长发自拍" }
  });
  const CARD_SLOTS = Object.freeze(["first", "camera", "third", "longhair"]);
  const HOME_QUADS = Object.freeze({
    first: [[1907.79, 132.31], [2166.64, 106.16], [2214.45, 533.71], [1952.44, 563.54]],
    camera: [[2221.11, 222.33], [2477.25, 255.36], [2436.59, 638.72], [2169.25, 598.62]],
    third: [[2057.82, 593.38], [2291, 562.34], [2333.61, 891.64], [2092.43, 923.18]],
    longhair: [[2151.68, 1014.07], [2471.51, 1054.11], [2421.38, 1391.25], [2090.6, 1344.41]]
  });
  const EASING = "cubic-bezier(0.42, 0, 0.58, 1)";
  const SHADOWS = Object.freeze({
    forest: "0px 5px 12px rgba(19, 17, 11, 0.22)",
    manga: "0px 3px 11px rgba(22, 29, 54, 0.13)",
    metro: "0px 3px 12px rgba(38, 39, 40, 0.12)"
  });

  function create(options) {
    const core = window.FlowerAlbumCore;
    if (!core) throw new Error("Album core is missing.");
    const { artwork, layer, transitionLayer, statusElement } = options || {};
    if (!artwork || !layer || !transitionLayer) throw new Error("Album display layers are missing.");
    const settings = { interactionenabled: true, transitionduration: 2000, fit: "contain", countdownenabled: true, countdownposition: "leftmiddle" };
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const buttons = {};
    const cards = {};
    const visuals = {};
    const images = {};
    const assetStatus = {};
    const listeners = [];
    const pendingTimers = new Set();
    const cardAnimations = new Map();
    let deck = core.makeInitialState();
    let ready = false;
    let loading = true;
    let busy = false;
    let paused = false;
    let disposed = false;
    let reducedMotion = media.matches;
    let storageAvailable = true;
    let error = null;
    let active = null;
    let generation = 0;
    let lastOrigin = null;
    let currentLayouts = {};
    let parallaxTransform = "none";

    layer.classList.add("flower-album-layer");
    transitionLayer.classList.add("flower-album-transition");
    transitionLayer.setAttribute("aria-hidden", "true");
    transitionLayer.hidden = true;
    const transitionUnderlay = document.createElement("img");
    transitionUnderlay.alt = "";
    transitionUnderlay.draggable = false;
    transitionUnderlay.className = "flower-album-transition-underlay";
    transitionUnderlay.hidden = true;
    const transitionFront = document.createElement("div");
    transitionFront.className = "flower-album-transition-front";
    const transitionImage = document.createElement("img");
    transitionImage.alt = "";
    transitionImage.draggable = false;
    transitionFront.appendChild(transitionImage);
    transitionLayer.appendChild(transitionUnderlay);
    transitionLayer.appendChild(transitionFront);
    if (statusElement) {
      statusElement.classList.add("flower-album-status");
      statusElement.hidden = true;
    }

    function listen(target, type, callback, eventOptions) {
      target.addEventListener(type, callback, eventOptions);
      listeners.push(() => target.removeEventListener(type, callback, eventOptions));
    }
    function bounded(value, min, max, fallback) {
      if (value === null || typeof value === "boolean") return fallback;
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
    }
    function setStatus(message) {
      error = message || null;
      if (statusElement) {
        statusElement.textContent = message || "";
        statusElement.hidden = !message;
      }
    }
    function setBusy(value) {
      if (busy === value) { updateEnabled(); return; }
      busy = value;
      layer.setAttribute("aria-busy", String(value));
      updateEnabled();
      if (typeof options.onBusyChange === "function") options.onBusyChange(value);
    }
    function updateEnabled() {
      for (const slot of ["first", "third"]) {
        if (!buttons[slot]) continue;
        const available = assetStatus[deck.slots[slot]] === "loaded";
        buttons[slot].disabled = !ready || busy || paused || !settings.interactionenabled || !available;
        buttons[slot].setAttribute("aria-disabled", String(buttons[slot].disabled));
      }
      layer.dataset.enabled = String(settings.interactionenabled);
    }
    function persist() {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deck)); }
      catch (_) { storageAvailable = false; }
    }
    function readStored() {
      try {
        const text = window.localStorage.getItem(STORAGE_KEY);
        if (!text) return null;
        return core.validateDeck(JSON.parse(text));
      } catch (_) { storageAvailable = false; return null; }
    }
    function timeout(promise, milliseconds, message) {
      return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          pendingTimers.delete(timer);
          reject(new Error(message));
        }, milliseconds);
        pendingTimers.add(timer);
        Promise.resolve(promise).then(value => {
          window.clearTimeout(timer); pendingTimers.delete(timer); resolve(value);
        }, exception => {
          window.clearTimeout(timer); pendingTimers.delete(timer); reject(exception);
        });
      });
    }
    async function decode(image) {
      if (typeof image.decode === "function") {
        await timeout(image.decode(), 15000, "图片解码超时。");
      } else if (!(image.complete && image.naturalWidth > 0)) {
        await timeout(new Promise((resolve, reject) => {
          const loaded = () => { cleanup(); resolve(); };
          const failed = () => { cleanup(); reject(new Error("图片加载失败。")); };
          function cleanup() { image.removeEventListener("load", loaded); image.removeEventListener("error", failed); }
          image.addEventListener("load", loaded, { once: true });
          image.addEventListener("error", failed, { once: true });
        }), 15000, "图片加载超时。");
      }
      if (!image.naturalWidth) throw new Error("图片内容不可用。");
    }
    async function preload(id) {
      const image = new Image();
      const descriptor = ASSETS[id] || FIXED_PHOTOS[id];
      image.src = descriptor.backgroundSrc || descriptor.thumbnailSrc;
      assetStatus[id] = "loading";
      try {
        if (descriptor.backgroundSrc) {
          const thumbnail = new Image();
          thumbnail.src = descriptor.thumbnailSrc;
          await Promise.all([decode(image), decode(thumbnail)]);
        } else await decode(image);
        if (disposed) return;
        images[id] = image;
        assetStatus[id] = "loaded";
      } catch (_) { if (!disposed) assetStatus[id] = "failed"; }
    }
    function imageRect() {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const image = images[deck.current];
      const sourceWidth = deck.current !== "forest" && image ? image.naturalWidth : 2560;
      const sourceHeight = deck.current !== "forest" && image ? image.naturalHeight : 1440;
      const scale = settings.fit === "cover" ? Math.max(width / sourceWidth, height / sourceHeight) : Math.min(width / sourceWidth, height / sourceHeight);
      const displayWidth = sourceWidth * scale;
      const displayHeight = sourceHeight * scale;
      return { x: (width - displayWidth) / 2, y: (height - displayHeight) / 2, scale, width, height, displayWidth, displayHeight };
    }
    function targetLayout(slot) {
      const rect = imageRect();
      const descriptor = ASSETS[deck.slots[slot]] || FIXED_PHOTOS[slot];
      const ratio = descriptor.thumbnailRatio;
      if (deck.current === "forest") {
        const sizes = { first: [260, 433], camera: [260, 385], third: [236, 334], longhair: [326, 343] };
        const height = sizes[slot][1];
        const width = (height - 16) * ratio + 16;
        const inset = (1 - width / sizes[slot][0]) / 2;
        const [tl, tr, br, bl] = HOME_QUADS[slot];
        const along = (a, b, fraction) => [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
        const quad = [along(tl, tr, inset), along(tl, tr, 1 - inset), along(bl, br, 1 - inset), along(bl, br, inset)]
          .map(([x, y]) => [rect.x + x * rect.scale, rect.y + y * rect.scale]);
        return { quad, width: width * rect.scale, height: height * rect.scale, paper: 8 * rect.scale, paperBottom: 8 * rect.scale, ratio, theme: "forest", home: true };
      }
      const displayWidth = Math.min(rect.width, rect.displayWidth);
      const displayHeight = Math.min(rect.height, rect.displayHeight);
      const displayX = Math.max(0, rect.x);
      const displayY = Math.max(0, rect.y);
      const paper = 3;
      const paperBottom = deck.current === "metro" ? 12 : paper;
      const gap = Math.max(12, displayWidth * 0.009);
      const maxHeight = (displayHeight * 0.43 - gap) / 2;
      const width = Math.min(158, displayWidth * 0.06, (maxHeight - paper - paperBottom) * ratio + paper * 2);
      const height = (width - paper * 2) / ratio + paper + paperBottom;
      const index = CARD_SLOTS.indexOf(slot);
      const left = displayX + displayWidth * 0.12 + (index % 2 ? width + gap : 0);
      const top = displayY + displayHeight * (settings.countdownenabled && settings.countdownposition === "lefttop" ? 0.43 : 0.09) + (index > 1 ? height + gap : 0);
      const angle = [-3, 2, -2, 3][index] * Math.PI / 180;
      const cx = left + width / 2;
      const cy = top + height / 2;
      const quad = [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]].map(([x, y]) => [cx + x * Math.cos(angle) - y * Math.sin(angle), cy + x * Math.sin(angle) + y * Math.cos(angle)]);
      return { quad, width, height, paper, paperBottom, ratio, theme: deck.current, home: false };
    }
    function stopCardAnimations() {
      for (const entry of cardAnimations.values()) for (const animation of entry.animations) animation.cancel();
      cardAnimations.clear();
    }
    function layoutStyles(layout) {
      return {
        width: layout.width + "px", height: layout.height + "px",
        paddingTop: layout.paper + "px", paddingRight: layout.paper + "px",
        paddingBottom: layout.paperBottom + "px", paddingLeft: layout.paper + "px",
        transform: core.makeCssQuadTransform(layout.width, layout.height, layout.quad),
        boxShadow: SHADOWS[layout.theme]
      };
    }
    function setLayoutStyles(card, layout) {
      Object.assign(card.style, layoutStyles(layout));
      card.style.setProperty("--album-paper", layout.paper + "px");
      card.style.setProperty("--album-paper-bottom", layout.paperBottom + "px");
    }
    function clearOldPhoto(visual) {
      if (visual.oldPhoto) visual.oldPhoto.remove();
      visual.oldPhoto = null;
      visual.photo.style.opacity = "1";
    }
    function completeCard(slot, layout) {
      const visual = visuals[slot];
      setLayoutStyles(cards[slot], layout);
      visual.paper.dataset.skin = layout.theme;
      visual.paper.style.opacity = "1";
      visual.nextPaper.dataset.skin = layout.theme;
      visual.nextPaper.style.opacity = "0";
      clearOldPhoto(visual);
      cards[slot].dataset.motion = "idle";
    }
    function renderCards(animate) {
      if (!animate) stopCardAnimations();
      layer.dataset.mode = deck.current === "forest" ? "home" : "album";
      layer.dataset.theme = deck.current;
      for (const slot of CARD_SLOTS) {
        const card = cards[slot];
        const visual = visuals[slot];
        const interactive = slot === "first" || slot === "third";
        const id = interactive ? deck.slots[slot] : slot;
        const descriptor = ASSETS[id] || FIXED_PHOTOS[id];
        const photo = visual.photo;
        const layout = targetLayout(slot);
        const from = currentLayouts[slot] || layout;
        const oldSrc = photo.getAttribute("src");
        const moving = animate && !reducedMotion && typeof card.animate === "function";
        clearOldPhoto(visual);
        if (oldSrc !== descriptor.thumbnailSrc) photo.src = descriptor.thumbnailSrc;
        photo.style.objectFit = "contain";
        photo.style.objectPosition = "50% 50%";
        card.dataset.asset = id;
        if (interactive) {
          card.setAttribute("aria-label", "切换到" + descriptor.name);
          card.title = "点击切换到" + descriptor.name + "，并与当前壁纸交换";
          photo.alt = "";
        } else photo.alt = descriptor.name;
        currentLayouts[slot] = layout;
        if (!moving) { completeCard(slot, layout); continue; }
        setLayoutStyles(card, from);
        visual.paper.dataset.skin = from.theme;
        visual.paper.style.opacity = "1";
        visual.nextPaper.dataset.skin = layout.theme;
        visual.nextPaper.style.opacity = "0";
        card.dataset.motion = "moving";
        const timing = { duration: settings.transitionduration, easing: EASING, fill: "forwards" };
        const motion = card.animate([layoutStyles(from), layoutStyles(layout)], timing);
        const skin = visual.nextPaper.animate([{ opacity: 0 }, { opacity: 1 }], timing);
        const entry = { animations: [motion, skin], from, to: layout };
        cardAnimations.set(slot, entry);
        if (oldSrc && oldSrc !== descriptor.thumbnailSrc) {
          const oldPhoto = document.createElement("img");
          oldPhoto.src = oldSrc;
          oldPhoto.alt = "";
          oldPhoto.draggable = false;
          oldPhoto.className = "flower-album-photo-old";
          oldPhoto.setAttribute("aria-hidden", "true");
          visual.stage.appendChild(oldPhoto);
          visual.oldPhoto = oldPhoto;
          photo.style.opacity = "0";
          const contentTiming = { duration: Math.min(700, settings.transitionduration * 0.35), delay: settings.transitionduration * 0.18, easing: EASING, fill: "forwards" };
          entry.animations.push(photo.animate([{ opacity: 0 }, { opacity: 1 }], contentTiming));
          entry.animations.push(oldPhoto.animate([{ opacity: 1 }, { opacity: 0 }], contentTiming));
        }
        motion.finished.then(() => {
          if (disposed || cardAnimations.get(slot) !== entry) return;
          completeCard(slot, layout);
          cardAnimations.delete(slot);
          for (const animation of entry.animations) animation.cancel();
        }, () => {});
        for (const animation of entry.animations.slice(1)) animation.finished.catch(() => {});
      }
      updateEnabled();
    }
    function hideTransition() {
      transitionLayer.hidden = true;
      transitionLayer.classList.remove("is-active");
      transitionLayer.style.clipPath = "none";
      transitionLayer.style.opacity = "1";
      transitionFront.style.clipPath = "none";
      transitionFront.hidden = false;
      transitionUnderlay.hidden = true;
    }
    function notifyCommit() {
      artwork.alt = ASSETS[deck.current].description;
      if (typeof options.onCommit === "function") options.onCommit(deck.current, deck);
    }
    async function settle(task) {
      if (!task || task.done || active !== task || disposed) return;
      if (task.settling) return task.settling;
      task.settling = (async () => {
        transitionLayer.style.clipPath = "none";
        transitionLayer.style.opacity = "1";
        if (task.reverse) {
          transitionFront.hidden = true;
          transitionFront.style.clipPath = task.endClip;
          transitionUnderlay.hidden = false;
          transitionLayer.hidden = false;
        }
        if (task.animation) task.animation.cancel();
        renderCards(false);
        artwork.src = ASSETS[task.to].backgroundSrc;
        try {
          await decode(artwork);
          if (disposed || active !== task) return;
          task.done = true;
          active = null;
          renderCards(false);
          notifyCommit();
          persist();
          hideTransition();
          setBusy(false);
        } catch (_) {
          if (disposed || active !== task) return;
          deck = task.from;
          artwork.src = ASSETS[deck.current].backgroundSrc;
          task.done = true;
          active = null;
          renderCards(false);
          notifyCommit();
          hideTransition();
          setBusy(false);
          setStatus("图片未能载入，已保留原壁纸。请检查工程内的图片文件。");
        }
      })();
      return task.settling;
    }
    async function switchSlot(slot, event) {
      if (disposed || !ready || busy || paused || !settings.interactionenabled || document.hidden) return false;
      if (slot !== "first" && slot !== "third") return false;
      const id = deck.slots[slot];
      if (assetStatus[id] !== "loaded") {
        setStatus("这张图片尚未载入，当前壁纸没有改变。");
        return false;
      }
      const bounds = buttons[slot].getBoundingClientRect();
      const keyboard = !event || event.detail === 0;
      const x = keyboard ? bounds.left + bounds.width / 2 : event.clientX;
      const y = keyboard ? bounds.top + bounds.height / 2 : event.clientY;
      const origin = core.circleGeometry(x, y, window.innerWidth, window.innerHeight);
      lastOrigin = { ...origin };
      const from = deck;
      const next = core.swapDeck(from, slot);
      const direction = from.current !== "forest" && next.current !== "forest" ? "in" : "out";
      const reverse = direction === "in" && !reducedMotion;
      const endRadius = reverse ? Math.min(origin.radius * 0.5, Math.max(0, Math.min(bounds.width, bounds.height) * 0.32)) : 0;
      const endX = bounds.left + bounds.width / 2, endY = bounds.top + bounds.height / 2;
      const task = { id: ++generation, from, next, to: next.current, animation: null, done: false, settling: null, origin, direction, reverse, endRadius, clipElement: reverse ? transitionFront : transitionLayer, endClip: `circle(${endRadius}px at ${endX}px ${endY}px)` };
      active = task;
      setStatus("");
      setBusy(true);
      deck = next;
      transitionImage.src = ASSETS[reverse ? from.current : task.to].backgroundSrc;
      transitionImage.style.objectFit = settings.fit;
      transitionImage.style.transform = parallaxTransform;
      transitionImage.hidden = false;
      transitionUnderlay.src = ASSETS[task.to].backgroundSrc;
      transitionUnderlay.style.objectFit = settings.fit;
      transitionUnderlay.style.transform = parallaxTransform;
      transitionUnderlay.hidden = !reverse;
      transitionFront.hidden = false;
      transitionLayer.hidden = reverse;
      transitionLayer.classList.add("is-active");
      const start = `circle(${reverse ? origin.radius : 0}px at ${origin.x}px ${origin.y}px)`;
      const end = reverse ? task.endClip : `circle(${origin.radius}px at ${origin.x}px ${origin.y}px)`;
      transitionLayer.style.clipPath = reducedMotion || reverse ? "none" : start;
      transitionFront.style.clipPath = reverse ? start : "none";
      transitionLayer.style.opacity = reducedMotion ? "0" : "1";
      try {
        const preparation = typeof options.onPrepareTransition === "function"
          ? options.onPrepareTransition({ from: from.current, to: task.to }) : undefined;
        await Promise.all([decode(transitionImage), reverse ? decode(transitionUnderlay) : undefined, Promise.resolve(preparation)]);
        if (disposed || active !== task || task.settling) return true;
        if (paused || document.hidden) { settle(task); return true; }
        if (typeof transitionLayer.animate !== "function") { settle(task); return true; }
        renderCards(!reducedMotion);
        transitionLayer.hidden = false;
        const frames = reducedMotion ? [{ opacity: 0 }, { opacity: 1 }] : [{ clipPath: start }, { clipPath: end }];
        task.animation = task.clipElement.animate(frames, {
          duration: reducedMotion ? 140 : settings.transitionduration,
          easing: EASING, fill: "forwards"
        });
        task.animation.finished.then(() => settle(task), () => { if (!task.settling) settle(task); });
        if (typeof options.onTransitionStart === "function") {
          options.onTransitionStart({ from: from.current, to: task.to, origin: { ...origin },
            duration: reducedMotion ? 140 : settings.transitionduration, easing: EASING,
            animation: task.animation, reducedMotion, direction, clipElement: task.clipElement, endRadius });
        }
      } catch (_) {
        if (disposed || active !== task || task.settling) return true;
        if (task.animation) task.animation.cancel();
        deck = from;
        active = null;
        stopCardAnimations();
        renderCards(false);
        notifyCommit();
        hideTransition();
        setBusy(false);
        setStatus("切换图片未能准备好，已保留原壁纸。");
      }
      return true;
    }
    for (const slot of CARD_SLOTS) {
      const interactive = slot === "first" || slot === "third";
      const button = document.createElement(interactive ? "button" : "div");
      const stage = document.createElement("span");
      const photo = document.createElement("img");
      const paper = document.createElement("span");
      const nextPaper = document.createElement("span");
      if (interactive) button.type = "button";
      button.className = "flower-album-card";
      button.dataset.slot = slot;
      button.dataset.interactive = String(interactive);
      stage.className = "flower-album-photo-stage";
      paper.className = "flower-album-paper";
      nextPaper.className = "flower-album-paper flower-album-paper-next";
      paper.setAttribute("aria-hidden", "true");
      nextPaper.setAttribute("aria-hidden", "true");
      photo.alt = "";
      photo.draggable = false;
      stage.appendChild(photo);
      button.appendChild(stage);
      button.appendChild(paper);
      button.appendChild(nextPaper);
      layer.appendChild(button);
      cards[slot] = button;
      visuals[slot] = { stage, photo, paper, nextPaper, oldPhoto: null };
      if (interactive) {
        buttons[slot] = button;
        listen(button, "click", event => { switchSlot(slot, event); });
      }
    }
    function resize() {
      if (disposed) return;
      if (active) settle(active);
      stopCardAnimations();
      renderCards(false);
    }
    function setPaused(value) {
      paused = Boolean(value);
      if (paused && active) settle(active);
      updateEnabled();
    }
    function setTransform(value) {
      if (disposed) return;
      parallaxTransform = typeof value === "string" && value ? value : "none";
      layer.style.transform = parallaxTransform;
      if (active) transitionImage.style.transform = parallaxTransform;
      if (active) transitionUnderlay.style.transform = parallaxTransform;
    }
    function applyProperties(properties) {
      if (disposed || !properties || typeof properties !== "object") return;
      let relayout = false;
      if (properties.interactionenabled) {
        const value = properties.interactionenabled.value;
        settings.interactionenabled = value === true || value === 1;
        if (!settings.interactionenabled && active) settle(active);
      }
      if (properties.transitionduration) settings.transitionduration = bounded(properties.transitionduration.value, 800, 4000, settings.transitionduration);
      if (properties.fit) {
        settings.fit = properties.fit.value === "cover" ? "cover" : "contain";
        transitionImage.style.objectFit = settings.fit;
        transitionUnderlay.style.objectFit = settings.fit;
        relayout = true;
      }
      if (properties.countdownenabled) {
        settings.countdownenabled = properties.countdownenabled.value === true || properties.countdownenabled.value === 1;
        relayout = true;
      }
      if (properties.countdownposition && ["lefttop", "leftmiddle", "leftbottom"].includes(properties.countdownposition.value)) {
        settings.countdownposition = properties.countdownposition.value;
        relayout = true;
      }
      if (relayout) resize();
      updateEnabled();
    }
    function getState() {
      return {
        ready, loading, busy, paused, reducedMotion, disposed, storageAvailable,
        storageKey: STORAGE_KEY, deck, settings: { ...settings },
        lastOrigin: lastOrigin ? { ...lastOrigin } : null,
        error, assets: { ...assetStatus },
        transition: active ? { from: active.from.current, to: active.to, settling: Boolean(active.settling), direction: active.direction, endRadius: active.endRadius, foregroundSrc: transitionImage.src, underlaySrc: transitionUnderlay.src } : null,
        slots: { first: buttons.first.dataset.asset, third: buttons.third.dataset.asset },
        photos: Object.fromEntries(CARD_SLOTS.map(slot => [slot, { asset: cards[slot].dataset.asset, src: visuals[slot].photo.src, interactive: Boolean(buttons[slot]), moving: cardAnimations.has(slot), oldPhoto: Boolean(visuals[slot].oldPhoto), skin: visuals[slot].paper.dataset.skin, nextSkin: visuals[slot].nextPaper.dataset.skin }]))
      };
    }
    function destroy() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      if (active) {
        if (active.animation) active.animation.cancel();
        artwork.src = ASSETS[deck.current].backgroundSrc;
        active.done = true;
        active = null;
      }
      stopCardAnimations();
      for (const slot of CARD_SLOTS) {
        clearOldPhoto(visuals[slot]);
        cards[slot].dataset.motion = "idle";
      }
      for (const timer of pendingTimers) window.clearTimeout(timer);
      pendingTimers.clear();
      for (const remove of listeners) remove();
      for (const card of Object.values(cards)) card.remove();
      transitionImage.remove();
      transitionFront.remove();
      transitionUnderlay.remove();
      hideTransition();
      if (busy) {
        busy = false;
        if (typeof options.onBusyChange === "function") options.onBusyChange(false);
      }
    }
    listen(document, "visibilitychange", () => { if (document.hidden && active) settle(active); });
    const mediaChanged = () => {
      reducedMotion = media.matches;
      if (active) settle(active);
      else renderCards(false);
    };
    if (media.addEventListener) listen(media, "change", mediaChanged);
    else {
      media.addListener(mediaChanged);
      listeners.push(() => media.removeListener(mediaChanged));
    }
    renderCards(false);
    const stored = readStored();
    const readyPromise = Promise.all([...Object.keys(ASSETS), ...Object.keys(FIXED_PHOTOS)].map(preload)).then(async () => {
      if (disposed) return;
      loading = false;
      if (stored && assetStatus[stored.current] === "loaded") deck = stored;
      else deck = core.makeInitialState();
      try {
        if (typeof options.onPrepareTransition === "function") {
          await options.onPrepareTransition({ from: deck.current, to: deck.current });
        }
        if (disposed) return;
        if (assetStatus[deck.current] === "loaded") {
          artwork.src = ASSETS[deck.current].backgroundSrc;
          await decode(artwork);
        }
        if (disposed) return;
        ready = true;
        renderCards(false);
        layer.classList.add("is-ready");
        notifyCommit();
        if (Object.values(assetStatus).some(value => value === "failed")) {
          setStatus("部分切换图片未能载入，请检查 assets/backgrounds 文件夹。");
        }
      } catch (_) {
        if (disposed) return;
        ready = false;
        setStatus("壁纸图片未能载入，点击切换暂不可用。");
      }
    });
    return Object.freeze({ applyProperties, setPaused, resize, setTransform, getState, destroy, ready: readyPromise });
  }
  window.FlowerAlbum = Object.freeze({ create, storageKey: STORAGE_KEY });
})();
