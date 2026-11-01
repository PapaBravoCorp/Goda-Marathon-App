import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import ModalLayer from './ModalLayer';

/**
 * Modal form shared by the admin editors (FAQs, testimonials, sponsors,
 * homepage blocks, guests, promo videos). ModalLayer puts it above the whole
 * page and handles focus, Escape and the inert background.
 */
export default function ContentModal({ title, error, isSaving, onSubmit, onClose, children }) {
  const titleId = useId();
  const errorRef = useRef(null);

  // The error sits at the foot of a body that scrolls; bring it into view.
  // role="alert" also has it read out.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  // aria-disabled rather than disabled while saving: a disabled button drops
  // keyboard focus to the page, and a second press is ignored here anyway.
  const submit = (e) => {
    if (isSaving) { e.preventDefault(); return; }
    onSubmit(e);
  };

  return (
    <ModalLayer onClose={onClose}>
      <div
        className="admin-modal admin-modal--wide glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="admin-modal-header">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit} className="admin-modal-form">
          <div className="admin-modal-body">
            <section className="admin-form-section">{children}</section>
            {error && (
              <div ref={errorRef} className="admin-login-error" role="alert" style={{ marginTop: '1rem' }}>
                <span>{error}</span>
              </div>
            )}
          </div>
          <div className="admin-modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" aria-disabled={isSaving || undefined}>
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </ModalLayer>
  );
}
