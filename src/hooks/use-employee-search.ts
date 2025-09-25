import { useState, useEffect, useCallback } from 'react';
import { Employee } from './use-employees';

interface SearchResult {
  id: string;
  name: string;
  email: string;
  position: string;
  department: string;
  photoUrl?: string;
  phone?: string;
  mobile?: string;
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
      const response = await fetch('https://a3x3k8svll.execute-api.us-east-1.amazonaws.com/dev/api/employees/');
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const employees: Employee[] = await response.json();
      
      // Filter employees based on search term
      const filtered = employees
        .filter(employee => {
          const searchLower = term.toLowerCase();
          return (
            employee.name.toLowerCase().includes(searchLower) ||
            employee.email.toLowerCase().includes(searchLower) ||
            employee.position.toLowerCase().includes(searchLower) ||
            employee.department.toLowerCase().includes(searchLower)
          );
        })
        .slice(0, 10) // Limit to 10 results
        .map(employee => ({
          id: employee.id,
          name: employee.name,
          email: employee.email,
          position: employee.position,
          department: employee.department,
          photoUrl: employee.photoUrl,
          phone: employee.phone,
          mobile: employee.mobile,
          location: employee.location,
          dateOfBirth: employee.dateOfBirth,
          dateOfJoining: employee.dateOfJoining,
          employeeStatus: employee.employeeStatus,
          employmentCategory: employee.employmentCategory,
          account: employee.account,
          isLeader: employee.isLeader,
          gender: employee.gender
        }));
      
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
