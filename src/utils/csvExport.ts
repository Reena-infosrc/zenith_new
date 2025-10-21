// CSV Export Utility - Comprehensive field mapping
// This utility ensures all Add Employee form fields are included in CSV exports

import { Employee } from '@/hooks/use-employees';

export interface EmployeeCSVRow {
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  position?: string;
  department?: string;
  phone?: string;
  mobile?: string;
  employmentCategory?: string;
  gender?: string;
  employeeStatus?: string;
  account?: string;
  isLeader?: string;
  location?: string;
  dateOfBirth?: string;
  dateOfJoining?: string;
  bio?: string;
  projectStartDate?: string;
  projectEndDate?: string;
  manager?: string;
  skills?: string[];
  expertise?: string;
  experienceYears?: number;
  status?: string;
  reporting_to?: string;
}

// Canonical field order based on Add Employee form
export const CSV_HEADERS = [
  "Employee ID",
  "First Name", 
  "Last Name",
  "Full Name",
  "Email",
  "Position",
  "Department", 
  "Phone",
  "Mobile",
  "Employment Category",
  "Gender",
  "Employee Status",
  "Account",
  "Is Leader",
  "Location",
  "Date of Birth",
  "Date of Joining",
  "Project Start Date",
  "Project End Date",
  "Bio",
  "Skills",
  "Expertise",
  "Experience Years",
  "Manager",
  "Status"
];

// Field mapping from employee data to CSV headers
export const FIELD_MAPPING: Record<string, keyof EmployeeCSVRow> = {
  "Employee ID": "employeeId",
  "First Name": "firstName", 
  "Last Name": "lastName",
  "Full Name": "name",
  "Email": "email",
  "Position": "position",
  "Department": "department",
  "Phone": "phone",
  "Mobile": "mobile",
  "Employment Category": "employmentCategory",
  "Gender": "gender",
  "Employee Status": "employeeStatus",
  "Account": "account",
  "Is Leader": "isLeader",
  "Location": "location",
  "Date of Birth": "dateOfBirth",
  "Date of Joining": "dateOfJoining",
  "Project Start Date": "projectStartDate",
  "Project End Date": "projectEndDate",
  "Bio": "bio",
  "Skills": "skills",
  "Expertise": "expertise",
  "Experience Years": "experienceYears",
  "Manager": "manager",
  "Status": "status"
};

/**
 * Format date to YYYY-MM-DD format (ISO date only, no time)
 */
export function formatDateForCSV(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "N/A";
  
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "N/A";
    
    // Return ISO date format (YYYY-MM-DD) without time
    return date.toISOString().slice(0, 10);
  } catch (error) {
    console.warn("Error formatting date for CSV:", error);
    return "N/A";
  }
}

/**
 * Format array values for CSV (join with semicolon)
 */
export function formatArrayForCSV(arrayValue: string[] | null | undefined): string {
  if (!arrayValue || !Array.isArray(arrayValue) || arrayValue.length === 0) return "N/A";
  return arrayValue.join("; ");
}

/**
 * Escape CSV field value (handle quotes and commas)
 */
export function escapeCSVField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  
  const stringValue = String(value);
  
  // If the value contains commas, quotes, or newlines, wrap in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}

/**
 * Convert employee data to CSV row with flexible field mapping
 */
export function employeeToCSVRow(employee: Employee, getManagerName?: (managerId: string) => string): string[] {
  return CSV_HEADERS.map(header => {
    const fieldKey = FIELD_MAPPING[header];
    let value = employee[fieldKey];
    
    // Handle field name variations from different APIs
    const fieldMappings: Record<string, string[]> = {
      employeeId: ['employeeId', 'employee_id'],
      firstName: ['firstName', 'first_name'],
      lastName: ['lastName', 'last_name'],
      name: ['name'],
      email: ['email'],
      position: ['position'],
      department: ['department'],
      phone: ['phone'],
      mobile: ['mobile'],
      employmentCategory: ['employmentCategory', 'employment_category'],
      gender: ['gender'],
      employeeStatus: ['employeeStatus', 'employee_status'],
      account: ['account'],
      isLeader: ['isLeader', 'is_leader'],
      location: ['location'],
      dateOfBirth: ['dateOfBirth', 'date_of_birth'],
      dateOfJoining: ['dateOfJoining', 'date_of_joining'],
      projectStartDate: ['projectStartDate', 'project_start_date'],
      projectEndDate: ['projectEndDate', 'project_end_date'],
      bio: ['bio'],
      skills: ['skills'],
      expertise: ['expertise'],
      experienceYears: ['experienceYears', 'experience_years'],
      manager: ['manager'],
      status: ['status']
    };
    
    // Try to find the value using multiple possible field names
    if (value === undefined || value === null) {
      const possibleFields = fieldMappings[fieldKey] || [fieldKey];
      for (const field of possibleFields) {
        if (employee[field] !== undefined && employee[field] !== null) {
          value = employee[field];
          break;
        }
      }
    }
    
    // Special handling for specific fields
    switch (fieldKey) {
      case "dateOfBirth":
      case "dateOfJoining":
      case "projectStartDate":
      case "projectEndDate":
        return formatDateForCSV(value);
        
      case "skills":
        return formatArrayForCSV(value);
        
      case "manager":
        // Try multiple ways to get manager name
        if (employee.reporting_to && getManagerName) {
          return escapeCSVField(getManagerName(employee.reporting_to));
        }
        if (employee.manager_name) {
          return escapeCSVField(employee.manager_name);
        }
        if (employee.manager) {
          return escapeCSVField(employee.manager);
        }
        return "N/A";
        
      case "firstName": {
        // Try both firstName and first_name
        const firstName = employee.firstName || employee.first_name || value;
        return escapeCSVField(firstName);
      }
        
      case "lastName": {
        // Try both lastName and last_name
        const lastName = employee.lastName || employee.last_name || value;
        return escapeCSVField(lastName);
      }
        
      case "employeeId": {
        // Try both employeeId and employee_id
        const employeeId = employee.employeeId || employee.employee_id || value;
        return escapeCSVField(employeeId);
      }
        
      case "employmentCategory": {
        // Try both employmentCategory and employment_category
        const employmentCategory = employee.employmentCategory || employee.employment_category || value;
        return escapeCSVField(employmentCategory);
      }
        
      case "employeeStatus": {
        // Try both employeeStatus and employee_status
        const employeeStatus = employee.employeeStatus || employee.employee_status || value;
        return escapeCSVField(employeeStatus);
      }
        
      case "isLeader": {
        // Try both isLeader and is_leader
        const isLeader = employee.isLeader || employee.is_leader || value;
        return escapeCSVField(isLeader);
      }
        
      case "experienceYears": {
        // Try both experienceYears and experience_years
        const experienceYears = employee.experienceYears || employee.experience_years || value;
        return escapeCSVField(experienceYears);
      }
        
      default:
        return escapeCSVField(value);
    }
  });
}

/**
 * Export employees to CSV with comprehensive field coverage
 */
export function exportEmployeesToCSV(
  employees: any[], 
  filename: string = "employees_export.csv",
  getManagerName?: (managerId: string) => string
): void {
  if (!employees || employees.length === 0) {
    throw new Error("No employees data to export");
  }
  
  // Debug: Log the first employee to see the data structure
  console.log("🔍 CSV Export Debug - First employee:", employees[0]);
  
  // Create CSV content
  const csvRows = [
    CSV_HEADERS.join(","), // Header row
    ...employees.map(employee => {
      const row = employeeToCSVRow(employee, getManagerName);
      // Debug: Log the first row to see the output
      if (employees.indexOf(employee) === 0) {
        console.log("🔍 CSV Export Debug - First row:", row);
      }
      return row.join(",");
    })
  ];
  
  const csvContent = csvRows.join("\n");
  
  // Debug: Log a sample of the CSV content
  console.log("🔍 CSV Export Debug - Sample content:", csvContent.split("\n").slice(0, 3).join("\n"));
  
  // Create and download file
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up
  URL.revokeObjectURL(url);
}
