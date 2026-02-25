const express = require('express');

const { paths } = require('../lib/dataPaths');
const { readJson, updateJson } = require('../lib/fileStore');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const normalizeText = (value, maxLength = 120) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, maxLength);
};

const toCustomerProfile = (user) => ({
  firstName: user?.firstName || '',
  lastName: user?.lastName || '',
  streetAddress: user?.streetAddress || '',
  streetNumber: user?.streetNumber || '',
  phoneNumber: user?.phoneNumber || '',
  email: user?.email || '',
  city: user?.city || '',
  country: user?.country || '',
  county: user?.county || '',
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const usersData = await readJson(paths.users, { users: [] });
    const user = usersData.users.find((entry) => entry.id === req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({
      role: user.role,
      username: user.username,
      profile: toCustomerProfile(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        error: 'Customer profile updates are only available for customer accounts.',
      });
    }

    const {
      firstName,
      lastName,
      streetAddress,
      streetNumber,
      phoneNumber,
      email,
      city,
      country,
      county,
    } = req.body || {};

    const nextProfile = {
      firstName: normalizeText(firstName, 120),
      lastName: normalizeText(lastName, 120),
      streetAddress: normalizeText(streetAddress, 180),
      streetNumber: normalizeText(streetNumber, 40),
      phoneNumber: normalizeText(phoneNumber, 40),
      email: normalizeText(email, 180),
      city: normalizeText(city, 120),
      country: normalizeText(country, 120),
      county: normalizeText(county, 120),
    };

    const missingFields = Object.entries(nextProfile)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(', ')}.`,
      });
    }

    const updatedUser = await updateJson(paths.users, { users: [] }, (data) => {
      const users = Array.isArray(data.users) ? data.users : [];
      const index = users.findIndex((entry) => entry.id === req.user.id);
      if (index === -1) {
        return { data, result: null };
      }

      const nextUser = {
        ...users[index],
        ...nextProfile,
        updatedAt: new Date().toISOString(),
      };
      users[index] = nextUser;
      return { data: { users }, result: nextUser };
    });

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({
      role: updatedUser.role,
      username: updatedUser.username,
      profile: toCustomerProfile(updatedUser),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
