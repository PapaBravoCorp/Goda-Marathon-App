import { supabase } from '../supabaseClient';
import { HERO_FOLDER, parseUploadedHero } from '../heroVariants';

// TODO: [AUTH] Uploads currently go through the anon key, matching the rest of
// the admin panel. Tighten the bucket policies alongside real admin auth.

export const BUCKET = 'past-events';
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // must match the bucket's file_size_limit
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ACCEPTED_VIDEO_TYPES = ['video/mp4'];
export const SPONSOR_FOLDER = 'sponsors';
export const COURSE_FOLDER = 'courses';
// Must be in the bucket's allowed_mime_types (0019). Kept here rather than
// imported from utils/gpx, which would pull the GPX parser into the main bundle.
const GPX_CONTENT_TYPE = 'application/gpx+xml';

/**
 * Sanitise a folder path one segment at a time, so nesting like
 * "2025/covers" survives while anything needing URL-escaping does not.
 */
function safeFolder(folder) {
  const cleaned = String(folder || '')
    .split('/')
    .map(seg => seg.replace(/[^a-zA-Z0-9_-]/g, ''))
    .filter(Boolean)
    .join('/');
  return cleaned || 'misc';
}

/** Filenames become URLs — strip anything that would need escaping. */
function safeStem(name) {
  const dot = name.lastIndexOf('.');
  const stem = (dot > -1 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'photo';
  // Collisions would otherwise overwrite an existing photo silently.
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return `${stem}-${unique}`;
}

function safeName(name) {
  const dot = name.lastIndexOf('.');
  const ext = dot > -1 ? name.slice(dot + 1).toLowerCase() : 'jpg';
  return `${safeStem(name)}.${ext}`;
}

function describeStorageError(error) {
  if (/bucket not found/i.test(error?.message || '')) {
    return new Error(
      'Storage bucket "past-events" does not exist. Run migration 0003_past_events.sql first.'
    );
  }
  return error;
}

export function validateFile(file) {
  const accepted = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES];
  if (!accepted.includes(file.type)) {
    return `${file.name}: unsupported type (${file.type || 'unknown'}). Use JPG, PNG, WEBP, GIF or MP4.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `${file.name}: ${mb} MB exceeds the 10 MB limit. Resize it and try again.`;
  }
  return null;
}

/**
 * Upload one file. `folder` is a path inside the bucket, e.g. "2025" for an
 * edition's gallery or "2025/covers" for its hero image.
 * Returns { publicUrl, storagePath, mediaType }.
 */
export const uploadMedia = async (file, folder) => {
  const validationError = validateFile(file);
  if (validationError) throw new Error(validationError);

  const storagePath = `${safeFolder(folder)}/${safeName(file.name)}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { cacheControl: '31536000', upsert: false });

  if (error) throw describeStorageError(error);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return {
    publicUrl: data.publicUrl,
    storagePath,
    mediaType: ACCEPTED_VIDEO_TYPES.includes(file.type) ? 'video' : 'image',
  };
};

/** Remove an uploaded object. External URLs have no storage_path — skip them. */
export const deleteStoredMedia = async (storagePath) => {
  if (!storagePath) return;
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) console.error('Failed to remove stored file', storagePath, error);
};

/**
 * Upload a hero photo already resized by resizeHero(). Returns the public URL
 * of the widest file, which is the one to store on the event row.
 *
 * All or nothing: a set missing a width would leave holes in the srcset, so if
 * any file fails the ones that made it are removed again.
 */
export const uploadHeroVariants = async (resized, originalName) => {
  const dir = `${HERO_FOLDER}/${safeStem(originalName || 'hero')}`;
  const pathFor = (width) => `${dir}/${width}.${resized.ext}`;

  const results = await Promise.all(resized.variants.map(({ width, blob }) =>
    supabase.storage
      .from(BUCKET)
      .upload(pathFor(width), blob, {
        contentType: resized.contentType,
        cacheControl: '31536000',
        upsert: false,
      })
      .then(({ error }) => ({ width, error }), error => ({ width, error }))
  ));

  const failed = results.find(r => r.error);
  if (failed) {
    const uploaded = results.filter(r => !r.error).map(r => pathFor(r.width));
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
    throw describeStorageError(failed.error);
  }

  return supabase.storage.from(BUCKET).getPublicUrl(pathFor(resized.width)).data.publicUrl;
};

/**
 * Upload a sponsor logo already processed by prepareLogo(). Returns its
 * public URL, which is all the sponsors row stores.
 */
export const uploadSponsorLogo = async (logo, originalName) => {
  const path = `${SPONSOR_FOLDER}/${safeStem(originalName || 'logo')}.${logo.ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, logo.blob, {
      contentType: logo.contentType,
      cacheControl: '31536000',
      upsert: false,
    });
  if (error) throw describeStorageError(error);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
};

/**
 * Upload an edition cover already resized by resizeCover(), under
 * "<year>/covers". Returns its public URL, which is all past_events stores.
 */
export const uploadCoverPhoto = async (cover, originalName, year) => {
  const path = `${safeFolder(year)}/covers/${safeStem(originalName || 'cover')}.${cover.ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, cover.blob, {
      contentType: cover.contentType,
      cacheControl: '31536000',
      upsert: false,
    });
  if (error) throw describeStorageError(error);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
};

/**
 * Upload a category's course file, already trimmed by prepareCourse(), under
 * "courses". Returns its public URL, which is all event_categories stores.
 */
export const uploadCourseGpx = async (gpx, originalName) => {
  const path = `${COURSE_FOLDER}/${safeStem(originalName || 'course')}.gpx`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([gpx], { type: GPX_CONTENT_TYPE }), {
      contentType: GPX_CONTENT_TYPE,
      cacheControl: '31536000',
      upsert: false,
    });
  if (error) {
    // The bucket lists the file types it takes, and GPX joins the list in 0019.
    if (/mime type/i.test(error.message || '')) {
      throw new Error(
        'Storage does not accept GPX files yet. Run supabase/migrations/0019_category_course_maps.sql in the Supabase SQL editor, then save again.'
      );
    }
    throw describeStorageError(error);
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
};

/** The text of a course file. A plain fetch: the bucket is public. */
export const fetchCourseGpx = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The course file returned HTTP ${response.status}.`);
  return response.text();
};

/**
 * A link that saves a course file rather than opening it as text. The
 * `download` attribute is ignored across origins, so for a file in our bucket
 * Supabase is asked to send it as an attachment under `fileName`.
 */
export const courseDownloadUrl = (url, fileName) => {
  if (!storagePathFromPublicUrl(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(fileName)}`;
};

/** True for a cover uploaded by uploadCoverPhoto, as opposed to a gallery file or a link. */
export const isUploadedCover = (url) => /^[^/]+\/covers\//.test(storagePathFromPublicUrl(url) || '');

/**
 * Remove the file(s) behind one of our public URLs: every width of an uploaded
 * hero, or the single file of any other upload. Does nothing for a URL we do
 * not host, and never throws -- callers use it to tidy up after a save.
 */
export const deleteStoredImageAt = async (url) => {
  const hero = parseUploadedHero(url);
  const paths = (hero ? hero.widths.map(hero.urlFor) : [url])
    .map(storagePathFromPublicUrl)
    .filter(Boolean);
  if (!paths.length) return;

  try {
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) throw error;
  } catch (error) {
    console.error('Failed to remove stored files', paths, error);
  }
};

/**
 * Recover the object path from one of our own public URLs.
 *
 * Lets a replaced hero photo be deleted without storing its path in a column
 * of its own — events keeps only hero_image. Returns null for anything that is
 * not a file in this bucket (a Drive link, a /images path), so callers never
 * try to delete something they do not own.
 */
export const storagePathFromPublicUrl = (url) => {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
};

/** Used by the admin panel to warn when the bucket is missing. */
export const bucketExists = async () => {
  const { error } = await supabase.storage.from(BUCKET).list('', { limit: 1 });
  return !error;
};
