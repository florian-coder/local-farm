const express = require('express');

const {
  hashPassword,
  verifyPassword,
  createSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  revokeSession,
} = require('../lib/auth');
const { getUserFromRequest } = require('../middleware/auth');
const { supabase, TABLES } = require('../lib/supabase');
const { mapDbUserToApi, normalizeText, toDbUserType } = require('../lib/domain');

const router = express.Router();

const normalizeUsername = (username) => normalizeText(username, 32).toLowerCase();

const isValidRole = (role) => role === 'customer' || role === 'vendor';

const createRoleProfile = async ({ userId, role, username }) => {
  if (role === 'vendor') {
    const { error } = await supabase.from(TABLES.farmers).insert({
      id: userId,
      'farm name': `${username} Farm`,
      'display name': username,
      'street address': '',
      'street number': '',
      city: '',
      county: '',
      'phone number': '',
      email: '',
      'organic operator certificate': '',
      'delivery radius': 0,
      bio: '',
    });
    return error;
  }

  const { error } = await supabase.from(TABLES.customers).insert({
    id: userId,
    name: '',
    surname: '',
    'address street': '',
    'address number': '',
    'phone number': '',
    city: '',
    county: '',
    country: '',
  });
  return error;
};

router.post('/signup', async (req, res, next) => {
  try {
    const { username, password, role, email } = req.body || {};
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
    const normalizedEmail =
      typeof email === 'string' && email.trim()
        ? email.trim().toLowerCase()
        : `${normalized}@localfarmers.app`;

    const { data: existingUser, error: existingUserError } = await supabase
      .from(TABLES.users)
      .select('id')
      .eq('username', normalized)
      .maybeSingle();
    if (existingUserError) {
      return res.status(500).json({ error: 'Unable to verify existing user.' });
    }
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    const { data: insertedUser, error: insertError } = await supabase
      .from(TABLES.users)
      .insert({
        username: normalized,
        email: normalizedEmail,
        password: passwordHash,
        user_type: toDbUserType(role),
      })
      .select('id, username, user_type')
      .single();

    if (insertError) {
      if (
        typeof insertError.message === 'string' &&
        insertError.message.toLowerCase().includes('row-level security')
      ) {
        return res.status(500).json({
          error:
            'Supabase RLS blocked writes to users. Configure SUPABASE_SERVICE_ROLE_KEY on the backend.',
        });
      }
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'Username already exists.' });
      }
      return res.status(500).json({ error: insertError.message || 'Signup failed.' });
    }

    const profileError = await createRoleProfile({
      userId: insertedUser.id,
      role,
      username: normalized,
    });
    if (profileError) {
      await supabase.from(TABLES.users).delete().eq('id', insertedUser.id);
      return res.status(500).json({
        error:
          profileError.message ||
          'Account created but role profile initialization failed.',
      });
    }

    return res.status(201).json(mapDbUserToApi(insertedUser));
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

    const normalized = normalizeUsername(username);
    const { data: user, error } = await supabase
      .from(TABLES.users)
      .select('id, username, password, user_type')
      .eq('username', normalized)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const apiUser = mapDbUserToApi(user);
    const session = await createSession(apiUser);
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      maxAge: SESSION_TTL_MS,
      path: '/',
    });

    return res.json(apiUser);
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
