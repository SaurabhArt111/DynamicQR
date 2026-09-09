import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  useRouteError
} from 'react-router-dom';
import { AlertOctagon, RefreshCw } from 'lucide-react';

import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { useAuth } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

import App from './App.jsx';
import { routes } from './routes/paths.js';

import './styles/global.css';

// Every route below is its own JS chunk, downloaded only when visited. This
// matters most for the public Viewer route (what a QR scan actually opens,
// often on a phone on cellular data) — it no longer pulls in the rest of
// the admin dashboard (the Design QR Code studio, ZIP/PDF export, etc.)
// just to show someone their files.
const Login = lazy(() => import('./pages/Login.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Collections = lazy(() => import('./pages/Collections.jsx'));
const CollectionDetail = lazy(() => import('./pages/CollectionDetail.jsx'));
const QRCodes = lazy(() => import('./pages/QRCodes.jsx'));
const QRDetail = lazy(() => import('./pages/QRDetail.jsx'));
const RecycleBin = lazy(() => import('./pages/RecycleBin.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Files = lazy(() => import('./pages/Files.jsx'));
const Modules = lazy(() => import('./pages/Modules.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

function RouteErrorBoundary() {
  const error = useRouteError();

  return (
    <div className="error-boundary">
      <div className="error-boundary-panel glass-card">
        <AlertOctagon size={40} />
        <h1>Navigation error</h1>
        <p>
          {error?.message ||
            'Unable to load this page right now. Refresh the app or try again later.'}
        </p>
        <button
          type="button"
          className="primary-button"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={16} />
          Reload the app
        </button>
      </div>
    </div>
  );
}

function RouteLoading() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
      <span className="spinner" />
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to={routes.login} replace />;
  }
  return children;
}

function PublicOnlyRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to={routes.dashboard} replace />;
  }
  return children;
}

const router = createBrowserRouter(
  [
    {
      path: routes.login,
      element: (
        <PublicOnlyRoute>
          <Login />
        </PublicOnlyRoute>
      )
    },
    {
      path: routes.adminRoot,
      element: (
        <ProtectedRoute>
          <App />
        </ProtectedRoute>
      ),
      errorElement: <RouteErrorBoundary />,
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'modules', element: <Modules /> },
        { path: 'collections', element: <Collections /> },
        { path: 'collections/:id', element: <CollectionDetail /> },
        { path: 'qrcodes', element: <QRCodes /> },
        { path: 'qrcodes/:id', element: <QRDetail /> },
        { path: 'files', element: <Files /> },
        { path: 'recycle-bin', element: <RecycleBin /> },
        { path: 'settings', element: <Settings /> }
      ]
    },
    { path: '*', element: <NotFound />, errorElement: <RouteErrorBoundary /> }
  ],
  { future: { v7_relativeSplatPath: true, v7_startTransition: true } }
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <Suspense fallback={<RouteLoading />}>
              <RouterProvider router={router} />
            </Suspense>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
