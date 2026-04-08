import React from 'react';

export function Card({ image, badge, title, subtitle, children, footer }) {
  return (
    <div className="card">
      {image && (
        <div className="card-img-wrapper">
          <img src={image} alt={title || "Card image"} className="card-image" />
        </div>
      )}
      <div className="card-content">
        {badge && <div style={{ marginBottom: '16px' }}>{badge}</div>}
        {title && <h3 style={{ marginBottom: '8px' }}>{title}</h3>}
        {subtitle && <p className="text-muted" style={{ marginBottom: '16px' }}>{subtitle}</p>}
        
        <div className="card-body">
          {children}
        </div>
        
        {footer && (
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
