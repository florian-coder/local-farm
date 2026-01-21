const express = require('express');

const { paths } = require('../lib/dataPaths');
const { getCacheEntry, getOrSetCache, setCacheEntry } = require('../lib/cacheStore');
const { fetchSoilGrids } = require('../lib/external/soilgrids');
const { fetchUsdaMarkets } = require('../lib/external/usdaLocalFood');
const { fetchUsdaMarketNews } = require('../lib/external/usdaMyMarketNews');
const { fetchFaostat } = require('../lib/external/faostat');
const { fetchPexels } = require('../lib/external/pexels');
const { getProductImage } = require('../lib/productMedia');

const router = express.Router();

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

router.get('/soilgrids', async (req, res, next) => {
  try {
    const lat = toNumber(req.query.lat);
    const lng = toNumber(req.query.lng);
    if (lat === null || lng === null) {
      return res.status(400).json({ error: 'lat and lng are required.' });
    }

    const key = `soil:${lat},${lng}`;
    const { value } = await getOrSetCache(
      paths.cache.soil,
      key,
      1000 * 60 * 60 * 24 * 7,
      () => fetchSoilGrids(lat, lng),
    );

    return res.json(value);
  } catch (error) {
    return next(error);
  }
});

router.get('/usda-markets', async (req, res, next) => {
  try {
    const { zip, location } = req.query;
    const lat = toNumber(req.query.lat);
    const lng = toNumber(req.query.lng);
    const locationZip =
      typeof location === 'string' ? location.replace(/\D/g, '') : '';
    const resolvedZip = zip || (locationZip.length >= 5 ? locationZip : null);

    if (!resolvedZip && !(lat !== null && lng !== null)) {
      return res
        .status(400)
        .json({ error: 'zip or lat/lng is required.' });
    }

    const key = resolvedZip ? `zip:${resolvedZip}` : `coords:${lat},${lng}`;

    const { value } = await getOrSetCache(
      paths.cache.usdaMarkets,
      key,
      1000 * 60 * 60 * 24,
      () =>
        fetchUsdaMarkets({
          zip: resolvedZip,
          lat: lat || null,
          lng: lng || null,
        }),
    );

    return res.json(value);
  } catch (error) {
    return next(error);
  }
});

router.get('/usda-news', async (req, res, next) => {
  try {
    const commodity = req.query.commodity;
    if (!commodity) {
      return res.status(400).json({ error: 'commodity is required.' });
    }

    const key = `commodity:${commodity}`;
    const { value } = await getOrSetCache(
      paths.cache.usdaNews,
      key,
      1000 * 60 * 60 * 6,
      () => fetchUsdaMarketNews({ commodity }),
    );

    return res.json(value);
  } catch (error) {
    return next(error);
  }
});

router.get('/faostat', async (req, res, next) => {
  try {
    const item = req.query.item;
    const country = req.query.country;
    if (!item || !country) {
      return res.status(400).json({ error: 'item and country are required.' });
    }

    const key = `item:${item}|country:${country}`;
    const { value } = await getOrSetCache(
      paths.cache.faostat,
      key,
      1000 * 60 * 60 * 24 * 30,
      () => fetchFaostat({ item, country }),
    );

    return res.json(value);
  } catch (error) {
    return next(error);
  }
});

router.get('/pexels', async (req, res, next) => {
  try {
    const query = req.query.q || 'farmers market';
    const perPage = Number(req.query.per_page || 1);
    const safePerPage = Number.isFinite(perPage) && perPage > 0 ? perPage : 1;

    const key = `pexels:${query}:${safePerPage}`;
    const cached = await getCacheEntry(paths.cache.pexels, key);
    if (cached?.photos?.length) {
      return res.json(cached);
    }

    const fresh = await fetchPexels({ query, perPage: safePerPage, locale: 'ro-RO' });
    if (fresh?.photos?.length) {
      await setCacheEntry(
        paths.cache.pexels,
        key,
        fresh,
        1000 * 60 * 60 * 24,
      );
    }

    return res.json(fresh);
  } catch (error) {
    return next(error);
  }
});

router.get('/product-image', async (req, res, next) => {
  try {
    const name = req.query.name;
    if (!name) {
      return res.status(400).json({ error: 'name is required.' });
    }

    const image = await getProductImage(name);
    return res.json({ name, image });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
