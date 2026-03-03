const inMemoryCache = new Map();

const resolveStore = (cachePath) => {
  const key = cachePath || '__default__';
  let store = inMemoryCache.get(key);
  if (!store) {
    store = new Map();
    inMemoryCache.set(key, store);
  }
  return store;
};

const pruneStore = (store, now) => {
  for (const [key, entry] of store.entries()) {
    if (!entry || typeof entry.expiresAt !== 'number' || entry.expiresAt <= now) {
      store.delete(key);
    }
  }
};

const getCacheEntry = async (cachePath, key) => {
  const store = resolveStore(cachePath);
  const now = Date.now();
  pruneStore(store, now);

  const entry = store.get(key);
  return entry ? entry.value : null;
};

const setCacheEntry = async (cachePath, key, value, ttlMs) => {
  const store = resolveStore(cachePath);
  const now = Date.now();
  const safeTtl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 0;
  store.set(key, {
    value,
    expiresAt: now + safeTtl,
  });
  return value;
};

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
  inMemoryCache,
  getCacheEntry,
  setCacheEntry,
  getOrSetCache,
};
