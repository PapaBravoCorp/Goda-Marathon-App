import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Trash2, Edit3, Users, Hash } from 'lucide-react';
import { getEventCategories, getBibOverview, addEventCategory, updateEventCategory, deleteEventCategory } from '../../utils/services/categories';
import { uploadCourseGpx, deleteStoredImageAt } from '../../utils/services/storage';
import { describeSaveError } from '../../utils/services/errors';
import { CATEGORY_LEVELS, levelLabel } from '../../utils/categoryLevels';
import { formatBibSeries, validateBibSeries } from '../../utils/bibSeries';
import { prepareCourse } from '../../utils/gpx';
import BibSeriesPanel from './BibSeriesPanel';
import CourseMapField from './CourseMapField';

export default function CategoryManager({ eventId, eventSlug }) {
  const [categories, setCategories] = useState([]);
  const [bibOverview, setBibOverview] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  // A course file read and trimmed, waiting for the category to be saved.
  const [pendingCourse, setPendingCourse] = useState(null);

  const emptyForm = {
    name: '', distance: '', elevation: '0m', price: '',
    min_age: 5, max_slots: 200, flag_off_time: '',
    status: 'Open', display_order: 0,
    // Edited as one-per-line text; stored as a jsonb array.
    perks: '', elevation_image: '',
    // Who the distance suits (0016). Empty saves as NULL, which hides it.
    level: '', audience: '',
    // Bib series (0017). Both empty: the database picks one from the distance.
    bib_start: '', bib_end: '',
    // Course map (0019): URL of the uploaded GPX, empty for none.
    route_gpx: '',
  };
  const [formData, setFormData] = useState(emptyForm);

  const perksToLines = (perks) => Array.isArray(perks) ? perks.join('\n') : '';
  const linesToPerks = (text) =>
    text.split('\n').map(l => l.trim()).filter(Boolean);


  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Counts come from get_category_availability, not from reading entrants.
      const [cats, bibs] = await Promise.all([
        getEventCategories(eventId, eventSlug),
        getBibOverview(eventSlug || eventId),
      ]);
      setCategories(cats);
      setBibOverview(bibs);
    } catch (err) {
      setFormError(describeSaveError(err, 'categories'));
    } finally {
      setIsLoading(false);
    }
  }, [eventId, eventSlug]);

  // Declared after loadData deliberately: a dependency array is evaluated
  // during render, so naming it above its own `const` throws.
  useEffect(() => { loadData(); }, [loadData]);

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formData.name.trim()) { setFormError('Category name is required.'); return; }
    if (!formData.distance.trim()) { setFormError('Distance is required.'); return; }
    if (!formData.price || parseInt(formData.price) <= 0) { setFormError('Valid price is required.'); return; }
    const seriesError = validateBibSeries({
      start: formData.bib_start,
      end: formData.bib_end,
      maxSlots: parseInt(formData.max_slots) || 200,
      others: categories.filter(c => c.id !== editingId),
    });
    if (seriesError) { setFormError(seriesError); return; }

    setIsSubmitting(true);
    let uploadedCourse = null;
    try {
      const previous = editingId ? categories.find(c => c.id === editingId) : null;
      let routeGpx = formData.route_gpx || null;
      if (pendingCourse) {
        // Written again under the name being saved, which is the name a
        // runner's watch shows; the file may have been chosen before it was typed.
        const { gpx } = prepareCourse(pendingCourse.source, pendingCourse.lineIndex, formData.name.trim());
        uploadedCourse = await uploadCourseGpx(gpx, pendingCourse.fileName);
        routeGpx = uploadedCourse;
      }
      // Sent only when it changes, so a database without migration 0019 still
      // saves every other edit.
      const courseChanged = routeGpx !== (previous?.route_gpx ?? null);

      const payload = {
        event_id: eventId,
        name: formData.name.trim(),
        distance: formData.distance.trim(),
        elevation: formData.elevation || '0m',
        price: parseInt(formData.price),
        min_age: parseInt(formData.min_age) || 5,
        max_slots: parseInt(formData.max_slots) || 200,
        flag_off_time: formData.flag_off_time || null,
        status: formData.status,
        display_order: parseInt(formData.display_order) || 0,
        perks: linesToPerks(formData.perks),
        elevation_image: formData.elevation_image.trim() || null,
        level: formData.level || null,
        audience: formData.audience.trim() || null,
        // Both null asks the database for a series coded by distance.
        bib_start: String(formData.bib_start).trim() ? parseInt(formData.bib_start) : null,
        bib_end: String(formData.bib_end).trim() ? parseInt(formData.bib_end) : null,
        ...(courseChanged ? { route_gpx: routeGpx } : {}),
      };

      if (editingId) {
        await updateEventCategory(editingId, payload);
      } else {
        await addEventCategory(payload);
      }
      // The row no longer points at the old course file.
      if (courseChanged && previous?.route_gpx) deleteStoredImageAt(previous.route_gpx);
      setFormData(emptyForm);
      setPendingCourse(null);
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (err) {
      // The row still points at the old course, so the new file is an orphan.
      if (uploadedCourse) deleteStoredImageAt(uploadedCourse);
      // The message matters now: after the RLS lockdown the usual cause is an
      // expired session, and "please try again" sends the organiser round the
      // same loop forever.
      setFormError(describeSaveError(err, 'category'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (cat) => {
    setFormData({
      name: cat.name, distance: cat.distance, elevation: cat.elevation || '0m',
      price: cat.price, min_age: cat.min_age || 5, max_slots: cat.max_slots || 200,
      flag_off_time: cat.flag_off_time || '', status: cat.status || 'Open',
      display_order: cat.display_order || 0,
      perks: perksToLines(cat.perks), elevation_image: cat.elevation_image || '',
      level: cat.level || '', audience: cat.audience || '',
      bib_start: cat.bib_start ?? '', bib_end: cat.bib_end ?? '',
      route_gpx: cat.route_gpx || '',
    });
    setPendingCourse(null);
    setEditingId(cat.id);
    setShowForm(true);
    setFormError('');
  };

  const handleDelete = async (id, name) => {
    const category = categories.find(c => c.id === id);
    const count = category?.registration_count || 0;
    const msg = count > 0
      ? `"${name}" has ${count} registrations. Are you sure you want to delete this category?`
      : `Delete category "${name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteEventCategory(id);
      // Nothing points at its course file any more.
      if (category?.route_gpx) deleteStoredImageAt(category.route_gpx);
      await loadData();
    } catch (err) {
      setFormError(describeSaveError(err, 'category'));
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
    setPendingCourse(null);
    setFormError('');
  };

  const formatPrice = (p) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p);

  return (
    <div>
      <div className="admin-media-header">
        <h3 style={{ margin: 0 }}>Race Categories</h3>
        <button className="btn btn-primary admin-action-btn" onClick={() => showForm ? cancelForm() : setShowForm(true)} style={{ gap: '6px' }}>
          {showForm ? <X size={18} /> : <Plus size={18} />}
          <span className="admin-action-label">{showForm ? 'Cancel' : 'Add Category'}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="admin-media-form glass">
          <h4 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>{editingId ? 'Edit Category' : 'New Category'}</h4>
          <div className="admin-media-form-grid">
            <div className="admin-media-form-group">
              <label>Category Name *</label>
              <input name="name" value={formData.name} onChange={handleInput} placeholder="e.g. 5km Trail" />
            </div>
            <div className="admin-media-form-group">
              <label>Distance *</label>
              <input name="distance" value={formData.distance} onChange={handleInput} placeholder="e.g. 5km" />
            </div>
            <div className="admin-media-form-group">
              <label>Elevation</label>
              <input name="elevation" value={formData.elevation} onChange={handleInput} placeholder="e.g. 100m" />
            </div>
            <div className="admin-media-form-group">
              <label>Price (₹) *</label>
              <input name="price" type="number" value={formData.price} onChange={handleInput} placeholder="e.g. 499" />
            </div>
            <div className="admin-media-form-group">
              <label>Min Age</label>
              <input name="min_age" type="number" value={formData.min_age} onChange={handleInput} />
            </div>
            <div className="admin-media-form-group">
              <label>Max Slots</label>
              <input name="max_slots" type="number" value={formData.max_slots} onChange={handleInput} />
            </div>
            <div className="admin-media-form-group">
              <label>Flag-Off Time</label>
              <input name="flag_off_time" value={formData.flag_off_time} onChange={handleInput} placeholder="e.g. 07:10 AM" />
            </div>
            <div className="admin-media-form-group">
              <label>Status</label>
              <select name="status" value={formData.status} onChange={handleInput}>
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
                <option value="Sold Out">Sold Out</option>
              </select>
            </div>
            <div className="admin-media-form-group">
              <label>Display Order</label>
              <input name="display_order" type="number" value={formData.display_order} onChange={handleInput} />
            </div>
            <div className="admin-media-form-group">
              <label htmlFor="cat-level">Level</label>
              <select id="cat-level" name="level" value={formData.level} onChange={handleInput}>
                <option value="">Not set</option>
                {CATEGORY_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>

          <fieldset className="admin-media-form-grid" style={{ marginTop: '0.75rem', border: 'none', padding: 0 }}>
            <legend className="sr-only">Bib series</legend>
            <div className="admin-media-form-group">
              <label htmlFor="cat-bib-start">First Bib Number</label>
              <input id="cat-bib-start" name="bib_start" type="number" min="1" max="999999" value={formData.bib_start} onChange={handleInput} placeholder="Automatic" aria-describedby="cat-bib-hint" />
            </div>
            <div className="admin-media-form-group">
              <label htmlFor="cat-bib-end">Last Bib Number</label>
              <input id="cat-bib-end" name="bib_end" type="number" min="1" max="999999" value={formData.bib_end} onChange={handleInput} placeholder="Automatic" aria-describedby="cat-bib-hint" />
            </div>
          </fieldset>
          <span id="cat-bib-hint" className="admin-field-hint">
            Every runner in this category gets a bib from this range, so the number shows the race.
            Leave both empty for one coded by distance (21 km → 21001–21999). The range must hold at
            least Max Slots numbers, must not overlap another category, and cannot be moved away from
            bibs already issued.
          </span>

          <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="cat-audience">Who It&apos;s For</label>
            <input
              id="cat-audience"
              name="audience"
              value={formData.audience}
              onChange={handleInput}
              maxLength={140}
              placeholder="e.g. First-timers and families; walking is fine"
            />
            <span className="admin-field-hint">
              One line under the category name on the homepage card. Beginner-friendly
              distances are also listed in the homepage&apos;s first-timer guide.
            </span>
          </div>

          {/* Homepage card content */}
          <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="cat-perks">Card Perks — one per line</label>
            <textarea
              id="cat-perks"
              name="perks"
              value={formData.perks}
              onChange={handleInput}
              rows={3}
              placeholder={'Finisher Medal included\nAid stations on route\nTiming chip included'}
              style={{ resize: 'vertical' }}
            />
            <span className="admin-field-hint">Shown as bullets on the homepage card. Leave empty to hide the list.</span>
          </div>
          <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="cat-elev-img">Elevation Profile Image</label>
            <input id="cat-elev-img" name="elevation_image" value={formData.elevation_image} onChange={handleInput} placeholder="https://… link to the route profile image" />
            <span className="admin-field-hint">Revealed by the card&apos;s &ldquo;View Route&rdquo; toggle. Leave empty to hide the toggle.</span>
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <CourseMapField
              value={formData.route_gpx}
              savedValue={editingId ? categories.find(c => c.id === editingId)?.route_gpx : null}
              pending={pendingCourse}
              onPending={(next) => { setPendingCourse(next); setFormError(''); }}
              onChange={(url) => setFormData(prev => ({ ...prev, route_gpx: url }))}
              categoryName={formData.name}
              categoryDistance={formData.distance}
              disabled={isSubmitting}
            />
          </div>

          {formError && <div className="admin-login-error" style={{ marginTop: '0.75rem' }}><span>{formError}</span></div>}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? (pendingCourse ? 'Uploading course…' : 'Saving...') : editingId ? 'Update Category' : 'Add Category'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-outline" onClick={cancelForm}>Cancel Edit</button>
            )}
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="admin-empty-state">Loading categories...</div>
      ) : categories.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
          <p>No categories configured yet. Click "Add Category" to create race categories.</p>
        </div>
      ) : (
        <>
        <BibSeriesPanel categories={categories} overview={bibOverview} />
        <div className="admin-cat-grid">
          {categories.map(cat => {
            const registered = cat.registration_count || 0;
            const pct = cat.max_slots > 0 ? Math.min((registered / cat.max_slots) * 100, 100) : 0;
            return (
              <div key={cat.id} className="admin-cat-card glass">
                <div className="admin-cat-card-header">
                  <div>
                    <h4 className="admin-cat-name">{cat.name}</h4>
                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>{cat.distance} • Elev: {cat.elevation || '0m'}</span>
                  </div>
                  <span className={`admin-badge ${cat.status === 'Open' ? 'admin-badge-paid' : cat.status === 'Sold Out' ? 'admin-badge-cancelled' : 'admin-badge-pending'}`}>
                    {cat.status}
                  </span>
                </div>

                <div className="admin-cat-card-body">
                  <div className="admin-cat-price">{formatPrice(cat.price)}</div>
                  {formatBibSeries(cat) && (
                    <div className="admin-cat-bibs">
                      <Hash size={14} aria-hidden="true" /> Bibs {formatBibSeries(cat)}
                    </div>
                  )}
                  <div className="admin-cat-meta">
                    <span>Min Age: {cat.min_age || 5}</span>
                    <span>Flag-off: {cat.flag_off_time || '—'}</span>
                    <span>Level: {levelLabel(cat.level) || 'Not set'}</span>
                    <span>Course map: {cat.route_gpx ? 'Uploaded' : 'None'}</span>
                  </div>
                  <div className="admin-cat-slots">
                    <div className="admin-cat-slots-label">
                      <Users size={14} />
                      <span>{registered} / {cat.max_slots} slots</span>
                    </div>
                    <div className="admin-cat-slots-bar">
                      <div className="admin-cat-slots-fill" style={{
                        width: `${pct}%`,
                        background: pct >= 90 ? '#ff4444' : pct >= 70 ? 'var(--color-accent)' : 'var(--color-primary)'
                      }}></div>
                    </div>
                  </div>
                </div>

                <div className="admin-cat-card-actions">
                  <button className="admin-cat-action-btn" onClick={() => startEdit(cat)}>
                    <Edit3 size={14} /> Edit
                  </button>
                  <button className="admin-cat-action-btn admin-cat-delete-btn" onClick={() => handleDelete(cat.id, cat.name)}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
