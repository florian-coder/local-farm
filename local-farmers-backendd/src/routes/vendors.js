const express = require('express');

const { paths } = require('../lib/dataPaths');
const { readJson } = require('../lib/fileStore');

const router = express.Router();

const isLocalUpload = (image) => {
  const url = image?.url;
  return (
    typeof url === 'string' &&
    (url.startsWith('/uploads') ||
      url.startsWith('uploads/') ||
      url.includes('/uploads/'))
  );
};

const toAbsoluteUploadUrl = (req, url) => {
  if (typeof url !== 'string') {
    return url;
  }
  if (!url.startsWith('/uploads') && !url.startsWith('uploads/')) {
    return url;
  }
  const base = `${req.protocol}://${req.get('host')}`;
  const normalized = url.startsWith('/') ? url : `/${url}`;
  return `${base}${normalized}`;
};

const normalizeUploadImage = (req, image) => {
  if (!image?.url || !isLocalUpload(image)) {
    return image;
  }
  const normalizedUrl = toAbsoluteUploadUrl(req, image.url);
  return {
    ...image,
    url: normalizedUrl,
    photoUrl: image.photoUrl
      ? toAbsoluteUploadUrl(req, image.photoUrl)
      : image.photoUrl,
    source: image.source || 'upload',
  };
};

const normalizeFarmImages = (req, farmImages) => {
  if (!Array.isArray(farmImages)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  for (const imageUrl of farmImages) {
    if (typeof imageUrl !== 'string') {
      continue;
    }
    const trimmed = imageUrl.trim();
    if (!trimmed) {
      continue;
    }
    const relative = trimmed.includes('/uploads/')
      ? trimmed.slice(trimmed.indexOf('/uploads/'))
      : trimmed.startsWith('uploads/')
        ? `/${trimmed}`
        : trimmed;
    if (seen.has(relative)) {
      continue;
    }
    seen.add(relative);
    normalized.push(toAbsoluteUploadUrl(req, relative));
    if (normalized.length >= 10) {
      break;
    }
  }
  return normalized;
};

const toTimestamp = (value) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const toPublicVendor = (req, vendor) => ({
  id: vendor.id,
  farmName: vendor.farmName || '',
  displayName: vendor.displayName || '',
  streetAddress: vendor.streetAddress || '',
  streetNumber: vendor.streetNumber || '',
  county: vendor.county || '',
  city: vendor.city || '',
  phoneNumber: vendor.phoneNumber || '',
  deliveryRadiusKm:
    typeof vendor.deliveryRadiusKm === 'number' &&
    Number.isFinite(vendor.deliveryRadiusKm)
      ? vendor.deliveryRadiusKm
      : null,
  bio: vendor.bio || '',
  farmImages: normalizeFarmImages(req, vendor.farmImages),
});

router.get('/', async (req, res, next) => {
  try {
    const vendorsData = await readJson(paths.vendors, { vendors: [] });
    const vendors = Array.isArray(vendorsData.vendors) ? vendorsData.vendors : [];
    const productsData = await readJson(paths.products, { products: [] });
    const products = Array.isArray(productsData.products)
      ? productsData.products
      : [];

    const productCountByVendor = new Map();
    const ratingStatsByVendor = new Map();
    for (const product of products) {
      if (!product?.vendorId) {
        continue;
      }
      const current = productCountByVendor.get(product.vendorId) || 0;
      productCountByVendor.set(product.vendorId, current + 1);

      const rating = Number(product.rating);
      if (Number.isFinite(rating)) {
        const stats = ratingStatsByVendor.get(product.vendorId) || {
          sum: 0,
          count: 0,
        };
        stats.sum += rating;
        stats.count += 1;
        ratingStatsByVendor.set(product.vendorId, stats);
      }
    }

    const list = vendors
      .map((vendor) => {
        const ratingStats = ratingStatsByVendor.get(vendor.id);
        const vendorRating =
          ratingStats && ratingStats.count > 0
            ? Number((ratingStats.sum / ratingStats.count).toFixed(1))
            : null;

        return {
          ...toPublicVendor(req, vendor),
          productCount: productCountByVendor.get(vendor.id) || 0,
          vendorRating,
        };
      })
      .sort((a, b) =>
        (a.farmName || a.displayName || '').localeCompare(
          b.farmName || b.displayName || '',
          undefined,
          { sensitivity: 'base' },
        ),
      );

    return res.json({ vendors: list });
  } catch (error) {
    return next(error);
  }
});

router.get('/:vendorId', async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    if (!vendorId) {
      return res.status(400).json({ error: 'vendorId is required.' });
    }

    const vendorsData = await readJson(paths.vendors, { vendors: [] });
    const vendors = Array.isArray(vendorsData.vendors) ? vendorsData.vendors : [];
    const vendor = vendors.find((entry) => entry.id === vendorId);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor profile not found.' });
    }

    const productsData = await readJson(paths.products, { products: [] });
    const products = Array.isArray(productsData.products)
      ? productsData.products
      : [];
    const vendorProducts = products
      .filter((product) => product.vendorId === vendor.id)
      .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
      .map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        type: product.type || '',
        unit: product.unit || 'unit',
        price: Number.isFinite(product.price) ? product.price : null,
        rating: Number.isFinite(product.rating) ? product.rating : null,
        available: product.available !== false,
        isBio: Boolean(product.isBio),
        image: normalizeUploadImage(req, product.image || null),
      }));

    return res.json({
      vendor: toPublicVendor(req, vendor),
      products: vendorProducts,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
