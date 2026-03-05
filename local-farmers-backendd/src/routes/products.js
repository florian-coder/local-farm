const express = require('express');

const { supabase, TABLES } = require('../lib/supabase');
const { mapProductToApi } = require('../lib/domain');

const router = express.Router();

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
  'instant_buy',
].join(', ');

const FARMER_COLUMNS = [
  'id',
  '"farm name"',
  '"display name"',
  'city',
  'county',
].join(', ');

router.get('/', async (_req, res, next) => {
  try {
    const [productsResult, farmersResult] = await Promise.all([
      supabase.from(TABLES.products).select(PRODUCT_COLUMNS),
      supabase.from(TABLES.farmers).select(FARMER_COLUMNS),
    ]);

    if (productsResult.error) {
      return res.status(500).json({ error: productsResult.error.message });
    }
    if (farmersResult.error) {
      return res.status(500).json({ error: farmersResult.error.message });
    }

    const farmersById = new Map(
      (farmersResult.data || []).map((farmer) => [
        String(farmer.id),
        {
          id: String(farmer.id),
          farmName: farmer['farm name'] || '',
          displayName: farmer['display name'] || '',
          city: farmer.city || '',
          county: farmer.county || '',
        },
      ]),
    );

    const products = (productsResult.data || []).map((product) => {
      const vendor = farmersById.get(String(product.farmer_id)) || null;
      return mapProductToApi(product, vendor);
    });

    return res.json({ products });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
