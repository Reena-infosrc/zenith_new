import { useState, useEffect, useCallback } from 'react';
import { Employee } from './use-employees';

interface SearchResult {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  position: string;
  department: string;
  photoUrl?: string;
  phone?: string;
  mobile?: string;
  bio?: string;
  startDate?: string;
  skills?: string[];
  expertise?: string;
  experienceYears?: number;
  manager?: string;
  reporting_to?: string;
  location?: string;
  dateOfBirth?: string;
  dateOfJoining?: string;
  employeeStatus?: string;
  employmentCategory?: string;
  account?: string;
  isLeader?: string;
  gender?: string;
}

export function useEmployeeSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Debounced search function
  const searchEmployees = useCallback(async (term: string) => {
    if (term.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    
    try {
      const response = await fetch('http://localhost:8000/api/employees/');
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data: any[] = await response.json();
      
      // Transform the data the same way useEmployees does
      const transformedData = data.map((emp: any) => ({
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
        manager: emp.reporting_to || "",
        reporting_to: emp.reporting_to || "",
        skills: emp.skills || [],
        expertise: emp.expertise || "",
        experienceYears: emp.experience_years !== null ? emp.experience_years : undefined,
        location: emp.location || "",
        account: emp.account || "",
        dateOfBirth: emp.date_of_birth || "",
        dateOfJoining: emp.date_of_joining || "",
        gender: emp.gender || "",
        employeeStatus: emp.employee_status || "",
        employmentCategory: emp.employment_category || "",
        isLeader: emp.is_leader || ""
      }));
      
      // Filter employees based on search term
      const filtered = transformedData
        .filter(employee => {
          const searchLower = term.toLowerCase();
          return (
            employee.name.toLowerCase().includes(searchLower) ||
            employee.email.toLowerCase().includes(searchLower) ||
            employee.position.toLowerCase().includes(searchLower) ||
            employee.department.toLowerCase().includes(searchLower)
          );
        })
        .slice(0, 10); // Limit to 10 results
      
      setSearchResults(filtered);
      setShowResults(true);
    } catch (error) {
      setSearchResults([]);
      setShowResults(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm.length >= 2) {
        searchEmployees(searchTerm);
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchTerm, searchEmployees]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };

  const clearSearch = () => {
    setSearchTerm('');
    setSearchResults([]);
    setShowResults(false);
  };

  const selectResult = (result: SearchResult) => {
    setSearchTerm(result.name);
    setShowResults(false);
    // You can add navigation logic here if needed
  };

  return {
    searchTerm,
    searchResults,
    isSearching,
    showResults,
    handleSearchChange,
    clearSearch,
    selectResult,
    setShowResults
  };
}
