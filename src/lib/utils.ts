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
    // Use formatLocation to normalize casing for deduplication (e.g. "Duncanville, TX")
    return formatLocation(location);
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
    .split(/([\s/-]+)/)
    .map(part => {
      if (/^[\s/-]+$/.test(part)) return part;
      if (part.length === 0) return '';
      // Capitalize first letter, lowercase the rest
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}

/**
 * Formats a location string to ensure state codes are uppercase (e.g. "Duncanville, TX")
 * @param location The location string to format
 * @returns The formatted location string
 */
export function formatLocation(location: string): string {
  if (!location || typeof location !== 'string') return '';

  return location.split(',').map(part => {
    const trimmed = part.trim();
    // Uppercase 2-letter state codes (e.g. TX, NY, CA)
    if (trimmed.length === 2) {
      return trimmed.toUpperCase();
    }
    // Title Case the rest
    return toCamelCase(trimmed);
  }).join(', ');
}

export function groupLocationsByCountry(locations: string[]): Record<string, string[]> {
  const indiaKeywords = ['bangalore', 'bengaluru', 'chennai', 'hyderabad', 'firozabad', 'mumbai', 'delhi', 'new delhi', 'pune', 'nagpur', 'india', 'noida', 'gurgaon', 'kolkata', 'indore'];

  // Added common US state codes and major cities to ensure proper grouping
  const usaKeywords = [
    'austin', 'houston', 'rochester', 'springfield', 'livonia', 'cumming', 'texas', 'georgia', 'california',
    'new york', 'new jersey', 'michigan', 'san francisco', 'los angeles', 'chicago', 'usa', 'us', 'united states',
    'boston', 'seattle', 'washington', 'dallas', 'irving', 'duncanville', 'plano', 'detroit', 'atlanta',
    'tx', 'ny', 'nj', 'ca', 'fl', 'il', 'ga', 'wa', 'ma', 'pa', 'nc', 'va', 'az', 'oh', 'mi', 'tn', 'US', 'USA', 'US Location', 'US Office'
  ];

  const grouped: Record<string, string[]> = {
    'INDIA': [],
    'USA': [],
    'Other': []
  };

  locations.forEach(location => {
    if (!location || location.trim() === '') return;

    // Use formatLocation to normalize the display name (e.g. "Duncanville, TX")
    const normalizedLocation = formatLocation(location);
    const lowerLocation = location.toLowerCase();

    // Check if location belongs to India
    if (indiaKeywords.some(keyword => lowerLocation.includes(keyword.toLowerCase()))) {
      if (!grouped['INDIA'].includes(normalizedLocation)) {
        grouped['INDIA'].push(normalizedLocation);
      }
    }
    // Check if location belongs to USA
    else if (usaKeywords.some(keyword => {
      const lowerKeyword = keyword.toLowerCase();
      return lowerLocation.includes(lowerKeyword) ||
        lowerLocation.split(',').map(p => p.trim()).includes(lowerKeyword);
    })) {
      if (!grouped['USA'].includes(normalizedLocation)) {
        grouped['USA'].push(normalizedLocation);
      }
    }
    // Everything else goes to Other (including UK, Canada, UAE, etc.)
    else {
      if (!grouped['Other'].includes(normalizedLocation)) {
        grouped['Other'].push(normalizedLocation);
      }
    }
  });

  // Sort cities within each country and remove empty countries
  const finalGrouped: Record<string, string[]> = {};

  // Ensure the order is INDIA, USA, Other
  ['INDIA', 'USA', 'Other'].forEach(country => {
    if (grouped[country] && grouped[country].length > 0) {
      grouped[country].sort();
      finalGrouped[country] = grouped[country];
    }
  });

  return finalGrouped;
}

/**
 * Groups accounts/clients by their base name (e.g. "ADP - India" -> "ADP")
 * @param accounts Array of account strings
 * @returns Object with base names as keys and arrays of full account names as values
 */
export function groupAccounts(accounts: string[]): Record<string, string[]> {
  // Explicit groupings with keywords (similar to location grouping)
  const definitions: Record<string, string[]> = {
    'ADP': ['adp'],
    'Ford': ['ford'],
    'HBO': ['hbo'],
    'Disney': ['disney'],
    'Zenith': ['zenith'],
    'Google': ['google'],
    'Microsoft': ['microsoft'],
    'Amazon': ['amazon'],
    'Meta': ['meta', 'facebook'],
    'Apple': ['apple'],
    'Netflix': ['netflix'],
    'Client': ['client']
  };

  const grouped: Record<string, string[]> = {};

  // Initialize explicit groups
  Object.keys(definitions).forEach(key => grouped[key] = []);

  accounts.forEach(account => {
    if (!account || typeof account !== 'string') return;
    const normalized = account.toLowerCase();
    const formattedAccount = toCamelCase(account);
    let matched = false;

    // 1. Try explicit keywords
    for (const [groupName, keywords] of Object.entries(definitions)) {
      if (keywords.some(k => normalized.includes(k))) {
        if (!grouped[groupName].includes(formattedAccount)) {
          grouped[groupName].push(formattedAccount);
        }
        matched = true;
        break;
      }
    }

    // 2. If not matched, intelligent auto-grouping
    if (!matched) {
      // Try to split by " - " first as it's a strong separator
      let groupName = 'Other';
      if (account.includes(' - ')) {
        groupName = account.split(' - ')[0].trim();
      } else {
        // Fallback to first word
        groupName = account.split(' ')[0].trim();
      }

      // Normalize group name to avoid duplicates like "Adobe" vs "adobe"
      groupName = toCamelCase(groupName);

      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }

      if (!grouped[groupName].includes(formattedAccount)) {
        grouped[groupName].push(formattedAccount);
      }
    }
  });

  // Sort keys alphabetically, but keep ADP at the top
  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    if (a === 'ADP') return -1;
    if (b === 'ADP') return 1;
    return a.localeCompare(b);
  });


  // Create new sorted object and remove empty groups
  const sortedGrouped: Record<string, string[]> = {};
  sortedKeys.forEach(key => {
    if (grouped[key].length > 0) {
      // Sort values within each group
      grouped[key].sort();
      sortedGrouped[key] = grouped[key];
    }
  });

  return sortedGrouped;
}
