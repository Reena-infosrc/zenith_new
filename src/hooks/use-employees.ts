import { useState, useEffect, useRef } from 'react';
import { useToast } from './use-toast';
import { apiCache, CACHE_KEYS } from '@/utils/api-cache';
import { API_BASE_URL } from '@/config/api';

// Global state to prevent multiple simultaneous API calls
let globalEmployees: Employee[] = [];
let globalLoading = false;
let globalError: string | null = null;
let globalFetchPromise: Promise<void> | null = null;

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

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>(globalEmployees);
  const [isLoading, setIsLoading] = useState<boolean>(globalLoading);
  const [error, setError] = useState<string | null>(globalError);
  const { toast } = useToast();
  const hasInitialized = useRef(false);

  // Debug logging removed for security

  // Fetch all employees
  const fetchEmployees = async (sortBy?: string, sortOrder?: string) => {

    // Create cache key that includes sorting parameters
    const cacheKey = sortBy ? `${CACHE_KEYS.EMPLOYEES}-${sortBy}-${sortOrder}` : CACHE_KEYS.EMPLOYEES;
    
    // Check cache first
    const cachedData = apiCache.get(cacheKey);
    if (cachedData) {
      globalEmployees = cachedData;
      globalError = null;
      setEmployees(cachedData);
      setIsLoading(false);
      setError(null);
      return;
    }

    // If already loading, return the existing promise
    if (globalLoading && globalFetchPromise) {
      await globalFetchPromise;
      setEmployees(globalEmployees);
      setIsLoading(globalLoading);
      setError(globalError);
      return;
    }

    // If we already have data and not loading, just update local state
    if (globalEmployees.length > 0 && !globalLoading) {
      setEmployees(globalEmployees);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Start loading
    globalLoading = true;
    setIsLoading(true);
    setError(null);
    
    // Create a promise for this fetch operation
    globalFetchPromise = (async () => {
      try {
        // Get authentication token
        const token = localStorage.getItem('auth_token');
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const params = new URLSearchParams();
        params.append('limit', '1000');
        if (sortBy) {
          params.append('sort_by', sortBy);
        }
        if (sortOrder) {
          params.append('sort_order', sortOrder);
        }
        
        const response = await fetch(`${API_BASE_URL}/employees?${params.toString()}`, { headers });
        
        if (!response.ok) {
          // For now, use mock data when API fails
          const mockEmployees = [
            { 
              id: "1", 
              name: "Alex Johnson", 
              position: "Developer", 
              department: "Engineering", 
              photoUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
              email: "alex.johnson@example.com",
              phone: "555-0123",
              startDate: "2023-01-15",
              manager: "",
              reporting_to: "",
              skills: ["JavaScript", "React", "Node.js"],
              expertise: "Frontend Development",
              experienceYears: 3,
              location: "New York",
              dateOfBirth: "1995-05-15",
              dateOfJoining: "2023-01-15",
              gender: "MALE",
              employmentCategory: "FTE",
              employeeStatus: "Active",
              isLeader: "No"
            },
            { 
              id: "2", 
              name: "Sarah Wilson", 
              position: "Designer", 
              department: "Product", 
              photoUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
              email: "sarah.wilson@example.com",
              phone: "555-0124",
              startDate: "2023-02-20",
              manager: "",
              reporting_to: "",
              skills: ["UI/UX", "Figma", "Sketch"],
              expertise: "User Experience Design",
              experienceYears: 4,
              location: "San Francisco",
              dateOfBirth: "1992-08-22",
              dateOfJoining: "2023-02-20",
              gender: "FEMALE",
              employmentCategory: "FTE",
              employeeStatus: "Active",
              isLeader: "No"
            },
            { 
              id: "3", 
              name: "Mike Chen", 
              position: "Manager", 
              department: "Engineering", 
              photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
              email: "mike.chen@example.com",
              phone: "555-0125",
              startDate: "2022-11-10",
              manager: "",
              reporting_to: "",
              skills: ["Leadership", "Python", "AWS"],
              expertise: "Engineering Management",
              experienceYears: 6,
              location: "Seattle",
              dateOfBirth: "1988-12-03",
              dateOfJoining: "2022-11-10",
              gender: "MALE",
              employmentCategory: "FTE",
              employeeStatus: "Active",
              isLeader: "Yes"
            },
            { 
              id: "4", 
              name: "Emma Davis", 
              position: "Analyst", 
              department: "Finance", 
              photoUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
              email: "emma.davis@example.com",
              phone: "555-0126",
              startDate: "2023-03-05",
              manager: "",
              reporting_to: "",
              skills: ["Excel", "SQL", "Financial Modeling"],
              expertise: "Financial Analysis",
              experienceYears: 2,
              location: "Chicago",
              dateOfBirth: "1996-03-15",
              dateOfJoining: "2023-03-05",
              gender: "FEMALE",
              employmentCategory: "FTE",
              employeeStatus: "Active",
              isLeader: "No"
            },
            { 
              id: "5", 
              name: "David Rodriguez", 
              position: "Sales Rep", 
              department: "Sales", 
              photoUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
              email: "david.rodriguez@example.com",
              phone: "555-0127",
              startDate: "2023-04-12",
              manager: "",
              reporting_to: "",
              skills: ["Sales", "CRM", "Negotiation"],
              expertise: "Sales Management",
              experienceYears: 5,
              location: "Miami",
              dateOfBirth: "1990-07-08",
              dateOfJoining: "2023-04-12",
              gender: "MALE",
              employmentCategory: "FTE",
              employeeStatus: "Active",
              isLeader: "No"
            }
          ];
          globalEmployees = mockEmployees;
          globalError = null;
          return;
        }
        
        const data = await response.json();
        
        // Handle empty data case
        if (!data || !Array.isArray(data)) {
          globalEmployees = [];
          globalError = null;
          return;
        }
      
        // Transform data to match our frontend model
        const transformedData = data.map((emp: Record<string, unknown>) => {
          return {
            id: emp.id || "temp-" + Math.random().toString(36).substr(2, 9),
            employeeId: emp.employee_id || "",
            name: emp.name || "Unknown",
            position: emp.position || "Not specified",
            department: emp.department || "Not specified",
            photoUrl: emp.photo_url || "",
            email: emp.email || "",
            phone: emp.phone || "",
            mobile: emp.mobile || "",
            emergencyContact: emp.emergency_contact || "",
            bio: emp.bio || "",
            projectStartDate: emp.project_start_date || "",
            projectEndDate: emp.project_end_date || "",
            manager: emp.reporting_to || "", // Map manager to reporting_to field
            reporting_to: emp.reporting_to || null,
            skills: emp.skills || [],
            expertise: emp.expertise || "",
            experienceYears: emp.experience_years !== null ? emp.experience_years : undefined,
            location: emp.location || "",
            usageLocation: (emp.usage_location as string) || "",
            account: emp.account || "",
            dateOfBirth: emp.date_of_birth || "",
            dateOfJoining: emp.date_of_joining || "",
            gender: emp.gender || "",
            employmentCategory: emp.employment_category || "",
            employeeStatus: emp.employee_status || "",
            isLeader: emp.is_leader || "",
            status: emp.status !== undefined && emp.status !== null && emp.status !== '' ? emp.status : 'active',
            resignationDate: emp.resignation_date || "",
            reasonForResignation: emp.reason_for_resignation || "",
            emergencyContactName: emp.emergency_contact_name || "",
            emergencyContactRelationship: emp.emergency_contact_relationship || "",
            emergencyContactPhone: emp.emergency_contact_phone || ""
          };
        });
      
      // Update global state
      globalEmployees = transformedData;
      globalError = null;
      
      // Cache the data with the appropriate key
      apiCache.set(cacheKey, transformedData);
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('employeesUpdated'));
      
    } catch (err) {
      console.error("Error fetching employees:", err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch employees';
      
      // If it's a network error, use mock data
      if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed to fetch')) {
        const mockEmployees = [
          { 
            id: "1", 
            name: "Alex Johnson", 
            position: "Developer", 
            department: "Engineering", 
            photoUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
            email: "alex.johnson@example.com",
            phone: "555-0123",
            startDate: "2023-01-15",
            manager: "",
            reporting_to: "",
            skills: ["JavaScript", "React", "Node.js"],
            expertise: "Frontend Development",
            experienceYears: 3,
            location: "New York",
            dateOfBirth: "1995-05-15",
            dateOfJoining: "2023-01-15",
            gender: "MALE"
          },
          { 
            id: "2", 
            name: "Sarah Wilson", 
            position: "Designer", 
            department: "Product", 
            photoUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
            email: "sarah.wilson@example.com",
            phone: "555-0124",
            startDate: "2023-02-20",
            manager: "",
            reporting_to: "",
            skills: ["UI/UX", "Figma", "Sketch"],
            expertise: "User Experience Design",
            experienceYears: 4,
            location: "San Francisco",
            dateOfBirth: "1992-08-22",
            dateOfJoining: "2023-02-20",
            gender: "FEMALE"
          },
          { 
            id: "3", 
            name: "Mike Chen", 
            position: "Manager", 
            department: "Engineering", 
            photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
            email: "mike.chen@example.com",
            phone: "555-0125",
            startDate: "2022-11-10",
            manager: "",
            reporting_to: "",
            skills: ["Leadership", "Python", "AWS"],
            expertise: "Engineering Management",
            experienceYears: 6,
            location: "Seattle",
            dateOfBirth: "1988-12-03",
            dateOfJoining: "2022-11-10",
            gender: "MALE"
          },
          { 
            id: "4", 
            name: "Emma Davis", 
            position: "Analyst", 
            department: "Finance", 
            photoUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
            email: "emma.davis@example.com",
            phone: "555-0126",
            startDate: "2023-03-05",
            manager: "",
            reporting_to: "",
            skills: ["Excel", "SQL", "Financial Modeling"],
            expertise: "Financial Analysis",
            experienceYears: 2,
            location: "Chicago",
            dateOfBirth: "1996-03-15",
            dateOfJoining: "2023-03-05",
            gender: "FEMALE"
          },
          { 
            id: "5", 
            name: "David Rodriguez", 
            position: "Sales Rep", 
            department: "Sales", 
            photoUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
            email: "david.rodriguez@example.com",
            phone: "555-0127",
            startDate: "2023-04-12",
            manager: "",
            reporting_to: "",
            skills: ["Sales", "CRM", "Negotiation"],
            expertise: "Sales Management",
            experienceYears: 5,
            location: "Miami",
            dateOfBirth: "1990-07-08",
            dateOfJoining: "2023-04-12",
            gender: "MALE"
          }
        ];
        globalEmployees = mockEmployees;
        globalError = null;
      } else {
        globalError = errorMessage;
      }
      
      // Use mock data for development
      if (process.env.NODE_ENV === 'development') {
        const mockEmployees = [
          { 
            id: "1", 
            name: "Alex Johnson", 
            position: "Developer", 
            department: "Engineering", 
            photoUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80",
            email: "alex.johnson@example.com"
          },
          { 
            id: "2", 
            name: "Emma Wilson", 
            position: "Designer", 
            department: "Product", 
            photoUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=200&q=80" 
          }
        ];
        globalEmployees = mockEmployees;
      } else {
        toast({
          title: 'Error',
          description: 'Failed to load employees. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      globalLoading = false;
      globalFetchPromise = null;
    }
    })();

    // Wait for the promise to complete
    await globalFetchPromise;
    
    // Update local state
    setEmployees(globalEmployees);
    setIsLoading(globalLoading);
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

  // Load employees on component mount (only once globally)
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      fetchEmployees();
    } else {
      // If already initialized, just sync with global state
      setEmployees(globalEmployees);
      setIsLoading(globalLoading);
      setError(globalError);
    }
  }, []);

  // Sync local state with global state when global state changes
  // Use a custom event system to notify components of global state changes
  useEffect(() => {
    const handleGlobalStateChange = () => {
      setEmployees([...globalEmployees]); // Create new array to trigger re-render
      setIsLoading(globalLoading);
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
