import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Consolidates remote locations into a single "Remote" entry
 * @param locations Array of location strings
 * @returns Array of consolidated locations with remote locations merged
 */
export function consolidateRemoteLocations(locations: string[]): string[] {
  const processedLocations = locations.map(location => {
    if (!location) return location;
    
    const normalizedLocation = location.trim().toLowerCase();
    // Check if location starts with "remote -" or is exactly "remote" and consolidate to just "Remote"
    if (normalizedLocation.startsWith('remote -') || normalizedLocation === 'remote') {
      return 'Remote';
    }
    return location;
  });
  
  return [...new Set(processedLocations)].sort();
}

/**
 * Predefined department options for employee forms
 */
export const DEPARTMENT_OPTIONS = [
  'Human Resource',
  'Talent Acquisition', 
  'IT Support',
  'Operations',
  'Finance',
  'L&D',
  'Marketing',
  'Support',
  'Delivery'
];

/**
 * Predefined employee status options for employee forms
 */
export const EMPLOYEE_STATUS_OPTIONS = [
  'Active',
  'Inactive',
  'On Leave',
  'Terminated',
  'Contract',
  'Intern',
  'Part-time',
  'Full-time'
];

/**
 * Predefined client/account options for employee forms
 */
export const CLIENT_OPTIONS = [
  'Zenith Technologies',
  'Client A',
  'Client B',
  'Client C',
  'Internal',
  'External',
  'Government',
  'Private Sector'
];

/**
 * Converts a name to camel case format
 * @param name The name to convert
 * @returns The name in camel case format
 */
export function toCamelCase(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  return name
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
