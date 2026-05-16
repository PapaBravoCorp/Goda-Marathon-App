import React from 'react';
import { Button } from '../../components/Button';
import { CATEGORY_PRICING, CATEGORY_RULES } from '../../utils/constants';

export default function StepTwo({ formData, handleInputChange, onNext, onBack, age, formatCurrency, errorFields = {}, dbCategories = [] }) {
  const getInputClass = (fieldName) => `w-full bg-white/5 border rounded-lg p-3 text-white focus:outline-none focus:ring-2 transition-colors ${errorFields[fieldName] ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-primary'}`;
  const getSelectClass = (fieldName) => `w-full bg-white/5 border rounded-lg p-3 text-white focus:outline-none focus:ring-2 [&>option]:bg-gray-800 transition-colors ${errorFields[fieldName] ? 'border-red-500 focus:ring-red-500' : 'border-white/10 focus:ring-primary'}`;

  // Build category list: prefer DB, fallback to constants
  const categoryList = dbCategories.length > 0
    ? dbCategories.map(c => ({
        name: c.name,
        price: c.price,
        minAge: c.min_age || 5,
        maxSlots: c.max_slots,
        currentRegs: c.current_registrations || 0,
        status: c.status || 'Open',
        distance: c.distance,
        elevation: c.elevation,
      }))
    : Object.keys(CATEGORY_PRICING).map(cat => ({
        name: cat,
        price: CATEGORY_PRICING[cat],
        minAge: CATEGORY_RULES[cat]?.minAge || 5,
        maxSlots: null,
        currentRegs: 0,
        status: 'Open',
      }));

  return (
    <form onSubmit={onNext} className="space-y-8" noValidate>
      <div>
        <h2 className="text-2xl font-bold mb-4 text-white">Race Category</h2>
        {age !== null && (
          <p className="mb-4 text-gray-400 text-sm">Based on your DOB, your age is <strong className="text-white">{age} years</strong>.</p>
        )}
        <div className={`flex flex-col gap-4 p-1 rounded-xl transition-colors ${errorFields.category ? 'border border-red-500 bg-red-500/5' : 'border border-transparent'}`}>
          {categoryList.map((cat, i) => {
            const isEligible = age === null || age >= cat.minAge;
            const isSoldOut = cat.status === 'Sold Out';
            const isClosed = cat.status === 'Closed';
            const isDisabled = !isEligible || isSoldOut || isClosed;
            return (
              <div key={i} className={`relative ${isDisabled ? 'opacity-50' : ''}`}>
                <label 
                  htmlFor={`cat-${i}`}
                  className={`flex items-center p-4 rounded-xl cursor-${isDisabled ? 'not-allowed' : 'pointer'} border transition-colors ${formData.category === cat.name ? 'bg-primary/10 border-primary' : 'bg-white/5 border-transparent hover:border-white/20'}`}
                >
                  <input 
                    type="radio" 
                    id={`cat-${i}`}
                    name="category" 
                    value={cat.name} 
                    checked={formData.category === cat.name} 
                    onChange={handleInputChange} 
                    required 
                    disabled={isDisabled} 
                    className="w-5 h-5 mr-4 text-primary focus:ring-primary focus:ring-offset-gray-900 border-white/20 bg-black/50" 
                  />
                  <div className="flex-1">
                    <span className="text-lg font-semibold text-white">{cat.name}</span>
                    {cat.distance && <span className="text-xs text-gray-400 ml-2">{cat.distance}{cat.elevation && cat.elevation !== '0m' ? ` • ${cat.elevation} elev.` : ''}</span>}
                  </div>
                  <div className="text-right">
                    <span className="font-extrabold block text-white">{formatCurrency(cat.price)}</span>
                    {!isEligible && <span className="text-xs text-red-500">Min age {cat.minAge}</span>}
                    {isSoldOut && <span className="text-xs text-red-500">Sold Out</span>}
                    {isClosed && <span className="text-xs text-yellow-500">Closed</span>}
                    {cat.maxSlots && cat.status === 'Open' && (
                      <span className="text-xs text-gray-500">{cat.maxSlots - cat.currentRegs} slots left</span>
                    )}
                  </div>
                </label>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="tshirtSize" className="block text-sm font-medium mb-2 text-gray-200">T-Shirt Size *</label>
          <select id="tshirtSize" name="tshirtSize" value={formData.tshirtSize} onChange={handleInputChange} required className={getSelectClass('tshirtSize')}>
            <option value="">Select Size...</option>
            <option value="XS">X-Small</option>
            <option value="S">Small</option>
            <option value="M">Medium</option>
            <option value="L">Large</option>
            <option value="XL">X-Large</option>
            <option value="XXL">XX-Large</option>
          </select>
        </div>
        <div>
          <label htmlFor="estimatedTime" className="block text-sm font-medium mb-2 text-gray-200">Estimated Finish Time</label>
          <input type="text" id="estimatedTime" name="estimatedTime" value={formData.estimatedTime} onChange={handleInputChange} placeholder="HH:MM:SS" className={getInputClass('estimatedTime')} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="couponCode" className="block text-sm font-medium mb-2 text-gray-200">Coupon / Referral Code</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input type="text" id="couponCode" name="couponCode" value={formData.couponCode} onChange={handleInputChange} placeholder="Enter code" className={getInputClass('couponCode')} />
            <Button type="button" variant="outline" className="sm:w-auto w-full">Apply</Button>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-6 border-t border-white/10">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary">Next Step</Button>
      </div>
    </form>
  );
}
