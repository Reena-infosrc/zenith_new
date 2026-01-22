// Simple in-memory cache for API responses
interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class APICache {
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
  private readonly STORAGE_PREFIX = 'zenith_api_cache_v2_';

  constructor() {
    // Try to hydrate cache from localStorage on initialization
    this.hydrateFromStorage();
  }

  private hydrateFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_PREFIX)) {
          const rawData = localStorage.getItem(key);
          if (rawData) {
            try {
              const entry: CacheEntry = JSON.parse(rawData);
              const originalKey = key.replace(this.STORAGE_PREFIX, '');

              // Only hydrate if not expired
              if (Date.now() - entry.timestamp < entry.ttl) {
                this.cache.set(originalKey, entry);
              } else {
                keysToRemove.push(key);
              }
            } catch (parseErr) {
              keysToRemove.push(key);
            }
          }
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.warn('Failed to hydrate API cache:', e);
    }
  }

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl
    };

    // Set in memory
    this.cache.set(key, entry as CacheEntry);

    // Set in localStorage for persistence (handle potential size errors)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`${this.STORAGE_PREFIX}${key}`, JSON.stringify(entry));
      } catch (e) {
        // If storage is full, we still have it in memory for this session
        console.warn('LocalStorage quota exceeded, using in-memory cache only');
      }
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const isExpired = (now - entry.timestamp) > entry.ttl;

    if (isExpired) {
      this.cache.delete(key);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`${this.STORAGE_PREFIX}${key}`);
      }
      return null;
    }

    return entry.data as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    const isExpired = (now - entry.timestamp) > entry.ttl;

    if (isExpired) {
      this.cache.delete(key);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`${this.STORAGE_PREFIX}${key}`);
      }
      return false;
    }

    return true;
  }

  clear(): void {
    this.cache.clear();
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(this.STORAGE_PREFIX)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch (e) {
        console.warn('Failed to clear persistent cache');
      }
    }
  }

  // Get cache statistics
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance
export const apiCache = new APICache();

// Cache keys
export const CACHE_KEYS = {
  FEATURE_FLAGS: 'feature-flags',
  EMPLOYEES: 'employees',
  DASHBOARD: 'dashboard',
} as const;
