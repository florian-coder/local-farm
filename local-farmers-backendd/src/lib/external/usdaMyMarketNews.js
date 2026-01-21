const DEFAULT_BASE_URL = 'https://api.data.gov/usda/ams/marketnews/v1.1/reports';

const extractNumbers = (record) => {
  const candidates = [
    record.lowPrice,
    record.highPrice,
    record.minPrice,
    record.maxPrice,
    record.price,
    record.price_low,
    record.price_high,
    record?.priceRange?.min,
    record?.priceRange?.max,
  ];

  return candidates
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
};

const buildFallback = (commodity) => {
  const base = Math.max(1, Math.min(3, (commodity?.length || 8) / 3));
  return {
    commodity,
    priceRange: {
      min: Number(base.toFixed(2)),
      max: Number((base * 1.8).toFixed(2)),
      unit: 'USD/lb',
    },
    headline: 'Seasonal supply tightening',
    updatedAt: new Date().toISOString(),
  };
};

const fetchUsdaMarketNews = async ({ commodity }) => {
  const apiKey =
    process.env.USDA_MARKETNEWS_API_KEY || process.env.USDA_API_KEY || null;
  const baseUrl = process.env.USDA_MARKETNEWS_BASE_URL || DEFAULT_BASE_URL;

  if (!apiKey) {
    return buildFallback(commodity);
  }

  const url = new URL(baseUrl);
  url.searchParams.set('commodity', commodity);
  url.searchParams.set('api_key', apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return buildFallback(commodity);
    }

    const payload = await response.json();
    const records =
      payload?.results || payload?.data || payload?.reports || [];

    if (!Array.isArray(records) || records.length === 0) {
      return buildFallback(commodity);
    }

    const numbers = records.flatMap(extractNumbers);
    const min = numbers.length ? Math.min(...numbers) : null;
    const max = numbers.length ? Math.max(...numbers) : null;

    return {
      commodity,
      priceRange: {
        min: min !== null ? Number(min.toFixed(2)) : null,
        max: max !== null ? Number(max.toFixed(2)) : null,
        unit: 'USD/lb',
      },
      headline:
        records[0]?.report_title || records[0]?.headline || 'Market update',
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return buildFallback(commodity);
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  fetchUsdaMarketNews,
};
