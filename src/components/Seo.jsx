import { useEffect } from 'react';

/**
 * Per-page title and meta description.
 *
 * Every route shared one title -- "goda-epic-trail" -- so a visitor with the
 * registration form and the gallery open saw two identical tabs, a bookmark
 * saved the wrong name, and search results listed every page under the same
 * heading. There was no description at all, which leaves Google to invent one
 * from whatever text it finds first.
 *
 * Small enough not to warrant react-helmet: this writes the two tags directly
 * and restores the site default on unmount. Both are also present in index.html
 * as static fallbacks, which is what crawlers that do not run JavaScript and
 * link previews on WhatsApp and Slack will read.
 */

const SITE_NAME = 'GODA Epic Trail Run';
const DEFAULT_TITLE = 'GODA Epic Trail Run — Trail running in Nashik';
const DEFAULT_DESCRIPTION =
  'GODA Epic Trail Run, organised by Godavari Expedition and G5 Foundation in the Gangapur Backwaters near Nashik. Trail distances for every level, chip timing, finisher medals and full medical support.';

function setMeta(selector, attr, value) {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('meta');
    const [, key, val] = selector.match(/\[(.+?)="(.+?)"\]/) || [];
    if (key && val) tag.setAttribute(key, val);
    document.head.appendChild(tag);
  }
  tag.setAttribute(attr, value);
}

export default function Seo({ title, description, image, noIndex = false }) {
  useEffect(() => {
    const pageTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
    const pageDescription = description || DEFAULT_DESCRIPTION;

    document.title = pageTitle;
    setMeta('meta[name="description"]', 'content', pageDescription);
    setMeta('meta[property="og:title"]', 'content', pageTitle);
    setMeta('meta[property="og:description"]', 'content', pageDescription);
    setMeta('meta[property="og:url"]', 'content', window.location.href);
    setMeta('meta[name="twitter:title"]', 'content', pageTitle);
    setMeta('meta[name="twitter:description"]', 'content', pageDescription);
    if (image) {
      const absolute = image.startsWith('http') ? image : `${window.location.origin}${image}`;
      setMeta('meta[property="og:image"]', 'content', absolute);
      setMeta('meta[name="twitter:image"]', 'content', absolute);
    }

    // The admin dashboard and the 404 have no business in a search index.
    setMeta('meta[name="robots"]', 'content', noIndex ? 'noindex, nofollow' : 'index, follow');

    // Canonical, so ?utm_source=... variants do not become separate pages.
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', `${window.location.origin}${window.location.pathname}`);

    return () => {
      document.title = DEFAULT_TITLE;
      setMeta('meta[name="robots"]', 'content', 'index, follow');
    };
  }, [title, description, image, noIndex]);

  return null;
}
