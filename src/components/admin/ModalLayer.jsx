import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Fields a dialog opens on. Hidden file pickers (the sr-only inputs behind
// "Upload" buttons) are skipped: focus there is invisible.
const FIRST_FIELD = [
  'input:not([type="hidden"]):not([type="file"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
].join(', ');

/**
 * The dimmed layer behind every admin dialog, and what makes a dialog behave
 * as one. Children are the dialog panel itself, which carries role="dialog",
 * aria-modal and its label.
 *
 * - Rendered into <body>. The admin cards are .glass, whose backdrop-filter
 *   makes each card the box that position: fixed is measured against, so an
 *   overlay rendered inside a card covered only that card: the next card
 *   painted over it and the page could not scroll to its buttons.
 * - The page behind is made inert while it is open, so Tab and screen
 *   readers stay inside the dialog, and it cannot scroll.
 * - Focus moves to the panel's [data-autofocus] element, else its first
 *   field, else the panel itself, and goes back to whatever opened it.
 * - Escape closes. A click on the dim layer closes only when the press also
 *   started there, so dragging a text selection out of a field does not
 *   throw the form away.
 */
export default function ModalLayer({ onClose, children }) {
  const layerRef = useRef(null);
  const pressedOnLayer = useRef(false);
  // The newest onClose without re-running the mount effect, which would
  // steal focus back to the first field on every keystroke.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const opener = document.activeElement;
    const appRoot = document.getElementById('root');
    const wasInert = appRoot?.hasAttribute('inert');
    const prevOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';
    if (appRoot) appRoot.setAttribute('inert', '');

    const panel = layerRef.current?.querySelector('[role="dialog"]') || layerRef.current;
    const target = panel?.querySelector('[data-autofocus]') || panel?.querySelector(FIRST_FIELD);
    if (target) {
      target.focus();
    } else if (panel) {
      if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
      panel.focus();
    }

    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (appRoot && !wasInert) appRoot.removeAttribute('inert');
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    };
  }, []);

  return createPortal(
    <div
      ref={layerRef}
      className="admin-modal-overlay"
      onMouseDown={(e) => { pressedOnLayer.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (pressedOnLayer.current && e.target === e.currentTarget) onCloseRef.current?.();
        pressedOnLayer.current = false;
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
