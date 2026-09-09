import { Link } from 'react-router-dom';
import { ArrowLeft, SearchX } from 'lucide-react';
import { routes } from '../routes/paths.js';
import './NotFound.css';

export default function NotFound() {
  return (
    <main className="not-found-page">
      <section className="not-found-panel">
        <SearchX size={34} />
        <p className="not-found-code">404</p>
        <h1>Page not found</h1>
        <p>The page you requested does not exist or has moved to a different route.</p>
        <div className="button-row">
          <a className="primary-button" href={import.meta.env.VITE_PUBLIC_APP_URL || '/'}>Open public site</a>
        </div>
      </section>
    </main>
  );
}
