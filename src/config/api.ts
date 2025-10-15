// API Configuration - Dynamic based on environment
const getApiBaseUrl = () => {
  // Check if we're in development mode
  if (import.meta.env.DEV) {
    // Use local backend when running in development
    return 'http://localhost:8000/api';
  }
  
  // Use production API in production
  return 'https://zenith-hr-api.apps.infoservices.com/api';
};

export const API_BASE_URL = getApiBaseUrl();

// For backward compatibility, also export the old constant
export const PRODUCTION_API_URL = 'https://zenith-hr-api.apps.infoservices.com/api';
export const LOCAL_API_URL = 'http://localhost:8000/api';

console.log('🔧 API Configuration:', {
  mode: import.meta.env.DEV ? 'development' : 'production',
  apiUrl: API_BASE_URL,
  viteDev: import.meta.env.DEV
});
