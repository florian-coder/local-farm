const express = require('express');
const crypto = require('crypto');

const { paths } = require('../lib/dataPaths');
const { readJson, updateJson } = require('../lib/fileStore');
const { requireVendor } = require('../middleware/auth');
const { getProductImage } = require('../lib/productMedia');

const router = express.Router();

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

router.get('/profile', requireVendor, async (req, res, next) => {
  try {
    const data = await readJson(paths.vendors, { vendors: [] });
    const vendor = data.vendors.find((entry) => entry.userId === req.user.id) || null;
    return res.json({ vendor });
  } catch (error) {
    return next(error);
  }
});

router.post('/profile', requireVendor, async (req, res, next) => {
  try {
    const { farmName, displayName, lat, lng, bio } = req.body || {};
    if (!farmName || typeof farmName !== 'string') {
      return res.status(400).json({ error: 'farmName is required.' });
    }

    const latValue = toNumberOrNull(lat);
    const lngValue = toNumberOrNull(lng);

    const vendor = await updateJson(paths.vendors, { vendors: [] }, (data) => {
      const vendors = Array.isArray(data.vendors) ? data.vendors : [];
      const existing = vendors.find((entry) => entry.userId === req.user.id);
      const now = new Date().toISOString();

      if (existing) {
        const updated = {
          ...existing,
          farmName,
          displayName: displayName || existing.displayName,
          lat: latValue ?? existing.lat,
          lng: lngValue ?? existing.lng,
          bio: bio ?? existing.bio,
          updatedAt: now,
        };
        const nextVendors = vendors.map((entry) =>
          entry.userId === req.user.id ? updated : entry,
        );
        return { data: { vendors: nextVendors }, result: updated };
      }

      const created = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        farmName,
        displayName: displayName || req.user.username,
        lat: latValue,
        lng: lngValue,
        bio: bio || '',
        createdAt: now,
      };
      vendors.push(created);
      return { data: { vendors }, result: created };
    });

    return res.json({ vendor });
  } catch (error) {
    return next(error);
  }
});

router.get('/products', requireVendor, async (req, res, next) => {
  try {
    const vendorsData = await readJson(paths.vendors, { vendors: [] });
    const vendor = vendorsData.vendors.find((entry) => entry.userId === req.user.id);
    if (!vendor) {
      return res.json({ products: [] });
    }

    const productsData = await readJson(paths.products, { products: [] });
    const products = productsData.products.filter(
      (product) => product.vendorId === vendor.id,
    );
    const imageUpdates = new Map();
    const hydratedProducts = await Promise.all(
      products.map(async (product) => {
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

    return res.json({ products: hydratedProducts });
  } catch (error) {
    return next(error);
  }
});

router.post('/products', requireVendor, async (req, res, next) => {
  try {
    const { name, category, unit, available, rating } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required.' });
    }
    const ratingValue = Number(rating);
    if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res
        .status(400)
        .json({ error: 'rating must be between 1 and 5.' });
    }

    const vendorsData = await readJson(paths.vendors, { vendors: [] });
    const vendor = vendorsData.vendors.find((entry) => entry.userId === req.user.id);
    if (!vendor) {
      return res.status(400).json({ error: 'Vendor profile is required.' });
    }

    const image = await getProductImage(name);
    const product = {
      id: crypto.randomUUID(),
      vendorId: vendor.id,
      name,
      category: category || 'general',
      unit: unit || 'unit',
      rating: Number(ratingValue.toFixed(1)),
      available: available !== false,
      image,
      createdAt: new Date().toISOString(),
    };

    await updateJson(paths.products, { products: [] }, (data) => {
      const products = Array.isArray(data.products) ? data.products : [];
      products.push(product);
      return { data: { products }, result: product };
    });

    return res.status(201).json({ product });
  } catch (error) {
    return next(error);
  }
});

router.delete('/products/:productId', requireVendor, async (req, res, next) => {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({ error: 'productId is required.' });
    }

    const vendorsData = await readJson(paths.vendors, { vendors: [] });
    const vendor = vendorsData.vendors.find((entry) => entry.userId === req.user.id);
    if (!vendor) {
      return res.status(400).json({ error: 'Vendor profile is required.' });
    }

    const deletedProduct = await updateJson(paths.products, { products: [] }, (data) => {
      const products = Array.isArray(data.products) ? data.products : [];
      const index = products.findIndex(
        (product) => product.id === productId && product.vendorId === vendor.id,
      );
      if (index === -1) {
        return { data, result: null };
      }
      const [removed] = products.splice(index, 1);
      return { data: { products }, result: removed };
    });

    if (!deletedProduct) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    return res.json({ product: deletedProduct });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
