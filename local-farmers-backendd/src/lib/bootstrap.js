const fs = require('fs/promises');

const { paths, DATA_DIR, CACHE_DIR } = require('./dataPaths');
const { writeJson } = require('./fileStore');

const ensureFile = async (filePath, defaultData) => {
  try {
    await fs.access(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    await writeJson(filePath, defaultData);
  }
};

const bootstrapData = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });

  await ensureFile(paths.users, { users: [] });
  await ensureFile(paths.vendors, { vendors: [] });
  await ensureFile(paths.products, { products: [] });
  await ensureFile(paths.sessions, { sessions: [] });
  await ensureFile(paths.markets, {
    markets: [
      {
        id: 'm1',
        name: 'Central Market',
        lat: 44.4268,
        lng: 26.1025,
        pickupPoints: 3,
        openStands: 12,
        activeGrowers: 48,
      },
    ],
  });

  await ensureFile(paths.cache.soil, { entries: [] });
  await ensureFile(paths.cache.usdaMarkets, { entries: [] });
  await ensureFile(paths.cache.usdaNews, { entries: [] });
  await ensureFile(paths.cache.faostat, { entries: [] });
  await ensureFile(paths.cache.pexels, { entries: [] });
};

module.exports = {
  bootstrapData,
};
