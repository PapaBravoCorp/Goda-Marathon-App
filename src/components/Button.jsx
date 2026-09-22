import React from 'react';

/**
 * Thin wrapper over the `.btn` / `.btn-{variant}` classes defined in index.css.
 * Variants: primary | secondary | outline | ghost.
 */
export function Button({ children, variant = 'primary', className = '', ...props }) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
