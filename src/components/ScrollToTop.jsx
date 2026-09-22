import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Put a new page at the top when you navigate to it.
 *
 * A browser restores scroll position on a real page load; a single-page app
 * swaps the content underneath and leaves the scroll where it was. Following a
 * footer link from the bottom of the homepage landed you halfway down the
 * registration form, past the step indicator and the category list, with no
 * sign that anything had changed.
 *
 * `hash` is honoured so an in-page anchor such as /#faq still works, and the
 * jump is instant rather than animated -- a smooth scroll on navigation reads
 * as the page moving on its own.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const target = document.querySelector(hash);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);

  return null;
}
