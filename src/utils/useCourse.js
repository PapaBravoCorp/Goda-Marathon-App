import { useEffect, useState } from 'react';
import { fetchCourseGpx } from './services/storage';
import { readCourse } from './gpx';

// Per page load: switching between distances, or back again, fetches and
// measures each file once.
const loading = new Map();
const loaded = new Map();

function loadCourse(url) {
  let pending = loading.get(url);
  if (!pending) {
    pending = fetchCourseGpx(url).then(text => {
      const course = readCourse(text);
      loaded.set(url, course);
      return course;
    });
    loading.set(url, pending);
    // A failure is not remembered, so showing the course again retries it.
    pending.catch(() => loading.delete(url));
  }
  return pending;
}

/**
 * The course at `url`, measured: { course, error }, both null while it loads.
 * A course already loaded is returned straight away, without a loading frame.
 */
export function useCourse(url) {
  const [result, setResult] = useState({ url: null, course: null, error: null });

  useEffect(() => {
    if (!url || loaded.has(url)) return undefined;
    let live = true;
    loadCourse(url).then(
      course => { if (live) setResult({ url, course, error: null }); },
      error => { if (live) setResult({ url, course: null, error }); },
    );
    return () => { live = false; };
  }, [url]);

  if (loaded.has(url)) return { course: loaded.get(url), error: null };
  return result.url === url ? result : { course: null, error: null };
}
