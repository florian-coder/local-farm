export const getApiBase = () => {
  const raw = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  return raw.replace(/\/$/, '');
};

export const apiFetch = (path, options = {}) => {
  const { timeoutMs = 12000, signal: externalSignal, ...restOptions } = options;
  const base = getApiBase();
  const url = path.startsWith('http')
    ? path
    : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const controller = new AbortController();
  let timeoutId;
  let abortHandler;

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      abortHandler = () => controller.abort();
      externalSignal.addEventListener('abort', abortHandler);
    }
  }

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  const fetchOptions = {
    credentials: 'include',
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(restOptions.headers || {}),
    },
    signal: controller.signal,
  };

  const method = (fetchOptions.method || 'GET').toUpperCase();
  if (restOptions.body === undefined && method === 'GET') {
    delete fetchOptions.body;
  }

  const fetchPromise = fetch(url, fetchOptions);
  fetchPromise.finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (externalSignal && abortHandler) {
      externalSignal.removeEventListener('abort', abortHandler);
    }
  });

  return fetchPromise;
};
