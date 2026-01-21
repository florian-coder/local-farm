const DEFAULT_BASE_URL = 'https://api.pexels.com/v1/search';

const normalizePhotos = (photos = []) =>
  photos.map((photo) => ({
    id: photo.id,
    url: photo.url,
    alt: photo.alt || 'Pexels photo',
    photographer: photo.photographer || null,
    photographer_url: photo.photographer_url || null,
    src: {
      large: photo.src?.large || null,
      medium: photo.src?.medium || null,
      landscape: photo.src?.landscape || null,
    },
  }));

const fetchPexels = async ({ query, perPage = 1, locale }) => {
  const apiKey = process.env.PEXELS_API_KEY;
  const baseUrl = process.env.PEXELS_BASE_URL || DEFAULT_BASE_URL;

  if (!apiKey) {
    return { query, photos: [] };
  }

  const url = new URL(baseUrl);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  if (locale) {
    url.searchParams.set('locale', locale);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        Authorization: apiKey,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { query, photos: [] };
    }

    const payload = await response.json();
    const photos = Array.isArray(payload?.photos) ? payload.photos : [];

    return {
      query,
      photos: normalizePhotos(photos),
    };
  } catch (error) {
    return { query, photos: [] };
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = {
  fetchPexels,
};
