import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * One labelled form control with its own inline error.
 *
 * The previous form reported every problem as a bulleted list at the top of the
 * page, leaving the runner to work out which box it referred to. Errors now sit
 * against the field they describe and are wired up with aria-describedby.
 */
export function Field({ id, label, error, required, hint, children, className = '' }) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={`reg-field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="reg-required" aria-hidden="true"> *</span>}
      </label>

      {typeof children === 'function'
        ? children({
            id,
            'aria-invalid': error ? 'true' : undefined,
            'aria-describedby': error ? errorId : hint ? hintId : undefined,
          })
        : children}

      {hint && !error && <span className="reg-hint" id={hintId}>{hint}</span>}
      {error && (
        <span className="reg-error" id={errorId} role="alert">
          <AlertCircle size={14} aria-hidden="true" /> {error}
        </span>
      )}
    </div>
  );
}
