const express = require('express');

const { requireAuth } = require('../middleware/auth');
const { supabase, TABLES } = require('../lib/supabase');
const { normalizeText } = require('../lib/domain');

const router = express.Router();

const toCustomerProfile = (customer, user) => ({
  firstName: customer?.name || '',
  lastName: customer?.surname || '',
  streetAddress: customer?.['address street'] || '',
  streetNumber: customer?.['address number'] || '',
  phoneNumber: customer?.['phone number'] || '',
  email: user?.email || '',
  city: customer?.city || '',
  country: customer?.country || '',
  county: customer?.county || '',
});

const upsertCustomerRecord = async (userId, profile) => {
  const payload = {
    id: userId,
    name: profile.firstName,
    surname: profile.lastName,
    'address street': profile.streetAddress,
    'address number': profile.streetNumber,
    'phone number': profile.phoneNumber,
    city: profile.city,
    county: profile.county,
    country: profile.country,
  };

  const { data: existingCustomer, error: lookupError } = await supabase
    .from(TABLES.customers)
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message || 'Unable to load customer profile.');
  }

  if (existingCustomer?.id) {
    const { error: updateError } = await supabase
      .from(TABLES.customers)
      .update(payload)
      .eq('id', existingCustomer.id);
    if (updateError) {
      throw new Error(updateError.message || 'Unable to update customer profile.');
    }
    return;
  }

  const { error: insertError } = await supabase
    .from(TABLES.customers)
    .insert(payload);
  if (insertError) {
    throw new Error(insertError.message || 'Unable to create customer profile.');
  }
};

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data: user, error: userError } = await supabase
      .from(TABLES.users)
      .select('id, username, email, user_type')
      .eq('id', req.user.id)
      .maybeSingle();
    if (userError || !user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const { data: customer, error: customerError } = await supabase
      .from(TABLES.customers)
      .select(
        'id, name, surname, "address street", "address number", "phone number", city, county, country',
      )
      .eq('id', user.id)
      .maybeSingle();

    if (customerError && customerError.code !== 'PGRST116') {
      return res.status(500).json({ error: customerError.message });
    }

    return res.json({
      role: req.user.role,
      username: user.username || '',
      profile: toCustomerProfile(customer, user),
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
      city,
      county,
      country,
      email,
    } = req.body || {};

    const nextProfile = {
      firstName: normalizeText(firstName, 120),
      lastName: normalizeText(lastName, 120),
      streetAddress: normalizeText(streetAddress, 220),
      streetNumber: normalizeText(streetNumber, 60),
      phoneNumber: normalizeText(phoneNumber, 40),
      city: normalizeText(city, 120),
      county: normalizeText(county, 120),
      country: normalizeText(country, 120),
      email: normalizeText(email, 180),
    };

    const missingFields = Object.entries(nextProfile)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(', ')}.`,
      });
    }

    await upsertCustomerRecord(req.user.id, nextProfile);

    const { error: userUpdateError } = await supabase
      .from(TABLES.users)
      .update({ email: nextProfile.email })
      .eq('id', req.user.id);
    if (userUpdateError) {
      return res.status(500).json({ error: userUpdateError.message });
    }

    return res.json({
      role: 'customer',
      username: req.user.username,
      profile: {
        ...toCustomerProfile(
          {
            name: nextProfile.firstName,
            surname: nextProfile.lastName,
            'address street': nextProfile.streetAddress,
            'address number': nextProfile.streetNumber,
            'phone number': nextProfile.phoneNumber,
            city: nextProfile.city,
            county: nextProfile.county,
            country: nextProfile.country,
          },
          { email: nextProfile.email },
        ),
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
