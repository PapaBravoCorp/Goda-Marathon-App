/**
 * A stub for analytics event tracking.
 * This can be connected to Mixpanel, Amplitude, PostHog, GA, etc.
 */
export const trackEvent = (eventName, properties = {}) => {
  const payload = {
    event: eventName,
    timestamp: new Date().toISOString(),
    // Mock device info
    deviceType: window.innerWidth < 768 ? 'mobile' : 'desktop',
    source: document.referrer || 'direct',
    ...properties
  };

  // In production, this would be: mixpanel.track(eventName, payload)
  console.log(`%c[Analytics Event] %c${eventName}`, 'color: #3b82f6; font-weight: bold', 'color: #a855f7', payload);
};
