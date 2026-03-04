const crypto = require('crypto');

const ADMIN_COOKIE_NAME = 'lf_admin_session';
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'user';
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || 'EmIqvVBOORxseKNX';
const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  process.env.SESSION_SECRET ||
  'local-farmers-admin-secret';

const base64UrlEncode = (value) =>
  Buffer.from(value, 'utf8').toString('base64url');
const base64UrlDecode = (value) =>
  Buffer.from(value, 'base64url').toString('utf8');

const signValue = (value) =>
  crypto
    .createHmac('sha256', ADMIN_SESSION_SECRET)
    .update(value)
    .digest('base64url');

const createAdminSessionToken = () => {
  const payload = {
    username: ADMIN_USERNAME,
    exp: Date.now() + ADMIN_SESSION_TTL_MS,
  };

  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signature = signValue(payloadSegment);
  return `${payloadSegment}.${signature}`;
};

const getAdminSession = (token) => {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }

  const [payloadSegment, signature] = token.split('.');
  if (!payloadSegment || !signature) {
    return null;
  }

  const expectedSignature = signValue(payloadSegment);
  const expectedBuffer = Buffer.from(expectedSignature);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    const payloadRaw = base64UrlDecode(payloadSegment);
    const payload = JSON.parse(payloadRaw);
    if (!payload?.username || !payload?.exp) {
      return null;
    }
    if (payload.username !== ADMIN_USERNAME) {
      return null;
    }
    if (Date.now() >= Number(payload.exp)) {
      return null;
    }

    return {
      username: payload.username,
      expiresAt: new Date(Number(payload.exp)).toISOString(),
    };
  } catch (_error) {
    return null;
  }
};

const requireAdmin = (req, res, next) => {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  const session = getAdminSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.admin = session;
  return next();
};

module.exports = {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_TTL_MS,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  createAdminSessionToken,
  getAdminSession,
  requireAdmin,
};
