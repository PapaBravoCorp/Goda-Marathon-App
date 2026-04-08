import React, { useState } from 'react';
import { Button } from '../components/Button';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { CATEGORY_PRICING, CURRENT_EVENT } from '../utils/constants';
import { addRegistration } from '../utils/storage';

export default function Register() {
  const [step, setStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Controlled inputs state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    dob: '',
    gender: '',
    category: '',
    tshirtSize: '',
    estimatedTime: ''
  });

  const [paymentData, setPaymentData] = useState({
    cardNumber: '',
    expiry: '',
    cvc: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePaymentChange = (e) => {
    const { name, value } = e.target;
    setPaymentData(prev => ({ ...prev, [name]: value }));
  };

  const isStep1Valid = formData.firstName && formData.lastName && formData.email && formData.dob && formData.gender;
  const isStep2Valid = formData.category && formData.tshirtSize;
  const isStep3Valid = paymentData.cardNumber && paymentData.expiry && paymentData.cvc;

  const handleNext = (e) => {
    e.preventDefault();
    if (step === 1 && !isStep1Valid) return;
    if (step === 2 && !isStep2Valid) return;
    setStep(step + 1);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!isStep3Valid) return;

    const basePrice = CATEGORY_PRICING[formData.category] || 0;
    const price = basePrice; 

    const finalRegistrationData = {
      ...formData,
      price: price,
      eventId: CURRENT_EVENT.id,
      eventName: CURRENT_EVENT.name
    };

    try {
      const saved = addRegistration(finalRegistrationData);
      if (saved) {
        setStep(4);
      }
    } catch (err) {
      if (err.message === "Already Registered") {
        setErrorMsg("This email is already registered for the current event. If you need to register another person, please use their email.");
      } else {
        setErrorMsg("An unexpected error occurred during registration. Please try again.");
      }
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const calculateTotal = () => {
    const base = CATEGORY_PRICING[formData.category] || 0;
    return base + 4.50; // $4.50 processing fee
  };

  return (
    <div className="section" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center' }}>
      <div className="container" style={{ maxWidth: '800px' }}>
        
        {/* Progress Tracker */}
        {step < 4 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '15px', left: '0', width: '100%', height: '2px', background: 'var(--color-border)', zIndex: -1 }}></div>
            <div style={{ position: 'absolute', top: '15px', left: '0', width: `${((step-1)/2)*100}%`, height: '2px', background: 'var(--color-primary)', zIndex: -1, transition: 'width 0.3s ease' }}></div>
            
            <div className="text-center" style={{ width: '80px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: step >= 1 ? 'var(--color-primary)' : 'var(--color-bg-surface-light)', color: step >= 1 ? '#000' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontWeight: 800 }}>1</div>
              <span style={{ fontSize: '0.8rem', color: step >= 1 ? '#fff' : 'var(--color-text-muted)' }}>Personal</span>
            </div>
            <div className="text-center" style={{ width: '80px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: step >= 2 ? 'var(--color-primary)' : 'var(--color-bg-surface-light)', color: step >= 2 ? '#000' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontWeight: 800 }}>2</div>
              <span style={{ fontSize: '0.8rem', color: step >= 2 ? '#fff' : 'var(--color-text-muted)' }}>Category</span>
            </div>
            <div className="text-center" style={{ width: '80px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: step >= 3 ? 'var(--color-primary)' : 'var(--color-bg-surface-light)', color: step >= 3 ? '#000' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontWeight: 800 }}>3</div>
              <span style={{ fontSize: '0.8rem', color: step >= 3 ? '#fff' : 'var(--color-text-muted)' }}>Payment</span>
            </div>
          </div>
        )}

        <div className="glass" style={{ padding: '40px', borderRadius: '16px' }}>
          
          {errorMsg && (
            <div style={{ background: 'rgba(255, 60, 60, 0.1)', border: '1px solid rgba(255, 60, 60, 0.3)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertTriangle color="red" />
              <p style={{ color: '#fff', margin: 0 }}>{errorMsg}</p>
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleNext}>
              <h2 style={{ marginBottom: '24px' }}>Personal Details</h2>
              <div className="grid grid-cols-2 gap-md" style={{ marginBottom: '24px' }}>
                <div>
                  <label>First Name</label>
                  <input type="text" name="firstName" value={formData.firstName} onChange={handleInputChange} required placeholder="John" />
                </div>
                <div>
                  <label>Last Name</label>
                  <input type="text" name="lastName" value={formData.lastName} onChange={handleInputChange} required placeholder="Doe" />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label>Email Address</label>
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} required placeholder="john@example.com" />
                </div>
                <div>
                  <label>Date of Birth</label>
                  <input type="date" name="dob" value={formData.dob} onChange={handleInputChange} required />
                </div>
                <div>
                  <label>Gender</label>
                  <select name="gender" value={formData.gender} onChange={handleInputChange} required>
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="non-binary">Non-binary</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant={isStep1Valid ? "primary" : "outline"} disabled={!isStep1Valid}>Next Step</Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleNext}>
              <h2 style={{ marginBottom: '24px' }}>Race Category</h2>
              <div className="flex flex-col gap-sm" style={{ marginBottom: '32px' }}>
                {Object.keys(CATEGORY_PRICING).map((cat, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', padding: '16px', background: formData.category === cat ? 'rgba(57,255,20,0.1)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', cursor: 'pointer', border: '1px solid transparent', borderColor: formData.category === cat ? 'var(--color-primary)' : 'transparent' }} 
                         onMouseOver={(e) => { if(formData.category !== cat) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                         onMouseOut={(e) => { if(formData.category !== cat) e.currentTarget.style.borderColor = 'transparent'; }}>
                    <input type="radio" name="category" value={cat} checked={formData.category === cat} onChange={handleInputChange} required style={{ width: 'auto', marginRight: '16px' }} />
                    <span style={{ fontSize: '1.1rem', fontWeight: 600, flex: 1 }}>{cat}</span>
                    <span style={{ fontWeight: 800 }}>{formatCurrency(CATEGORY_PRICING[cat])}</span>
                  </label>
                ))}
              </div>
              
              <div className="grid grid-cols-2 gap-md" style={{ marginBottom: '32px' }}>
                <div>
                  <label>T-Shirt Size</label>
                  <select name="tshirtSize" value={formData.tshirtSize} onChange={handleInputChange} required>
                    <option value="">Select Size...</option>
                    <option value="S">Small</option>
                    <option value="M">Medium</option>
                    <option value="L">Large</option>
                    <option value="XL">X-Large</option>
                  </select>
                </div>
                <div>
                  <label>Estimated Finish Time</label>
                  <input type="text" name="estimatedTime" value={formData.estimatedTime} onChange={handleInputChange} placeholder="HH:MM:SS" />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button type="button" variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button type="submit" variant={isStep2Valid ? "primary" : "outline"} disabled={!isStep2Valid}>Next Step</Button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit}>
              <h2 style={{ marginBottom: '24px' }}>Payment Summary</h2>
              
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '24px', borderRadius: '8px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span>{formData.category} Entry</span>
                  <span>{formatCurrency(CATEGORY_PRICING[formData.category] || 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span>Processing Fee</span>
                  <span>{formatCurrency(4.50)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--color-border)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--color-primary)' }}>
                  <span>Total</span>
                  <span>{formatCurrency(calculateTotal())}</span>
                </div>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <label>Card Number</label>
                <input type="text" name="cardNumber" value={paymentData.cardNumber} onChange={handlePaymentChange} placeholder="XXXX XXXX XXXX XXXX" style={{ marginBottom: '16px' }} required />
                <div className="grid grid-cols-2 gap-md">
                  <div>
                    <label>Expiry Date</label>
                    <input type="text" name="expiry" value={paymentData.expiry} onChange={handlePaymentChange} placeholder="MM/YY" required />
                  </div>
                  <div>
                    <label>CVC</label>
                    <input type="text" name="cvc" value={paymentData.cvc} onChange={handlePaymentChange} placeholder="XXX" required />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button type="button" variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button type="submit" variant={isStep3Valid ? "primary" : "outline"} disabled={!isStep3Valid}>
                  Pay {formatCurrency(calculateTotal())}
                </Button>
              </div>
            </form>
          )}

          {step === 4 && (
            <div className="text-center" style={{ padding: '40px 0' }}>
              <CheckCircle size={80} className="text-primary" style={{ margin: '0 auto 24px' }} />
              <h2 style={{ fontSize: '2.5rem', marginBottom: '16px' }}>You're In!</h2>
              <p className="text-muted" style={{ fontSize: '1.125rem', maxWidth: '400px', margin: '0 auto 32px' }}>
                Your payment was successful. We've sent the confirmation and your digital bib to your email.
              </p>
              <Button variant="primary" onClick={() => window.location.href="/"}>Return Home</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
