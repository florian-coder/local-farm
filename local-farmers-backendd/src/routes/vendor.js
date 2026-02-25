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
const MAX_PROFILE_IMAGES = 10;

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

const normalizeText = (value, maxLength = 180) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, maxLength);
};

const toRelativeUploadUrl = (url) => {
  if (typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('/uploads/')) {
    return trimmed;
  }
  if (trimmed.startsWith('uploads/')) {
    return `/${trimmed}`;
  }
  const uploadsIndex = trimmed.indexOf('/uploads/');
  if (uploadsIndex !== -1) {
    return trimmed.slice(uploadsIndex);
  }
  return null;
};

const normalizeFarmImages = (images) => {
  if (!Array.isArray(images)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  for (const entry of images) {
    const relativeUrl = toRelativeUploadUrl(entry);
    if (!relativeUrl || seen.has(relativeUrl)) {
      continue;
    }
    seen.add(relativeUrl);
    normalized.push(relativeUrl);
    if (normalized.length >= MAX_PROFILE_IMAGES) {
      break;
    }
  }
  return normalized;
};

const normalizeVendorForResponse = (req, vendor) => {
  if (!vendor) {
    return null;
  }

  const farmImages = normalizeFarmImages(vendor.farmImages).map((url) =>
    toAbsoluteUploadUrl(req, url),
  );

  return {
    ...vendor,
    farmImages,
  };
};

router.get('/profile', requireVendor, async (req, res, next) => {
  try {
    const data = await readJson(paths.vendors, { vendors: [] });
    const vendor = data.vendors.find((entry) => entry.userId === req.user.id) || null;
    return res.json({ vendor: normalizeVendorForResponse(req, vendor) });
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

router.post('/upload-farm-images', requireVendor, (req, res) => {
  upload.array('photos', MAX_PROFILE_IMAGES)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      console.error('Unknown upload error:', err);
      return res.status(500).json({ error: `Server error: ${err.message}` });
    }

    if (!Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded.' });
    }

    const images = req.files
      .map((file) => `/uploads/${file.filename}`)
      .slice(0, MAX_PROFILE_IMAGES);
    return res.json({ images });
  });
});

router.post('/profile', requireVendor, async (req, res, next) => {
  try {
    const {
      farmName,
      displayName,
      streetAddress,
      streetNumber,
      county,
      city,
      phoneNumber,
      email,
      organicCertificate,
      deliveryRadiusKm,
      bio,
      farmImages,
    } = req.body || {};

    if (typeof farmName !== 'string' || !farmName.trim()) {
      return res.status(400).json({ error: 'farmName is required.' });
    }

    if (
      farmImages !== undefined &&
      farmImages !== null &&
      !Array.isArray(farmImages)
    ) {
      return res
        .status(400)
        .json({ error: 'farmImages must be an array of upload URLs.' });
    }
    if (Array.isArray(farmImages) && farmImages.length > MAX_PROFILE_IMAGES) {
      return res.status(400).json({
        error: `farmImages can contain at most ${MAX_PROFILE_IMAGES} images.`,
      });
    }

    const farmNameValue = normalizeText(farmName, 120);
    const displayNameValue = normalizeText(displayName, 120);
    const streetAddressValue = normalizeText(streetAddress, 180);
    const streetNumberValue = normalizeText(streetNumber, 40);
    const countyValue = normalizeText(county, 120);
    const cityValue = normalizeText(city, 120);
    const phoneNumberValue = normalizeText(phoneNumber, 40);
    const emailValue = normalizeText(email, 180);
    const organicCertificateValue = normalizeText(organicCertificate, 180);
    const bioValue = normalizeText(bio, 800);
    const deliveryRadiusValue = toNumberOrNull(deliveryRadiusKm);
    const shouldValidateDeliveryRadius =
      deliveryRadiusKm !== undefined &&
      deliveryRadiusKm !== null &&
      deliveryRadiusKm !== '';
    if (
      shouldValidateDeliveryRadius &&
      (deliveryRadiusValue === null || deliveryRadiusValue < 0)
    ) {
      return res
        .status(400)
        .json({ error: 'deliveryRadiusKm must be a positive number.' });
    }
    const normalizedFarmImages = normalizeFarmImages(farmImages);

    const vendor = await updateJson(paths.vendors, { vendors: [] }, (data) => {
      const vendors = Array.isArray(data.vendors) ? data.vendors : [];
      const existing = vendors.find((entry) => entry.userId === req.user.id);
      const now = new Date().toISOString();

      if (existing) {
        const updated = {
          ...existing,
          farmName: farmNameValue,
          displayName:
            displayName === undefined
              ? existing.displayName || req.user.username
              : displayNameValue || existing.displayName || req.user.username,
          streetAddress:
            streetAddress === undefined
              ? existing.streetAddress || ''
              : streetAddressValue,
          streetNumber:
            streetNumber === undefined
              ? existing.streetNumber || ''
              : streetNumberValue,
          county: county === undefined ? existing.county || '' : countyValue,
          city: city === undefined ? existing.city || '' : cityValue,
          phoneNumber:
            phoneNumber === undefined
              ? existing.phoneNumber || ''
              : phoneNumberValue,
          email: email === undefined ? existing.email || '' : emailValue,
          organicCertificate:
            organicCertificate === undefined
              ? existing.organicCertificate || ''
              : organicCertificateValue,
          deliveryRadiusKm:
            deliveryRadiusKm === undefined
              ? toNumberOrNull(existing.deliveryRadiusKm)
              : deliveryRadiusValue,
          farmImages:
            farmImages === undefined
              ? normalizeFarmImages(existing.farmImages)
              : normalizedFarmImages,
          bio: bio === undefined ? existing.bio || '' : bioValue,
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
        farmName: farmNameValue,
        displayName: displayNameValue || req.user.username,
        streetAddress: streetAddressValue,
        streetNumber: streetNumberValue,
        county: countyValue,
        city: cityValue,
        phoneNumber: phoneNumberValue,
        email: emailValue,
        organicCertificate: organicCertificateValue,
        deliveryRadiusKm: deliveryRadiusValue,
        farmImages: normalizedFarmImages,
        bio: bioValue,
        createdAt: now,
      };
      vendors.push(created);
      return { data: { vendors }, result: created };
    });

    return res.json({ vendor: normalizeVendorForResponse(req, vendor) });
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
