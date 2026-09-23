import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Loader } from 'lucide-react';

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';

import Home from './pages/Home';
import EventDetails from './pages/EventDetails';
import Register from './pages/Register';
import PastEvents from './pages/PastEvents';
import Results from './pages/Results';
import NotFound from './pages/NotFound';

import './index.css';

/**
 * The admin dashboard and the policy pages are split out of the main bundle.
 *
 * The dashboard is seven management panels that no visitor ever opens, and it
 * was roughly a third of a 741 KB single bundle that every runner downloaded
 * before the homepage could paint. Splitting it means a visitor on a phone over
 * mobile data fetches only what the public site needs.
 */
const Admin = lazy(() => import('./pages/Admin'));

// Split out for the same reason: a roster form with its own table and tally
// styling is dead weight for the great majority of visitors, who enter alone.
const GroupRegister = lazy(() => import('./pages/Register/Group'));

const PrivacyPolicy = lazy(() => import('./pages/legal/PrivacyPolicy'));
const Terms = lazy(() => import('./pages/legal/Terms'));
const RefundPolicy = lazy(() => import('./pages/legal/RefundPolicy'));
const Contact = lazy(() => import('./pages/legal/Contact'));

function RouteFallback() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader size={32} className="spin" style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <ScrollToTop />

      {/* Lets a keyboard or screen-reader user jump past the navigation
          instead of tabbing through every link on every page. */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <Navbar />

      <main className="main-content" id="main-content">
        {/* Inside <main> so a crash keeps the header and footer, and with them
            a way to navigate somewhere that works. */}
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/event" element={<EventDetails />} />
              <Route path="/register" element={<Register />} />
              <Route path="/register/group" element={<GroupRegister />} />
              <Route path="/past-events" element={<PastEvents />} />
              <Route path="/results" element={<Results />} />
              <Route path="/admin" element={<Admin />} />

              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />
              <Route path="/contact" element={<Contact />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />
    </Router>
  );
}
