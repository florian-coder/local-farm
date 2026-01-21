const crypto = require('crypto');
const { promisify } = require('util');

const { updateJson } = require('./fileStore');
const { paths } = require('./dataPaths');

const scryptAsync = promisify(crypto.scrypt);

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_COOKIE_NAME = 'lf_session';

const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
};

const verifyPassword = async (password, storedHash) => {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) {
    return false;
  }
  const derivedKey = await scryptAsync(password, salt, 64);
  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== derivedKey.length) {
    return false;
  }
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
};

const createSession = async (user) => {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const session = {
    id: crypto.randomUUID(),
    token,
    userId: user.id,
    role: user.role,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  };

  await updateJson(paths.sessions, { sessions: [] }, (data) => {
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const activeSessions = sessions.filter((entry) => {
      const expiresAt = new Date(entry.expiresAt).getTime();
      return Number.isFinite(expiresAt) && expiresAt > Date.now();
    });

    activeSessions.push(session);

    return {
      data: { sessions: activeSessions },
      result: session,
    };
  });

  return session;
};

const getSession = async (token) => {
  if (!token) {
    return null;
  }

  return updateJson(paths.sessions, { sessions: [] }, (data) => {
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const now = Date.now();
    const activeSessions = sessions.filter((entry) => {
      const expiresAt = new Date(entry.expiresAt).getTime();
      return Number.isFinite(expiresAt) && expiresAt > now;
    });

    const session = activeSessions.find((entry) => entry.token === token) || null;

    return {
      data: { sessions: activeSessions },
      result: session,
    };
  });
};

const revokeSession = async (token) => {
  if (!token) {
    return null;
  }

  return updateJson(paths.sessions, { sessions: [] }, (data) => {
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const nextSessions = sessions.filter((entry) => entry.token !== token);
    return {
      data: { sessions: nextSessions },
      result: null,
    };
  });
};

module.exports = {
  SESSION_TTL_MS,
  SESSION_COOKIE_NAME,
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  revokeSession,
};
