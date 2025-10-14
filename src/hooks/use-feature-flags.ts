import { useState, useEffect } from 'react';
import { apiCache, CACHE_KEYS } from '@/utils/api-cache';

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

// API base URL
const API_BASE_URL = 'https://zenith-hr-api.apps.infoservices.com/api';

export function useFeatureFlags() {
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [featureFlagStatus, setFeatureFlagStatus] = useState<Record<string, FeatureFlagStatus>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all feature flags
  const fetchFeatureFlags = async () => {
    setIsLoading(true);
    setError(null);
    
    // Check cache first
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
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/feature-flags/`);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setFeatureFlags(data);
      
      // Cache the data
      apiCache.set(CACHE_KEYS.FEATURE_FLAGS, data, 10 * 60 * 1000); // Cache for 10 minutes
      
      // Create status map for quick lookups
      const statusMap: Record<string, FeatureFlagStatus> = {};
      data.forEach((flag: FeatureFlag) => {
        statusMap[flag.name] = flag.status;
      });
      setFeatureFlagStatus(statusMap);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch feature flags');
      
      // Use default enabled status for development
      if (process.env.NODE_ENV === 'development') {
        const defaultFlags: FeatureFlag[] = [
          {
            id: 'default-directory',
            name: 'directory_module',
            display_name: 'Directory',
            status: 'enabled',
            module: 'directory',
            category: 'hr_modules',
            is_core_feature: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'default-performance',
            name: 'performance_module',
            display_name: 'Performance',
            status: 'enabled',
            module: 'performance',
            category: 'hr_modules',
            is_core_feature: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'default-leave',
            name: 'leave_module',
            display_name: 'Leave Management',
            status: 'enabled',
            module: 'leave',
            category: 'hr_modules',
            is_core_feature: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'default-compensation',
            name: 'compensation_module',
            display_name: 'Compensation',
            status: 'enabled',
            module: 'compensation',
            category: 'hr_modules',
            is_core_feature: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'default-recruitment',
            name: 'recruitment_module',
            display_name: 'Recruitment',
            status: 'enabled',
            module: 'recruitment',
            category: 'hr_modules',
            is_core_feature: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'default-engagement',
            name: 'engagement_module',
            display_name: 'Engagement',
            status: 'enabled',
            module: 'engagement',
            category: 'hr_modules',
            is_core_feature: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'default-resource-hub',
            name: 'resource_hub_module',
            display_name: 'Resource Hub',
            status: 'enabled',
            module: 'resource_hub',
            category: 'hr_modules',
            is_core_feature: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'default-dashboard',
            name: 'dashboard_module',
            display_name: 'Dashboard',
            status: 'enabled',
            module: 'dashboard',
            category: 'hr_modules',
            is_core_feature: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'default-admin-portal',
            name: 'admin_portal',
            display_name: 'Admin Portal',
            status: 'enabled',
            module: 'admin',
            category: 'admin_portal',
            is_core_feature: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'default-home',
            name: 'home_module',
            display_name: 'Home',
            status: 'enabled',
            module: 'home',
            category: 'hr_modules',
            is_core_feature: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'default-helpdesk',
            name: 'helpdesk_module',
            display_name: 'Helpdesk',
            status: 'enabled',
            module: 'helpdesk',
            category: 'hr_modules',
            is_core_feature: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'default-learning',
            name: 'learning_module',
            display_name: 'Learning',
            status: 'enabled',
            module: 'learning',
            category: 'hr_modules',
            is_core_feature: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'default-notifications',
            name: 'notifications',
            display_name: 'Notifications',
            status: 'enabled',
            module: 'ui',
            category: 'ui_components',
            is_core_feature: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ];
        
        setFeatureFlags(defaultFlags);
        
        const statusMap: Record<string, FeatureFlagStatus> = {};
        defaultFlags.forEach((flag) => {
          statusMap[flag.name] = flag.status;
        });
        setFeatureFlagStatus(statusMap);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Check if a feature is enabled
  const isEnabled = (featureName: string): boolean => {
    return featureFlagStatus[featureName] === 'enabled';
  };

  // Check if a feature is disabled
  const isDisabled = (featureName: string): boolean => {
    return featureFlagStatus[featureName] === 'disabled';
  };

  // Check if a feature is hidden
  const isHidden = (featureName: string): boolean => {
    return featureFlagStatus[featureName] === 'hidden';
  };

  // Get feature flag by name
  const getFeatureFlag = (featureName: string): FeatureFlag | undefined => {
    return featureFlags.find(flag => flag.name === featureName);
  };

  // Get feature flags by category
  const getFeatureFlagsByCategory = (category: string): FeatureFlag[] => {
    return featureFlags.filter(flag => flag.category === category);
  };

  // Get feature flags by module
  const getFeatureFlagsByModule = (module: string): FeatureFlag[] => {
    return featureFlags.filter(flag => flag.module === module);
  };

  // Update feature flag status
  const updateFeatureFlag = async (flagId: string, status: FeatureFlagStatus): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/feature-flags/${flagId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: status,
          updated_by: 'current_user' // This should be replaced with actual user ID
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      // Refresh feature flags
      await fetchFeatureFlags();
      return true;
    } catch (err) {
      return false;
    }
  };

  // Load feature flags on mount
  useEffect(() => {
    fetchFeatureFlags();
  }, []);

  return {
    featureFlags,
    featureFlagStatus,
    isLoading,
    error,
    fetchFeatureFlags,
    isEnabled,
    isDisabled,
    isHidden,
    getFeatureFlag,
    getFeatureFlagsByCategory,
    getFeatureFlagsByModule,
    updateFeatureFlag
  };
}
