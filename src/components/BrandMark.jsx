import React from 'react';
import { useSiteSettings } from '../utils/useSiteSettings';
import { resolveSiteBranding, DEFAULT_BRAND_LOGO } from '../utils/siteBranding';
import { resolveImageUrl } from '../utils/mediaUrl';

/**
 * The logo and name in the header, the phone menu and the footer, as set in
 * Admin -> Website. Without an uploaded logo it is the built-in round mark.
 *
 * On a first visit the logo slot stays empty for the moment it takes to learn
 * which logo to show, rather than flashing the built-in one and swapping it.
 * Later visits start from the copy the browser kept (useSiteSettings).
 *
 * `short` is for the phone menu, which had room only for "GODA"; a custom
 * name is shown there in full.
 */
export function BrandMark({ short = false, wordClassName = 'brand-word', dotClassName = 'brand-dot' }) {
  const row = useSiteSettings();
  const brand = resolveSiteBranding(row);
  const name = short && !brand.hasCustomBrandName ? 'GODA' : brand.brandName;
  // With the name hidden, the logo is what the link says, so it carries it.
  const alt = brand.showBrandName ? '' : name;

  let mark;
  if (row === undefined) {
    mark = <span className="brand-mark brand-mark--pending" aria-hidden="true" />;
  } else if (brand.brandLogo) {
    mark = (
      <span className={`brand-logo is-${brand.brandLogoPlate}`}>
        <img src={resolveImageUrl(brand.brandLogo)} alt={alt} decoding="async" />
      </span>
    );
  } else {
    mark = <img className="brand-mark" src={DEFAULT_BRAND_LOGO} alt={alt} width="40" height="40" />;
  }

  return (
    <>
      {mark}
      {brand.showBrandName && (
        <span className={wordClassName}>{name}<span className={dotClassName}>.</span></span>
      )}
    </>
  );
}
