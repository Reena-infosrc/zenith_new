import { FeatureFlagStatus } from '@/hooks/use-feature-flags';

// Define the module order for navigation priority
export const MODULE_NAVIGATION_ORDER = [
  { name: 'Directory', route: '/directory', featureFlag: 'directory_module' },
  { name: 'Home', route: '/home', featureFlag: 'home_module' },
  { name: 'Leave', route: '/leave', featureFlag: 'leave_module' },
  { name: 'Recruitment', route: '/recruitment', featureFlag: 'recruitment_module' },
  { name: 'Performance', route: '/performance', featureFlag: 'performance_module' },
  { name: 'Analytics', route: '/dashboard', featureFlag: 'dashboard_module' },
  { name: 'Engagement', route: '/engagement', featureFlag: 'engagement_module' },
  { name: 'Resource Hub', route: '/resource-hub', featureFlag: 'resource_hub_module' },
  { name: 'Compensation', route: '/compensation', featureFlag: 'compensation_module' },
  { name: 'Learning', route: '/learning', featureFlag: 'learning_module' },
  { name: 'Helpdesk', route: '/helpdesk', featureFlag: 'helpdesk_module' },
];

/**
 * Get the first available module route based on feature flags
 * @param featureFlagStatus - Map of feature flag statuses
 * @returns The route of the first enabled module, or '/directory' as fallback
 */
export function getFirstAvailableModuleRoute(featureFlagStatus: Record<string, FeatureFlagStatus>): string {
  // Find the first module that is enabled (not disabled or hidden)
  for (const module of MODULE_NAVIGATION_ORDER) {
    const status = featureFlagStatus[module.featureFlag];
    if (status === 'enabled') {
      return module.route;
    }
  }
  
  // Fallback to directory if no modules are enabled
  return '/directory';
}

/**
 * Get all available module routes based on feature flags
 * @param featureFlagStatus - Map of feature flag statuses
 * @returns Array of routes for enabled modules
 */
export function getAvailableModuleRoutes(featureFlagStatus: Record<string, FeatureFlagStatus>): string[] {
  return MODULE_NAVIGATION_ORDER
    .filter(module => featureFlagStatus[module.featureFlag] === 'enabled')
    .map(module => module.route);
}

/**
 * Check if a specific module is available
 * @param featureFlagStatus - Map of feature flag statuses
 * @param moduleName - Name of the module to check
 * @returns True if the module is enabled
 */
export function isModuleAvailable(featureFlagStatus: Record<string, FeatureFlagStatus>, moduleName: string): boolean {
  const module = MODULE_NAVIGATION_ORDER.find(m => m.name === moduleName);
  if (!module) return false;
  
  return featureFlagStatus[module.featureFlag] === 'enabled';
}
