import axios from 'axios';

const isDev = import.meta.env.DEV;

const API_URL = isDev
  ? (import.meta.env.VITE_API_URL || 'http://localhost:5000/api')
  : import.meta.env.VITE_API_URL;

const STORAGE_URL = isDev
  ? 'http://localhost:5000'
  : (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api$/, '') : window.location.origin);

// How long to wait before treating a request as failed.
const REQUEST_TIMEOUT_MS = 20000;

// Idempotent methods are safe to retry automatically on network hiccups.
const RETRYABLE_METHODS = new Set(['get', 'head', 'options']);
const MAX_AUTO_RETRIES = 1;

export const api = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT_MS
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('dv_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function isNetworkOrTimeoutError(error) {
  return !error.response && (error.code === 'ECONNABORTED' || error.message === 'Network Error' || !navigator.onLine);
}

function broadcastAppError(detail) {
  // Decoupled from the React tree so this interceptor can notify any
  // listening UI (e.g. a global toast) without importing components here.
  window.dispatchEvent(new CustomEvent('app:error', { detail }));
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config || {};

    // Session expired / unauthorized: clear local session and bounce to
    // login from anywhere inside the admin area.
    if (error.response?.status === 401) {
      const wasAuthenticated = !!localStorage.getItem('dv_token');
      localStorage.removeItem('dv_token');
      localStorage.removeItem('dv_admin');
      if (wasAuthenticated && !window.location.pathname.startsWith('/login')) {
        broadcastAppError({ message: 'Your session has expired. Please log in again.', tone: 'warning' });
        window.location.assign('/login');
      }
      return Promise.reject(error);
    }

    // Auto-retry idempotent GET-style requests once on transient network errors.
    if (isNetworkOrTimeoutError(error) && RETRYABLE_METHODS.has((config.method || 'get').toLowerCase())) {
      config.__retryCount = config.__retryCount || 0;
      if (config.__retryCount < MAX_AUTO_RETRIES) {
        config.__retryCount += 1;
        const backoffMs = 500 * config.__retryCount;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return api(config);
      }
    }

    // Surface a friendly, consistent message for global listeners (e.g. toasts),
    // unless the caller explicitly opted out via { __silent: true } in config.
    if (!config.__silent) {
      broadcastAppError({ message: getErrorMessage(error), tone: 'error' });
    }

    return Promise.reject(error);
  }
);

/**
 * Extracts a human-readable message from any error thrown by the api client,
 * covering server-provided messages, validation arrays, network failures,
 * timeouts, and unexpected client-side exceptions.
 */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'You appear to be offline. Check your connection and try again.';
  }

  if (error.code === 'ECONNABORTED') {
    return 'The request took too long to respond. Please try again.';
  }

  const data = error.response?.data;

  if (data) {
    if (Array.isArray(data.errors) && data.errors.length) {
      return data.errors.map((e) => (typeof e === 'string' ? e : e.message)).filter(Boolean).join(' ');
    }
    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }
  }

  if (error.response?.status === 404) {
    return 'The requested resource could not be found.';
  }
  if (error.response?.status === 403) {
    return 'You do not have permission to perform this action.';
  }
  if (error.response?.status >= 500) {
    return 'The server ran into a problem. Please try again shortly.';
  }

  if (!error.response) {
    return 'Unable to reach the server. Please check your connection.';
  }

  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function fileUrl(relativeUrl) {
  if (!relativeUrl) return '';
  const localizedPath = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
  return `${STORAGE_URL}${localizedPath}`;
}
