import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/config/api';
import { authenticatedFetch } from '@/utils/auth-utils';

interface EmployeeStatusesResponse {
  employee_statuses: string[];
  count: number;
}

// Global cache for employee statuses data
class EmployeeStatusesCache {
  private static instance: EmployeeStatusesCache;
  private cache: string[] | null = null;
  private lastFetch: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private fetchPromise: Promise<string[]> | null = null;

  static getInstance(): EmployeeStatusesCache {
    if (!EmployeeStatusesCache.instance) {
      EmployeeStatusesCache.instance = new EmployeeStatusesCache();
    }
    return EmployeeStatusesCache.instance;
  }

  async getEmployeeStatuses(): Promise<string[]> {
    const now = Date.now();
    
    // Return cached data if it's still fresh
    if (this.cache && (now - this.lastFetch) < this.CACHE_DURATION) {
      return this.cache;
    }

    // If there's already a fetch in progress, return that promise
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Start a new fetch
    this.fetchPromise = this.fetchEmployeeStatusesFromAPI();
    
    try {
      const result = await this.fetchPromise;
      this.cache = result;
      this.lastFetch = now;
      return result;
    } finally {
      this.fetchPromise = null;
    }
  }

  private async fetchEmployeeStatusesFromAPI(): Promise<string[]> {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/employees/employee-statuses`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: EmployeeStatusesResponse = await response.json();
      return data.employee_statuses || [];
      
    } catch (err) {
      console.error('❌ Error fetching employee statuses:', err);
      // Return empty array if API fails
      return [];
    }
  }

  // Method to invalidate cache (useful for when new employees are added)
  invalidateCache(): void {
    this.cache = null;
    this.lastFetch = 0;
    this.fetchPromise = null;
  }
}

export function useEmployeeStatuses() {
  const [employeeStatuses, setEmployeeStatuses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(EmployeeStatusesCache.getInstance());

  useEffect(() => {
    const fetchEmployeeStatuses = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await cache.current.getEmployeeStatuses();
        setEmployeeStatuses(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch employee statuses');
        setEmployeeStatuses([]);
      } finally {
        setIsLoading(false);
      }
    };

    // Listen for cache invalidation events
    const handleCacheInvalidation = () => {
      fetchEmployeeStatuses();
    };

    // Add event listener for cache invalidation
    window.addEventListener('invalidateEmployeeStatusesCache', handleCacheInvalidation);

    fetchEmployeeStatuses();

    // Cleanup event listener
    return () => {
      window.removeEventListener('invalidateEmployeeStatusesCache', handleCacheInvalidation);
    };
  }, []);

  const refetch = async () => {
    cache.current.invalidateCache();
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await cache.current.getEmployeeStatuses();
      setEmployeeStatuses(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch employee statuses');
      setEmployeeStatuses([]);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    employeeStatuses,
    isLoading,
    error,
    refetch
  };
}
