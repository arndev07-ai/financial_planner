const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(message, status = 500, body = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(method, url, { body, params } = {}) {
  let target = `${BASE}${url}`;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    });
    const s = qs.toString();
    if (s) target += `?${s}`;
  }

  const options = {
    method,
    credentials: 'include',
    headers: {},
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(target, options);
  } catch (err) {
    if (!navigator.onLine) {
      throw new ApiError('You are offline. Your changes will be queued and synced automatically.', 0, { offline: true });
    }
    throw new ApiError('Network error. Please check your connection.', 0);
  }

  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  get: (url, params) => request('GET', url, { params }),
  post: (url, body) => request('POST', url, { body }),
  put: (url, body) => request('PUT', url, { body }),
  del: (url) => request('DELETE', url),

  async uploadReceipt(formData) {
    let res;
    try {
      res = await fetch(`${BASE}/upload/receipt`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
    } catch (err) {
      throw new ApiError('You are offline. Receipts can only be uploaded while online.', 0);
    }
    if (!res.ok) {
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }
      throw new ApiError(data?.error || 'Receipt upload failed', res.status, data);
    }
    return res.json();
  },

  async uploadImport(formData) {
    let res;
    try {
      res = await fetch(`${BASE}/import/transactions`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
    } catch (err) {
      throw new ApiError('You are offline. CSV import requires a connection.', 0);
    }
    if (!res.ok) {
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }
      throw new ApiError(data?.error || 'Import failed', res.status, data);
    }
    return res.json();
  },

  download(url, params) {
    const target = params ? `${BASE}${url}?${new URLSearchParams(params).toString()}` : `${BASE}${url}`;
    return fetch(target, { credentials: 'include' });
  },
};

export default api;
