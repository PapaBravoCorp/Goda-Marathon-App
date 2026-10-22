import { useEffect, useState } from 'react';
import { getSiteSettings, peekSiteSettings, subscribeSiteSettings } from './services/siteSettings';

/**
 * The site_settings row for a component that renders from it: undefined until
 * anything is known, null when it could not be loaded and nothing was cached,
 * otherwise the row. Pass it to resolveSiteBranding() for the values with
 * their defaults filled in.
 *
 * A returning visitor gets the copy cached by their last visit at once, then
 * the live row when it arrives. Saving in Admin -> Website updates every
 * component using this in the same tab.
 */
export function useSiteSettings() {
  const [row, setRow] = useState(peekSiteSettings);

  useEffect(() => {
    let live = true;
    const unsubscribe = subscribeSiteSettings(next => { if (live) setRow(next); });
    getSiteSettings().then(next => {
      // Also covers a fetch that finished between the first render and this
      // subscription. A failed fetch keeps whatever was cached; with nothing
      // cached it settles on null, so components stop waiting for it.
      if (live) setRow(prev => next || (prev === undefined ? null : prev));
    });
    return () => { live = false; unsubscribe(); };
  }, []);

  return row;
}
