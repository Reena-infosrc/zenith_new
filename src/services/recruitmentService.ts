import { toast } from 'sonner';

const API_BASE_URL = 'https://a3x3k8svll.execute-api.us-east-1.amazonaws.com/dev/api/recruitment';

export interface JobRequisitionData {
  jobTitle: string;
  department: string;
  manager: string;
  numberOfOpenings: number;
  jobType: string;
  location: string;
  skills: string[];
  experienceLevel: string;
  educationRequirements: string;
  salaryMin: number;
  salaryMax: number;
  reasonForHire: string;
  startDate: Date | undefined;
  notes: string;
}

export interface WorkflowStep {
  id: string;
  title: string;
  status: 'pending' | 'approved' | 'declined' | 'current' | 'in-progress';
  step_type: string;
  comments?: string;
  reviewer?: string;
  reviewed_at?: string;
  attachments?: string[];
}

export interface JobRequisition {
  id: string;
  requisition_id: string;
  department_request: JobRequisitionData;
  hr_review?: any;
  budget_approval?: any;
  final_approval?: any;
  workflow_steps: WorkflowStep[];
  current_step: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface RecruitmentStats {
  total_requisitions: number;
  pending_requisitions: number;
  approved_requisitions: number;
  declined_requisitions: number;
  open_positions: number;
  closed_positions: number;
  average_approval_time?: number;
}

export interface HeadcountForecast {
  month: string;
  actual?: number;
  forecast: number;
  department?: string;
}

class RecruitmentService {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  async createJobRequisition(data: JobRequisitionData): Promise<JobRequisition> {
    try {
      const payload = {
        department_request: data,
        created_by: 'current_user' // This should come from auth context
      };
      const response = await fetch(`${API_BASE_URL}/job-requisitions`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create job requisition');
      }

      const result = await response.json();
      toast.success('Job requisition created successfully');
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create job requisition');
      throw error;
    }
  }

  async getJobRequisitions(params?: {
    skip?: number;
    limit?: number;
    status?: string;
    department?: string;
  }): Promise<JobRequisition[]> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.skip) queryParams.append('skip', params.skip.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.status) queryParams.append('status', params.status);
      if (params?.department) queryParams.append('department', params.department);

      const response = await fetch(`${API_BASE_URL}/job-requisitions?${queryParams}`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch job requisitions');
      }

      return await response.json();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch job requisitions');
      throw error;
    }
  }

  async getJobRequisition(id: string): Promise<JobRequisition> {
    try {
      const response = await fetch(`${API_BASE_URL}/job-requisitions/${id}`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch job requisition');
      }

      return await response.json();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch job requisition');
      throw error;
    }
  }

  async updateWorkflowStep(
    requisitionId: string, 
    stepId: string, 
    action: 'approve' | 'decline' | 'request_info' | 'submit',
    comments?: string
  ): Promise<any> {
    try {
      const response = await fetch(`${API_BASE_URL}/job-requisitions/${requisitionId}/workflow/${stepId}`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          action,
          comments,
          reviewer: 'current_user' // This should come from auth context
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update workflow step');
      }

      const result = await response.json();
      toast.success(`Workflow step ${action}ed successfully`);
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update workflow step');
      throw error;
    }
  }

  async getRecruitmentStats(): Promise<RecruitmentStats> {
    try {
      const response = await fetch(`${API_BASE_URL}/stats`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch recruitment stats');
      }

      return await response.json();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch recruitment stats');
      throw error;
    }
  }

  async getHeadcountForecast(): Promise<HeadcountForecast[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/headcount-forecast`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch headcount forecast');
      }

      return await response.json();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch headcount forecast');
      throw error;
    }
  }

  async getDepartments(): Promise<string[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/departments`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch departments');
      }

      const result = await response.json();
      return result.departments;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch departments');
      throw error;
    }
  }

  async getJobTypes(): Promise<string[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/job-types`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch job types');
      }

      const result = await response.json();
      return result.job_types;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch job types');
      throw error;
    }
  }

  async getExperienceLevels(): Promise<string[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/experience-levels`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch experience levels');
      }

      const result = await response.json();
      return result.experience_levels;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch experience levels');
      throw error;
    }
  }
}

export const recruitmentService = new RecruitmentService(); 