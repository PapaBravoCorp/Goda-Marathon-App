import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Lock } from 'lucide-react';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className="navbar" style={{ background: isScrolled ? 'rgba(11, 11, 11, 0.95)' : 'rgba(11, 11, 11, 0.5)' }}>
      <div className="container nav-container">
        <Link to="/" className="brand">
          <Activity color="#39FF14" size={28} />
          <span>GODA<span className="text-primary">.</span></span>
        </Link>
        
        <div className="hidden md:flex nav-links" style={{ display: 'flex', alignItems: 'center' }}>
          <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>Home</Link>
          <Link to="/event" className={`nav-link ${location.pathname === '/event' ? 'active' : ''}`}>Event Details</Link>
          <Link to="/past-events" className={`nav-link ${location.pathname === '/past-events' ? 'active' : ''}`}>Past Events</Link>
          <Link to="/results" className={`nav-link ${location.pathname === '/results' ? 'active' : ''}`}>Results</Link>
          <Link to="/register" className="btn btn-primary" style={{ padding: '8px 24px', marginRight: '16px' }}>Register Now</Link>
          <Link to="/admin" title="Admin Dashboard" style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }} className="hover:text-primary transition-colors">
            <Lock size={18} />
          </Link>
        </div>
      </div>
    </nav>
  );
}
