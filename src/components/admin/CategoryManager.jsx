import React, { useState, useEffect } from 'react';
import { Plus, X, Trash2, Edit3, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { getEventCategories, addEventCategory, updateEventCategory, deleteEventCategory, getRegistrations } from '../../utils/storage';

export default function CategoryManager({ eventId }) {
  const [categories, setCategories] = useState([]);
  const [regCounts, setRegCounts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const emptyForm = {
    name: '', distance: '', elevation: '0m', price: '',
    min_age: 5, max_slots: 200, flag_off_time: '',
    status: 'Open', display_order: 0
  };
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => { loadData(); }, [eventId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cats, regs] = await Promise.all([
        getEventCategories(eventId),
        getRegistrations(eventId)
      ]);
      setCategories(cats);
      const counts = {};
      regs.forEach(r => {
        if (r.payment_status !== 'CANCELLED') {
          counts[r.category] = (counts[r.category] || 0) + 1;
        }
      });
      setRegCounts(counts);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

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

    setIsSubmitting(true);
    try {
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
      };

      if (editingId) {
        await updateEventCategory(editingId, payload);
      } else {
        await addEventCategory(payload);
      }
      setFormData(emptyForm);
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (err) {
      setFormError('Failed to save category. Please try again.');
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
    });
    setEditingId(cat.id);
    setShowForm(true);
    setFormError('');
  };

  const handleDelete = async (id, name) => {
    const count = regCounts[name] || 0;
    const msg = count > 0
      ? `"${name}" has ${count} registrations. Are you sure you want to delete this category?`
      : `Delete category "${name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteEventCategory(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
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
          </div>
          {formError && <div className="admin-login-error" style={{ marginTop: '0.75rem' }}><span>{formError}</span></div>}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingId ? 'Update Category' : 'Add Category'}
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
        <div className="admin-cat-grid">
          {categories.map(cat => {
            const registered = regCounts[cat.name] || 0;
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
                  <div className="admin-cat-meta">
                    <span>Min Age: {cat.min_age || 5}</span>
                    <span>Flag-off: {cat.flag_off_time || '—'}</span>
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
      )}
    </div>
  );
}
