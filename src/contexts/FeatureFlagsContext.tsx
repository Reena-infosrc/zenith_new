import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiCache, CACHE_KEYS } from '@/utils/api-cache';
import { API_BASE_URL } from '@/config/api';

// Feature flag status types
export type FeatureFlagStatus = 'enabled' | 'disabled' | 'hidden';

// Feature flag interface
export interface FeatureFlag {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  status: FeatureFlagStatus;
  module: string;
  category: string;
  is_core_feature: boolean;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

interface FeatureFlagsContextType {
  featureFlags: FeatureFlag[];
  featureFlagStatus: Record<string, FeatureFlagStatus>;
  isLoading: boolean;
  error: string | null;
  isEnabled: (featureName: string) => boolean;
  isDisabled: (featureName: string) => boolean;
  isHidden: (featureName: string) => boolean;
  getFeatureFlag: (featureName: string) => FeatureFlag | undefined;
  refreshFeatureFlags: () => Promise<void>;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType | undefined>(undefined);

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [featureFlagStatus, setFeatureFlagStatus] = useState<Record<string, FeatureFlagStatus>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize from cache immediately if available
  useEffect(() => {
    const cachedData = apiCache.get(CACHE_KEYS.FEATURE_FLAGS);
    if (cachedData) {
      setFeatureFlags(cachedData);
      
      // Create status map for quick lookups
      const statusMap: Record<string, FeatureFlagStatus> = {};
      cachedData.forEach((flag: FeatureFlag) => {
        statusMap[flag.name] = flag.status;
      });
      setFeatureFlagStatus(statusMap);
      setIsLoading(false);
    }
  }, []);

  // Fetch all feature flags
  const fetchFeatureFlags = async () => {
    // If we already have cached data, don't show loading state
    const cachedData = apiCache.get(CACHE_KEYS.FEATURE_FLAGS);
    if (!cachedData) {
      setIsLoading(true);
    }
    setError(null);
    
    // Check cache first
    if (cachedData) {
      setFeatureFlags(cachedData);
      
      // Create status map for quick lookups
      const statusMap: Record<string, FeatureFlagStatus> = {};
      cachedData.forEach((flag: FeatureFlag) => {
        statusMap[flag.name] = flag.status;
      });
      setFeatureFlagStatus(statusMap);
      setIsLoading(false);
      return;
    }
    
    try {
      const token = localStorage.getItem('auth_token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/feature-flags/`, { headers });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Cache the data for 10 minutes
      apiCache.set(CACHE_KEYS.FEATURE_FLAGS, data, 10 * 60 * 1000);
      
      setFeatureFlags(data);
      
      // Create status map for quick lookups
      const statusMap: Record<string, FeatureFlagStatus> = {};
      data.forEach((flag: FeatureFlag) => {
        statusMap[flag.name] = flag.status;
      });
      setFeatureFlagStatus(statusMap);
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching feature flags:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch feature flags');
      setIsLoading(false);
    }
  };

  // Load feature flags on mount
  useEffect(() => {
    fetchFeatureFlags();
  }, []);

  // Helper functions
  const isEnabled = (featureName: string): boolean => {
    return featureFlagStatus[featureName] === 'enabled';
  };

  const isDisabled = (featureName: string): boolean => {
    return featureFlagStatus[featureName] === 'disabled';
  };

  const isHidden = (featureName: string): boolean => {
    return featureFlagStatus[featureName] === 'hidden';
  };

  const getFeatureFlag = (featureName: string): FeatureFlag | undefined => {
    return featureFlags.find(flag => flag.name === featureName);
  };

  const refreshFeatureFlags = async (): Promise<void> => {
    // Clear cache and refetch
    apiCache.clear();
    await fetchFeatureFlags();
  };

  const value: FeatureFlagsContextType = {
    featureFlags,
    featureFlagStatus,
    isLoading,
    error,
    isEnabled,
    isDisabled,
    isHidden,
    getFeatureFlag,
    refreshFeatureFlags
  };

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (context === undefined) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider');
  }
  return context;
}
