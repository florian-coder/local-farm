const SOILGRIDS_BASE = 'https://rest.isric.org/soilgrids/v2.0/properties/query';

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

const extractMean = (payload, key) => {
  const property = payload?.properties?.[key];
  if (!property || !Array.isArray(property.depths)) {
    return null;
  }
  const depth =
    property.depths.find((entry) => entry.label === '0-5cm') ||
    property.depths[0];
  return toNumber(depth?.values?.mean);
};

const computeQualityScore = ({ ph, organicCarbon, clay, sand }) => {
  const phScore = ph ? Math.max(0, 100 - Math.abs(ph - 6.5) * 18) : 50;
  const carbonScore = organicCarbon
    ? Math.min(100, Math.max(0, organicCarbon * 6))
    : 50;
  const clayScore = clay
    ? Math.max(0, 100 - Math.abs(clay - 30) * 2)
    : 50;
  const sandScore = sand
    ? Math.max(0, 100 - Math.abs(sand - 40) * 1.5)
    : 50;

  const raw = (phScore + carbonScore + clayScore + sandScore) / 4;
  return Math.round(raw);
};

const buildFallback = (lat, lng) => {
  const ph = 6.5;
  const organicCarbon = 10;
  const clay = 25;
  const sand = 40;
  const qualityScore = computeQualityScore({ ph, organicCarbon, clay, sand });

  return {
    lat: Number(lat),
    lng: Number(lng),
    ph,
    organicCarbon,
    clay,
    sand,
    bulkDensity: null,
    qualityScore,
  };
};

const fetchSoilGrids = async (lat, lng) => {
  const params = new URLSearchParams();
  params.set('lat', lat);
  params.set('lon', lng);
  params.append('property', 'phh2o');
  params.append('property', 'soc');
  params.append('property', 'clay');
  params.append('property', 'sand');
  params.append('property', 'bdod');
  params.append('depth', '0-5cm');

  const url = `${SOILGRIDS_BASE}?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`SoilGrids error: ${response.status}`);
    }

    const payload = await response.json();
    const rawPh = extractMean(payload, 'phh2o');
    const ph = rawPh && rawPh > 14 ? rawPh / 10 : rawPh;
    const organicCarbon = extractMean(payload, 'soc');
    const clay = extractMean(payload, 'clay');
    const sand = extractMean(payload, 'sand');
    const bulkDensity = extractMean(payload, 'bdod');

    const qualityScore = computeQualityScore({ ph, organicCarbon, clay, sand });

    return {
      lat: Number(lat),
      lng: Number(lng),
      ph,
      organicCarbon,
      clay,
      sand,
      bulkDensity,
      qualityScore,
    };
  } catch (error) {
    return buildFallback(lat, lng);
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  fetchSoilGrids,
};
