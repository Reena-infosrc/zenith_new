/**
 * Animation Configuration
 * Switch between different sidebar animations
 */

export type AnimationType = 'cloud-gear' | 'hr-character';

export const ANIMATION_CONFIG = {
  // Set this to switch between animations
  // Options: 'cloud-gear' | 'hr-character'
  currentAnimation: 'cloud-gear' as AnimationType,
  
  // Animation settings
  settings: {
    gearRotationSpeed: 15, // seconds for full rotation
    cloudBounceDuration: 3, // seconds for bounce cycle
    enableSparkles: true, // show sparkle effects (only for cloud-gear)
  }
} as const;

// Helper function to get current animation
export const getCurrentAnimation = (): AnimationType => {
  return ANIMATION_CONFIG.currentAnimation;
};

// Helper function to switch animation
export const switchAnimation = (type: AnimationType): void => {
  // Note: This is a type-safe way to switch, but actual value changes need to be done
  // by modifying the config file directly, or you can use environment variables
  console.log(`Switching animation to: ${type}`);
};

