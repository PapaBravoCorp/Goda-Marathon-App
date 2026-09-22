import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import Seo from '../components/Seo';

/**
 * Anything that is not a route.
 *
 * vercel.json rewrites every path to the app, which is what a single-page app
 * needs -- but it also means a typo, a stale link or a scanner probing
 * /wp-admin previously rendered the header and footer around an empty main
 * element. Nothing said the page did not exist and nothing offered a way on.
 */
export default function NotFound() {
  return (
    <div className="section" style={{ minHeight: '70vh', display: 'flex', alignItems: 'center' }}>
      <Seo
        title="Page not found"
        description="That page does not exist."
        noIndex
      />
      <div className="container" style={{ textAlign: 'center', maxWidth: '620px' }}>
        <Compass size={56} style={{ color: 'var(--color-primary)', marginBottom: '24px' }} aria-hidden="true" />
        <p style={{ fontSize: '3.5rem', fontWeight: 900, lineHeight: 1, marginBottom: '12px' }}>404</p>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '16px' }}>
          Off the <span className="accent-text">trail</span>
        </h1>
        <p className="text-muted" style={{ marginBottom: '32px' }}>
          That page does not exist. It may have moved, or the link that sent you
          here may be out of date.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn btn-primary">Back to home</Link>
          <Link to="/event" className="btn btn-outline">Event details</Link>
          <Link to="/register" className="btn btn-outline">Register</Link>
        </div>
      </div>
    </div>
  );
}
