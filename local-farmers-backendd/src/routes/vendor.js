const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');

const { requireVendor } = require('../middleware/auth');
const { supabase, TABLES, BUCKET_ALIASES } = require('../lib/supabase');
const {
  mapFarmerToVendor,
  mapProductToApi,
  normalizeText,
  toIntFlag,
  toNumberOrNull,
} = require('../lib/domain');

const router = express.Router();

const MAX_PROFILE_IMAGES = 10;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
  },
});

const FARMER_COLUMNS = [
  'id',
  '"farm name"',
  '"display name"',
  '"street address"',
  '"street number"',
  'city',
  'county',
  '"phone number"',
  'email',
  '"organic operator certificate"',
  '"delivery radius"',
  'bio',
].join(', ');

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
].join(', ');

const normalizePublicUrls = (images) => {
  if (!Array.isArray(images)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  for (const entry of images) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
    if (normalized.length >= MAX_PROFILE_IMAGES) {
      break;
    }
  }
  return normalized;
};

const fetchUserRow = async (userId) => {
  const { data: user, error } = await supabase
    .from(TABLES.users)
    .select('id, username, email')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Unable to load user.');
  }
  return user || null;
};

const fetchFarmerByUserId = async (userId) => {
  const { data: farmer, error } = await supabase
    .from(TABLES.farmers)
    .select(FARMER_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message || 'Unable to load farmer profile.');
  }
  return farmer || null;
};

const createDefaultFarmer = async (user) => {
  const username = normalizeText(user?.username || 'Farmer', 120) || 'Farmer';
  const payload = {
    id: user.id,
    'farm name': `${username} Farm`,
    'display name': username,
    'street address': '',
    'street number': '',
    city: '',
    county: '',
    'phone number': '',
    email: user?.email || '',
    'organic operator certificate': '',
    'delivery radius': 0,
    bio: '',
  };

  const { data: farmer, error } = await supabase
    .from(TABLES.farmers)
    .insert(payload)
    .select(FARMER_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message || 'Unable to create farmer profile.');
  }
  return farmer;
};

const ensureFarmerForUser = async (user) => {
  const existing = await fetchFarmerByUserId(user.id);
  if (existing) {
    return existing;
  }
  return createDefaultFarmer(user);
};

const fetchFarmPhotos = async (farmerId) => {
  const { data: photos, error } = await supabase
    .from(TABLES.farmPhotos)
    .select('id, farmer_id, image_url, caption, is_cover')
    .eq('farmer_id', farmerId)
    .order('is_cover', { ascending: false })
    .order('id', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Unable to load farm gallery.');
  }
  return Array.isArray(photos) ? photos : [];
};

const syncFarmPhotos = async (farmerId, imageUrls) => {
  const { error: deleteError } = await supabase
    .from(TABLES.farmPhotos)
    .delete()
    .eq('farmer_id', farmerId);
  if (deleteError) {
    throw new Error(deleteError.message || 'Unable to replace farm photos.');
  }

  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return;
  }

  const rows = imageUrls.map((url, index) => ({
    farmer_id: farmerId,
    image_url: url,
    caption: '',
    is_cover: index === 0,
  }));

  const { error: insertError } = await supabase
    .from(TABLES.farmPhotos)
    .insert(rows);
  if (insertError) {
    throw new Error(insertError.message || 'Unable to save farm photos.');
  }
};

const getFileExtension = (file) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext) {
    return ext;
  }
  if (file.mimetype === 'image/png') {
    return '.png';
  }
  if (file.mimetype === 'image/webp') {
    return '.webp';
  }
  return '.jpg';
};

const isBucketNotFoundError = (error) => {
  const message =
    typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return message.includes('bucket not found');
};

const uploadToBucket = async ({ bucketNames, uploadPath, file }) => {
  for (const bucket of bucketNames) {
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(uploadPath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      if (isBucketNotFoundError(uploadError)) {
        continue;
      }
      throw new Error(uploadError.message || 'Upload failed.');
    }

    const { data: publicData } = supabase.storage
      .from(bucket)
      .getPublicUrl(uploadPath);
    if (!publicData?.publicUrl) {
      throw new Error('Could not resolve public URL for uploaded image.');
    }
    return publicData.publicUrl;
  }

  throw new Error(
    `Bucket not found. Tried: ${bucketNames.join(', ')}`,
  );
};

const resolveVendorResponse = async (farmer, userEmail) => {
  const farmPhotos = await fetchFarmPhotos(farmer.id);
  return mapFarmerToVendor(farmer, {
    email: userEmail,
    farmPhotos,
  });
};

router.get('/profile', requireVendor, async (req, res, next) => {
  try {
    const userRow = await fetchUserRow(req.user.id);
    const farmer = await fetchFarmerByUserId(req.user.id);
    if (!farmer) {
      return res.json({ vendor: null });
    }

    const vendor = await resolveVendorResponse(farmer, userRow?.email || '');
    return res.json({ vendor });
  } catch (error) {
    return next(error);
  }
});

router.post('/upload-image', requireVendor, (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    try {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      if (err) {
        return res.status(500).json({ error: `Server error: ${err.message}` });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }

      const farmer = await ensureFarmerForUser(req.user);
      const fileName = `${crypto.randomUUID()}${getFileExtension(req.file)}`;
      const uploadPath = `${farmer.id}/products/${fileName}`;
      const publicUrl = await uploadToBucket({
        bucketNames: BUCKET_ALIASES.productPhotos,
        uploadPath,
        file: req.file,
      });

      return res.json({ imageUrl: publicUrl });
    } catch (uploadError) {
      return res.status(500).json({ error: uploadError.message || 'Upload failed.' });
    }
  });
});

router.post('/upload-farm-images', requireVendor, (req, res) => {
  upload.array('photos', MAX_PROFILE_IMAGES)(req, res, async (err) => {
    try {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      if (err) {
        return res.status(500).json({ error: `Server error: ${err.message}` });
      }
      if (!Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ error: 'No images uploaded.' });
      }

      const farmer = await ensureFarmerForUser(req.user);
      const urls = [];
      for (const file of req.files.slice(0, MAX_PROFILE_IMAGES)) {
        const fileName = `${crypto.randomUUID()}${getFileExtension(file)}`;
        const uploadPath = `${farmer.id}/gallery/${fileName}`;
        const publicUrl = await uploadToBucket({
          bucketNames: BUCKET_ALIASES.farmPhotos,
          uploadPath,
          file,
        });
        urls.push(publicUrl);
      }

      return res.json({ images: urls });
    } catch (uploadError) {
      return res.status(500).json({ error: uploadError.message || 'Upload failed.' });
    }
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
    if (farmImages !== undefined && !Array.isArray(farmImages)) {
      return res.status(400).json({ error: 'farmImages must be an array of URLs.' });
    }

    const deliveryRadius = toNumberOrNull(deliveryRadiusKm);
    if (
      deliveryRadiusKm !== undefined &&
      deliveryRadiusKm !== null &&
      deliveryRadiusKm !== '' &&
      (deliveryRadius === null || deliveryRadius < 0)
    ) {
      return res.status(400).json({ error: 'deliveryRadiusKm must be a positive number.' });
    }

    const farmerPayload = {
      'farm name': normalizeText(farmName, 120),
      'display name':
        normalizeText(displayName, 120) || normalizeText(farmName, 120),
      'street address': normalizeText(streetAddress, 200),
      'street number': normalizeText(streetNumber, 40),
      county: normalizeText(county, 120),
      city: normalizeText(city, 120),
      'phone number': normalizeText(phoneNumber, 40),
      email: normalizeText(email, 180),
      'organic operator certificate': normalizeText(organicCertificate, 200),
      'delivery radius': deliveryRadius,
      bio: normalizeText(bio, 1000),
    };

    const existingFarmer = await fetchFarmerByUserId(req.user.id);
    let farmer = null;
    if (existingFarmer?.id) {
      const { data: updatedFarmer, error: updateError } = await supabase
        .from(TABLES.farmers)
        .update(farmerPayload)
        .eq('id', existingFarmer.id)
        .select(FARMER_COLUMNS)
        .single();
      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }
      farmer = updatedFarmer;
    } else {
      const { data: insertedFarmer, error: insertError } = await supabase
        .from(TABLES.farmers)
        .insert({
          id: req.user.id,
          ...farmerPayload,
        })
        .select(FARMER_COLUMNS)
        .single();
      if (insertError) {
        return res.status(500).json({ error: insertError.message });
      }
      farmer = insertedFarmer;
    }

    const normalizedEmail = normalizeText(email, 180);
    if (normalizedEmail) {
      const { error: userError } = await supabase
        .from(TABLES.users)
        .update({ email: normalizedEmail })
        .eq('id', req.user.id);
      if (userError) {
        return res.status(500).json({ error: userError.message });
      }
    }

    if (farmImages !== undefined) {
      const urls = normalizePublicUrls(farmImages);
      await syncFarmPhotos(farmer.id, urls);
    }

    const vendor = await resolveVendorResponse(farmer, normalizedEmail || req.user.email || '');
    return res.json({ vendor });
  } catch (error) {
    return next(error);
  }
});

router.get('/products', requireVendor, async (req, res, next) => {
  try {
    const farmer = await fetchFarmerByUserId(req.user.id);
    if (!farmer) {
      return res.json({ products: [] });
    }

    const { data: products, error } = await supabase
      .from(TABLES.products)
      .select(PRODUCT_COLUMNS)
      .eq('farmer_id', farmer.id)
      .order('id', { ascending: false });
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      products: (products || []).map((product) => mapProductToApi(product)),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/products', requireVendor, async (req, res, next) => {
  try {
    const { name, category, unit, available, rating, isBio, price, type, imageUrl } =
      req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required.' });
    }

    if (rating !== undefined) {
      const ratingValue = Number(rating);
      if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
        return res.status(400).json({ error: 'rating must be between 1 and 5.' });
      }
    }

    const priceValue = Number(price);
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      return res.status(400).json({ error: 'price must be a positive number.' });
    }

    const farmer = await fetchFarmerByUserId(req.user.id);
    if (!farmer) {
      return res.status(400).json({ error: 'Vendor profile is required.' });
    }

    const payload = {
      farmer_id: farmer.id,
      'product name': normalizeText(name, 180),
      category: normalizeText(category, 80) || 'fruits_and_vegetables',
      type: normalizeText(type, 80),
      Unit: normalizeText(unit, 40) || 'unit',
      Price: Number(priceValue.toFixed(2)),
      available: toIntFlag(available !== false),
      'bio check': toIntFlag(Boolean(isBio)),
      'photo url': typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null,
    };

    const { data: insertedProduct, error: insertError } = await supabase
      .from(TABLES.products)
      .insert(payload)
      .select(PRODUCT_COLUMNS)
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    return res.status(201).json({ product: mapProductToApi(insertedProduct) });
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

    const farmer = await fetchFarmerByUserId(req.user.id);
    if (!farmer) {
      return res.status(400).json({ error: 'Vendor profile is required.' });
    }

    const { data: deletedRows, error: deleteError } = await supabase
      .from(TABLES.products)
      .delete()
      .eq('id', productId)
      .eq('farmer_id', farmer.id)
      .select(PRODUCT_COLUMNS);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    const deletedProduct = Array.isArray(deletedRows) ? deletedRows[0] : null;
    if (!deletedProduct) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    return res.json({ product: mapProductToApi(deletedProduct) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
