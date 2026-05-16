import React, { useState } from 'react';
import { X, Save } from 'lucide-react';

export default function EditRegistrationModal({ registration, categories, onSave, onClose }) {
  const [formData, setFormData] = useState({
    first_name: registration.first_name || '',
    last_name: registration.last_name || '',
    email: registration.email || '',
    category: registration.category || '',
    tshirt_size: registration.tshirt_size || '',
    payment_status: registration.payment_status || 'PENDING',
    bib: registration.bib || '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(registration.id, formData);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal glass" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3>Edit Registration</h3>
          <button className="admin-modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="admin-modal-body">
          <div className="admin-media-form-grid">
            <div className="admin-media-form-group">
              <label>First Name</label>
              <input name="first_name" value={formData.first_name} onChange={handleInput} />
            </div>
            <div className="admin-media-form-group">
              <label>Last Name</label>
              <input name="last_name" value={formData.last_name} onChange={handleInput} />
            </div>
            <div className="admin-media-form-group">
              <label>Email</label>
              <input name="email" type="email" value={formData.email} onChange={handleInput} />
            </div>
            <div className="admin-media-form-group">
              <label>Bib Number</label>
              <input name="bib" value={formData.bib} onChange={handleInput} />
            </div>
            <div className="admin-media-form-group">
              <label>Category</label>
              <select name="category" value={formData.category} onChange={handleInput}>
                <option value="">Select...</option>
                {categories.map((cat, i) => (
                  <option key={i} value={typeof cat === 'string' ? cat : cat.name}>
                    {typeof cat === 'string' ? cat : cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-media-form-group">
              <label>T-Shirt Size</label>
              <select name="tshirt_size" value={formData.tshirt_size} onChange={handleInput}>
                <option value="">Select...</option>
                {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="admin-media-form-group">
              <label>Payment Status</label>
              <select name="payment_status" value={formData.payment_status} onChange={handleInput}>
                <option value="PENDING">Pending</option>
                <option value="PAID">Paid</option>
                <option value="REFUNDED">Refunded</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="admin-modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ gap: '6px', display: 'inline-flex', alignItems: 'center' }}>
              <Save size={16} /> {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
