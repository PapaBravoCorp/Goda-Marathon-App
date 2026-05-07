import React from 'react';
import { Button } from '../../components/Button';
import { INDIAN_STATES } from '../../utils/constants';

export default function StepOne({ formData, handleInputChange, onNext, errorFields = {} }) {
  const getInputClass = (fieldName) => `w-full bg-white/5 border rounded-lg p-3 text-white focus:outline-none focus:ring-2 transition-colors ${errorFields[fieldName] ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-primary'}`;
  const getSelectClass = (fieldName) => `w-full bg-white/5 border rounded-lg p-3 text-white focus:outline-none focus:ring-2 [&>option]:bg-gray-800 transition-colors ${errorFields[fieldName] ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-primary'}`;

  return (
    <form onSubmit={onNext} className="space-y-8" noValidate>
      <div>
        <h2 className="text-2xl font-bold mb-6 text-white">Participant Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium mb-2 text-gray-200">First Name *</label>
            <input type="text" id="firstName" name="firstName" value={formData.firstName} onChange={handleInputChange} required placeholder="John" className={getInputClass('firstName')} />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium mb-2 text-gray-200">Last Name *</label>
            <input type="text" id="lastName" name="lastName" value={formData.lastName} onChange={handleInputChange} required placeholder="Doe" className={getInputClass('lastName')} />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2 text-gray-200">Email Address *</label>
            <input type="email" id="email" name="email" value={formData.email} onChange={handleInputChange} required placeholder="john@example.com" className={getInputClass('email')} />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-2 text-gray-200">Phone Number *</label>
            <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleInputChange} required placeholder="9876543210" className={getInputClass('phone')} />
          </div>
          <div>
            <label htmlFor="dob" className="block text-sm font-medium mb-2 text-gray-200">Date of Birth *</label>
            <input type="date" id="dob" name="dob" value={formData.dob} onChange={handleInputChange} required className={getInputClass('dob')} />
          </div>
          <div>
            <label htmlFor="gender" className="block text-sm font-medium mb-2 text-gray-200">Gender *</label>
            <select id="gender" name="gender" value={formData.gender} onChange={handleInputChange} required className={getSelectClass('gender')}>
              <option value="">Select...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other / Prefer not to say</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-4 text-primary">Health & Safety</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="bloodGroup" className="block text-sm font-medium mb-2 text-gray-200">Blood Group *</label>
            <select id="bloodGroup" name="bloodGroup" value={formData.bloodGroup} onChange={handleInputChange} required className={getSelectClass('bloodGroup')}>
              <option value="">Select...</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
            </select>
          </div>
          <div className="hidden md:block">
            {/* Empty space filler for layout */}
          </div>
          <div>
            <label htmlFor="emergencyContactName" className="block text-sm font-medium mb-2 text-gray-200">Emergency Contact Name *</label>
            <input type="text" id="emergencyContactName" name="emergencyContactName" value={formData.emergencyContactName} onChange={handleInputChange} required placeholder="Contact Person" className={getInputClass('emergencyContactName')} />
          </div>
          <div>
            <label htmlFor="emergencyContactNumber" className="block text-sm font-medium mb-2 text-gray-200">Emergency Contact Number *</label>
            <input type="tel" id="emergencyContactNumber" name="emergencyContactNumber" value={formData.emergencyContactNumber} onChange={handleInputChange} required placeholder="9876543210" className={getInputClass('emergencyContactNumber')} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="hasMedicalCondition" className="flex items-center cursor-pointer mb-2">
              <input type="checkbox" id="hasMedicalCondition" name="hasMedicalCondition" checked={formData.hasMedicalCondition} onChange={handleInputChange} className="w-5 h-5 mr-3 rounded border-white/10 bg-white/5 text-primary focus:ring-primary focus:ring-offset-gray-900" />
              <span className="text-gray-200 text-sm">I have a pre-existing medical condition or allergy organizers should know about</span>
            </label>
            {formData.hasMedicalCondition && (
              <textarea id="allergies" name="allergies" value={formData.allergies} onChange={handleInputChange} placeholder="Please describe your medical conditions or allergies..." required className="w-full min-h-[80px] bg-white/5 border border-white/10 rounded-lg p-3 mt-2 text-white focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-4 text-primary">Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="state" className="block text-sm font-medium mb-2 text-gray-200">State *</label>
            <select id="state" name="state" value={formData.state} onChange={handleInputChange} required className={getSelectClass('state')}>
              <option value="">Select State...</option>
              {INDIAN_STATES.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="city" className="block text-sm font-medium mb-2 text-gray-200">City *</label>
            <input type="text" id="city" name="city" value={formData.city} onChange={handleInputChange} required placeholder="City" className={getInputClass('city')} />
          </div>
          <div>
            <label htmlFor="pincode" className="block text-sm font-medium mb-2 text-gray-200">Pincode *</label>
            <input type="text" id="pincode" name="pincode" value={formData.pincode} onChange={handleInputChange} required placeholder="123456" className={getInputClass('pincode')} />
          </div>
          <div>
            <label htmlFor="clubName" className="block text-sm font-medium mb-2 text-gray-200">Running Club / Company (Optional)</label>
            <input type="text" id="clubName" name="clubName" value={formData.clubName} onChange={handleInputChange} placeholder="Club Name" className={getInputClass('clubName')} />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-6 border-t border-white/10">
        <Button type="submit" variant="primary">Next Step</Button>
      </div>
    </form>
  );
}
