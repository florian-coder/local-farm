const express = require('express');
const crypto = require('crypto');

const { paths } = require('../lib/dataPaths');
const { readJson, updateJson } = require('../lib/fileStore');
const {
  hashPassword,
  verifyPassword,
  createSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  revokeSession,
} = require('../lib/auth');
const { getUserFromRequest } = require('../middleware/auth');

const router = express.Router();

const normalizeUsername = (username) => username.trim();

const isValidRole = (role) => role === 'customer' || role === 'vendor';

router.post('/signup', async (req, res, next) => {
  try {
    const { username, password, role } = req.body || {};
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (!isValidRole(role)) {
      return res.status(400).json({ error: 'Role must be customer or vendor.' });
    }

    const normalized = normalizeUsername(username);
    if (normalized.length < 3 || normalized.length > 32) {
      return res.status(400).json({ error: 'Username must be 3-32 characters.' });
    }

    const passwordHash = await hashPassword(password);
    const user = {
      id: crypto.randomUUID(),
      username: normalized,
      passwordHash,
      role,
      createdAt: new Date().toISOString(),
    };

    const result = await updateJson(paths.users, { users: [] }, (data) => {
      const users = Array.isArray(data.users) ? data.users : [];
      const exists = users.some(
        (entry) => entry.username.toLowerCase() === normalized.toLowerCase(),
      );
      if (exists) {
        return { data, result: { error: 'Username already exists.' } };
      }
      users.push(user);
      return { data: { users }, result: { user } };
    });

    if (result?.error) {
      return res.status(409).json({ error: result.error });
    }

    return res.status(201).json({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const usersData = await readJson(paths.users, { users: [] });
    const user = usersData.users.find(
      (entry) => entry.username.toLowerCase() === username.toLowerCase(),
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const session = await createSession(user);
    res.cookie(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_MS,
      path: '/',
    });

    return res.json({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    return res.json({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (token) {
      await revokeSession(token);
    }

    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
