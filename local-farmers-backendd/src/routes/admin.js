const express = require('express');

const { supabase, TABLES } = require('../lib/supabase');
const {
  ADMIN_COOKIE_NAME,
  ADMIN_PASSWORD,
  ADMIN_SESSION_TTL_MS,
  ADMIN_USERNAME,
  createAdminSessionToken,
  requireAdmin,
} = require('../middleware/adminAuth');

const router = express.Router();

const REQUEST_COLUMNS = [
  'id',
  'user_id',
  'farm_name',
  'display_name',
  'street_address',
  'street_number',
  'county',
  'city',
  'phone_number',
  'email',
  'organic_certificate',
  'delivery_radius_km',
  'bio',
  'farm_images',
  'status',
  'review_note',
  'reviewed_at',
  'reviewed_by',
  'created_at',
  'updated_at',
].join(', ');

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
  }
  return normalized;
};

const mapRequestMeta = (request, usersById) => {
  const user = usersById.get(String(request.user_id)) || null;
  return {
    id: String(request.id || ''),
    userId: String(request.user_id || ''),
    username: user?.username || '',
    status: request.status || 'pending',
    reviewNote: request.review_note || '',
    reviewedAt: request.reviewed_at || null,
    reviewedBy: request.reviewed_by || '',
    createdAt: request.created_at || null,
    updatedAt: request.updated_at || null,
    payload: {
      farmName: request.farm_name || '',
      displayName: request.display_name || request.farm_name || '',
      streetAddress: request.street_address || '',
      streetNumber: request.street_number || '',
      county: request.county || '',
      city: request.city || '',
      phoneNumber: request.phone_number || '',
      email: request.email || user?.email || '',
      organicCertificate: request.organic_certificate || '',
      deliveryRadiusKm:
        request.delivery_radius_km === null || request.delivery_radius_km === undefined
          ? null
          : Number(request.delivery_radius_km),
      bio: request.bio || '',
      farmImages: normalizePublicUrls(request.farm_images),
    },
  };
};

const fetchRequestById = async (requestId) => {
  const { data, error } = await supabase
    .from(TABLES.farmerRequests)
    .select(REQUEST_COLUMNS)
    .eq('id', requestId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Unable to load farmer request.');
  }
  return data || null;
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
  const { error: insertError } = await supabase.from(TABLES.farmPhotos).insert(rows);
  if (insertError) {
    throw new Error(insertError.message || 'Unable to save farm photos.');
  }
};

router.post('/login', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }

  const token = createAdminSessionToken();
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: ADMIN_SESSION_TTL_MS,
    path: '/',
  });

  return res.json({
    authenticated: true,
    username: ADMIN_USERNAME,
  });
});

router.get('/session', requireAdmin, (req, res) =>
  res.json({
    authenticated: true,
    username: req.admin.username,
    expiresAt: req.admin.expiresAt,
  }));

router.post('/logout', requireAdmin, (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
  return res.status(204).end();
});

router.get('/farmer-requests', requireAdmin, async (_req, res, next) => {
  try {
    const { data: requests, error: requestsError } = await supabase
      .from(TABLES.farmerRequests)
      .select(REQUEST_COLUMNS)
      .order('updated_at', { ascending: false });

    if (requestsError) {
      return res.status(500).json({ error: requestsError.message || 'Unable to load requests.' });
    }

    const userIds = Array.from(
      new Set((requests || []).map((entry) => String(entry.user_id)).filter(Boolean)),
    );
    const usersById = new Map();
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from(TABLES.users)
        .select('id, username, email')
        .in('id', userIds);
      if (usersError) {
        return res.status(500).json({ error: usersError.message || 'Unable to load users.' });
      }
      for (const user of users || []) {
        usersById.set(String(user.id), user);
      }
    }

    return res.json({
      requests: (requests || []).map((entry) => mapRequestMeta(entry, usersById)),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/farmer-requests/:requestId/approve', requireAdmin, async (req, res, next) => {
  try {
    const requestId = typeof req.params?.requestId === 'string' ? req.params.requestId.trim() : '';
    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required.' });
    }

    const request = await fetchRequestById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    const farmerPayload = {
      id: request.user_id,
      'farm name': request.farm_name || '',
      'display name': request.display_name || request.farm_name || '',
      'street address': request.street_address || '',
      'street number': request.street_number || '',
      county: request.county || '',
      city: request.city || '',
      'phone number': request.phone_number || '',
      email: request.email || '',
      'organic operator certificate': request.organic_certificate || '',
      'delivery radius': request.delivery_radius_km,
      bio: request.bio || '',
    };

    const { error: farmerError } = await supabase
      .from(TABLES.farmers)
      .upsert(farmerPayload, { onConflict: 'id' });
    if (farmerError) {
      return res.status(500).json({ error: farmerError.message || 'Unable to approve request.' });
    }

    await syncFarmPhotos(request.user_id, normalizePublicUrls(request.farm_images));

    if (request.email) {
      const { error: userEmailError } = await supabase
        .from(TABLES.users)
        .update({ email: request.email })
        .eq('id', request.user_id);
      if (userEmailError) {
        return res.status(500).json({ error: userEmailError.message || 'Unable to update email.' });
      }
    }

    const now = new Date().toISOString();
    const { data: updatedRequest, error: updateRequestError } = await supabase
      .from(TABLES.farmerRequests)
      .update({
        status: 'approved',
        review_note: '',
        reviewed_at: now,
        reviewed_by: req.admin.username,
      })
      .eq('id', requestId)
      .select(REQUEST_COLUMNS)
      .single();

    if (updateRequestError) {
      return res.status(500).json({ error: updateRequestError.message || 'Unable to update request status.' });
    }

    const { data: users } = await supabase
      .from(TABLES.users)
      .select('id, username, email')
      .eq('id', request.user_id)
      .limit(1);
    const usersById = new Map();
    for (const user of users || []) {
      usersById.set(String(user.id), user);
    }

    return res.json({
      request: mapRequestMeta(updatedRequest, usersById),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/farmer-requests/:requestId/reject', requireAdmin, async (req, res, next) => {
  try {
    const requestId = typeof req.params?.requestId === 'string' ? req.params.requestId.trim() : '';
    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required.' });
    }

    const request = await fetchRequestById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    const reviewNote =
      typeof req.body?.reviewNote === 'string' ? req.body.reviewNote.trim().slice(0, 1000) : '';
    if (!reviewNote) {
      return res.status(400).json({ error: 'reviewNote is required when rejecting a request.' });
    }

    const now = new Date().toISOString();
    const { data: updatedRequest, error: updateRequestError } = await supabase
      .from(TABLES.farmerRequests)
      .update({
        status: 'rejected',
        review_note: reviewNote,
        reviewed_at: now,
        reviewed_by: req.admin.username,
      })
      .eq('id', requestId)
      .select(REQUEST_COLUMNS)
      .single();

    if (updateRequestError) {
      return res.status(500).json({ error: updateRequestError.message || 'Unable to reject request.' });
    }

    const { data: users } = await supabase
      .from(TABLES.users)
      .select('id, username, email')
      .eq('id', request.user_id)
      .limit(1);
    const usersById = new Map();
    for (const user of users || []) {
      usersById.set(String(user.id), user);
    }

    return res.json({
      request: mapRequestMeta(updatedRequest, usersById),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
