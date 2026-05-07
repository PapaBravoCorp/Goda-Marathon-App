import React from 'react';
import { Button } from '../../components/Button';
import { CATEGORY_PRICING } from '../../utils/constants';
// Optional: import { FaShieldAlt } from 'react-icons/fa'; // if available

export default function StepThree({ 
  formData, 
  waivers, 
  handleWaiverChange, 
  onSubmit, 
  onBack, 
  isSubmitting, 
  formatCurrency, 
  calculateTotal,
  errorFields = {}
}) {
  const getCheckboxClass = (fieldName) => `mt-1 w-5 h-5 mr-3 rounded border bg-white/5 focus:ring-primary focus:ring-offset-gray-900 shrink-0 transition-colors ${errorFields[fieldName] ? 'border-red-500 text-red-500 focus:ring-red-500 bg-red-500/10' : 'border-white/10 text-primary'}`;

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      <h2 className="text-2xl font-bold text-white">Waivers & Payment</h2>
      
      {/* Waivers Section */}
      <div className="bg-white/5 border border-white/10 p-6 rounded-xl">
        <h3 className="text-lg font-semibold mb-4 text-primary">Declarations (Mandatory)</h3>
        
        <div className="space-y-4">
          <label htmlFor="isMedicallyFit" className="flex items-start cursor-pointer">
            <input type="checkbox" id="isMedicallyFit" name="isMedicallyFit" checked={waivers.isMedicallyFit} onChange={handleWaiverChange} required className={getCheckboxClass('isMedicallyFit')} />
            <span className={`text-sm leading-relaxed ${errorFields.isMedicallyFit ? 'text-red-400 font-medium' : 'text-gray-200'}`}>I declare that I am physically fit and have sufficiently trained to participate in this event.</span>
          </label>
          
          <label htmlFor="acceptsRisk" className="flex items-start cursor-pointer">
            <input type="checkbox" id="acceptsRisk" name="acceptsRisk" checked={waivers.acceptsRisk} onChange={handleWaiverChange} required className={getCheckboxClass('acceptsRisk')} />
            <span className={`text-sm leading-relaxed ${errorFields.acceptsRisk ? 'text-red-400 font-medium' : 'text-gray-200'}`}>I understand that participating in a marathon involves potential risks and I assume full responsibility for any injury or health issue.</span>
          </label>

          <label htmlFor="acceptsRefundPolicy" className="flex items-start cursor-pointer">
            <input type="checkbox" id="acceptsRefundPolicy" name="acceptsRefundPolicy" checked={waivers.acceptsRefundPolicy} onChange={handleWaiverChange} required className={getCheckboxClass('acceptsRefundPolicy')} />
            <span className={`text-sm leading-relaxed ${errorFields.acceptsRefundPolicy ? 'text-red-400 font-medium' : 'text-gray-200'}`}>I agree to the cancellation and refund policy (Tickets are non-refundable and non-transferable).</span>
          </label>

          <label htmlFor="consentsToMedia" className="flex items-start cursor-pointer">
            <input type="checkbox" id="consentsToMedia" name="consentsToMedia" checked={waivers.consentsToMedia} onChange={handleWaiverChange} required className={getCheckboxClass('consentsToMedia')} />
            <span className={`text-sm leading-relaxed ${errorFields.consentsToMedia ? 'text-red-400 font-medium' : 'text-gray-200'}`}>I grant permission to the organizers to use photographs, motion pictures, or any other record of my participation for promotional purposes.</span>
          </label>
        </div>
      </div>

      {/* Payment Summary */}
      <div className="bg-black/30 p-6 rounded-xl">
        <div className="flex justify-between items-center mb-3 text-gray-200">
          <span>{formData.category} Entry</span>
          <span>{formatCurrency(CATEGORY_PRICING[formData.category] || 0)}</span>
        </div>
        <div className="flex justify-between items-center pt-4 border-t border-white/10 text-xl font-extrabold text-primary">
          <span>Total Payable</span>
          <span>{formatCurrency(calculateTotal())}</span>
        </div>
        <div className="text-right text-xs text-gray-400 mt-1">
          Inclusive of all taxes & platform fees
        </div>
      </div>

      {/* Secure Checkout UI (Mocking Indian Gateways) */}
      <div className="bg-white/5 border border-white/10 p-6 rounded-xl text-center">
        <div className="flex justify-center mb-4">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Secure Checkout</h3>
        <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
          You will be safely redirected to our secure payment partner to complete your transaction via UPI, Cards, or NetBanking.
        </p>
        
        {/* Mocking Trust Badges */}
        <div className="flex justify-center items-center gap-6 mb-6 opacity-60 grayscale hover:grayscale-0 transition-all duration-300">
          <div className="text-sm font-bold tracking-wider">RAZORPAY</div>
          <div className="text-sm font-bold tracking-wider">PHONEPE</div>
        </div>
      </div>

      <div className="flex justify-between pt-6 border-t border-white/10">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? "Redirecting..." : `Proceed to Pay ${formatCurrency(calculateTotal())}`}
        </Button>
      </div>
    </form>
  );
}
