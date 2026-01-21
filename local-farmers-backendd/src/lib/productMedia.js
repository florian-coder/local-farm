const { getCacheEntry, setCacheEntry } = require('./cacheStore');
const { paths } = require('./dataPaths');
const { fetchPexels } = require('./external/pexels');

const PRODUCT_IMAGE_TTL = 1000 * 60 * 60 * 24 * 7;

const normalizeName = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cleanQuery = (value) =>
  value
    .replace(/\d+/g, ' ')
    .replace(/\b(kg|g|gr|buc|bucati|pcs|piece|pieces|pack|box)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const resolveQueryPlan = (name) => {
  if (!name || typeof name !== 'string') {
    return [{ query: 'legume proaspete', locale: 'ro-RO' }];
  }

  const raw = name.trim();
  const normalized = normalizeName(raw);
  const cleaned = cleanQuery(normalized);
  const plan = [];

  if (raw) {
    plan.push({ query: raw, locale: 'ro-RO' });
  }
  if (normalized && normalized !== raw) {
    plan.push({ query: normalized, locale: 'ro-RO' });
  }
  if (cleaned && cleaned !== normalized) {
    plan.push({ query: cleaned, locale: 'ro-RO' });
  }

  plan.push({ query: 'legume proaspete', locale: 'ro-RO' });

  const seen = new Set();
  return plan.filter((entry) => {
    const key = `${entry.locale}:${entry.query}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const getCachedPexels = async (query, locale) => {
  const key = `pexels:product:${locale || 'default'}:${query}`;
  const cached = await getCacheEntry(paths.cache.pexels, key);
  if (cached?.photos?.length) {
    return cached.photos[0];
  }

  const fresh = await fetchPexels({ query, perPage: 1, locale });
  if (fresh?.photos?.length) {
    await setCacheEntry(paths.cache.pexels, key, fresh, PRODUCT_IMAGE_TTL);
    return fresh.photos[0];
  }

  return null;
};

const getProductImage = async (name) => {
  const plan = resolveQueryPlan(name);
  let photo = null;
  for (const step of plan) {
    photo = await getCachedPexels(step.query, step.locale);
    if (photo) {
      break;
    }
  }
  const url =
    photo?.src?.medium || photo?.src?.large || photo?.src?.landscape || null;
  if (!url) {
    return null;
  }

  return {
    url,
    alt: photo.alt || `${name} photo`,
    photographer: photo.photographer || null,
    photographerUrl: photo.photographer_url || null,
    photoUrl: photo.url || null,
  };
};

module.exports = {
  getProductImage,
};
