import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Check } from 'lucide-react';
import { FaTwitter, FaInstagram, FaFacebook } from 'react-icons/fa';

export default function Footer() {
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleSubscribe = (e) => {
    e.preventDefault();
    setIsSubscribed(true);
    setTimeout(() => setIsSubscribed(false), 5000); // Options to reset it or keep it subscribed
  };
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <Link to="/" className="brand" style={{ marginBottom: '24px', display: 'flex' }}>
              <Activity color="#39FF14" size={28} />
              <span>GODA<span className="text-primary">.</span></span>
            </Link>
            <p className="text-muted" style={{ maxWidth: '300px', marginBottom: '24px' }}>
              Bringing people together through the power of sport! Organized by Godavari Expedition & G5 Foundation.
            </p>
            <div className="flex gap-sm">
              <a href="#" className="btn-outline" style={{ padding: '8px', borderRadius: '50%' }}><FaTwitter size={20} /></a>
              <a href="#" className="btn-outline" style={{ padding: '8px', borderRadius: '50%' }}><FaInstagram size={20} /></a>
              <a href="#" className="btn-outline" style={{ padding: '8px', borderRadius: '50%' }}><FaFacebook size={20} /></a>
            </div>
          </div>
          
          <div>
            <h4 className="footer-title">Quick Links</h4>
            <ul className="footer-links">
              <li><Link to="/event">Event Details</Link></li>
              <li><Link to="/register">Register</Link></li>
              <li><Link to="/results">Results</Link></li>
              <li><Link to="/past-events">Past Events</Link></li>
              <li><Link to="/admin">Admin Login</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="footer-title">Contact & Support</h4>
            <ul className="footer-links">
              <li><a href="#">FAQ</a></li>
              <li className="text-muted" style={{ fontSize: '0.9rem' }}>+91 82085 92273</li>
              <li className="text-muted" style={{ fontSize: '0.9rem' }}>godavariexpedition@gmail.com</li>
              <li className="text-muted" style={{ fontSize: '0.9rem' }}>Tidke colony, Nashik</li>
            </ul>
          </div>
          
          <div>
            <h4 className="footer-title">Newsletter</h4>
            <p className="text-muted" style={{ marginBottom: '16px' }}>Stay updated with the latest race news.</p>
            <form className="flex gap-sm" style={{ flexWrap: 'wrap' }} onSubmit={handleSubscribe}>
              <input type="email" placeholder="Your email address" style={{ flex: '1 1 0', minWidth: '0' }} required disabled={isSubscribed} />
              <button 
                type="submit" 
                className="btn btn-primary flex items-center justify-center transition-all" 
                style={{ 
                  padding: '12px 20px',
                  width: 'auto',
                  flex: '0 0 auto',
                  whiteSpace: 'nowrap',
                  backgroundColor: isSubscribed ? '#10b981' : 'var(--color-primary)',
                  boxShadow: isSubscribed ? '0 0 25px rgba(16,185,129,0.6)' : undefined
                }}
                disabled={isSubscribed}
              >
                {isSubscribed ? <><Check size={18} style={{ marginRight: '8px' }} /> Subscribed!</> : 'Join'}
              </button>
            </form>
          </div>
        </div>
        <div className="copyright">
          <p>© {new Date().getFullYear()} Godavari Expedition. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
