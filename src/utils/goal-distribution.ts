/**
 * Utility function to calculate goal distribution by category
 * Used across Manager, User, and Admin performance views
 */

export interface GoalDistributionData {
  name: string;
  value: number;
  color: string;
}

export interface Goal {
  category: string;
  [key: string]: any;
}

/**
 * Maps goal categories to the new distribution categories
 */
const mapCategoryToDistribution = (category: string): string => {
  const cat = category.toLowerCase();
  
  // Business/Project Goals - includes business, project, revenue, sales, client-related goals
  if (
    cat.includes('business') ||
    cat.includes('project') ||
    cat.includes('revenue') ||
    cat.includes('sales') ||
    cat.includes('client') ||
    cat.includes('delivery') ||
    cat.includes('product')
  ) {
    return 'Business/Project Goals';
  }
  
  // Functional/Behavioral Competencies - includes technical, functional, behavioral, skills
  if (
    cat.includes('technical') ||
    cat.includes('functional') ||
    cat.includes('behavioral') ||
    cat.includes('competency') ||
    cat.includes('skill') ||
    cat.includes('leadership') ||
    cat.includes('communication')
  ) {
    return 'Functional/Behavioral Competencies';
  }
  
  // Innovation/Initiatives/Collaboration - includes innovation, initiative, collaboration, certification, learning
  if (
    cat.includes('innovation') ||
    cat.includes('initiative') ||
    cat.includes('collaboration') ||
    cat.includes('certification') ||
    cat.includes('learning') ||
    cat.includes('development') ||
    cat.includes('training')
  ) {
    return 'Innovation/Initiatives/Collaboration';
  }
  
  // Default to Business/Project Goals if category doesn't match
  return 'Business/Project Goals';
};

/**
 * Calculate goal distribution based on the new category structure
 * Uses weightage percentages from goals instead of just counting
 * Returns distribution data for pie chart visualization
 */
export function calculateGoalDistribution(goals: Goal[]): GoalDistributionData[] {
  if (!goals || goals.length === 0) {
    // Return default distribution if no goals
    return [
      { name: "Business/Project Goals", value: 60, color: "#4facfe" },
      { name: "Functional/Behavioral Competencies", value: 20, color: "#00f2fe" },
      { name: "Innovation/Initiatives/Collaboration", value: 20, color: "#42b983" }
    ];
  }

  // Sum weightage by distribution category
  const categoryWeightage: Record<string, number> = {
    'Business/Project Goals': 0,
    'Functional/Behavioral Competencies': 0,
    'Innovation/Initiatives/Collaboration': 0
  };

  goals.forEach(goal => {
    const distributionCategory = mapCategoryToDistribution(goal.category);
    // Use weightage if available, otherwise default to equal distribution
    const weightage = goal.weightage || (100 / goals.length);
    categoryWeightage[distributionCategory] += weightage;
  });

  // Calculate percentages based on total weightage
  const totalWeightage = Object.values(categoryWeightage).reduce((sum, val) => sum + val, 0);
  
  const businessWeightage = categoryWeightage['Business/Project Goals'];
  const functionalWeightage = categoryWeightage['Functional/Behavioral Competencies'];
  const innovationWeightage = categoryWeightage['Innovation/Initiatives/Collaboration'];

  // Calculate percentages (round to nearest integer)
  const businessPercent = totalWeightage > 0 ? Math.round((businessWeightage / totalWeightage) * 100) : 60;
  const functionalPercent = totalWeightage > 0 ? Math.round((functionalWeightage / totalWeightage) * 100) : 20;
  const innovationPercent = totalWeightage > 0 ? Math.round((innovationWeightage / totalWeightage) * 100) : 20;

  // Ensure percentages sum to 100 (adjust if needed due to rounding)
  const sum = businessPercent + functionalPercent + innovationPercent;
  const diff = 100 - sum;
  if (diff !== 0) {
    // Adjust the largest category
    if (businessPercent >= functionalPercent && businessPercent >= innovationPercent) {
      return [
        { name: "Business/Project Goals", value: businessPercent + diff, color: "#4facfe" },
        { name: "Functional/Behavioral Competencies", value: functionalPercent, color: "#00f2fe" },
        { name: "Innovation/Initiatives/Collaboration", value: innovationPercent, color: "#42b983" }
      ];
    } else if (functionalPercent >= innovationPercent) {
      return [
        { name: "Business/Project Goals", value: businessPercent, color: "#4facfe" },
        { name: "Functional/Behavioral Competencies", value: functionalPercent + diff, color: "#00f2fe" },
        { name: "Innovation/Initiatives/Collaboration", value: innovationPercent, color: "#42b983" }
      ];
    } else {
      return [
        { name: "Business/Project Goals", value: businessPercent, color: "#4facfe" },
        { name: "Functional/Behavioral Competencies", value: functionalPercent, color: "#00f2fe" },
        { name: "Innovation/Initiatives/Collaboration", value: innovationPercent + diff, color: "#42b983" }
      ];
    }
  }

  return [
    { name: "Business/Project Goals", value: businessPercent, color: "#4facfe" },
    { name: "Functional/Behavioral Competencies", value: functionalPercent, color: "#00f2fe" },
    { name: "Innovation/Initiatives/Collaboration", value: innovationPercent, color: "#42b983" }
  ];
}

/**
 * Get default distribution (used when no goals are available)
 */
export function getDefaultGoalDistribution(): GoalDistributionData[] {
  return [
    { name: "Business/Project Goals", value: 60, color: "#4facfe" },
    { name: "Functional/Behavioral Competencies", value: 20, color: "#00f2fe" },
    { name: "Innovation/Initiatives/Collaboration", value: 20, color: "#42b983" }
  ];
}

