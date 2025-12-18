// Performance data preloader hook
// Preloads performance data after authentication to improve page load time
import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './use-auth';
import { useEmployees } from './use-employees';
import { useGoals } from './use-goals';
import { authenticatedFetch } from '@/utils/auth-utils';
import { API_BASE_URL } from '@/config/api';

interface PreloadedPerformanceData {
  employeeId: string | null;
  goals: any[];
  reviews: any[];
  cycles: any[];
  viewMode: 'user' | 'manager' | 'admin' | null;
  timestamp: number;
  // Manager-specific data
  managerData?: {
    directReports: any[];
    teamGoals: Map<string, any[]>; // employeeId -> goals[]
    teamReviews: {
      managerSubmitted: any[];
      managerDraft: any[];
      selfSubmitted: any[];
      selfDraft: any[];
    };
  };
}

// Global cache for performance data
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const performanceCache = new Map<string, PreloadedPerformanceData>();
const preloadPromises = new Map<string, Promise<void>>();

export function usePerformancePreload() {
  const { user } = useAuth();
  const { employees } = useEmployees();
  const { getEmployeeGoals } = useGoals();
  const hasPreloadedRef = useRef(false);

  // Preload performance data after authentication
  useEffect(() => {
    const preloadData = async () => {
      // Only preload once per session
      if (hasPreloadedRef.current || !user?.email || employees.length === 0) {
        return;
      }

      // Check if already preloaded for this user
      const cached = performanceCache.get(user.email);
      const now = Date.now();
      if (cached && (now - cached.timestamp < CACHE_DURATION_MS)) {
        hasPreloadedRef.current = true;
        return;
      }

      // Check if preload is already in progress
      const existingPreload = preloadPromises.get(user.email);
      if (existingPreload) {
        await existingPreload;
        hasPreloadedRef.current = true;
        return;
      }

      // Start preloading
      hasPreloadedRef.current = true;

      const preloadPromise = (async () => {
        try {
          // Find employee
          const employee = employees.find(emp => emp.email?.toLowerCase() === user.email.toLowerCase());
          if (!employee) {
            return;
          }

          const employeeId = employee.id;

          // Determine view mode
          let viewMode: 'user' | 'manager' | 'admin' | null = 'user';
          try {
            const response = await authenticatedFetch(`${API_BASE_URL}/employees/check-team-members`);
            if (response.ok) {
              const data = await response.json();
              viewMode = data.view_mode || 'user';
            }
          } catch (error) {
            console.error('Error checking view mode during preload:', error);
          }

          // Preload data based on view mode
          const preloadPromises: Promise<any>[] = [];

          // Always preload user's own goals and reviews
          preloadPromises.push(
            getEmployeeGoals(employeeId).catch(err => {
              console.error('Error preloading goals:', err);
              return [];
            })
          );

          preloadPromises.push(
            authenticatedFetch(`${API_BASE_URL}/reviews?employeeId=${employeeId}`)
              .then(res => res.ok ? res.json() : [])
              .catch(err => {
                console.error('Error preloading reviews:', err);
                return [];
              })
          );

          preloadPromises.push(
            authenticatedFetch(`${API_BASE_URL}/reviews/cycles`)
              .then(res => res.ok ? res.json() : [])
              .catch(err => {
                console.error('Error preloading cycles:', err);
                return [];
              })
          );

          // Wait for base preloads to complete
          const baseResults = await Promise.allSettled(preloadPromises);
          
          const goals = baseResults[0].status === 'fulfilled' ? baseResults[0].value : [];
          const reviews = baseResults[1].status === 'fulfilled' ? baseResults[1].value : [];
          const cycles = baseResults[2].status === 'fulfilled' ? baseResults[2].value : [];

          // If manager, preload ALL team data (not just first 5)
          let managerData = undefined;
          if (viewMode === 'manager') {
            // Only include active employees as direct reports
            const directReports = employees.filter(emp => {
              const empStatus = (emp as any).status ?? 'active';
              return emp.reporting_to === employeeId && empStatus !== 'inactive';
            });
            
            if (directReports.length > 0) {
              const teamEmployeeIds = directReports.map(r => r.id);
              const employeeIdsParam = teamEmployeeIds.join(',');
              
              // Preload ALL team member goals in parallel
              const teamGoalsPromises = directReports.map(async (report) => {
                try {
                  const apiGoals = await getEmployeeGoals(report.id);
                  return { employeeId: report.id, goals: apiGoals };
                } catch (err) {
                  console.error(`Error preloading goals for ${report.id}:`, err);
                  return { employeeId: report.id, goals: [] };
                }
              });
              
              // Preload batch reviews for all team members in parallel
              const [teamGoalsResults, managerSubmittedRes, managerDraftRes, selfSubmittedRes, selfDraftRes] = await Promise.allSettled([
                Promise.all(teamGoalsPromises),
                authenticatedFetch(`${API_BASE_URL}/reviews/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}&reviewType=manager&isDraft=false&includeInactive=true`)
                  .then(res => res.ok ? res.json() : []),
                authenticatedFetch(`${API_BASE_URL}/reviews/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}&reviewType=manager&isDraft=true&includeInactive=true`)
                  .then(res => res.ok ? res.json() : []),
                authenticatedFetch(`${API_BASE_URL}/reviews/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}&reviewType=self&isDraft=false`)
                  .then(res => res.ok ? res.json() : []),
                authenticatedFetch(`${API_BASE_URL}/reviews/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}&reviewType=self&isDraft=true`)
                  .then(res => res.ok ? res.json() : [])
              ]);
              
              // Build team goals map
              const teamGoalsMap = new Map<string, any[]>();
              if (teamGoalsResults.status === 'fulfilled') {
                teamGoalsResults.value.forEach(({ employeeId, goals }) => {
                  teamGoalsMap.set(employeeId, goals);
                });
              }
              
              managerData = {
                directReports: directReports.map(r => ({
                  ...r,
                  reviewStatus: 'not_started' as const
                })),
                teamGoals: teamGoalsMap,
                teamReviews: {
                  managerSubmitted: managerSubmittedRes.status === 'fulfilled' ? managerSubmittedRes.value : [],
                  managerDraft: managerDraftRes.status === 'fulfilled' ? managerDraftRes.value : [],
                  selfSubmitted: selfSubmittedRes.status === 'fulfilled' ? selfSubmittedRes.value : [],
                  selfDraft: selfDraftRes.status === 'fulfilled' ? selfDraftRes.value : []
                }
              };
            }
          }

          // Store in cache
          performanceCache.set(user.email, {
            employeeId,
            goals: Array.isArray(goals) ? goals : [],
            reviews: Array.isArray(reviews) ? reviews : [],
            cycles: Array.isArray(cycles) ? cycles : [],
            viewMode,
            managerData,
            timestamp: Date.now()
          });
        } catch (error) {
        } finally {
          preloadPromises.delete(user.email);
        }
      })();

      preloadPromises.set(user.email, preloadPromise);
      await preloadPromise;
    };

    // Small delay to ensure employees are loaded
    const timer = setTimeout(() => {
      preloadData();
    }, 1000);

    return () => clearTimeout(timer);
  }, [user?.email, employees.length, getEmployeeGoals]);

  // Memoize getCachedData to prevent infinite loops
  const getCachedData = useCallback((email: string): PreloadedPerformanceData | null => {
    const cached = performanceCache.get(email);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION_MS)) {
      return cached;
    }
    return null;
  }, []);

  // Memoize clearCache to prevent infinite loops
  const clearCache = useCallback((email?: string) => {
    if (email) {
      performanceCache.delete(email);
      preloadPromises.delete(email);
    } else {
      performanceCache.clear();
      preloadPromises.clear();
    }
  }, []);

  // Memoize getCachedViewMode to prevent infinite loops
  const getCachedViewMode = useCallback((email: string): 'user' | 'manager' | 'admin' | null => {
    const cached = getCachedData(email);
    return cached?.viewMode || null;
  }, [getCachedData]);

  // Memoize getCachedManagerData to prevent infinite loops
  const getCachedManagerData = useCallback((email: string) => {
    const cached = getCachedData(email);
    return cached?.managerData || null;
  }, [getCachedData]);

  return {
    getCachedData,
    clearCache,
    getCachedViewMode,
    getCachedManagerData
  };
}

// Export standalone function to get cached view mode (for use outside of hook)
export function getCachedViewMode(email: string): 'user' | 'manager' | 'admin' | null {
  const cached = performanceCache.get(email);
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION_MS)) {
    return cached.viewMode;
  }
  return null;
}

// Export standalone function to get cached manager data (for use outside of hook)
export function getCachedManagerData(email: string) {
  const cached = performanceCache.get(email);
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION_MS)) {
    return cached.managerData || null;
  }
  return null;
}

// Export function to manually trigger preload (can be called after login)
// OPTIMIZED: Now preloads full manager data if user is a manager
export function triggerPerformancePreload(userEmail: string, employees: any[], getEmployeeGoals: (id: string) => Promise<any[]>) {
  // Check if already cached
  const cached = performanceCache.get(userEmail);
  const now = Date.now();
  if (cached && (now - cached.timestamp < CACHE_DURATION_MS)) {
    return Promise.resolve();
  }

  // Check if already in progress
  const existingPreload = preloadPromises.get(userEmail);
  if (existingPreload) {
    return existingPreload;
  }

  // Start new preload
  const preloadPromise = (async () => {
    try {
      const employee = employees.find(emp => emp.email?.toLowerCase() === userEmail.toLowerCase());
      if (!employee) {
        return;
      }

      const employeeId = employee.id;

      // Determine view mode (ONLY API CALL - this is necessary to know if we need manager data)
      let viewMode: 'user' | 'manager' | 'admin' | null = 'user';
      try {
        const response = await authenticatedFetch(`${API_BASE_URL}/employees/check-team-members`);
        if (response.ok) {
          const data = await response.json();
          viewMode = data.view_mode || 'user';
        }
      } catch (error) {
        console.error('Error checking view mode during preload:', error);
      }

      // Preload essential data (always needed)
      const [goals, reviewsResponse, cyclesResponse] = await Promise.allSettled([
        getEmployeeGoals(employeeId),
        authenticatedFetch(`${API_BASE_URL}/reviews?employeeId=${employeeId}`).then(res => res.ok ? res.json() : []),
        authenticatedFetch(`${API_BASE_URL}/reviews/cycles`).then(res => res.ok ? res.json() : [])
      ]);

      const goalsData = goals.status === 'fulfilled' ? goals.value : [];
      const reviewsData = reviewsResponse.status === 'fulfilled' ? reviewsResponse.value : [];
      const cyclesData = cyclesResponse.status === 'fulfilled' ? cyclesResponse.value : [];

      // If manager, preload ALL team data (same as usePerformancePreload hook)
      let managerData = undefined;
      if (viewMode === 'manager') {
        // Only include active employees as direct reports
        const directReports = employees.filter(emp => {
          const empStatus = (emp as any).status ?? 'active';
          return emp.reporting_to === employeeId && empStatus !== 'inactive';
        });
        
        if (directReports.length > 0) {
          const teamEmployeeIds = directReports.map(r => r.id);
          const employeeIdsParam = teamEmployeeIds.join(',');
          
          // Preload ALL team member goals in parallel
          const teamGoalsPromises = directReports.map(async (report) => {
            try {
              const apiGoals = await getEmployeeGoals(report.id);
              return { employeeId: report.id, goals: apiGoals };
            } catch (err) {
              console.error(`Error preloading goals for ${report.id}:`, err);
              return { employeeId: report.id, goals: [] };
            }
          });
          
          // Preload batch reviews for all team members in parallel
          const [teamGoalsResults, managerSubmittedRes, managerDraftRes, selfSubmittedRes, selfDraftRes] = await Promise.allSettled([
            Promise.all(teamGoalsPromises),
            authenticatedFetch(`${API_BASE_URL}/reviews/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}&reviewType=manager&isDraft=false&includeInactive=true`)
              .then(res => res.ok ? res.json() : []),
            authenticatedFetch(`${API_BASE_URL}/reviews/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}&reviewType=manager&isDraft=true&includeInactive=true`)
              .then(res => res.ok ? res.json() : []),
            authenticatedFetch(`${API_BASE_URL}/reviews/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}&reviewType=self&isDraft=false`)
              .then(res => res.ok ? res.json() : []),
            authenticatedFetch(`${API_BASE_URL}/reviews/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}&reviewType=self&isDraft=true`)
              .then(res => res.ok ? res.json() : [])
          ]);
          
          // Build team goals map
          const teamGoalsMap = new Map<string, any[]>();
          if (teamGoalsResults.status === 'fulfilled') {
            teamGoalsResults.value.forEach(({ employeeId, goals }) => {
              teamGoalsMap.set(employeeId, goals);
            });
          }
          
          managerData = {
            directReports: directReports.map(r => ({
              ...r,
              reviewStatus: 'not_started' as const
            })),
            teamGoals: teamGoalsMap,
            teamReviews: {
              managerSubmitted: managerSubmittedRes.status === 'fulfilled' ? managerSubmittedRes.value : [],
              managerDraft: managerDraftRes.status === 'fulfilled' ? managerDraftRes.value : [],
              selfSubmitted: selfSubmittedRes.status === 'fulfilled' ? selfSubmittedRes.value : [],
              selfDraft: selfDraftRes.status === 'fulfilled' ? selfDraftRes.value : []
            }
          };
        }
      }

      // Store in cache with full manager data
      performanceCache.set(userEmail, {
        employeeId,
        goals: Array.isArray(goalsData) ? goalsData : [],
        reviews: Array.isArray(reviewsData) ? reviewsData : [],
        cycles: Array.isArray(cyclesData) ? cyclesData : [],
        viewMode,
        managerData,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error in triggerPerformancePreload:', error);
    } finally {
      preloadPromises.delete(userEmail);
    }
  })();

  preloadPromises.set(userEmail, preloadPromise);
  return preloadPromise;
}

