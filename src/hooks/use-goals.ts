import { useState, useCallback, useRef } from 'react';
import { API_BASE_URL } from '@/config/api';
import { authenticatedFetch } from '@/utils/auth-utils';
import { useToast } from '@/hooks/use-toast';

export interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string;
  evidence?: string;
  completedDate?: string;
  managerApproved?: boolean;
  managerReopened?: boolean;
  managerComment?: string;
  userComment?: string;
}

export interface Goal {
  id: string;
  employeeId: string;
  title: string;
  description?: string;
  category: string;
  targetDate: string;
  status: 'in_progress' | 'completed' | 'pending' | 'pending_manager_approval' | 'manager_reopened';
  completion: number;
  weightage?: number; // Percentage weightage (10, 20, 30, ..., 100)
  milestones?: Milestone[];
  createdBy?: string;
  managerApproved?: boolean;
  managerReopened?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GoalCreate {
  employeeId: string;
  title: string;
  description?: string;
  category: string;
  targetDate: string;
  weightage?: number; // Percentage weightage (10, 20, 30, ..., 100)
  milestones?: Array<{ title: string; dueDate: string }>;
}

export interface GoalUpdate {
  title?: string;
  description?: string;
  category?: string;
  targetDate?: string;
  status?: string;
  completion?: number;
  weightage?: number; // Percentage weightage (10, 20, 30, ..., 100)
  milestones?: Milestone[];
  managerApproved?: boolean;
  managerReopened?: boolean;
}

export interface MilestoneCreate {
  title: string;
  dueDate: string;
}

export interface MilestoneUpdate {
  title?: string;
  completed?: boolean;
  dueDate?: string;
  evidence?: string;
  completedDate?: string;
  userComment?: string;
  managerComment?: string;
  managerApproved?: boolean;
  managerReopened?: boolean;
}

export function useGoals() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Cache for employee goals to avoid duplicate API calls
  const goalsCache = useRef<Map<string, { data: Goal[]; timestamp: number }>>(new Map());
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
  const pendingRequests = useRef<Map<string, Promise<Goal[]>>>(new Map());

  // Get employee goals with caching
  const getEmployeeGoals = useCallback(async (employeeId: string, forceRefresh: boolean = false): Promise<Goal[]> => {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = goalsCache.current.get(employeeId);
      if (cached) {
        const now = Date.now();
        const isExpired = (now - cached.timestamp) > CACHE_TTL;
        if (!isExpired) {
          // Return cached data immediately
          return cached.data;
        }
      }
      
      // Check if there's already a pending request for this employee
      const pendingRequest = pendingRequests.current.get(employeeId);
      if (pendingRequest) {
        // Return the existing promise instead of making a new request
        return pendingRequest;
      }
    }
    
    // Create the request promise
    const requestPromise = (async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await authenticatedFetch(`${API_BASE_URL}/goals/employee/${employeeId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch goals: ${response.statusText}`);
        }
        
        const data = await response.json();
        const goals = data || [];
        
        // Cache the result
        goalsCache.current.set(employeeId, {
          data: goals,
          timestamp: Date.now()
        });
        
        return goals;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch goals';
        setError(errorMessage);
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
        return [];
      } finally {
        setLoading(false);
        // Remove from pending requests
        pendingRequests.current.delete(employeeId);
      }
    })();
    
    // Store the pending request
    pendingRequests.current.set(employeeId, requestPromise);
    
    return requestPromise;
  }, [toast]);

  // Get batch employee goals (optimized for loading multiple employees at once)
  const getBatchEmployeeGoals = useCallback(async (employeeIds: string[]): Promise<Map<string, Goal[]>> => {
    if (!employeeIds || employeeIds.length === 0) {
      return new Map();
    }

    // Filter out employees we already have cached
    const uncachedIds: string[] = [];
    const cachedResults = new Map<string, Goal[]>();
    
    for (const employeeId of employeeIds) {
      const cached = goalsCache.current.get(employeeId);
      if (cached) {
        const now = Date.now();
        const isExpired = (now - cached.timestamp) > CACHE_TTL;
        if (!isExpired) {
          cachedResults.set(employeeId, cached.data);
          continue;
        }
      }
      uncachedIds.push(employeeId);
    }

    // If all are cached, return immediately
    if (uncachedIds.length === 0) {
      return cachedResults;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Call batch endpoint
      const employeeIdsParam = uncachedIds.join(',');
      const response = await authenticatedFetch(`${API_BASE_URL}/goals/batch?employeeIds=${encodeURIComponent(employeeIdsParam)}`);
      
      if (!response.ok) {
        // If batch endpoint fails (404 or other error), fallback to individual calls
        console.warn('Batch endpoint failed, falling back to individual calls');
        const fallbackResults = new Map(cachedResults);
        
        // Fetch goals individually in parallel
        const individualPromises = uncachedIds.map(async (employeeId) => {
          try {
            const goals = await getEmployeeGoals(employeeId, false);
            return { employeeId, goals };
          } catch (err) {
            console.error(`Error fetching goals for ${employeeId}:`, err);
            return { employeeId, goals: [] };
          }
        });
        
        const individualResults = await Promise.all(individualPromises);
        individualResults.forEach(({ employeeId, goals }) => {
          fallbackResults.set(employeeId, goals);
        });
        
        return fallbackResults;
      }
      
      const data = await response.json();
      const batchResults = data || {};
      
      // Cache all results and combine with cached results
      const resultMap = new Map(cachedResults);
      
      for (const employeeId of uncachedIds) {
        const goals = batchResults[employeeId] || [];
        
        // Cache the result
        goalsCache.current.set(employeeId, {
          data: goals,
          timestamp: Date.now()
        });
        
        resultMap.set(employeeId, goals);
      }
      
      return resultMap;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch batch goals';
      console.error('Batch goals fetch error:', err);
      
      // Fallback to individual calls if batch completely fails
      console.warn('Falling back to individual goal fetches');
      const fallbackResults = new Map(cachedResults);
      
      try {
        const individualPromises = uncachedIds.map(async (employeeId) => {
          try {
            const goals = await getEmployeeGoals(employeeId, false);
            return { employeeId, goals };
          } catch (err) {
            console.error(`Error fetching goals for ${employeeId}:`, err);
            return { employeeId, goals: [] };
          }
        });
        
        const individualResults = await Promise.all(individualPromises);
        individualResults.forEach(({ employeeId, goals }) => {
          fallbackResults.set(employeeId, goals);
        });
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
        setError(errorMessage);
        toast({
          title: "Error",
          description: "Failed to load some goals. Please try refreshing.",
          variant: "destructive"
        });
      }
      
      return fallbackResults;
    } finally {
      setLoading(false);
    }
  }, [toast, getEmployeeGoals]);

  // Get single goal
  const getGoal = useCallback(async (goalId: string): Promise<Goal | null> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch(`${API_BASE_URL}/goals/${goalId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch goal: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch goal';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Create goal
  const createGoal = useCallback(async (goal: GoalCreate): Promise<Goal | null> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch(`${API_BASE_URL}/goals/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(goal),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Failed to create goal: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Invalidate cache for this employee
      if (data.employeeId) {
        goalsCache.current.delete(data.employeeId);
      }
      
      toast({
        title: "Success",
        description: "Goal created successfully",
      });
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create goal';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Update goal
  const updateGoal = useCallback(async (goalId: string, updates: GoalUpdate): Promise<Goal | null> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch(`${API_BASE_URL}/goals/${goalId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Failed to update goal: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Invalidate cache for this employee
      if (data.employeeId) {
        goalsCache.current.delete(data.employeeId);
      }
      
      toast({
        title: "Success",
        description: "Goal updated successfully",
      });
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update goal';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Delete goal
  const deleteGoal = useCallback(async (goalId: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch(`${API_BASE_URL}/goals/${goalId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Failed to delete goal: ${response.statusText}`);
      }
      
      toast({
        title: "Success",
        description: "Goal deleted successfully",
      });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete goal';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Create milestone
  const createMilestone = useCallback(async (goalId: string, milestone: MilestoneCreate): Promise<Milestone | null> => {
    try {
      setLoading(true);
      setError(null);
      
      // Get the goal first to get employeeId for cache invalidation
      const goal = await getGoal(goalId);
      
      const response = await authenticatedFetch(`${API_BASE_URL}/goals/${goalId}/milestones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(milestone),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Failed to create milestone: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Invalidate cache for this employee
      if (goal && goal.employeeId) {
        goalsCache.current.delete(goal.employeeId);
      }
      
      toast({
        title: "Success",
        description: "Milestone created successfully",
      });
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create milestone';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast, getGoal]);

  // Update milestone
  const updateMilestone = useCallback(async (goalId: string, milestoneId: string, updates: MilestoneUpdate): Promise<Milestone | null> => {
    try {
      setLoading(true);
      setError(null);
      
      // Get the goal first to get employeeId for cache invalidation
      const goal = await getGoal(goalId);
      
      const response = await authenticatedFetch(`${API_BASE_URL}/goals/${goalId}/milestones/${milestoneId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Failed to update milestone: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Invalidate cache for this employee
      if (goal && goal.employeeId) {
        goalsCache.current.delete(goal.employeeId);
      }
      
      toast({
        title: "Success",
        description: "Milestone updated successfully",
      });
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update milestone';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast, getGoal]);

  // Delete milestone
  const deleteMilestone = useCallback(async (goalId: string, milestoneId: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      // Get the goal first to get employeeId for cache invalidation
      const goal = await getGoal(goalId);
      
      const response = await authenticatedFetch(`${API_BASE_URL}/goals/${goalId}/milestones/${milestoneId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Failed to delete milestone: ${response.statusText}`);
      }
      
      // Invalidate cache for this employee
      if (goal && goal.employeeId) {
        goalsCache.current.delete(goal.employeeId);
      }
      
      toast({
        title: "Success",
        description: "Milestone deleted successfully",
      });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete milestone';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast, getGoal]);

  // Get milestones
  const getMilestones = useCallback(async (goalId: string): Promise<Milestone[]> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch(`${API_BASE_URL}/goals/${goalId}/milestones`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch milestones: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data || [];
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch milestones';
      setError(errorMessage);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear cache for a specific employee (useful after mutations)
  const clearEmployeeGoalsCache = useCallback((employeeId: string) => {
    goalsCache.current.delete(employeeId);
  }, []);

  // Clear all goals cache
  const clearAllGoalsCache = useCallback(() => {
    goalsCache.current.clear();
  }, []);

  return {
    loading,
    error,
    getEmployeeGoals,
    getBatchEmployeeGoals,
    getGoal,
    createGoal,
    updateGoal,
    deleteGoal,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    getMilestones,
    clearEmployeeGoalsCache,
    clearAllGoalsCache,
  };
}

