import React, { useState, useMemo, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CATEGORY_PRICING, CURRENT_EVENT, CATEGORY_RULES } from '../../utils/constants';
import { addRegistration } from '../../utils/services/registrations';
import { getEventCategories } from '../../utils/services/categories';
import { getCurrentEvent } from '../../utils/services/events';
import { isValidPhone, calculateAge } from '../../utils/validation';
import { trackEvent } from '../../utils/analytics';

import StepOne from './StepOne';
import StepTwo from './StepTwo';
import StepThree from './StepThree';
import SuccessScreen from './SuccessScreen';

const DRAFT_KEY = 'goda-registration-draft';

export default function Register() {
  const [step, setStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorFields, setErrorFields] = useState({});
  
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    dob: '', gender: '', bloodGroup: '',
    emergencyContactName: '', emergencyContactNumber: '',
    city: '', state: '', pincode: '', clubName: '',
    hasMedicalCondition: false, allergies: '',
    category: '', tshirtSize: '', estimatedTime: '', couponCode: ''
  });

  const [waivers, setWaivers] = useState({
    isMedicallyFit: false,
    acceptsRisk: false,
    acceptsRefundPolicy: false,
    consentsToMedia: false
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [dbCategories, setDbCategories] = useState([]);
  const [eventConfig, setEventConfig] = useState(null);

  const age = useMemo(() => calculateAge(formData.dob), [formData.dob]);

  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const { savedStep, savedFormData, savedWaivers } = JSON.parse(saved);
        if (savedFormData) setFormData(savedFormData);
        if (savedWaivers) setWaivers(savedWaivers);
        if (savedStep && savedStep < 4) setStep(savedStep);
      } catch (e) {
        console.error('Failed to parse registration draft', e);
      }
    }
    // Fetch DB categories and event config
    getCurrentEvent().then(ev => {
      if (ev) {
        setEventConfig(ev);
        // Use event UUID for category queries
        getEventCategories(ev.id, CURRENT_EVENT.slug).then(cats => {
          if (cats.length > 0) setDbCategories(cats);
          setIsLoaded(true);
        }).catch(() => {
          setIsLoaded(true);
        });
      } else {
        setIsLoaded(true);
      }
    }).catch(() => {
      setIsLoaded(true);
    });
    trackEvent('registration_started', { eventName: CURRENT_EVENT.name });
  }, []);

  useEffect(() => {
    if (isLoaded && step < 4) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        savedStep: step,
        savedFormData: formData,
        savedWaivers: waivers
      }));
    }
  }, [formData, step, waivers, isLoaded]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
    
    // Clear field error when they type
    if (errorFields[name]) {
      setErrorFields(prev => ({ ...prev, [name]: false }));
    }
    
    if (name === 'category') {
      trackEvent('category_selected', { category: value, step });
    }
  };

  const handleWaiverChange = (e) => {
    const { name, checked } = e.target;
    setWaivers(prev => ({ ...prev, [name]: checked }));
    
    if (errorFields[name]) {
      setErrorFields(prev => ({ ...prev, [name]: false }));
    }
  };

  const handleNextFromStepOne = (e) => {
    e.preventDefault();
    setErrorMsg('');
    setErrorFields({});
    
    const missingFields = [];
    const newErrorFields = {};

    if (!formData.firstName) { missingFields.push('First Name'); newErrorFields.firstName = true; }
    if (!formData.lastName) { missingFields.push('Last Name'); newErrorFields.lastName = true; }
    if (!formData.email) { missingFields.push('Email Address'); newErrorFields.email = true; }
    if (!formData.phone) { missingFields.push('Phone Number'); newErrorFields.phone = true; }
    if (!formData.dob) { missingFields.push('Date of Birth'); newErrorFields.dob = true; }
    if (!formData.gender) { missingFields.push('Gender'); newErrorFields.gender = true; }
    if (!formData.bloodGroup) { missingFields.push('Blood Group'); newErrorFields.bloodGroup = true; }
    if (!formData.emergencyContactName) { missingFields.push('Emergency Contact Name'); newErrorFields.emergencyContactName = true; }
    if (!formData.emergencyContactNumber) { missingFields.push('Emergency Contact Number'); newErrorFields.emergencyContactNumber = true; }
    if (!formData.state) { missingFields.push('State'); newErrorFields.state = true; }
    if (!formData.city) { missingFields.push('City'); newErrorFields.city = true; }
    if (!formData.pincode) { missingFields.push('Pincode'); newErrorFields.pincode = true; }

    if (missingFields.length > 0) {
      setErrorMsg(['Please provide the following required fields:', ...missingFields]);
      setErrorFields(newErrorFields);
      trackEvent('registration_validation_failed', { step: 1, field: 'multiple', errorType: 'missing_required' });
      return;
    }

    if (!isValidPhone(formData.phone)) {
      setErrorMsg('Please enter a valid 10-digit Indian mobile number.');
      setErrorFields({ phone: true });
      trackEvent('registration_validation_failed', { step: 1, field: 'phone', errorType: 'invalid_format' });
      return;
    }
    if (!isValidPhone(formData.emergencyContactNumber)) {
      setErrorMsg('Emergency contact number must be a valid 10-digit mobile number.');
      setErrorFields({ emergencyContactNumber: true });
      trackEvent('registration_validation_failed', { step: 1, field: 'emergencyContactNumber', errorType: 'invalid_format' });
      return;
    }
    if (formData.phone === formData.emergencyContactNumber) {
      setErrorMsg('Emergency contact number cannot be the same as your primary number.');
      setErrorFields({ emergencyContactNumber: true, phone: true });
      trackEvent('registration_validation_failed', { step: 1, field: 'emergencyContactNumber', errorType: 'same_as_primary' });
      return;
    }

    if (formData.category && age !== null) {
      const rule = CATEGORY_RULES[formData.category];
      if (rule && age < rule.minAge) {
        setFormData(prev => ({ ...prev, category: '' }));
      }
    }
    
    trackEvent('registration_step_completed', { step: 1, city: formData.city, state: formData.state, age });
    setStep(2);
  };

  const handleNextFromStepTwo = (e) => {
    e.preventDefault();
    setErrorMsg('');
    setErrorFields({});

    const missingFields = [];
    const newErrorFields = {};

    if (!formData.category) { missingFields.push('Race Category'); newErrorFields.category = true; }
    if (!formData.tshirtSize) { missingFields.push('T-Shirt Size'); newErrorFields.tshirtSize = true; }

    if (missingFields.length > 0) {
      setErrorMsg(['Please complete the following selections:', ...missingFields]);
      setErrorFields(newErrorFields);
      trackEvent('registration_validation_failed', { step: 2, field: 'category_or_tshirt', errorType: 'missing_required' });
      return;
    }

    if (formData.couponCode) {
      trackEvent('coupon_applied', { couponCode: formData.couponCode, step: 2 });
    }
    trackEvent('registration_step_completed', { step: 2, category: formData.category, tshirtSize: formData.tshirtSize });
    setStep(3);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setErrorFields({});

    const missingWaivers = [];
    const newErrorFields = {};
    if (!waivers.isMedicallyFit) { missingWaivers.push('Medical Fitness Declaration'); newErrorFields.isMedicallyFit = true; }
    if (!waivers.acceptsRisk) { missingWaivers.push('Assumption of Risk'); newErrorFields.acceptsRisk = true; }
    if (!waivers.acceptsRefundPolicy) { missingWaivers.push('Refund Policy'); newErrorFields.acceptsRefundPolicy = true; }
    if (!waivers.consentsToMedia) { missingWaivers.push('Media Consent'); newErrorFields.consentsToMedia = true; }

    if (missingWaivers.length > 0) {
      setErrorMsg(['You must accept all mandatory declarations to proceed:', ...missingWaivers]);
      setErrorFields(newErrorFields);
      trackEvent('registration_validation_failed', { step: 3, field: 'waivers', errorType: 'not_accepted' });
      return;
    }

    // Use DB category price if available, fallback to constants
    let price = CATEGORY_PRICING[formData.category] || 0;
    if (dbCategories.length > 0) {
      const dbCat = dbCategories.find(c => c.name === formData.category);
      if (dbCat) price = dbCat.price;
    }

    trackEvent('registration_payment_initiated', { category: formData.category, price });
    setIsSubmitting(true);
    
    await new Promise(resolve => setTimeout(resolve, 2000));

    const finalRegistrationData = {
      ...formData,
      waiversAccepted: true,
      price: price,
      eventId: CURRENT_EVENT.slug,
      eventName: CURRENT_EVENT.name
    };

    try {
      const saved = await addRegistration(finalRegistrationData);
      if (saved) {
        trackEvent('registration_payment_success', { category: formData.category, price });
        trackEvent('registration_completed', { category: formData.category, city: formData.city });
        localStorage.removeItem(DRAFT_KEY);
        setStep(4);
      }
    } catch (err) {
      trackEvent('registration_payment_failed', { category: formData.category, price, errorType: err.message });
      if (err.message === "Already Registered") {
        setErrorMsg("This email is already registered for the current event.");
      } else {
        setErrorMsg("An unexpected error occurred during registration. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const calculateTotal = () => {
    if (dbCategories.length > 0) {
      const dbCat = dbCategories.find(c => c.name === formData.category);
      if (dbCat) return dbCat.price;
    }
    return CATEGORY_PRICING[formData.category] || 0;
  };

  return (
    <div className="min-h-[80dvh] flex items-center py-12">
      <div className="container max-w-3xl mx-auto px-4">
        
        {!isLoaded ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading registration details...</p>
          </div>
        ) : eventConfig && eventConfig.registration_open === false ? (
          <div className="glass p-10 rounded-2xl text-center py-16">
            <h2 className="text-3xl font-bold text-white mb-4">Registration Closed</h2>
            <p className="text-gray-300 text-lg">
              Registration for {eventConfig.name} is currently closed. Thank you for your interest!
            </p>
          </div>
        ) : (
          <>
            {step < 4 && (
          <div className="relative flex justify-between mb-10">
            <div className="absolute top-[15px] left-0 w-full h-[2px] bg-white/10 -z-10"></div>
            <div 
              className="absolute top-[15px] left-0 h-[2px] bg-primary -z-10 transition-all duration-300"
              style={{ width: `${((step-1)/2)*100}%` }}
            ></div>
            
            {[ { num: 1, label: 'Details' }, { num: 2, label: 'Category' }, { num: 3, label: 'Payment' } ].map(s => (
              <div key={s.num} className="text-center w-20">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2 font-extrabold transition-colors duration-300 ${step >= s.num ? 'bg-primary text-black' : 'bg-gray-800 text-white'}`}>
                  {s.num}
                </div>
                <span className={`text-xs font-semibold ${step >= s.num ? 'text-white' : 'text-gray-500'}`}>{s.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="glass p-6 md:p-10 rounded-2xl">
          
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-lg mb-6 flex items-start gap-3 text-white">
              <AlertTriangle className="text-red-500 shrink-0 mt-0.5" />
              <div className="text-sm font-medium">
                {Array.isArray(errorMsg) ? (
                  <>
                    <p className="mb-2 font-bold">{errorMsg[0]}</p>
                    <ul className="list-disc list-inside space-y-1 ml-1 text-gray-300">
                      {errorMsg.slice(1).map((msg, i) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="m-0">{errorMsg}</p>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <StepOne 
              formData={formData} 
              handleInputChange={handleInputChange} 
              onNext={handleNextFromStepOne} 
              errorFields={errorFields}
            />
          )}

          {step === 2 && (
            <StepTwo 
              formData={formData} 
              handleInputChange={handleInputChange} 
              onNext={handleNextFromStepTwo} 
              onBack={() => setStep(1)} 
              age={age} 
              formatCurrency={formatCurrency} 
              errorFields={errorFields}
              dbCategories={dbCategories}
            />
          )}

          {step === 3 && (
            <StepThree 
              formData={formData} 
              waivers={waivers} 
              handleWaiverChange={handleWaiverChange} 
              onSubmit={handleSubmit} 
              onBack={() => setStep(2)} 
              isSubmitting={isSubmitting} 
              formatCurrency={formatCurrency} 
              calculateTotal={calculateTotal} 
              errorFields={errorFields}
              dbCategories={dbCategories}
            />
          )}

          {step === 4 && (
            <SuccessScreen 
              formData={formData} 
              eventName={CURRENT_EVENT.name} 
            />
          )}

        </div>
          </>
        )}
      </div>
    </div>
  );
}
