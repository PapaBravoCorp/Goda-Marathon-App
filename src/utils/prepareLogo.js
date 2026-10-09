/**
 * Prepare a sponsor logo in the browser before it is uploaded.
 *
 * Logos arrive from sponsors' press kits: multi-megabyte PNGs, SVGs, JPEGs on
 * a white box, most with a wide empty margin. Shown as they are, each sits at
 * a different apparent size in the strip, and the page downloads far more than
 * a logo drawn 60px tall needs. So every upload is
 *
 *   - rasterised, an SVG included, so the bucket only holds types it accepts
 *     and nothing scriptable is ever served from it;
 *   - trimmed of empty margin, so logos fill their tiles consistently;
 *   - scaled to fit MAX_WIDTH x MAX_HEIGHT, about 3x the largest tile; and
 *   - encoded as WebP, or PNG where the browser cannot encode WebP. Never
 *     JPEG, which would put a box behind a transparent logo.
 */

export const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
export const MAX_LOGO_SOURCE_MB = 20;

const MAX_WIDTH = 720;
const MAX_HEIGHT = 240;
// Margins are trimmed before the logo is fitted to its final size, on a copy
// bounded by a square rather than by the final 3:1 box. Fitting a padded file
// to 3:1 first would shrink it by its height, margin included, and leave the
// logo itself a fraction of the pixels it came with.
const WORK_SIDE = 2048;
// Below this a logo is upscaled on high-density screens and looks soft.
const SHARP_HEIGHT = 120;

const WEBP = { type: 'image/webp', ext: 'webp', quality: 0.9 };
const PNG = { type: 'image/png', ext: 'png' };

function loadImageFromBlob(blob, failMessage) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(failMessage)); };
    img.src = url;
  });
}

/** Intrinsic size of an SVG from its viewBox, else its width/height. */
function svgSize(svg) {
  const box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box[2] > 0 && box[3] > 0) {
    return { width: box[2], height: box[3], hasViewBox: true };
  }
  const width = svg.getAttribute('width') || '';
  const height = svg.getAttribute('height') || '';
  // A percentage is relative to a container an <img> does not have.
  if (width.includes('%') || height.includes('%')) return null;
  const w = parseFloat(width);
  const h = parseFloat(height);
  return w > 0 && h > 0 ? { width: w, height: h, hasViewBox: false } : null;
}

/**
 * Browsers disagree on the size of an SVG with no width and height (Firefox
 * reports 0x0), so the size is written in before it is drawn. Rendering it at
 * the working size also keeps the vector sharp instead of scaling a bitmap.
 */
async function loadSvg(file) {
  const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName !== 'svg' || doc.getElementsByTagName('parsererror').length) {
    throw new Error('This SVG could not be read. Export the logo as a PNG and try again.');
  }

  const size = svgSize(svg);
  if (!size) {
    throw new Error('This SVG does not say how big it is. Export the logo as a PNG and try again.');
  }

  const scale = Math.min(WORK_SIDE / size.width, WORK_SIDE / size.height);
  if (!size.hasViewBox) svg.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
  svg.setAttribute('width', String(Math.round(size.width * scale)));
  svg.setAttribute('height', String(Math.round(size.height * scale)));

  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
  return loadImageFromBlob(blob, 'This SVG could not be drawn. Export the logo as a PNG and try again.');
}

function drawScaled(source, sx, sy, sw, sh, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
  return canvas;
}

/** Scale (w, h) to fit inside (maxW, maxH), never enlarging. */
function fit(w, h, maxW, maxH) {
  const scale = Math.min(1, maxW / w, maxH / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

const isNearWhite = (r, g, b) => r > 245 && g > 245 && b > 245;

/**
 * Whether the logo sits on a white box, judged from its outermost pixels.
 *
 * Not from whether every pixel is opaque: an export with a faintly
 * translucent 1px edge, which is common, would then pass for a transparent
 * logo and keep its whole white margin. That is how the Sakal x G5 lockup was
 * uploaded at 720 x 240 with its artwork filling barely 85% of the width.
 */
function hasWhiteBackground(data, width, height) {
  let white = 0, other = 0;
  const visit = (x, y) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 8) other++;
    else if (isNearWhite(data[i], data[i + 1], data[i + 2])) white++;
    else other++;
  };
  for (let x = 0; x < width; x++) { visit(x, 0); visit(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { visit(0, y); visit(width - 1, y); }
  return white > other;
}

/**
 * Bounding box of the artwork, ignoring the margin around it.
 *
 * A logo on a white box (a JPEG, most PNG exports) is trimmed of near-white,
 * which the light tile would show as blank space anyway; any other is trimmed
 * of transparent pixels only, so white artwork on transparency survives.
 *
 * Also reports how light the artwork is, so a white logo can be put on a dark
 * tile without the organiser having to notice it vanished.
 */
function analyse(canvas) {
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height);

  const onWhite = hasWhiteBackground(data, width, height);

  let minX = width, minY = height, maxX = -1, maxY = -1;
  let lumaSum = 0, weightSum = 0, solid = 0, solidWhite = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      const empty = a < 8 || (onWhite && isNearWhite(r, g, b));
      if (empty) continue;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      lumaSum += (0.2126 * r + 0.7152 * g + 0.0722 * b) * a;
      weightSum += a;
      if (a >= 128) {
        solid++;
        if (r > 230 && g > 230 && b > 230) solidWhite++;
      }
    }
  }

  if (maxX < 0) return null;
  return {
    box: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    onWhite,
    // A logo on a white box brings its own background; only a transparent
    // one depends on the tile behind it. Light overall, or a fifth of it
    // white: a version made for dark backgrounds (white lettering beside
    // brand colours) averages mid-tone but would still lose its lettering
    // on a light tile. Ordinary colour logos measure ~5% white.
    isLightArtwork: !onWhite && weightSum > 0
      && (lumaSum / weightSum > 200 || solidWhite / solid > 0.2),
  };
}

/**
 * Make a logo's off-white box pure white. Exports often carry a background of
 * #FDFDFD or similar, which shows as a faint grey panel on the pure-white
 * tile and hero plate the logo is placed on.
 */
function whitenBackground(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    if (isNearWhite(data[i], data[i + 1], data[i + 2])) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function toBlob(canvas, format) {
  return new Promise(resolve => canvas.toBlob(resolve, format.type, format.quality));
}

/**
 * Returns { blob, width, height, ext, contentType, suggestedBackground, warning }.
 * `suggestedBackground` is 'light' or 'dark'; `warning` is a sentence or null.
 */
export async function prepareLogo(file) {
  if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
    throw new Error('Choose a PNG, SVG, WEBP or JPG logo.');
  }
  if (file.size > MAX_LOGO_SOURCE_MB * 1024 * 1024) {
    throw new Error(`That file is over ${MAX_LOGO_SOURCE_MB} MB. Export a smaller copy and try again.`);
  }

  // Drawing an <img> rather than an ImageBitmap applies EXIF rotation.
  const img = file.type === 'image/svg+xml'
    ? await loadSvg(file)
    : await loadImageFromBlob(file, 'This file could not be read as an image. Try a PNG.');

  const work = fit(img.naturalWidth, img.naturalHeight, WORK_SIDE, WORK_SIDE);
  let canvas = drawScaled(img, 0, 0, img.naturalWidth, img.naturalHeight, work.width, work.height);

  let result;
  try {
    result = analyse(canvas);
  } catch {
    // A canvas the browser considers tainted cannot be read back. Keep the
    // logo untrimmed rather than refusing it.
    result = { box: { x: 0, y: 0, width: work.width, height: work.height }, onWhite: false, isLightArtwork: false };
  }
  if (!result) {
    throw new Error('This image looks blank. Check that the logo is not white on a transparent background with nothing else in it.');
  }

  const { box } = result;
  const out = fit(box.width, box.height, MAX_WIDTH, MAX_HEIGHT);
  const trimmed = drawScaled(canvas, box.x, box.y, box.width, box.height, out.width, out.height);
  canvas.width = canvas.height = 0; // Safari caps total canvas memory
  canvas = trimmed;
  if (result.onWhite) whitenBackground(canvas);

  let format = WEBP;
  let blob = await toBlob(canvas, format);
  // Safari cannot encode WebP from a canvas and quietly returns a PNG.
  if (!blob || blob.type !== format.type) {
    format = PNG;
    blob = await toBlob(canvas, format);
  }
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('This logo could not be processed. Try a PNG.');

  return {
    blob,
    width: out.width,
    height: out.height,
    ext: format.ext,
    contentType: format.type,
    suggestedBackground: result.isLightArtwork ? 'dark' : 'light',
    warning: out.height < SHARP_HEIGHT && out.width < MAX_WIDTH
      ? `This logo is only ${out.width} × ${out.height} px once its margins are trimmed, so it may look soft. A larger PNG or an SVG will be sharper.`
      : null,
  };
}
