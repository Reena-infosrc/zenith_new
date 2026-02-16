// API Configuration - read base URL from Vite env when provided
const normalize = (raw: string) => raw.replace(/\/$/, '').endsWith('/api') ? raw.replace(/\/$/, '') : `${raw.replace(/\/$/, '')}/api`;

const getApiBaseUrl = () => {
  // Priority 1: Direct env variable (set by CI/CD or .env files)
  const envBase = import.meta.env.VITE_API_BASE as string | undefined;
  if (envBase && envBase.length) {
    return normalize(envBase);
  }

  // Priority 2: Development manual override
  if (import.meta.env.DEV) {
    const devBase = import.meta.env.VITE_LOCAL_API_BASE as string | undefined;
    if (devBase) return normalize(devBase);
  }

  // Default: Return empty and warn
  // eslint-disable-next-line no-console
  console.warn('VITE_API_BASE is not set. API calls will likely fail.');
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

// Backwards-compatible exports
export const PRODUCTION_API_URL = API_BASE_URL;
export const LOCAL_API_URL = normalize((import.meta.env.VITE_LOCAL_API_BASE as string) || '');

// API configuration - logging removed for security
