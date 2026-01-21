const express = require('express');

const { paths } = require('../lib/dataPaths');
const { readJson } = require('../lib/fileStore');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const productsData = await readJson(paths.products, { products: [] });
    const vendorsData = await readJson(paths.vendors, { vendors: [] });
    const vendorsById = new Map(
      vendorsData.vendors.map((vendor) => [vendor.id, vendor]),
    );

    const products = productsData.products.map((product) => {
      const vendor = vendorsById.get(product.vendorId);
      return {
        ...product,
        vendor: vendor
          ? {
              id: vendor.id,
              farmName: vendor.farmName,
              displayName: vendor.displayName,
              lat: vendor.lat,
              lng: vendor.lng,
            }
          : null,
      };
    });

    return res.json({ products });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
