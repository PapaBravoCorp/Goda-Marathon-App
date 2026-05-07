import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Lock, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Body scroll lock
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location]);

  return (
    <>
      <nav className="navbar" style={{ 
        background: isScrolled ? 'rgba(11, 11, 11, 0.95)' : 'rgba(11, 11, 11, 0.5)',
        padding: isScrolled ? '12px 0' : '24px 0',
        backdropFilter: 'blur(12px)',
        borderBottom: isScrolled ? '1px solid rgba(57,255,20,0.2)' : '1px solid transparent',
        transition: 'all 0.3s ease',
        zIndex: 1000
      }}>
        <div className="container nav-container flex items-center justify-between">
          <Link to="/" className="brand" style={{ transform: isScrolled ? 'scale(0.9)' : 'scale(1)', transition: 'transform 0.3s ease' }}>
            <Activity color="#39FF14" size={28} />
            <span>GODA<span className="text-primary">.</span></span>
          </Link>
          
          <div className="hidden md:flex nav-links items-center">
            <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>Home</Link>
            <Link to="/event" className={`nav-link ${location.pathname === '/event' ? 'active' : ''}`}>Event Details</Link>
            <Link to="/past-events" className={`nav-link ${location.pathname === '/past-events' ? 'active' : ''}`}>Past Events</Link>
            <Link to="/results" className={`nav-link ${location.pathname === '/results' ? 'active' : ''}`}>Results</Link>
            <Link to="/register" className="btn btn-primary ml-4" style={{ padding: isScrolled ? '6px 20px' : '8px 24px', transition: 'all 0.3s ease' }}>Register Now</Link>
            <Link to="/admin" title="Admin Dashboard" style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }} className="hover:text-primary transition-colors ml-4">
              <Lock size={18} />
            </Link>
          </div>

          <button 
            className="mobile-menu-btn"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={28} />
          </button>
        </div>
      </nav>

      {/* Mobile Premium Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: '-100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[1001] bg-[#0b0b0b]/95 backdrop-blur-xl flex flex-col pt-6 px-6"
            style={{ minHeight: '100dvh' }}
          >
            <div className="flex justify-between items-center mb-12">
              <Link to="/" className="brand">
                <Activity color="#39FF14" size={28} />
                <span>GODA<span className="text-primary">.</span></span>
              </Link>
              <button 
                className="flex items-center justify-center p-2 text-white hover:text-primary transition-colors bg-white/5 rounded-full"
                onClick={() => setIsMenuOpen(false)}
                aria-label="Close menu"
                style={{ minHeight: '44px', minWidth: '44px' }}
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="flex flex-col gap-6 text-2xl font-bold">
              <Link to="/" className={`pb-2 border-b border-white/10 ${location.pathname === '/' ? 'text-primary' : 'text-white'}`}>Home</Link>
              <Link to="/event" className={`pb-2 border-b border-white/10 ${location.pathname === '/event' ? 'text-primary' : 'text-white'}`}>Event Details</Link>
              <Link to="/past-events" className={`pb-2 border-b border-white/10 ${location.pathname === '/past-events' ? 'text-primary' : 'text-white'}`}>Past Events</Link>
              <Link to="/results" className={`pb-2 border-b border-white/10 ${location.pathname === '/results' ? 'text-primary' : 'text-white'}`}>Results</Link>
            </div>

            <div className="mt-auto mb-12 flex flex-col gap-4">
              <Link to="/register" className="btn btn-primary w-full py-4 text-xl">Register Now</Link>
              <Link to="/admin" className="flex items-center justify-center gap-2 text-gray-400 py-4 w-full">
                <Lock size={18} /> <span>Admin Dashboard</span>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
