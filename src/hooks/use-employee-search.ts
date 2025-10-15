import { useState, useEffect, useCallback } from 'react';
import { Employee, useEmployees } from './use-employees';

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
  projectStartDate?: string;
  projectEndDate?: string;
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
  status?: string;
  resignationDate?: string;
  reasonForResignation?: string;
}

export function useEmployeeSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Use the same data source as the directory
  const { employees } = useEmployees();

  // Debounced search function
  const searchEmployees = useCallback(async (term: string) => {
    if (term.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    
    try {
      // Use the employees from useEmployees hook instead of making a separate API call
      const transformedData = employees.map((emp: Employee) => ({
        id: emp.id || "temp-" + Math.random().toString(36).substr(2, 9),
        employeeId: emp.employeeId || "",
        name: emp.name || "Unknown",
        position: emp.position || "Not specified",
        department: emp.department || "Not specified",
        photoUrl: emp.photoUrl || "",
        email: emp.email || "",
        phone: emp.phone || "",
        mobile: emp.mobile || "",
        bio: emp.bio || "",
        projectStartDate: emp.projectStartDate || "",
        projectEndDate: emp.projectEndDate || "",
        manager: emp.reporting_to || "",
        reporting_to: emp.reporting_to || "",
        skills: emp.skills || [],
        expertise: emp.expertise || "",
        experienceYears: emp.experienceYears !== null ? emp.experienceYears : undefined,
        location: emp.location || "",
        account: emp.account || "",
        dateOfBirth: emp.dateOfBirth || "",
        dateOfJoining: emp.dateOfJoining || "",
        gender: emp.gender || "",
        employeeStatus: emp.employeeStatus || "",
        employmentCategory: emp.employmentCategory || "",
        isLeader: emp.isLeader || "",
        status: emp.status !== undefined ? emp.status : 'active',
        resignationDate: emp.resignationDate || "",
        reasonForResignation: emp.reasonForResignation || ""
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
  }, [employees]);

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
