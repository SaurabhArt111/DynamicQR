import { Component } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import './ErrorBoundary.css';

/**
 * Catches render-time errors anywhere below it in the tree so a bug in one
 * page (e.g. a malformed QR record) can't blank out the entire app. Logs the
 * error for diagnostics and shows a friendly recovery screen instead.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-panel glass-card">
            <AlertOctagon size={40} />
            <h1>Something went wrong</h1>
            <p>
              An unexpected error interrupted this page. Your data is safe — try
              reloading, and if the problem continues, please contact support.
            </p>
            <button type="button" className="primary-button" onClick={this.handleReload}>
              <RefreshCw size={16} />
              Reload the app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
