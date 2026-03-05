const express = require('express');

const { getOrSetCache } = require('../lib/cacheStore');
const { fetchSoilGrids } = require('../lib/external/soilgrids');
const { fetchUsdaMarketNews } = require('../lib/external/usdaMyMarketNews');
const { fetchFaostat } = require('../lib/external/faostat');
const { getProductImage } = require('../lib/productMedia');
const { supabase, TABLES } = require('../lib/supabase');
const { DEFAULT_MARKETS, mapProductToApi } = require('../lib/domain');

const router = express.Router();

const TOP_COMMODITIES = ['tomatoes', 'potatoes', 'apples'];
const MARKET_PRODUCTS_LIMIT = 6;
const NEWS_IMAGE_QUERY = {
  tomatoes: 'tomatoes',
  potatoes: 'potatoes',
  apples: 'apples',
};

const PRODUCT_COLUMNS = [
  'id',
  'farmer_id',
  '"product name"',
  'category',
  'type',
  'Unit',
  'Price',
  '"photo url"',
  '"bio check"',
  'available',
  'instant_buy',
].join(', ');

const FARMER_COLUMNS = [
  'id',
  '"farm name"',
  '"display name"',
  'city',
  'county',
].join(', ');

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const sortProductsByNewest = (products) =>
  products
    .slice()
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

const loadProducts = async (category) => {
  let query = supabase.from(TABLES.products).select(PRODUCT_COLUMNS);
  if (category) {
    query = query.eq('category', category);
  }

  const [productsResult, farmersResult] = await Promise.all([
    query,
    supabase.from(TABLES.farmers).select(FARMER_COLUMNS),
  ]);

  if (productsResult.error) {
    throw new Error(productsResult.error.message || 'Unable to load products.');
  }
  if (farmersResult.error) {
    throw new Error(farmersResult.error.message || 'Unable to load farmers.');
  }

  const farmersById = new Map(
    (farmersResult.data || []).map((farmer) => [
      String(farmer.id),
      {
        id: String(farmer.id),
        farmName: farmer['farm name'] || '',
        displayName: farmer['display name'] || '',
        city: farmer.city || '',
        county: farmer.county || '',
      },
    ]),
  );

  return Promise.all(
    (productsResult.data || []).map(async (product) => {
      const vendor = farmersById.get(String(product.farmer_id)) || null;
      const mapped = mapProductToApi(product, vendor);
      if (!mapped.image?.url) {
        const fallback = await getProductImage(mapped.name);
        if (fallback?.url) {
          return {
            ...mapped,
            image: fallback,
          };
        }
      }
      return mapped;
    }),
  );
};

const loadMarketNews = async () => {
  const marketNews = await Promise.all(
    TOP_COMMODITIES.map(async (commodity) => {
      const key = `commodity:${commodity}`;
      const { value } = await getOrSetCache(
        'markets-usda-news',
        key,
        1000 * 60 * 60 * 6,
        () => fetchUsdaMarketNews({ commodity }),
      );
      return value;
    }),
  );

  return Promise.all(
    marketNews.map(async (newsItem) => {
      if (!newsItem) {
        return null;
      }
      const commodityName =
        typeof newsItem.commodity === 'string'
          ? newsItem.commodity.toLowerCase()
          : '';
      const query =
        NEWS_IMAGE_QUERY[commodityName] || newsItem.commodity || 'fresh vegetables';
      const image = await getProductImage(query);
      return { ...newsItem, image };
    }),
  );
};

const loadGlobalStats = async () => {
  const faostatKey = 'item:Tomatoes|country:Romania';
  const { value: globalStats } = await getOrSetCache(
    'markets-faostat',
    faostatKey,
    1000 * 60 * 60 * 24 * 30,
    () => fetchFaostat({ item: 'Tomatoes', country: 'Romania' }),
  );
  return globalStats;
};

const buildMarketResponse = async (category) => {
  const [products, marketNewsWithImages, globalStats] = await Promise.all([
    loadProducts(category),
    loadMarketNews(),
    loadGlobalStats(),
  ]);

  const sortedProducts = sortProductsByNewest(products);
  const markets = await Promise.all(
    DEFAULT_MARKETS.map(async (market) => {
      let soil = null;
      if (isNumber(market.lat) && isNumber(market.lng)) {
        const soilKey = `soil:${market.lat},${market.lng}`;
        const soilResult = await getOrSetCache(
          'markets-soil',
          soilKey,
          1000 * 60 * 60 * 24 * 7,
          () => fetchSoilGrids(market.lat, market.lng),
        );
        soil = soilResult.value;
      }

      return {
        id: market.id,
        name: market.name,
        openStands: market.openStands,
        activeGrowers: market.activeGrowers,
        pickupPoints: market.pickupPoints,
        soil: soil
          ? {
              ph: soil.ph,
              organicCarbon: soil.organicCarbon,
              qualityScore: soil.qualityScore,
            }
          : null,
        marketNews: marketNewsWithImages.filter(Boolean).slice(0, 3),
        globalStats,
        products: sortedProducts.slice(0, MARKET_PRODUCTS_LIMIT),
      };
    }),
  );

  return markets;
};

router.get('/', async (_req, res, next) => {
  try {
    const markets = await buildMarketResponse(null);
    return res.json({ markets });
  } catch (error) {
    return next(error);
  }
});

router.get('/:category', async (req, res, next) => {
  try {
    const { category } = req.params;
    const markets = await buildMarketResponse(category);
    return res.json({ markets });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
