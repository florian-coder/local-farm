const express = require('express');

const { paths } = require('../lib/dataPaths');
const { readJson, updateJson } = require('../lib/fileStore');
const { getOrSetCache } = require('../lib/cacheStore');
const { fetchSoilGrids } = require('../lib/external/soilgrids');
const { fetchUsdaMarketNews } = require('../lib/external/usdaMyMarketNews');
const { fetchFaostat } = require('../lib/external/faostat');
const { getProductImage } = require('../lib/productMedia');

const router = express.Router();

const TOP_COMMODITIES = ['tomatoes', 'potatoes', 'apples'];
const MAX_PRODUCT_DISTANCE_KM = 60;
const NEWS_IMAGE_QUERY = {
  tomatoes: 'tomatoes',
  potatoes: 'potatoes',
  apples: 'apples',
};

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const toRadians = (value) => (value * Math.PI) / 180;

const distanceKm = (lat1, lng1, lat2, lng2) => {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

router.get('/', async (req, res, next) => {
  try {
    const marketsData = await readJson(paths.markets, { markets: [] });
    const markets = Array.isArray(marketsData.markets) ? marketsData.markets : [];
    const vendorsData = await readJson(paths.vendors, { vendors: [] });
    const productsData = await readJson(paths.products, { products: [] });

    const vendors = Array.isArray(vendorsData.vendors) ? vendorsData.vendors : [];
    const products = Array.isArray(productsData.products)
      ? productsData.products
      : [];
    const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
    const productsWithVendors = products.map((product) => {
      const vendor = vendorsById.get(product.vendorId) || null;
      return {
        id: product.id,
        name: product.name,
        category: product.category,
        unit: product.unit,
        available: product.available,
        rating: product.rating ?? null,
        image: product.image ?? null,
        vendor: vendor
          ? {
              id: vendor.id,
              farmName: vendor.farmName,
              displayName: vendor.displayName,
              lat: vendor.lat,
              lng: vendor.lng,
            }
          : null,
        };
      });

    const imageUpdates = new Map();
    const hydratedProducts = await Promise.all(
      productsWithVendors.map(async (product) => {
        const needsImage =
          !product.image?.url ||
          !product.image?.photoUrl ||
          !product.image?.photographer;
        if (!needsImage) {
          return product;
        }
        const image = await getProductImage(product.name);
        if (image) {
          imageUpdates.set(product.id, image);
          return { ...product, image };
        }
        return product;
      }),
    );

    if (imageUpdates.size > 0) {
      await updateJson(paths.products, { products: [] }, (data) => {
        const allProducts = Array.isArray(data.products) ? data.products : [];
        const nextProducts = allProducts.map((entry) =>
          imageUpdates.has(entry.id)
            ? { ...entry, image: imageUpdates.get(entry.id) }
            : entry,
        );
        return { data: { products: nextProducts }, result: null };
      });
    }

    const marketNews = await Promise.all(
      TOP_COMMODITIES.map(async (commodity) => {
        const key = `commodity:${commodity}`;
        const { value } = await getOrSetCache(
          paths.cache.usdaNews,
          key,
          1000 * 60 * 60 * 6,
          () => fetchUsdaMarketNews({ commodity }),
        );
        return value;
      }),
    );

    const marketNewsWithImages = await Promise.all(
      marketNews.map(async (newsItem) => {
        if (!newsItem) {
          return null;
        }
        const commodityName =
          typeof newsItem.commodity === 'string'
            ? newsItem.commodity.toLowerCase()
            : '';
        const query =
          NEWS_IMAGE_QUERY[commodityName] ||
          newsItem.commodity ||
          'legume proaspete';
        const image = await getProductImage(query);
        return { ...newsItem, image };
      }),
    );

    const faostatKey = 'item:Tomatoes|country:Romania';
    const { value: globalStats } = await getOrSetCache(
      paths.cache.faostat,
      faostatKey,
      1000 * 60 * 60 * 24 * 30,
      () => fetchFaostat({ item: 'Tomatoes', country: 'Romania' }),
    );

    const enriched = await Promise.all(
      markets.map(async (market) => {
        let soil = null;
        if (typeof market.lat === 'number' && typeof market.lng === 'number') {
          const soilKey = `soil:${market.lat},${market.lng}`;
          const soilResult = await getOrSetCache(
            paths.cache.soil,
            soilKey,
            1000 * 60 * 60 * 24 * 7,
            () => fetchSoilGrids(market.lat, market.lng),
          );
          soil = soilResult.value;
        }

        const marketHasCoords = isNumber(market.lat) && isNumber(market.lng);
        const locationProducts = hydratedProducts.filter((product) => {
          if (!marketHasCoords) {
            return true;
          }
          const vendorLat = product.vendor?.lat;
          const vendorLng = product.vendor?.lng;
          if (!isNumber(vendorLat) || !isNumber(vendorLng)) {
            return true;
          }
          return (
            distanceKm(market.lat, market.lng, vendorLat, vendorLng) <=
            MAX_PRODUCT_DISTANCE_KM
          );
        });
        const marketProducts =
          locationProducts.length > 0 ? locationProducts : hydratedProducts;

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
          products: marketProducts.slice(0, 6),
        };
      }),
    );

    return res.json({ markets: enriched });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
