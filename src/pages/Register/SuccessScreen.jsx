import React from 'react';
import { Button } from '../../components/Button';
import { CheckCircle } from 'lucide-react';

export default function SuccessScreen({ formData, eventName }) {
  // Generate a mock registration ID
  const regId = `GODA-${Math.floor(100000 + Math.random() * 900000)}`;

  return (
    <div className="text-center py-10">
      <CheckCircle size={80} className="text-primary mx-auto mb-6" />
      <h2 className="text-4xl font-extrabold text-white mb-4">Registration Confirmed!</h2>
      
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 max-w-md mx-auto mb-8 text-left">
        <div className="border-b border-white/10 pb-4 mb-4">
          <p className="text-sm text-gray-400 mb-1">Registration ID</p>
          <p className="text-xl font-mono text-white font-bold">{regId}</p>
        </div>
        
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-400">Participant</p>
            <p className="font-semibold text-white">{formData.firstName} {formData.lastName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Event & Category</p>
            <p className="font-semibold text-white">{eventName} - {formData.category}</p>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto bg-primary/10 border border-primary/30 rounded-lg p-6 mb-8 text-left">
        <h4 className="font-bold text-primary mb-4 text-lg">Important Next Steps</h4>
        <ul className="text-sm text-gray-200 list-disc list-inside space-y-3 mb-6">
          <li>Your confirmation and waiver copy have been sent to <strong>{formData.email}</strong>.</li>
          <li>Bib collection details will be shared via email exactly <strong>7 days before race day</strong>.</li>
          <li>Please carry a valid government ID for bib collection.</li>
        </ul>
        <div className="bg-black/20 p-4 rounded-lg border border-white/5 text-sm text-gray-300">
          <p className="mb-1">Need help or need to report an issue?</p>
          <p>Contact us at: <a href="mailto:support@goda.run" className="text-primary font-bold hover:underline">support@goda.run</a></p>
        </div>
      </div>

      <Button variant="primary" onClick={() => window.location.href="/"}>Return to Home</Button>
    </div>
  );
}
