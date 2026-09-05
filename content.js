(() => {
  const BANDS = [
    { freq: 31, type: 'lowshelf' },
    { freq: 62, type: 'peaking' },
    { freq: 125, type: 'peaking' },
    { freq: 250, type: 'peaking' },
    { freq: 500, type: 'peaking' },
    { freq: 1000, type: 'peaking' },
    { freq: 2000, type: 'peaking' },
    { freq: 4000, type: 'peaking' },
    { freq: 8000, type: 'peaking' },
    { freq: 16000, type: 'highshelf' }
  ];
  const PEAKING_Q = 1.4;
  const RAMP_SECONDS = 0.015;

  const STATE = {
    enabled: true,
    preampDb: 0,
    gains: new Array(BANDS.length).fill(0)
  };

  let audioCtx = null;
  // Map, not WeakMap: we need to iterate all live chains to apply gain
  // changes, and to explicitly disconnect + drop entries when an element
  // leaves the DOM (SPAs that recreate media elements repeatedly would
  // otherwise leak a GainNode/BiquadFilterNode chain per element forever).
  const mediaChains = new Map();

  function clampNumber(n, min, max, fallback) {
    return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function sanitizeGains(raw) {
    if (!Array.isArray(raw) || raw.length !== BANDS.length) return new Array(BANDS.length).fill(0);
    return raw.map((g) => clampNumber(g, -15, 15, 0));
  }

  function dbToLinear(db) {
    return Math.pow(10, db / 20);
  }

  function setParam(param, value) {
    if (!audioCtx) return;
    try {
      param.setTargetAtTime(value, audioCtx.currentTime, RAMP_SECONDS);
    } catch {
      param.value = value;
    }
  }

  function ensureContext() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();

    const resume = () => {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    };
    resume();
    ['click', 'keydown', 'touchstart'].forEach((evt) => {
      document.addEventListener(evt, resume, { passive: true, capture: true });
    });

    return audioCtx;
  }

  function buildChain(source) {
    const ctx = audioCtx;
    const preamp = ctx.createGain();
    preamp.gain.value = STATE.enabled ? dbToLinear(STATE.preampDb) : 1;

    const filters = BANDS.map((band, i) => {
      const f = ctx.createBiquadFilter();
      f.type = band.type;
      f.frequency.value = band.freq;
      if (band.type === 'peaking') f.Q.value = PEAKING_Q;
      f.gain.value = STATE.enabled ? STATE.gains[i] : 0;
      return f;
    });

    source.connect(preamp);
    let node = preamp;
    for (const f of filters) {
      node.connect(f);
      node = f;
    }
    node.connect(ctx.destination);

    return { preamp, filters };
  }

  function connectElement(el) {
    if (mediaChains.has(el)) return;
    if (!(el instanceof HTMLMediaElement)) return;
    const ctx = ensureContext();
    if (!ctx) return;

    try {
      const source = ctx.createMediaElementSource(el);
      mediaChains.set(el, buildChain(source));
    } catch (err) {
      // Most commonly: the page itself already routed this element through
      // its own Web Audio graph (e.g. a site with a built-in visualizer).
      // An element can only ever be connected to one MediaElementSourceNode.
      console.warn('[Audio Equalizer] could not attach to media element', err);
    }
  }

  function disconnectElement(el) {
    const chain = mediaChains.get(el);
    if (!chain) return;
    try { chain.preamp.disconnect(); } catch { /* already disconnected */ }
    chain.filters.forEach((f) => {
      try { f.disconnect(); } catch { /* already disconnected */ }
    });
    mediaChains.delete(el);
  }

  function findMediaCandidates(root) {
    if (!(root instanceof Element)) return [];
    return root.matches('audio, video')
      ? [root, ...root.querySelectorAll('audio, video')]
      : Array.from(root.querySelectorAll('audio, video'));
  }

  function scanForMedia(root) {
    for (const el of findMediaCandidates(root)) connectElement(el);
  }

  // Only elements truly gone from the document get cleaned up — a node
  // that was merely reparented within the page (still `document.contains`)
  // must keep its chain, since childList mutations fire removal + addition
  // records for a plain DOM move too.
  function cleanupRemoved(root) {
    for (const el of findMediaCandidates(root)) {
      if (!document.contains(el)) disconnectElement(el);
    }
  }

  function applyStateToChains() {
    for (const chain of mediaChains.values()) {
      setParam(chain.preamp.gain, STATE.enabled ? dbToLinear(STATE.preampDb) : 1);
      chain.filters.forEach((f, i) => {
        setParam(f.gain, STATE.enabled ? STATE.gains[i] : 0);
      });
    }
  }

  function startObserver() {
    if (!document.documentElement) return;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const added of m.addedNodes) {
          if (added.nodeType === Node.ELEMENT_NODE) scanForMedia(added);
        }
        for (const removed of m.removedNodes) {
          if (removed.nodeType === Node.ELEMENT_NODE) cleanupRemoved(removed);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  async function init() {
    const stored = await chrome.storage.sync.get(['enabled', 'preampDb', 'gains']);
    STATE.enabled = stored.enabled !== false;
    STATE.preampDb = clampNumber(stored.preampDb, -20, 20, 0);
    STATE.gains = sanitizeGains(stored.gains);

    if (document.body) scanForMedia(document.body);
    startObserver();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    let changed = false;

    if (changes.enabled) {
      STATE.enabled = changes.enabled.newValue !== false;
      changed = true;
    }
    if (changes.preampDb) {
      STATE.preampDb = clampNumber(changes.preampDb.newValue, -20, 20, STATE.preampDb);
      changed = true;
    }
    if (changes.gains) {
      STATE.gains = sanitizeGains(changes.gains.newValue);
      changed = true;
    }

    if (changed) applyStateToChains();
  });

  init();
})();
