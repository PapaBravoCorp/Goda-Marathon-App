import { supabase } from '../supabaseClient';

const TABLE = 'site_settings';

// The row is read on every page (theme, header logo, footer contacts), so it
// is fetched once per visit and shared, and the last copy is kept in the
// browser so a returning visitor's header shows the right logo straight away
// instead of flashing the old one while the request is in flight.
const CACHE_KEY = 'goda.siteSettings';

function readCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(row) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(row));
  } catch {
    // Private browsing or full storage: the next visit simply fetches first.
  }
}

// undefined: nothing known yet. Otherwise the newest row this browser has seen.
let current = readCache();
let request = null;
const listeners = new Set();

function publish(row) {
  current = row;
  writeCache(row);
  listeners.forEach(listener => listener(row));
}

async function fetchRow() {
  try {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', true).maybeSingle();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching site settings', error);
    return null;
  }
}

/**
 * The single site_settings row (migrations 0018 and 0020), or null. Never
 * rejects: before the migrations run, or offline, callers fall back to their
 * defaults.
 *
 * Every caller in a visit shares one request. The admin panel passes
 * `fresh: true` so it never edits a copy that another tab has since changed.
 */
export const getSiteSettings = ({ fresh = false } = {}) => {
  if (!request || fresh) {
    const pending = fetchRow();
    request = pending;
    pending.then(row => {
      if (row) publish(row);
      // A failure is not remembered, so the next caller tries again.
      else if (request === pending) request = null;
    });
  }
  return request;
};

/** The newest row known without waiting: undefined before the first answer. */
export const peekSiteSettings = () => current;

/** Called with the new row whenever it is fetched or saved. Returns an unsubscribe function. */
export const subscribeSiteSettings = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Admin only. Throws, so the caller can report why a save failed. On success
 * every page open in this tab picks up the change without a reload.
 */
export const updateSiteSettings = async (updates) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', true)
    .select()
    .single();
  if (error) throw error;
  publish(data);
  request = Promise.resolve(data);
  return data;
};
