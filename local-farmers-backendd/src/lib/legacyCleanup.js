const fs = require('fs/promises');
const path = require('path');

const LEGACY_FILES = [
  'users.json',
  'vendors.json',
  'products.json',
  'markets.json',
  'sessions.json',
  'chats.json',
  'cache/soil.json',
  'cache/usda_markets.json',
  'cache/usda_news.json',
  'cache/faostat.json',
  'cache/pexels.json',
];

let didRun = false;

const purgeLegacyState = async () => {
  if (didRun) {
    return [];
  }
  didRun = true;

  const dataRoot = path.resolve(__dirname, '..', '..', '..', 'data');
  const removed = [];

  await Promise.all(
    LEGACY_FILES.map(async (relativePath) => {
      const targetPath = path.join(dataRoot, relativePath);
      try {
        await fs.access(targetPath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return;
        }
        throw error;
      }

      await fs.rm(targetPath, { force: true });
      removed.push(relativePath);
    }),
  );

  return removed;
};

module.exports = {
  purgeLegacyState,
};
