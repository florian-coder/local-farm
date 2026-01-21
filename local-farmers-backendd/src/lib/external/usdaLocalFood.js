const USDA_BASE = 'https://search.ams.usda.gov/farmersmarkets/v1/data.svc';

const parseMarketName = (marketname = '') => {
  const match = marketname.match(/^([0-9.]+)\s+(.*)$/);
  if (match) {
    return {
      name: match[2].trim(),
      distance: Number(match[1]),
    };
  }
  return { name: marketname.trim(), distance: null };
};

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`USDA markets error: ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
};

const fetchMarketDetail = async (id) => {
  if (!id) {
    return null;
  }
  const url = `${USDA_BASE}/mktDetail?id=${encodeURIComponent(id)}`;
  const payload = await fetchJson(url);
  return payload?.marketdetails || null;
};

const fetchUsdaMarkets = async ({ zip, lat, lng }) => {
  try {
    let url;
    if (zip) {
      url = `${USDA_BASE}/zipSearch?zip=${encodeURIComponent(zip)}`;
    } else if (lat && lng) {
      url = `${USDA_BASE}/locSearch?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(
        lng,
      )}`;
    } else {
      return { markets: [] };
    }

    const payload = await fetchJson(url);
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const trimmed = results.slice(0, 10);
    const details = await Promise.all(
      trimmed.map(async (market) => {
        const detail = await fetchMarketDetail(market.id).catch(() => null);
        const parsed = parseMarketName(market.marketname);

        return {
          id: market.id,
          name: parsed.name,
          distance: parsed.distance,
          address: detail?.Address || null,
        };
      }),
    );

    return { markets: details.filter((market) => market.name) };
  } catch (error) {
    return { markets: [] };
  }
};

module.exports = {
  fetchUsdaMarkets,
};
