const BAND_COUNT = 10;

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== 'install') return;

  const existing = await chrome.storage.sync.get(['enabled', 'preampDb', 'gains']);
  const patch = {};
  if (existing.enabled === undefined) patch.enabled = true;
  if (typeof existing.preampDb !== 'number') patch.preampDb = 0;
  if (!Array.isArray(existing.gains) || existing.gains.length !== BAND_COUNT) {
    patch.gains = new Array(BAND_COUNT).fill(0);
  }
  if (Object.keys(patch).length) await chrome.storage.sync.set(patch);
});
