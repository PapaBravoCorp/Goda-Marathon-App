import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * Catch a render-time crash and show something a visitor can act on.
 *
 * React unmounts the whole tree when a component throws during render. Without
 * a boundary the result is a blank white page: no message, no navigation, no
 * way back. On a registration form that means a runner halfway through entering
 * their details sees the site vanish and has no idea whether their entry was
 * saved.
 *
 * Class component on purpose -- componentDidCatch has no hook equivalent.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept as console output rather than sent anywhere: this project has no
    // error-reporting service wired up, and inventing one silently would be
    // worse than the organisers knowing they need to add it.
    console.error('Unhandled error in React tree:', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div className="glass" style={{ maxWidth: '560px', padding: '40px 32px', borderRadius: '16px', textAlign: 'center' }}>
          <AlertTriangle size={44} style={{ color: 'var(--color-accent)', marginBottom: '20px' }} aria-hidden="true" />
          <h1 style={{ fontSize: '1.6rem', marginBottom: '12px' }}>Something went wrong</h1>
          <p className="text-muted" style={{ marginBottom: '28px' }}>
            This page hit an unexpected error. Reloading usually clears it. If you
            were part-way through registering, nothing was submitted.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={this.handleReload} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <RefreshCw size={16} aria-hidden="true" /> Reload the page
            </button>
            {/* A plain anchor, not a Link: the router may be the thing that broke. */}
            <a className="btn btn-outline" href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Home size={16} aria-hidden="true" /> Back to home
            </a>
          </div>

          {import.meta.env.DEV && (
            <pre style={{ marginTop: '28px', textAlign: 'left', fontSize: '0.75rem', overflowX: 'auto', color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>
              {String(this.state.error?.stack || this.state.error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
