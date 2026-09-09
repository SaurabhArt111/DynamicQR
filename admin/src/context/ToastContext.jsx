import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, WifiOff, X } from 'lucide-react';
import './Toast.css';

const ToastContext = createContext(null);
let idCounter = 0;

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  offline: WifiOff
};

const DEFAULT_DURATION = 5000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((message, options = {}) => {
    if (!message) return;
    const id = ++idCounter;
    const tone = options.tone || 'info';
    const duration = options.duration ?? DEFAULT_DURATION;

    setToasts((current) => {
      // Avoid flooding the UI with duplicate messages back-to-back.
      if (current.some((t) => t.message === message && t.tone === tone)) {
        return current;
      }
      return [...current, { id, message, tone }].slice(-4);
    });

    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    }

    return id;
  }, [dismiss]);

  const toast = useMemo(() => ({
    show: push,
    success: (message, options) => push(message, { ...options, tone: 'success' }),
    error: (message, options) => push(message, { ...options, tone: 'error' }),
    warning: (message, options) => push(message, { ...options, tone: 'warning' }),
    info: (message, options) => push(message, { ...options, tone: 'info' }),
    dismiss
  }), [push, dismiss]);

  // Listen for API-layer errors (401s, network failures, 5xx) dispatched
  // from src/api/http.js so any request can surface feedback without every
  // component wiring its own error banner.
  useEffect(() => {
    function handleAppError(event) {
      const detail = event.detail || {};
      push(detail.message, { tone: detail.tone || 'error' });
    }

    function handleOffline() {
      push('You are offline. Some actions may not work until you reconnect.', { tone: 'offline', duration: 0 });
    }

    function handleOnline() {
      push('Back online.', { tone: 'success', duration: 2500 });
    }

    window.addEventListener('app:error', handleAppError);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('app:error', handleAppError);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [push]);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone] || Info;
          return (
            <div key={t.id} className={`toast toast-${t.tone}`} role="status">
              <Icon size={18} className="toast-icon" />
              <span className="toast-message">{t.message}</span>
              <button
                type="button"
                className="toast-close"
                aria-label="Dismiss notification"
                onClick={() => dismiss(t.id)}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
