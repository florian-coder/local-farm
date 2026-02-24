const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const { paths } = require('../lib/dataPaths');
const { readJson, updateJson } = require('../lib/fileStore');
const { requireVendor } = require('../middleware/auth');
const { getProductImage } = require('../lib/productMedia');

const uploadDir = path.join(__dirname, '../../public/uploads');

const ensureUploadDir = () => {
  fs.mkdirSync(uploadDir, { recursive: true });
};

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

const shouldFetchStockImage = (image) => {
  if (!image?.url) {
    return true;
  }
  if (image?.source === 'upload' || isLocalUpload(image)) {
    return false;
  }
  return !image?.photoUrl || !image?.photographer;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  },
});

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

router.post('/upload-image', requireVendor, (req, res) => {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      console.error('Unknown upload error:', err);
      return res.status(500).json({ error: `Server error: ${err.message}` });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    return res.json({ imageUrl });
  });
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
        if (!shouldFetchStockImage(product.image)) {
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

    const responseProducts = hydratedProducts.map((product) => ({
      ...product,
      image: normalizeUploadImage(req, product.image),
    }));

    return res.json({ products: responseProducts });
  } catch (error) {
    return next(error);
  }
});

router.post('/products', requireVendor, async (req, res, next) => {
  try {
    const { name, category, unit, available, rating, isBio, price, type, imageUrl } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required.' });
    }
    const ratingValue = Number(rating);
    if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res
        .status(400)
        .json({ error: 'rating must be between 1 and 5.' });
    }

    const priceValue = Number(price);
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      return res.status(400).json({ error: 'price must be a positive number.' });
    }

    const vendorsData = await readJson(paths.vendors, { vendors: [] });
    const vendor = vendorsData.vendors.find((entry) => entry.userId === req.user.id);
    if (!vendor) {
      return res.status(400).json({ error: 'Vendor profile is required.' });
    }

    let image = null;
    if (imageUrl) {
      image = {
        url: imageUrl,
        alt: `${name} photo`,
        source: 'upload',
      };
    } else {
      image = await getProductImage(name);
    }

    const product = {
      id: crypto.randomUUID(),
      vendorId: vendor.id,
      name,
      category: category || 'fruits_and_vegetables',
      type: type || '',
      unit: unit || 'unit',
      price: priceValue,
      rating: Number(ratingValue.toFixed(1)),
      available: available !== false,
      isBio: Boolean(isBio),
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
