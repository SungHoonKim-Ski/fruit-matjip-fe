import { useEffect, useState } from 'react';
import ReactGA from 'react-ga4';
import { useLocation } from 'react-router-dom';

const GA_KEY = process.env.REACT_APP_GA_KEY;

const GATracker = () => {
  const location = useLocation();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (window.location.hostname !== 'localhost' && GA_KEY) {
      ReactGA.initialize(GA_KEY);
      setIsInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (isInitialized) {
      ReactGA.set({ page: location.pathname });
      ReactGA.send('pageview');
    }
  }, [isInitialized, location]);

  return null; // ✅ 필수
};

export default GATracker;