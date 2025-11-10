import { useState, useCallback } from 'react';
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
  milestones?: Array<{ title: string; dueDate: string }>;
}

export interface GoalUpdate {
  title?: string;
  description?: string;
  category?: string;
  targetDate?: string;
  status?: string;
  completion?: number;
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

  // Get employee goals
  const getEmployeeGoals = useCallback(async (employeeId: string): Promise<Goal[]> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch(`${API_BASE_URL}/goals/employee/${employeeId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch goals: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data || [];
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
    }
  }, [toast]);

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
  }, [toast]);

  // Update milestone
  const updateMilestone = useCallback(async (goalId: string, milestoneId: string, updates: MilestoneUpdate): Promise<Milestone | null> => {
    try {
      setLoading(true);
      setError(null);
      
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
  }, [toast]);

  // Delete milestone
  const deleteMilestone = useCallback(async (goalId: string, milestoneId: string): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authenticatedFetch(`${API_BASE_URL}/goals/${goalId}/milestones/${milestoneId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `Failed to delete milestone: ${response.statusText}`);
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
  }, [toast]);

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

  return {
    loading,
    error,
    getEmployeeGoals,
    getGoal,
    createGoal,
    updateGoal,
    deleteGoal,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    getMilestones,
  };
}

