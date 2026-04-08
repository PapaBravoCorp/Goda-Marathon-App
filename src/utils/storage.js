import { CATEGORY_TIME_RANGES } from './constants';

const STORAGE_KEY = 'goda_registrations';

export const getRegistrations = (eventId = null) => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    const registrations = data ? JSON.parse(data) : [];
    
    if (eventId) {
      return registrations.filter(r => r.eventId === eventId);
    }
    return registrations;
  } catch (error) {
    console.error('Error reading from localStorage', error);
    return [];
  }
};

const generateTime = (min, max) => {
  // Biases toward lower values simulating a normal distribution where more serious runners finish sooner
  const bias = Math.random() * Math.random(); 
  const totalMinutes = Math.floor(min + (max - min) * bias);
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor(Math.random() * 60);
  
  return `${hours.toString()}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const addRegistration = (registrationData) => {
  try {
    const registrations = getRegistrations();
    
    // Check Duplicate Exception (1 email per event)
    const isDuplicate = registrations.some(r => 
      r.email === registrationData.email && r.eventId === registrationData.eventId
    );

    if (isDuplicate) {
      throw new Error("Already Registered");
    }

    // Time Generation logic based on ranges
    let mockFinishTime = '0:00:00';
    if (CATEGORY_TIME_RANGES[registrationData.category]) {
      const { min, max } = CATEGORY_TIME_RANGES[registrationData.category];
      mockFinishTime = generateTime(min, max);
    }

    const newRegistration = {
      ...registrationData,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      bib: Math.floor(1000 + Math.random() * 9000).toString(),
      paymentStatus: 'PENDING', // Default to pending until webhook triggers in the future
      mockFinishTime
    };
    
    registrations.push(newRegistration);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registrations));
    return newRegistration;
  } catch (error) {
    console.error('Error saving to localStorage', error);
    throw error; // Rethrow to let the UI catch duplicate specific errors
  }
};

export const updateRegistration = (id, updates) => {
  try {
    const registrations = getRegistrations();
    const index = registrations.findIndex(r => r.id === id);
    if (index !== -1) {
      registrations[index] = { ...registrations[index], ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(registrations));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error updating localStorage', error);
    return false;
  }
};

export const clearAll = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing localStorage', error);
  }
};

export const exportToCSV = (eventId) => {
  const data = getRegistrations(eventId);
  if (data.length === 0) {
    alert("No data available to export.");
    return;
  }

  // Proper Headers
  const headers = ["Name", "Email", "Category", "Bib Number", "Finish Time", "Event ID", "Payment Status", "Created At"];
  
  // Clean Row Mapping
  const rows = data.map(r => [
    `"${r.firstName} ${r.lastName}"`,
    `"${r.email}"`,
    `"${r.category}"`,
    `"${r.bib}"`,
    `"${r.mockFinishTime}"`,
    `"${r.eventId}"`,
    `"${r.paymentStatus}"`,
    `"${new Date(r.createdAt).toLocaleString()}"`
  ]);

  const csvContent = "data:text/csv;charset=utf-8," 
    + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `registrations_${eventId || 'all'}.csv`);
  document.body.appendChild(link);

  link.click();
  document.body.removeChild(link);
};

export const getStats = (eventId = null) => {
  const registrations = getRegistrations(eventId);
  
  const totalRegistrations = registrations.length;
  // Make sure we calculate revenue for both PENDING and PAID but in real life maybe isolate PAID.
  // Assuming a full system we just sum everything attached to price.
  const revenue = registrations.reduce((sum, r) => sum + (r.price || 0), 0);
  
  return {
    totalRegistrations,
    revenue
  };
};
