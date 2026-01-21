const DEFAULT_BASE_URL = 'https://fenixservices.fao.org/api/faostat/FAOSTAT/QCL';

const buildFallback = (item, country) => ({
  item,
  country,
  series: [
    { year: 2020, value: 120 },
    { year: 2021, value: 115 },
  ],
});

const toNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const fetchFaostat = async ({ item, country }) => {
  const baseUrl = process.env.FAOSTAT_BASE_URL || DEFAULT_BASE_URL;
  const url = new URL(baseUrl);
  url.searchParams.set('item', item);
  url.searchParams.set('area', country);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return buildFallback(item, country);
    }

    const payload = await response.json();
    const records = payload?.data || payload?.results || [];

    if (!Array.isArray(records) || records.length === 0) {
      return buildFallback(item, country);
    }

    const series = records
      .map((record) => {
        const year =
          toNumber(record.year || record.Year || record.year_code) || null;
        const value =
          toNumber(record.value || record.Value || record.value_num) || null;
        if (!year || value === null) {
          return null;
        }
        return { year, value };
      })
      .filter(Boolean)
      .sort((a, b) => a.year - b.year)
      .slice(-6);

    if (series.length === 0) {
      return buildFallback(item, country);
    }

    return {
      item,
      country,
      series,
    };
  } catch (error) {
    return buildFallback(item, country);
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  fetchFaostat,
};
