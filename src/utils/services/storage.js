import { supabase } from '../supabaseClient';

// TODO: [AUTH] Uploads currently go through the anon key, matching the rest of
// the admin panel. Tighten the bucket policies alongside real admin auth.

export const BUCKET = 'past-events';
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // must match the bucket's file_size_limit
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ACCEPTED_VIDEO_TYPES = ['video/mp4'];

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
function safeName(name) {
  const dot = name.lastIndexOf('.');
  const ext = dot > -1 ? name.slice(dot + 1).toLowerCase() : 'jpg';
  const stem = (dot > -1 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'photo';
  // Collisions would otherwise overwrite an existing photo silently.
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return `${stem}-${unique}.${ext}`;
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

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error(
        'Storage bucket "past-events" does not exist. Run migration 0003_past_events.sql first.'
      );
    }
    throw error;
  }

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
 * Recover the object path from one of our own public URLs.
 *
 * Lets a replaced cover image be deleted without storing its path in a column
 * of its own — past_events keeps only cover_image. Returns null for anything
 * that is not a file in this bucket (a Drive link, a /images path), so callers
 * never try to delete something they do not own.
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
