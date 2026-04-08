import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import EventDetails from './pages/EventDetails';
import Register from './pages/Register';
import PastEvents from './pages/PastEvents';
import Results from './pages/Results';
import Admin from './pages/Admin';

import './index.css';

function App() {
  return (
    <Router>
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/event" element={<EventDetails />} />
          <Route path="/register" element={<Register />} />
          <Route path="/past-events" element={<PastEvents />} />
          <Route path="/results" element={<Results />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
      <Footer />
    </Router>
  );
}

export default App;
