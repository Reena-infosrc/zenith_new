import { useState, useEffect, useRef } from 'react';
import { useToast } from './use-toast';
import { apiCache, CACHE_KEYS } from '@/utils/api-cache';

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
  startDate?: string;
  manager?: string;
  reporting_to?: string;
  skills?: string[];
  expertise?: string;
  experienceYears?: number;
  location?: string;
  account?: string;
  dateOfBirth?: string;
  dateOfJoining?: string;
  gender?: string;
  status?: string;
  resignationDate?: string;
  reasonForResignation?: string;
}

// API base URL - could be moved to environment config
const API_BASE_URL = 'https://zenith-hr-api.apps.infoservices.com/api';

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>(globalEmployees);
  const [isLoading, setIsLoading] = useState<boolean>(globalLoading);
  const [error, setError] = useState<string | null>(globalError);
  const { toast } = useToast();
  const hasInitialized = useRef(false);

  // Debug logging
  console.log('useEmployees hook called:', {
    globalEmployees: globalEmployees.length,
    globalLoading,
    globalError,
    hasInitialized: hasInitialized.current
  });

  // Fetch all employees
  const fetchEmployees = async (sortBy?: string, sortOrder?: string) => {
    console.log('fetchEmployees called:', {
      globalLoading,
      globalEmployeesLength: globalEmployees.length,
      hasPromise: !!globalFetchPromise,
      sortBy,
      sortOrder
    });

    // Create cache key that includes sorting parameters
    const cacheKey = sortBy ? `${CACHE_KEYS.EMPLOYEES}-${sortBy}-${sortOrder}` : CACHE_KEYS.EMPLOYEES;
    
    // Check cache first
    const cachedData = apiCache.get(cacheKey);
    if (cachedData) {
      console.log('✅ Using cached employees data:', cachedData.length, 'employees', 'with sort:', sortBy, sortOrder);
      console.log('🔍 Cached data sample:', cachedData[0] ? {
        id: cachedData[0].id,
        employeeId: cachedData[0].employeeId,
        name: cachedData[0].name,
        status: cachedData[0].status,
        dateOfBirth: cachedData[0].dateOfBirth,
        dateOfJoining: cachedData[0].dateOfJoining,
        experienceYears: cachedData[0].experienceYears
      } : null);
      globalEmployees = cachedData;
      globalError = null;
      setEmployees(cachedData);
      setIsLoading(false);
      setError(null);
      return;
    } else {
      console.log('❌ No cached employees data found for key:', cacheKey);
    }

    // If already loading, return the existing promise
    if (globalLoading && globalFetchPromise) {
      console.log('Waiting for existing promise...');
      await globalFetchPromise;
      setEmployees(globalEmployees);
      setIsLoading(globalLoading);
      setError(globalError);
      return;
    }

    // If we already have data and not loading, just update local state
    if (globalEmployees.length > 0 && !globalLoading) {
      console.log('Using cached data:', globalEmployees.length, 'employees');
      setEmployees(globalEmployees);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Start loading
    console.log('Starting fresh fetch...');
    globalLoading = true;
    setIsLoading(true);
    setError(null);
    
    // Create a promise for this fetch operation
    globalFetchPromise = (async () => {
      try {
        console.log('Making API call to:', `${API_BASE_URL}/employees`);
        
        // Get authentication token
        const token = localStorage.getItem('auth_token');
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          console.log("useEmployees - Authorization header set:", `Bearer ${token.substring(0, 20)}...`);
        } else {
          console.log("useEmployees - No token available");
        }
        
        // Build query parameters
        const params = new URLSearchParams();
        params.append('limit', '10000');
        if (sortBy) {
          params.append('sort_by', sortBy);
        }
        if (sortOrder) {
          params.append('sort_order', sortOrder);
        }
        
        const response = await fetch(`${API_BASE_URL}/employees?${params.toString()}`, { headers });
        
        console.log('API response:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });
        
        if (!response.ok) {
          console.error(`API error: ${response.status} ${response.statusText}`);
          // For now, use mock data when API fails
          console.log("Using mock data due to API error");
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
          return;
        }
        
        const data = await response.json();
        console.log('API data received:', {
          type: typeof data,
          isArray: Array.isArray(data),
          length: Array.isArray(data) ? data.length : 'not array'
        });
        
        // Handle empty data case
        if (!data || !Array.isArray(data)) {
          console.warn("API returned non-array data:", data);
          globalEmployees = [];
          globalError = null;
          return;
        }
      
        // Transform data to match our frontend model
        console.log('🔄 Transforming data for', data.length, 'employees');
        const transformedData = data.map((emp: any) => {
          console.log('🔍 Employee data transformation:', {
            id: emp.id,
            employee_id: emp.employee_id,
            name: emp.name,
            date_of_birth: emp.date_of_birth,
            date_of_joining: emp.date_of_joining,
            experience_years: emp.experience_years
          });
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
            bio: emp.bio || "",
            startDate: emp.start_date || "",
            manager: emp.reporting_to || "", // Map manager to reporting_to field
            reporting_to: emp.reporting_to || null,
            skills: emp.skills || [],
            expertise: emp.expertise || "",
            experienceYears: emp.experience_years !== null ? emp.experience_years : undefined,
            location: emp.location || "",
            account: emp.account || "",
            dateOfBirth: emp.date_of_birth || "",
            dateOfJoining: emp.date_of_joining || "",
            gender: emp.gender || "",
            status: emp.status !== undefined ? emp.status : 'active',
            resignationDate: emp.resignation_date || "",
            reasonForResignation: emp.reason_for_resignation || ""
          };
        });
        
        console.log('🔍 Transformed data sample:', transformedData[0] ? {
          id: transformedData[0].id,
          employeeId: transformedData[0].employeeId,
          name: transformedData[0].name,
          status: transformedData[0].status,
          dateOfBirth: transformedData[0].dateOfBirth,
          dateOfJoining: transformedData[0].dateOfJoining,
          experienceYears: transformedData[0].experienceYears
        } : null);
      
      // Update global state
      console.log('Updating global state with', transformedData.length, 'employees');
      globalEmployees = transformedData;
      globalError = null;
      
      // Cache the data with the appropriate key
      apiCache.set(cacheKey, transformedData);
      console.log('✅ Cached employees data with key:', cacheKey);
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('employeesUpdated'));
      
    } catch (err) {
      console.error("Error fetching employees:", err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch employees';
      
      // If it's a network error, use mock data
      if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed to fetch')) {
        console.log("Network error detected, using mock data");
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
        console.log("Using mock data for development");
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
    console.log('Updating local state:', {
      employees: globalEmployees.length,
      loading: globalLoading,
      error: globalError
    });
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

      const response = await fetch(`${API_BASE_URL}/employees/`, {  // Use main endpoint
        method: 'POST',
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
        startDate: data.start_date,
        manager: data.manager_name,
        skills: data.skills,
        status: data.status !== undefined ? data.status : 'active'
      };
      
      // Update global state
      globalEmployees = [...globalEmployees, newEmployee];
      setEmployees(globalEmployees);
      
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
        start_date: employeeData.startDate ? new Date(employeeData.startDate).toISOString().split('T')[0] : undefined,
        resignation_date: employeeData.resignationDate ? new Date(employeeData.resignationDate).toISOString().split('T')[0] : undefined,
      };

      // Get authentication token
      const token = localStorage.getItem('auth_token');
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log("Update Employee - Authorization header set:", `Bearer ${token.substring(0, 20)}...`);
      } else {
        console.log("Update Employee - No token available");
      }

      const requestBody = {
          name: formattedData.name,
          position: formattedData.position,
          department: formattedData.department,
          email: formattedData.email,
          phone: formattedData.phone,
          mobile: formattedData.mobile,
          bio: formattedData.bio,
          start_date: formattedData.start_date,
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
      
      console.log("🔍 Update Employee Request Body:", requestBody);
      console.log("🔍 Status fields:", {
        status: formattedData.status,
        resignation_date: formattedData.resignation_date,
        reason_for_resignation: formattedData.reasonForResignation
      });

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
        startDate: data.start_date || "",
        manager: data.reporting_to || "",
        reporting_to: data.reporting_to || "",
        skills: data.skills || [],
        expertise: data.expertise || "",
        experienceYears: data.experience_years !== null ? data.experience_years : undefined,
        location: data.location || "",
        dateOfBirth: data.date_of_birth || "",
        dateOfJoining: data.date_of_joining || "",
        gender: data.gender || "",
        status: data.status !== undefined ? data.status : 'active',
        resignationDate: data.resignation_date || "",
        reasonForResignation: data.reason_for_resignation || ""
      };
      
      // Update global state
      console.log("🔄 Updating global employees state for employee:", id);
      console.log("📊 Updated employee data:", updatedEmployee);
      
      globalEmployees = globalEmployees.map(emp => 
        emp.id === id ? updatedEmployee : emp
      );
      setEmployees(globalEmployees);
      
      console.log("✅ Global state updated, total employees:", globalEmployees.length);
      
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
      console.log("CSV Import - Token from localStorage:", token ? token.substring(0, 20) + "..." : "No token found");
      console.log("CSV Import - Full token length:", token ? token.length : 0);
      console.log("CSV Import - Token starts with 'eyJ':", token ? token.startsWith('eyJ') : false);
      
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log("CSV Import - Authorization header set:", `Bearer ${token.substring(0, 20)}...`);
      } else {
        console.log("CSV Import - No token available, request will fail");
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
    console.log('useEffect triggered:', {
      hasInitialized: hasInitialized.current,
      globalEmployeesLength: globalEmployees.length,
      globalLoading,
      globalError
    });
    
    if (!hasInitialized.current) {
      console.log('First time initialization, calling fetchEmployees');
      hasInitialized.current = true;
      fetchEmployees();
    } else {
      console.log('Already initialized, syncing with global state');
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
      console.log('🔄 Global state changed, syncing local state:', {
        globalEmployeesLength: globalEmployees.length,
        localEmployeesLength: employees.length,
        globalLoading,
        globalError
      });
      
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

  // Clear cache and force refresh
  const clearCache = () => {
    apiCache.clear();
    console.log('🗑️ Cache cleared, forcing fresh data fetch');
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
    clearCache
  };
}
