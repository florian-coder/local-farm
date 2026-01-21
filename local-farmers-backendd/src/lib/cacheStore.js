const { updateJson } = require('./fileStore');

const normalizeEntries = (data) => {
  if (!data || !Array.isArray(data.entries)) {
    return [];
  }
  return data.entries;
};

const pruneExpired = (entries, now) =>
  entries.filter((entry) => {
    if (!entry || !entry.expiresAt) {
      return false;
    }
    const expiresAt = new Date(entry.expiresAt).getTime();
    if (Number.isNaN(expiresAt)) {
      return false;
    }
    return expiresAt > now;
  });

const getCacheEntry = async (cachePath, key) =>
  updateJson(cachePath, { entries: [] }, (data) => {
    const now = Date.now();
    const entries = normalizeEntries(data);
    const activeEntries = pruneExpired(entries, now);
    const hit = activeEntries.find((entry) => entry.key === key);

    return {
      data: { entries: activeEntries },
      result: hit ? hit.value : null,
    };
  });

const setCacheEntry = async (cachePath, key, value, ttlMs) =>
  updateJson(cachePath, { entries: [] }, (data) => {
    const now = Date.now();
    const entries = normalizeEntries(data);
    const activeEntries = pruneExpired(entries, now).filter(
      (entry) => entry.key !== key,
    );

    activeEntries.push({
      key,
      value,
      expiresAt: new Date(now + ttlMs).toISOString(),
    });

    return {
      data: { entries: activeEntries },
      result: value,
    };
  });

const getOrSetCache = async (cachePath, key, ttlMs, fetcher) => {
  const cached = await getCacheEntry(cachePath, key);
  if (cached !== null && cached !== undefined) {
    return { value: cached, source: 'cache' };
  }

  const value = await fetcher();
  if (value !== null && value !== undefined) {
    await setCacheEntry(cachePath, key, value, ttlMs);
  }

  return { value, source: 'fresh' };
};

module.exports = {
  getCacheEntry,
  setCacheEntry,
  getOrSetCache,
};
