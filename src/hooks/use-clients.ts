import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/config/api';
import { authenticatedFetch } from '@/utils/auth-utils';

interface ClientsResponse {
  clients: string[];
  count: number;
}

// Global cache for clients data
class ClientsCache {
  private static instance: ClientsCache;
  private cache: string[] | null = null;
  private lastFetch: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private fetchPromise: Promise<string[]> | null = null;

  static getInstance(): ClientsCache {
    if (!ClientsCache.instance) {
      ClientsCache.instance = new ClientsCache();
    }
    return ClientsCache.instance;
  }

  async getClients(): Promise<string[]> {
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
    this.fetchPromise = this.fetchClientsFromAPI();
    
    try {
      const result = await this.fetchPromise;
      this.cache = result;
      this.lastFetch = now;
      return result;
    } finally {
      this.fetchPromise = null;
    }
  }

  private async fetchClientsFromAPI(): Promise<string[]> {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/employees/clients`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: ClientsResponse = await response.json();
      return data.clients || [];
      
    } catch (err) {
      console.error('❌ Error fetching clients:', err);
      // Return empty array if API fails
      return [];
    }
  }

  // Method to invalidate cache (useful for when new clients are added)
  invalidateCache(): void {
    this.cache = null;
    this.lastFetch = 0;
    this.fetchPromise = null;
  }
}

export function useClients() {
  const [clients, setClients] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(ClientsCache.getInstance());

  useEffect(() => {
    const fetchClients = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await cache.current.getClients();
        setClients(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch clients');
        setClients([]);
      } finally {
        setIsLoading(false);
      }
    };

    // Listen for cache invalidation events
    const handleCacheInvalidation = () => {
      fetchClients();
    };

    // Add event listener for cache invalidation
    window.addEventListener('invalidateClientsCache', handleCacheInvalidation);

    fetchClients();

    // Cleanup event listener
    return () => {
      window.removeEventListener('invalidateClientsCache', handleCacheInvalidation);
    };
  }, []);

  const refetch = async () => {
    cache.current.invalidateCache();
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await cache.current.getClients();
      setClients(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch clients');
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    clients,
    isLoading,
    error,
    refetch
  };
}
