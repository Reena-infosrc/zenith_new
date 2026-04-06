import { useState, useEffect } from 'react';
import { useToast } from './use-toast';
import { apiCache, CACHE_KEYS } from '@/utils/api-cache';
import { API_BASE_URL } from '@/config/api';

// Global state to prevent multiple simultaneous API calls
let globalEmployees: Employee[] = [];
let globalLoading = false;
let globalIsLoadingMore = false;
let globalError: string | null = null;
let globalFetchPromise: Promise<void> | null = null;

const FIRST_PAGE_LIMIT = 72;
const FULL_PAGE_LIMIT = 10000;

// Employee type definition
export interface Employee {
  id: string;
  employeeId?: string;
  name: string;
  position: string;
  department: string;
  photoUrl?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  bio?: string;
  projectStartDate?: string;
  projectEndDate?: string;
  manager?: string;
  reporting_to?: string;
  skills?: string[];
  expertise?: string;
  experienceYears?: number;
  location?: string;
  /** Azure Entra usageLocation — ISO country code (e.g. IN, US) */
  usageLocation?: string;
  account?: string;
  dateOfBirth?: string;
  dateOfJoining?: string;
  gender?: string;
  employmentCategory?: string;
  employeeStatus?: string;
  isLeader?: string;
  status?: string;
  resignationDate?: string;
  reasonForResignation?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
}

function mapEmployeeRow(emp: Record<string, unknown>): Employee {
  return {
    id: (emp.id as string) || 'temp-' + Math.random().toString(36).substring(2, 11),
    employeeId: (emp.employee_id as string) || '',
    name: (emp.name as string) || 'Unknown',
    position: (emp.position as string) || 'Not specified',
    department: (emp.department as string) || 'Not specified',
    photoUrl: (emp.photo_url as string) || '',
    email: (emp.email as string) || '',
    phone: (emp.phone as string) || '',
    mobile: (emp.mobile as string) || '',
    bio: (emp.bio as string) || '',
    projectStartDate: (emp.project_start_date as string) || '',
    projectEndDate: (emp.project_end_date as string) || '',
    manager: (emp.reporting_to as string) || '',
    reporting_to: (emp.reporting_to as string) || null,
    skills: (emp.skills as string[]) || [],
    expertise: (emp.expertise as string) || '',
    experienceYears:
      emp.experience_years !== null && emp.experience_years !== undefined
        ? (emp.experience_years as number)
        : undefined,
    location: (emp.location as string) || '',
    usageLocation: (emp.usage_location as string) || '',
    account: (emp.account as string) || '',
    dateOfBirth: (emp.date_of_birth as string) || '',
    dateOfJoining: (emp.date_of_joining as string) || '',
    gender: (emp.gender as string) || '',
    employmentCategory: (emp.employment_category as string) || '',
    employeeStatus: (emp.employee_status as string) || '',
    isLeader: (emp.is_leader as string) || '',
    status:
      emp.status !== undefined && emp.status !== null && emp.status !== ''
        ? (emp.status as string)
        : 'active',
    resignationDate: (emp.resignation_date as string) || '',
    reasonForResignation: (emp.reason_for_resignation as string) || '',
    emergencyContactName: (emp.emergency_contact_name as string) || '',
    emergencyContactRelationship: (emp.emergency_contact_relationship as string) || '',
    emergencyContactPhone: (emp.emergency_contact_phone as string) || '',
  };
}

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>(globalEmployees);
  const [isLoading, setIsLoading] = useState<boolean>(globalLoading);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(globalIsLoadingMore);
  const [error, setError] = useState<string | null>(globalError);
  const { toast } = useToast();

  const fetchEmployees = async (sortBy?: string, sortOrder?: string) => {
    const cacheKey = sortBy ? `${CACHE_KEYS.EMPLOYEES}-${sortBy}-${sortOrder}` : CACHE_KEYS.EMPLOYEES;

    const cachedData = apiCache.get(cacheKey);
    if (cachedData) {
      globalEmployees = cachedData;
      globalError = null;
      setEmployees(cachedData);
      setIsLoading(false);
      setIsLoadingMore(false);
      setError(null);
      return;
    }

    if (globalLoading && globalFetchPromise) {
      await globalFetchPromise;
      setEmployees(globalEmployees);
      setIsLoading(globalLoading);
      setIsLoadingMore(globalIsLoadingMore);
      setError(globalError);
      return;
    }

    if (globalEmployees.length > 0 && !globalLoading) {
      setEmployees(globalEmployees);
      setIsLoading(false);
      setIsLoadingMore(false);
      setError(null);
      return;
    }

    const progressive = !sortBy && !sortOrder;

    globalLoading = true;
    globalIsLoadingMore = false;
    setIsLoading(true);
    setIsLoadingMore(false);
    setError(null);

    globalFetchPromise = (async () => {
      const token = localStorage.getItem('auth_token');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const fetchPage = async (skip: number, limit: number): Promise<Employee[] | null> => {
        const params = new URLSearchParams();
        params.append('skip', String(skip));
        params.append('limit', String(limit));
        if (sortBy) params.append('sort_by', sortBy);
        if (sortOrder) params.append('sort_order', sortOrder);
        const response = await fetch(`${API_BASE_URL}/employees?${params.toString()}`, { headers });
        if (!response.ok) return null;
        const data = await response.json();
        if (!data || !Array.isArray(data)) return [];
        return data.map((emp: Record<string, unknown>) => mapEmployeeRow(emp));
      };

      const applyDevMock = () => {
        const mockEmployees: Employee[] = [
          {
            id: '1',
            name: 'Alex Johnson',
            position: 'Developer',
            department: 'Engineering',
            photoUrl:
              'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80',
            email: 'alex.johnson@example.com',
          },
          {
            id: '2',
            name: 'Emma Wilson',
            position: 'Designer',
            department: 'Product',
            photoUrl:
              'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80',
            email: 'emma@example.com',
          },
        ];
        globalEmployees = mockEmployees;
        globalError = null;
      };

      try {
        if (progressive) {
          const first = await fetchPage(0, FIRST_PAGE_LIMIT);
          if (first === null) {
            if (process.env.NODE_ENV === 'development') applyDevMock();
            else {
              globalEmployees = [];
              globalError = 'Failed to load employees';
              toast({ title: 'Error', description: 'Failed to load employees.', variant: 'destructive' });
            }
            return;
          }

          globalEmployees = first;
          globalError = null;
          window.dispatchEvent(new CustomEvent('employeesUpdated'));
          setEmployees([...globalEmployees]);
          setIsLoading(false);
          globalIsLoadingMore = true;
          setIsLoadingMore(true);

          const full = await fetchPage(0, FULL_PAGE_LIMIT);
          if (full === null) {
            globalError = globalError || 'Partial load';
            toast({
              title: 'Could not refresh full directory',
              description: 'Showing the first page only. Try refreshing.',
              variant: 'destructive',
            });
            return;
          }
          globalEmployees = full;
          globalError = null;
          apiCache.set(cacheKey, full);
          window.dispatchEvent(new CustomEvent('employeesUpdated'));
          return;
        }

        const rows = await fetchPage(0, FULL_PAGE_LIMIT);
        if (rows === null) {
          if (process.env.NODE_ENV === 'development') applyDevMock();
          else {
            globalEmployees = [];
            globalError = 'Failed to load employees';
            toast({ title: 'Error', description: 'Failed to load employees.', variant: 'destructive' });
          }
          return;
        }
        globalEmployees = rows;
        globalError = null;
        apiCache.set(cacheKey, rows);
        window.dispatchEvent(new CustomEvent('employeesUpdated'));
      } catch (err) {
        console.error('Error fetching employees:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch employees';
        if (
          errorMessage.includes('fetch') ||
          errorMessage.includes('network') ||
          errorMessage.includes('Failed to fetch')
        ) {
          if (process.env.NODE_ENV === 'development') applyDevMock();
          else globalError = errorMessage;
        } else {
          globalError = errorMessage;
        }
        if (process.env.NODE_ENV !== 'development' && globalEmployees.length === 0) {
          toast({
            title: 'Error',
            description: 'Failed to load employees. Please try again.',
            variant: 'destructive',
          });
        }
      } finally {
        globalLoading = false;
        globalIsLoadingMore = false;
        globalFetchPromise = null;
      }
    })();

    await globalFetchPromise;

    setEmployees(globalEmployees);
    setIsLoading(false);
    setIsLoadingMore(false);
    setError(globalError);
  };
  
  // Get employee by ID
  const getEmployee = async (id: string): Promise<Employee | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/employees/${id}`);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return {
        id: data.id,
        name: data.name,
        position: data.position,
        department: data.department,
        photoUrl: data.photo_url,
        email: data.email,
        phone: data.phone,
        bio: data.bio,
        startDate: data.start_date,
        manager: data.manager_name,
        skills: data.skills
      };
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load employee details.',
        variant: 'destructive',
      });
      return null;
    }
  };

  // Create a new employee
  const createEmployee = async (employeeData: Omit<Employee, 'id'>): Promise<Employee | null> => {
    try {
      // Create FormData for multipart/form-data submission
      const formData = new FormData();
      
      // Append all employee data to FormData
      Object.entries(employeeData).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (key === 'photoUrl' && value instanceof File) {
            formData.append('photo', value); // Change to 'photo' to match backend
          } else if (key !== 'photoUrl') { // Skip photoUrl if it's not a File
            formData.append(key, value.toString());
          }
        }
      });

      // Get authentication token
      const token = localStorage.getItem('auth_token');
      
      // Build headers - don't set Content-Type for FormData, browser will set it with boundary
      const headers: HeadersInit = {};
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/employees/`, {  // Use main endpoint
        method: 'POST',
        headers: headers,
        body: formData, // Use FormData instead of JSON
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Update local state
      const newEmployee = {
        id: data.id,
        name: data.name,
        position: data.position,
        department: data.department,
        photoUrl: data.photo_url,
        email: data.email,
        phone: data.phone,
        bio: data.bio,
        projectStartDate: data.project_start_date,
        projectEndDate: data.project_end_date,
        manager: data.manager_name,
        skills: data.skills,
        status: data.status !== undefined ? data.status : 'active'
      };
      
      // Update global state
      globalEmployees = [...globalEmployees, newEmployee];
      setEmployees(globalEmployees);
      
      // Invalidate caches since a new employee might have new client or status
      // This will trigger a refresh of the clients and employee statuses lists
      if (typeof window !== 'undefined') {
        // Dispatch custom events to notify caches to invalidate
        window.dispatchEvent(new CustomEvent('invalidateClientsCache'));
        window.dispatchEvent(new CustomEvent('invalidateEmployeeStatusesCache'));
      }
      
      toast({
        title: 'Success',
        description: `${employeeData.name} has been added successfully.`,
      });
      
      return newEmployee;
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to create employee.',
        variant: 'destructive',
      });
      return null;
    }
  };

  // Update an existing employee
  const updateEmployee = async (id: string, employeeData: Partial<Employee>): Promise<Employee | null> => {
    try {
      // Format the date to ISO string format if it exists
      const formattedData = {
        ...employeeData,
        projectStartDate: employeeData.projectStartDate ? new Date(employeeData.projectStartDate).toISOString().split('T')[0] : undefined,
        projectEndDate: employeeData.projectEndDate ? new Date(employeeData.projectEndDate).toISOString().split('T')[0] : undefined,
        resignation_date: employeeData.resignationDate ? new Date(employeeData.resignationDate).toISOString().split('T')[0] : undefined,
      };

      // Get authentication token
      const token = localStorage.getItem('auth_token');
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const requestBody = {
          employee_id: formattedData.employeeId,
          name: formattedData.name,
          position: formattedData.position,
          department: formattedData.department,
          email: formattedData.email,
          phone: formattedData.phone,
          mobile: formattedData.mobile,
          emergency_contact_name: formattedData.emergencyContactName,
          emergency_contact_relationship: formattedData.emergencyContactRelationship,
          emergency_contact_phone: formattedData.emergencyContactPhone,
          emergency_contact: formattedData.emergencyContact,
          bio: formattedData.bio,
          project_start_date: formattedData.projectStartDate,
          project_end_date: formattedData.projectEndDate,
          photo_url: formattedData.photoUrl,
          reporting_to: formattedData.reporting_to,
          skills: formattedData.skills,
          expertise: formattedData.expertise,
          experience_years: formattedData.experienceYears,
          location: formattedData.location,
          gender: formattedData.gender,
          date_of_birth: formattedData.dateOfBirth,
          date_of_joining: formattedData.dateOfJoining,
          employment_category: formattedData.employmentCategory,
          employee_status: formattedData.employeeStatus,
          account: formattedData.account,
          is_leader: formattedData.isLeader,
          status: formattedData.status,
          resignation_date: formattedData.resignation_date,
          reason_for_resignation: formattedData.reasonForResignation
      };

      const response = await fetch(`${API_BASE_URL}/employees/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Update local state with complete employee data
      const updatedEmployee = {
        id: data.id,
        employeeId: data.employee_id || "",
        name: data.name,
        position: data.position,
        department: data.department,
        photoUrl: data.photo_url || "",
        email: data.email || "",
        phone: data.phone || "",
        mobile: data.mobile || "",
        bio: data.bio || "",
        projectStartDate: data.project_start_date || "",
        projectEndDate: data.project_end_date || "",
        manager: data.reporting_to || "",
        reporting_to: data.reporting_to || "",
        skills: data.skills || [],
        expertise: data.expertise || "",
        experienceYears: data.experience_years !== null ? data.experience_years : undefined,
        location: data.location || "",
        dateOfBirth: data.date_of_birth || "",
        dateOfJoining: data.date_of_joining || "",
        gender: data.gender || "",
        emergencyContactName: data.emergency_contact_name || "",
        emergencyContactRelationship: data.emergency_contact_relationship || "",
        emergencyContactPhone: data.emergency_contact_phone || "",
        status: data.status !== undefined ? data.status : 'active',
        resignationDate: data.resignation_date || "",
        reasonForResignation: data.reason_for_resignation || ""
      };
      
      // Update global state
      globalEmployees = globalEmployees.map(emp => 
        emp.id === id ? updatedEmployee : emp
      );
      setEmployees(globalEmployees);
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('employeesUpdated'));
      
      // Clear cache to ensure fresh data on next fetch
      apiCache.clear();
      
      toast({
        title: 'Success',
        description: 'Employee profile has been updated successfully.',
      });
      
      return updatedEmployee;
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update employee.',
        variant: 'destructive',
      });
      return null;
    }
  };

  // Delete an employee
  const deleteEmployee = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/employees/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      // Update global state
      globalEmployees = globalEmployees.filter(emp => emp.id !== id);
      setEmployees(globalEmployees);
      
      toast({
        title: 'Success',
        description: 'Employee has been removed successfully.',
      });
      
      return true;
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to delete employee.',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Import employees from CSV
  const importEmployeesFromCsv = async (file: File): Promise<boolean> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Get authentication token
      const token = localStorage.getItem('auth_token');
      
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_BASE_URL}/employees/import-csv`, {  // Use the new CSV import endpoint
        method: 'POST',
        headers,
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Refresh employee list
      await fetchEmployees();  // Added await
      
      toast({
        title: 'Import successful',
        description: `${result.inserted || result.successful_imports} employees have been imported.`,  // Handle both response formats
      });
      
      return true;
    } catch (err) {
      console.error('Import error:', err);  // Added error logging
      toast({
        title: 'Import failed',
        description: 'Failed to import employees. Please check the file format.',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Hydrate from localStorage-backed cache or in-memory list so navigating away and back does not refetch.
  useEffect(() => {
    const cacheKey = CACHE_KEYS.EMPLOYEES;
    const cached = apiCache.get(cacheKey);
    if (cached) {
      globalEmployees = cached;
      setEmployees(cached);
      setIsLoading(false);
      setIsLoadingMore(false);
      setError(null);
      return;
    }
    if (globalEmployees.length > 0) {
      setEmployees(globalEmployees);
      setIsLoading(false);
      setIsLoadingMore(globalIsLoadingMore);
      setError(globalError);
      return;
    }
    fetchEmployees();
  }, []);

  // Sync local state with global state when global state changes
  // Use a custom event system to notify components of global state changes
  useEffect(() => {
    const handleGlobalStateChange = () => {
      setEmployees([...globalEmployees]);
      setIsLoading(globalLoading);
      setIsLoadingMore(globalIsLoadingMore);
      setError(globalError);
    };

    // Listen for global state changes
    window.addEventListener('employeesUpdated', handleGlobalStateChange);
    
    return () => {
      window.removeEventListener('employeesUpdated', handleGlobalStateChange);
    };
  }, [employees.length, globalLoading, globalError]);

  const clearCache = () => {
    apiCache.clear();
    globalEmployees = [];
    globalLoading = false;
    globalIsLoadingMore = false;
    globalFetchPromise = null;
    globalError = null;
  };

  // Bulk update employee names to camel case
  const bulkUpdateEmployeeNames = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/employees/bulk-update-names`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update employee names');
      }

      const result = await response.json();
      
      // Clear cache and refresh data
      apiCache.clear();
      await fetchEmployees();
      
      return result;
    } catch (error) {
      throw error;
    }
  };

  return {
    employees,
    isLoading,
    isLoadingMore,
    error,
    fetchEmployees,
    getEmployee,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    importEmployeesFromCsv,
    clearCache,
    bulkUpdateEmployeeNames
  };
}
