import { useState, useEffect, useRef } from 'react';
import { authenticatedFetch } from '@/utils/auth-utils';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from './use-auth';

interface DashboardStats {
  totalEmployees: number;
  cycleCompletionRate: number;
  averageRating: number;
  pendingReviews: number;
  completedReviews: number;
}

// Global cache for dashboard stats
let globalStats: DashboardStats | null = null;
let globalStatsTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useDashboardStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(globalStats);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchStats = async (forceRefresh: boolean = false) => {
    // Check cache first
    const now = Date.now();
    if (!forceRefresh && globalStats && (now - globalStatsTimestamp) < CACHE_DURATION) {
      setStats(globalStats);
      return globalStats;
    }

    // Prevent multiple simultaneous calls
    if (isLoading && !forceRefresh) {
      return globalStats;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await authenticatedFetch(`${API_BASE_URL}/reviews/dashboard/stats`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch dashboard stats: ${response.statusText}`);
      }

      const data = await response.json();
      const statsData: DashboardStats = {
        totalEmployees: data.totalEmployees || 0,
        cycleCompletionRate: data.cycleCompletionRate || 0,
        averageRating: data.averageRating || 0,
        pendingReviews: data.pendingReviews || 0,
        completedReviews: data.completedReviews || 0
      };

      // Update global cache
      globalStats = statsData;
      globalStatsTimestamp = now;
      setStats(statsData);

      return statsData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch dashboard stats';
      setError(errorMessage);
      console.error('Error fetching dashboard stats:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch stats after login
  useEffect(() => {
    if (user?.email && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchStats();
    }
  }, [user?.email]);

  // Clear cache when user logs out
  useEffect(() => {
    if (!user) {
      globalStats = null;
      globalStatsTimestamp = 0;
      setStats(null);
      hasFetchedRef.current = false;
    }
  }, [user]);

  return {
    stats,
    isLoading,
    error,
    fetchStats,
    refreshStats: () => fetchStats(true)
  };
}

