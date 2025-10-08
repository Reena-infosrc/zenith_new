import { useState, useRef, useEffect } from 'react';
import { Search, X, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useEmployeeSearch } from '@/hooks/use-employee-search';
import { EmployeeProfile } from '@/components/employee/EmployeeProfile';

interface SearchDropdownProps {
  className?: string;
}

export function SearchDropdown({ className }: SearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const {
    searchTerm,
    searchResults,
    isSearching,
    showResults,
    handleSearchChange,
    clearSearch,
    selectResult,
    setShowResults
  } = useEmployeeSearch();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setShowResults]);

  const handleInputFocus = () => {
    setIsOpen(true);
    if (searchTerm.length >= 2) {
      setShowResults(true);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSearchChange(e.target.value);
  };

  const handleResultClick = (result: any) => {
    setSelectedEmployee(result);
    setIsProfileOpen(true);
    setIsOpen(false);
    setShowResults(false);
  };

  const handleClearClick = () => {
    clearSearch();
    inputRef.current?.focus();
  };

  return (
    <div className={cn("relative w-full", className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Search employees, modules, or help..."
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          className="pl-9 pr-10 bg-muted/50 border-none rounded-full"
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 rounded-full"
            onClick={handleClearClick}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && (showResults || isSearching) && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-background border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto"
        >
          {isSearching ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Searching...</span>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="p-2">
              <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
                Employees ({searchResults.length})
              </div>
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => handleResultClick(result)}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={result.photoUrl} alt={result.name} />
                    <AvatarFallback className="text-xs">
                      {result.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {result.name}
                      </span>
                      <Badge variant="secondary" className="text-xs px-1 py-0">
                        {result.position}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {result.email}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {result.department}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : searchTerm.length >= 2 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No employees found for "{searchTerm}"
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </div>
          )}
        </div>
      )}

      {/* Employee Profile Popup */}
      {selectedEmployee && (
        <EmployeeProfile
          isOpen={isProfileOpen}
          onClose={() => {
            setIsProfileOpen(false);
            setSelectedEmployee(null);
          }}
          employee={selectedEmployee}
        />
      )}
    </div>
  );
}
