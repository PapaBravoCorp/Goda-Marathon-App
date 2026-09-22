/**
 * Media URL helpers.
 *
 * A Google Drive "share" link points at an HTML viewer page, not at an image,
 * so pasting one straight into <img src> renders nothing. These helpers turn
 * the various Drive link shapes into a URL that actually serves bytes, and
 * let the gallery request a smaller variant for the grid than for the lightbox.
 */

/** Recognised Google Drive file-link shapes. */
const DRIVE_FILE_PATTERNS = [
  /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/,      // /file/d/ID/view
  /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{10,})/,      // /open?id=ID
  /drive\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]{10,})/,// /uc?id=ID
  /drive\.google\.com\/thumbnail\?(?:.*&)?id=([a-zA-Z0-9_-]{10,})/,
  /docs\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]{10,})/,
  /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/,   // already direct
];

/** A folder link — cannot be expanded without the Drive API and OAuth. */
const DRIVE_FOLDER_PATTERN = /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\//;

export function getDriveFileId(url) {
  if (!url) return null;
  for (const pattern of DRIVE_FILE_PATTERNS) {
    const match = pattern.exec(url);
    if (match) return match[1];
  }
  return null;
}

export function isDriveFolderUrl(url) {
  return !!url && DRIVE_FOLDER_PATTERN.test(url);
}

export function getYouTubeId(url) {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

/**
 * Resolve a stored URL to something an <img> can load.
 *
 * `width` requests a scaled variant where the host supports it. Drive is served
 * from the googleusercontent CDN, which honours a `=wN` suffix — so the masonry
 * grid can pull ~800px files while the lightbox pulls ~1600px, instead of every
 * thumbnail dragging down a full-resolution original.
 */
export function resolveImageUrl(url, width) {
  if (!url) return '';

  const driveId = getDriveFileId(url);
  if (driveId) {
    return width
      ? `https://lh3.googleusercontent.com/d/${driveId}=w${width}`
      : `https://lh3.googleusercontent.com/d/${driveId}`;
  }

  // Supabase Storage can transform on the fly, but only on paid plans;
  // requesting it on the free tier 400s. Left untouched deliberately.
  return url;
}

/**
 * Validate and canonicalise a URL pasted into the admin panel.
 * Returns { ok, url, kind, error }.
 */
export function normalizeMediaUrl(rawUrl, mediaType = 'image') {
  const url = (rawUrl || '').trim();
  if (!url) return { ok: false, error: 'Enter a URL, or upload a file instead.' };

  if (isDriveFolderUrl(url)) {
    return {
      ok: false,
      error:
        'That is a Google Drive folder link. A folder cannot be expanded into individual photos — ' +
        'open the folder, share each photo, and paste its file link. Uploading the photos is easier.',
    };
  }

  if (mediaType === 'video') {
    if (getYouTubeId(url)) return { ok: true, url, kind: 'youtube' };
    if (/^https?:\/\//i.test(url)) return { ok: true, url, kind: 'file' };
    return { ok: false, error: 'Enter a YouTube link or a direct video URL starting with https://' };
  }

  const driveId = getDriveFileId(url);
  if (driveId) {
    // Store the canonical CDN form so the public page never has to re-parse.
    return { ok: true, url: `https://lh3.googleusercontent.com/d/${driveId}`, kind: 'drive' };
  }

  if (url.startsWith('/')) return { ok: true, url, kind: 'local' };

  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'URL must start with https:// or / for a file in the public folder.' };
  }

  if (/^https?:\/\/(drive|docs)\.google\.com/i.test(url)) {
    return {
      ok: false,
      error: 'That Google link is not a file link. It should look like drive.google.com/file/d/…/view',
    };
  }

  return { ok: true, url, kind: 'external' };
}

/** True when the URL depends on Google serving it — worth warning about. */
export function isHotlinkedDrive(url) {
  return !!getDriveFileId(url);
}
