import React from 'react';
import Seo from '../../components/Seo';
import './legal.css';

/**
 * Shared shell for the policy pages.
 *
 * `lastUpdated` is shown deliberately: a policy with no date gives a reader no
 * way to tell whether it still describes what the organisers do.
 */
export default function LegalPage({ title, description, lastUpdated, children }) {
  return (
    <div className="legal-page">
      <Seo title={title} description={description} />
      <div className="container legal-container">
        <header className="legal-header">
          <h1>{title}</h1>
          {lastUpdated && (
            <p className="legal-updated">
              Last updated: <time dateTime={lastUpdated}>{
                new Date(`${lastUpdated}T00:00:00`).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })
              }</time>
            </p>
          )}
        </header>

        <div className="legal-body">{children}</div>
      </div>
    </div>
  );
}
