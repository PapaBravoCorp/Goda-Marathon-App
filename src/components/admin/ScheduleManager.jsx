import React, { useState, useEffect } from 'react';
import { Plus, X, Trash2, Edit3, Clock } from 'lucide-react';
import { getEventSchedule, addScheduleItem, updateScheduleItem, deleteScheduleItem } from '../../utils/storage';

export default function ScheduleManager({ eventId }) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const emptyForm = { time: '', title: '', day_label: '', display_order: 0 };
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => { loadData(); }, [eventId]);

  const loadData = async () => {
    setIsLoading(true);
    const data = await getEventSchedule(eventId);
    setItems(data);
    setIsLoading(false);
  };

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formData.time.trim()) { setFormError('Time is required.'); return; }
    if (!formData.title.trim()) { setFormError('Title is required.'); return; }

    setIsSubmitting(true);
    try {
      const payload = {
        event_id: eventId,
        time: formData.time.trim(),
        title: formData.title.trim(),
        day_label: formData.day_label.trim() || null,
        display_order: parseInt(formData.display_order) || 0,
      };
      if (editingId) {
        await updateScheduleItem(editingId, payload);
      } else {
        await addScheduleItem(payload);
      }
      setFormData(emptyForm);
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (err) {
      setFormError('Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (item) => {
    setFormData({
      time: item.time, title: item.title,
      day_label: item.day_label || '', display_order: item.display_order || 0,
    });
    setEditingId(item.id);
    setShowForm(true);
    setFormError('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this schedule item?')) return;
    try {
      await deleteScheduleItem(id);
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

  // Group items by day_label
  const groups = [];
  let currentGroup = null;
  items.forEach(item => {
    if (item.day_label) {
      currentGroup = { day: item.day_label, items: [item] };
      groups.push(currentGroup);
    } else if (currentGroup) {
      currentGroup.items.push(item);
    } else {
      currentGroup = { day: '', items: [item] };
      groups.push(currentGroup);
    }
  });

  return (
    <div>
      <div className="admin-media-header">
        <h3 style={{ margin: 0 }}>Race Day Schedule</h3>
        <button className="btn btn-primary admin-action-btn" onClick={() => showForm ? cancelForm() : setShowForm(true)} style={{ gap: '6px' }}>
          {showForm ? <X size={18} /> : <Plus size={18} />}
          <span className="admin-action-label">{showForm ? 'Cancel' : 'Add Item'}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="admin-media-form glass">
          <h4 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>{editingId ? 'Edit Schedule Item' : 'New Schedule Item'}</h4>
          <div className="admin-media-form-grid">
            <div className="admin-media-form-group">
              <label>Time *</label>
              <input name="time" value={formData.time} onChange={handleInput} placeholder="e.g. 06:45 AM" />
            </div>
            <div className="admin-media-form-group">
              <label>Title *</label>
              <input name="title" value={formData.title} onChange={handleInput} placeholder="e.g. 15km Category Starts" />
            </div>
            <div className="admin-media-form-group">
              <label>Day/Group Label</label>
              <input name="day_label" value={formData.day_label} onChange={handleInput} placeholder="e.g. Sunday, Aug 9 (Race Day)" />
            </div>
            <div className="admin-media-form-group">
              <label>Display Order</label>
              <input name="display_order" type="number" value={formData.display_order} onChange={handleInput} />
            </div>
          </div>
          {formError && <div className="admin-login-error" style={{ marginTop: '0.75rem' }}><span>{formError}</span></div>}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingId ? 'Update Item' : 'Add Item'}
            </button>
            {editingId && <button type="button" className="btn btn-outline" onClick={cancelForm}>Cancel Edit</button>}
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="admin-empty-state">Loading schedule...</div>
      ) : items.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
          <p>No schedule items yet. Click "Add Item" to build the race day timeline.</p>
        </div>
      ) : (
        <div className="admin-schedule-timeline glass" style={{ padding: '1.5rem', borderRadius: '14px' }}>
          {groups.map((group, gi) => (
            <div key={gi} className="admin-schedule-group">
              {group.day && <h4 className="admin-schedule-day">{group.day}</h4>}
              {group.items.map(item => (
                <div key={item.id} className="admin-schedule-item">
                  <div className="admin-schedule-dot"></div>
                  <div className="admin-schedule-content">
                    <div className="admin-schedule-row">
                      <div>
                        <span className="admin-schedule-time"><Clock size={14} /> {item.time}</span>
                        <span className="admin-schedule-title">{item.title}</span>
                      </div>
                      <div className="admin-schedule-actions">
                        <button className="admin-cat-action-btn" onClick={() => startEdit(item)} title="Edit">
                          <Edit3 size={14} />
                        </button>
                        <button className="admin-cat-action-btn admin-cat-delete-btn" onClick={() => handleDelete(item.id)} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
