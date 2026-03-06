const express = require('express');

const { getOrSetCache } = require('../lib/cacheStore');
const { fetchSoilGrids } = require('../lib/external/soilgrids');
const { fetchUsdaMarketNews } = require('../lib/external/usdaMyMarketNews');
const { fetchFaostat } = require('../lib/external/faostat');
const { getProductImage } = require('../lib/productMedia');
const { supabase, TABLES } = require('../lib/supabase');
const { DEFAULT_MARKETS, mapProductToApi } = require('../lib/domain');
const {
  CATEGORY_CONFIG,
  normalizeCategory,
  buildMonthlyWinners,
} = require('../lib/farmerRanking');

const router = express.Router();

const TOP_COMMODITIES = ['tomatoes', 'potatoes', 'apples'];
const MARKET_PRODUCTS_LIMIT = 6;
const DAILY_RECOMMENDATION_LIMIT = 4;
const COMPLETED_ORDER_STATES = [
  'received_by_farmer',
  'preparing_order',
  'in_transit',
  'arrived',
  'received',
];
const MONTH_PARAM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
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
  'quantity',
  'Price',
  'rating',
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
const resolveArray = (value) => (Array.isArray(value) ? value : []);
const normalizeId = (value) =>
  value === null || value === undefined ? '' : String(value).trim();
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};
const roundMoney = (value) => Number(toNumber(value, 0).toFixed(2));

const sortProductsByNewest = (products) =>
  products
    .slice()
    .sort((a, b) => {
      const leftId = toNumber(a.id, 0);
      const rightId = toNumber(b.id, 0);
      if (rightId !== leftId) {
        return rightId - leftId;
      }
      return String(b.id || '').localeCompare(String(a.id || ''));
    });

const loadProducts = async (category, options = {}) => {
  const { withImageFallback = true } = options;
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
    resolveArray(productsResult.data).map(async (product) => {
      const vendor = farmersById.get(String(product.farmer_id)) || null;
      const mapped = mapProductToApi(product, vendor);
      if (withImageFallback && !mapped.image?.url) {
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

const resolveMonthRange = (rawMonth) => {
  const now = new Date();
  let year = now.getUTCFullYear();
  let monthIndex = now.getUTCMonth();

  if (typeof rawMonth === 'string' && rawMonth.trim()) {
    const [yearPart, monthPart] = rawMonth.split('-');
    year = Number(yearPart);
    monthIndex = Number(monthPart) - 1;
  }

  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  const month = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

  return {
    month,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
};

const toRecommendationEntry = (product) => ({
  id: product.id,
  name: product.name,
  price: roundMoney(product.price),
  unit: product.unit || 'unit',
  isBio: Boolean(product.isBio),
  vendorName: product.vendor?.farmName || product.vendor?.displayName || 'Local farmer',
  image: product.image?.url
    ? {
        url: product.image.url,
        alt: product.image.alt || `${product.name || 'Product'} image`,
      }
    : null,
});

const loadDailyRecommendations = async () => {
  const rows = await Promise.all(
    CATEGORY_CONFIG.map(async ({ key, label }) => {
      const products = await loadProducts(key, { withImageFallback: false });
      const recommendedProducts = sortProductsByNewest(products)
        .filter((product) => Boolean(product.available))
        .slice(0, DAILY_RECOMMENDATION_LIMIT)
        .map(toRecommendationEntry);

      return [
        key,
        {
          category: key,
          label,
          products: recommendedProducts,
        },
      ];
    }),
  );

  return Object.fromEntries(rows);
};

const loadFarmerMetadataById = async (farmerIds) => {
  const safeFarmerIds = [...new Set(resolveArray(farmerIds).map(normalizeId).filter(Boolean))];
  if (safeFarmerIds.length === 0) {
    return new Map();
  }

  const [{ data: farmers, error: farmersError }, { data: photos, error: photosError }] =
    await Promise.all([
      supabase
        .from(TABLES.farmers)
        .select('id, "display name", "farm name"')
        .in('id', safeFarmerIds),
      supabase
        .from(TABLES.farmPhotos)
        .select('id, farmer_id, image_url, is_cover')
        .in('farmer_id', safeFarmerIds)
        .order('is_cover', { ascending: false })
        .order('id', { ascending: true }),
    ]);

  if (farmersError) {
    throw new Error(farmersError.message || 'Unable to load farmers for ranking.');
  }
  if (photosError) {
    throw new Error(photosError.message || 'Unable to load farm photos for ranking.');
  }

  const metadataById = new Map();
  for (const farmer of resolveArray(farmers)) {
    const farmerId = normalizeId(farmer.id);
    if (!farmerId) {
      continue;
    }
    metadataById.set(farmerId, {
      farmerName: farmer['display name'] || '',
      farmName: farmer['farm name'] || '',
      photoUrl: null,
    });
  }

  for (const photo of resolveArray(photos)) {
    const farmerId = normalizeId(photo.farmer_id);
    if (!farmerId || !photo.image_url) {
      continue;
    }
    const existing = metadataById.get(farmerId) || {
      farmerName: '',
      farmName: '',
      photoUrl: null,
    };
    if (!existing.photoUrl) {
      existing.photoUrl = photo.image_url;
      metadataById.set(farmerId, existing);
    }
  }

  return metadataById;
};

const loadFarmerOfMonth = async ({ month, startIso, endIso }) => {
  const { data: orders, error: ordersError } = await supabase
    .from(TABLES.orders)
    .select('id, farmer_id, order_state, created_at')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .in('order_state', COMPLETED_ORDER_STATES);

  if (ordersError) {
    throw new Error(ordersError.message || 'Unable to load monthly orders.');
  }

  const safeOrders = resolveArray(orders);
  const orderIds = [...new Set(safeOrders.map((entry) => normalizeId(entry.id)).filter(Boolean))];
  const farmerIds = [
    ...new Set(safeOrders.map((entry) => normalizeId(entry.farmer_id)).filter(Boolean)),
  ];

  if (orderIds.length === 0) {
    return {
      month,
      ...buildMonthlyWinners([]),
    };
  }

  const [{ data: orderItems, error: orderItemsError }, farmerMetadataById] =
    await Promise.all([
      supabase
        .from(TABLES.orderItems)
        .select('order_id, product_id, quantity, line_total')
        .in('order_id', orderIds),
      loadFarmerMetadataById(farmerIds),
    ]);

  if (orderItemsError) {
    throw new Error(orderItemsError.message || 'Unable to load monthly order items.');
  }

  const safeOrderItems = resolveArray(orderItems);
  if (safeOrderItems.length === 0) {
    return {
      month,
      ...buildMonthlyWinners([]),
    };
  }

  const productIds = [
    ...new Set(safeOrderItems.map((entry) => normalizeId(entry.product_id)).filter(Boolean)),
  ];

  let productCategories = [];
  if (productIds.length > 0) {
    const { data: products, error: productsError } = await supabase
      .from(TABLES.products)
      .select('id, category')
      .in('id', productIds);

    if (productsError) {
      throw new Error(productsError.message || 'Unable to load product categories.');
    }
    productCategories = resolveArray(products);
  }

  const categoryByProductId = new Map(
    productCategories.map((entry) => [
      normalizeId(entry.id),
      normalizeCategory(entry.category),
    ]),
  );

  const ordersById = new Map(
    safeOrders.map((entry) => [normalizeId(entry.id), { ...entry, farmerId: normalizeId(entry.farmer_id) }]),
  );

  const groupedPerformance = new Map();

  for (const item of safeOrderItems) {
    const orderId = normalizeId(item.order_id);
    const order = ordersById.get(orderId);
    if (!order) {
      continue;
    }

    const category = categoryByProductId.get(normalizeId(item.product_id));
    if (!category) {
      continue;
    }

    const farmerId = normalizeId(order.farmerId);
    if (!farmerId) {
      continue;
    }

    const key = `${category}:${farmerId}`;
    const farmerMetadata = farmerMetadataById.get(farmerId) || {
      farmerName: '',
      farmName: '',
      photoUrl: null,
    };
    const existing = groupedPerformance.get(key) || {
      category,
      farmerId,
      farmerName: farmerMetadata.farmerName,
      farmName: farmerMetadata.farmName,
      photoUrl: farmerMetadata.photoUrl,
      revenue: 0,
      quantity: 0,
      orderIds: new Set(),
    };

    existing.revenue += Math.max(0, toNumber(item.line_total, 0));
    existing.quantity += Math.max(0, toNumber(item.quantity, 0));
    existing.orderIds.add(orderId);
    if (!existing.photoUrl && farmerMetadata.photoUrl) {
      existing.photoUrl = farmerMetadata.photoUrl;
    }
    groupedPerformance.set(key, existing);
  }

  const performanceRows = Array.from(groupedPerformance.values()).map((entry) => ({
    category: entry.category,
    farmerId: entry.farmerId,
    farmerName: entry.farmerName,
    farmName: entry.farmName,
    photoUrl: entry.photoUrl,
    revenue: entry.revenue,
    quantity: entry.quantity,
    orderCount: entry.orderIds.size,
  }));

  return {
    month,
    ...buildMonthlyWinners(performanceRows),
  };
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

router.get('/home-insights', async (req, res, next) => {
  try {
    const monthQuery = typeof req.query.month === 'string' ? req.query.month.trim() : '';
    if (monthQuery && !MONTH_PARAM_PATTERN.test(monthQuery)) {
      return res
        .status(400)
        .json({ error: 'Invalid month format. Use YYYY-MM, for example 2026-03.' });
    }

    const monthRange = resolveMonthRange(monthQuery || undefined);
    const [dailyRecommendations, farmerOfMonth] = await Promise.all([
      loadDailyRecommendations(),
      loadFarmerOfMonth(monthRange),
    ]);

    return res.json({
      generatedAt: new Date().toISOString(),
      dailyRecommendations,
      farmerOfMonth,
    });
  } catch (error) {
    return next(error);
  }
});

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
