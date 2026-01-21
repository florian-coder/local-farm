export const getApiBase = () => {
  const raw = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  return raw.replace(/\/$/, '');
};

export const apiFetch = (path, options = {}) => {
  const base = getApiBase();
  const url = path.startsWith('http')
    ? path
    : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const fetchOptions = {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  };

  if (options.body === undefined && fetchOptions.method === 'GET') {
    delete fetchOptions.body;
  }

  return fetch(url, fetchOptions);
};
