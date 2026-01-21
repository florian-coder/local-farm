const path = require('path');

const resolveDataDir = () => {
  const envDir = process.env.DATA_DIR || process.env.LF_DATA_DIR;
  if (!envDir) {
    return path.resolve(__dirname, '..', '..', '..', 'data');
  }
  return path.isAbsolute(envDir) ? envDir : path.resolve(process.cwd(), envDir);
};

const DATA_DIR = resolveDataDir();
const CACHE_DIR = path.join(DATA_DIR, 'cache');

const paths = {
  users: path.join(DATA_DIR, 'users.json'),
  vendors: path.join(DATA_DIR, 'vendors.json'),
  products: path.join(DATA_DIR, 'products.json'),
  markets: path.join(DATA_DIR, 'markets.json'),
  sessions: path.join(DATA_DIR, 'sessions.json'),
  cache: {
    soil: path.join(CACHE_DIR, 'soil.json'),
    usdaMarkets: path.join(CACHE_DIR, 'usda_markets.json'),
    usdaNews: path.join(CACHE_DIR, 'usda_news.json'),
    faostat: path.join(CACHE_DIR, 'faostat.json'),
    pexels: path.join(CACHE_DIR, 'pexels.json'),
  },
};

module.exports = {
  DATA_DIR,
  CACHE_DIR,
  paths,
};
