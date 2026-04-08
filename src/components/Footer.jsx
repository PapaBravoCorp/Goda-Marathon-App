import React from 'react';
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { FaTwitter, FaInstagram, FaFacebook } from 'react-icons/fa';

export default function Footer() {
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
            <form className="flex gap-sm" onSubmit={(e) => e.preventDefault()}>
              <input type="email" placeholder="Your email address" style={{ flex: 1 }} />
              <button type="submit" className="btn btn-primary" style={{ padding: '12px 20px' }}>Join</button>
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
