const FREQ_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
const BAND_COUNT = FREQ_LABELS.length;

const PRESETS = {
  flat:      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass:      [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  treble:    [0, 0, 0, 0, 0, 0, 2, 4, 6, 8],
  vocal:     [-2, -2, 0, 2, 4, 4, 4, 2, 0, -2],
  loudness:  [6, 4, 2, 0, -2, -2, 0, 2, 4, 6],
  rock:      [5, 3, -2, -3, -1, 2, 4, 5, 5, 5],
  pop:       [-1, 2, 4, 4, 2, -1, -2, -2, -1, -1],
  classical: [0, 0, 0, 0, 0, 0, -2, -2, -3, -4]
};

const $ = (id) => document.getElementById(id);

let gains = PRESETS.flat.slice();
let preampDb = 0;
let enabled = true;
let suppressPresetSync = false;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function formatDb(v) {
  return v > 0 ? `+${v} dB` : `${v} dB`;
}

function matchPreset(g) {
  for (const [name, values] of Object.entries(PRESETS)) {
    if (values.every((v, i) => v === g[i])) return name;
  }
  return 'custom';
}

function markCustom() {
  if (suppressPresetSync) return;
  $('preset').value = 'custom';
}

function buildBandSliders() {
  const container = $('bands');
  container.innerHTML = '';

  FREQ_LABELS.forEach((label, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'band';

    const value = document.createElement('div');
    value.className = 'band-value';

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'vertical';
    input.min = '-15';
    input.max = '15';
    input.step = '0.5';
    input.dataset.index = String(i);

    const freqLabel = document.createElement('div');
    freqLabel.className = 'band-label';
    freqLabel.textContent = label;

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      gains[i] = v;
      value.textContent = formatDb(v);
      markCustom();
      save();
    });

    wrap.append(value, input, freqLabel);
    container.appendChild(wrap);
  });
}

function syncSlidersFromGains() {
  const inputs = document.querySelectorAll('#bands input[type=range]');
  inputs.forEach((input, i) => {
    input.value = String(gains[i]);
    input.parentElement.querySelector('.band-value').textContent = formatDb(gains[i]);
  });
}

// chrome.storage.sync has a hard write-rate quota (~120 writes/minute).
// A slider drag fires many `input` events per second, so writes are
// debounced rather than sent on every event.
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 120);
}

function flushSave() {
  clearTimeout(saveTimer);
  chrome.storage.sync.set({ enabled, preampDb, gains });
}

// The popup's JS context is torn down as soon as it closes, so a pending
// debounced write would otherwise be silently lost if the user closes the
// popup right after dragging a slider.
window.addEventListener('pagehide', flushSave);

async function load() {
  const stored = await chrome.storage.sync.get(['enabled', 'preampDb', 'gains']);
  enabled = stored.enabled !== false;
  preampDb = typeof stored.preampDb === 'number' ? clamp(stored.preampDb, -20, 20) : 0;
  gains = Array.isArray(stored.gains) && stored.gains.length === BAND_COUNT
    ? stored.gains.slice()
    : PRESETS.flat.slice();

  $('enabled').checked = enabled;
  $('preampSlider').value = String(preampDb);
  $('preampValue').textContent = formatDb(preampDb);

  buildBandSliders();
  syncSlidersFromGains();

  suppressPresetSync = true;
  $('preset').value = matchPreset(gains);
  suppressPresetSync = false;
}

$('enabled').addEventListener('change', (e) => {
  enabled = e.target.checked;
  save();
});

$('preampSlider').addEventListener('input', (e) => {
  preampDb = clamp(parseFloat(e.target.value), -20, 20);
  $('preampValue').textContent = formatDb(preampDb);
  save();
});

$('preset').addEventListener('change', (e) => {
  const name = e.target.value;
  if (name === 'custom' || !PRESETS[name]) return;
  gains = PRESETS[name].slice();
  syncSlidersFromGains();
  save();
});

$('reset').addEventListener('click', () => {
  gains = PRESETS.flat.slice();
  preampDb = 0;

  suppressPresetSync = true;
  $('preset').value = 'flat';
  suppressPresetSync = false;

  $('preampSlider').value = '0';
  $('preampValue').textContent = formatDb(0);
  syncSlidersFromGains();
  save();
});

load();
