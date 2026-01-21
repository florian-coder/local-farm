const { getSession, SESSION_COOKIE_NAME } = require('../lib/auth');
const { readJson } = require('../lib/fileStore');
const { paths } = require('../lib/dataPaths');

const getUserFromRequest = async (req) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const session = await getSession(token);
  if (!session) {
    return null;
  }

  const usersData = await readJson(paths.users, { users: [] });
  return usersData.users.find((user) => user.id === session.userId) || null;
};

const requireAuth = async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
};

const requireVendor = async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (user.role !== 'vendor') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getUserFromRequest,
  requireAuth,
  requireVendor,
};
