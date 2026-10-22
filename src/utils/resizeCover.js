import { loadImage, drawScaled, toBlob, WEBP, JPEG } from './resizeHero';

/**
 * Resize a past edition's cover photo in the browser before it is uploaded.
 *
 * The homepage timeline draws a cover at most ~450 px wide (16:10 on a laptop,
 * an 84 px square on a phone), and Supabase's free tier cannot resize on the
 * fly. So one 1200 px file is sharp on a high-density screen, where a phone
 * original would be a multi-MB download per card.
 */

export const COVER_WIDTH = 1200;
// Below this a cover is upscaled on a high-density laptop screen.
export const SHARP_COVER_WIDTH = 900;

/**
 * Returns { blob, width, height, ext, contentType }. `maxWidth` is for other
 * photos drawn smaller than a cover, such as a guest's portrait.
 */
export async function resizeCover(file, maxWidth = COVER_WIDTH) {
  const img = await loadImage(file);
  const { naturalWidth, naturalHeight } = img;
  const heightFor = (w) => Math.max(1, Math.round((naturalHeight * w) / naturalWidth));
  const width = Math.min(naturalWidth, maxWidth);

  // Halve towards the target rather than shrinking in one jump, which lets
  // browsers sample coarsely and turns fine detail to noise.
  let source = img;
  let step = naturalWidth;
  while (step / 2 > width) {
    step = Math.round(step / 2);
    const next = drawScaled(source, step, heightFor(step));
    if (source !== img) source.width = source.height = 0; // Safari caps canvas memory
    source = next;
  }
  const canvas = drawScaled(source, width, heightFor(width));
  if (source !== img) source.width = source.height = 0;

  let format = WEBP;
  let blob = await toBlob(canvas, format);
  // Safari cannot encode WebP from a canvas and quietly returns a PNG.
  if (blob && blob.type !== format.type) {
    format = JPEG;
    blob = await toBlob(canvas, format);
  }
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('This photo could not be processed. Try a JPG or PNG.');

  return { blob, width, height: heightFor(width), ext: format.ext, contentType: format.type };
}
