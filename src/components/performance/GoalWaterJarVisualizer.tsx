import { useState, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type { TeamGoal } from "./TeamMemberGoalsCard";

interface GoalWaterJarVisualizerProps {
  goals: TeamGoal[];
  onSegmentClick?: (category: string, goals: TeamGoal[]) => void;
  className?: string;
}

const CATEGORY_COLORS: Record<string, { base: string; light: string; dark: string }> = {
  "Business/Project Goals": {
    base: "hsl(210, 98%, 65%)", // #4facfe
    light: "hsl(210, 98%, 75%)",
    dark: "hsl(210, 98%, 55%)"
  },
  "Functional/Behavioral Competencies": {
    base: "hsl(185, 100%, 50%)", // #00f2fe
    light: "hsl(185, 100%, 60%)",
    dark: "hsl(185, 100%, 40%)"
  },
  "Innovation/Initiatives/Collaboration": {
    base: "hsl(150, 60%, 50%)", // #42b983
    light: "hsl(150, 60%, 60%)",
    dark: "hsl(150, 60%, 40%)"
  }
};

const CATEGORY_ORDER = [
  "Business/Project Goals",
  "Functional/Behavioral Competencies",
  "Innovation/Initiatives/Collaboration"
];

const mapCategoryToDistribution = (category: string): string => {
    const cat = category.toLowerCase();
    if (
      cat.includes("business") ||
      cat.includes("project") ||
      cat.includes("revenue") ||
      cat.includes("sales") ||
      cat.includes("client") ||
      cat.includes("delivery") ||
      cat.includes("product")
    ) {
      return "Business/Project Goals";
    }
    if (
      cat.includes("technical") ||
      cat.includes("functional") ||
      cat.includes("behavioral") ||
      cat.includes("competency") ||
      cat.includes("skill") ||
      cat.includes("leadership") ||
      cat.includes("communication")
    ) {
      return "Functional/Behavioral Competencies";
    }
    if (
      cat.includes("innovation") ||
      cat.includes("initiative") ||
      cat.includes("collaboration") ||
      cat.includes("certification") ||
      cat.includes("learning") ||
      cat.includes("development") ||
      cat.includes("training")
    ) {
      return "Innovation/Initiatives/Collaboration";
    }
    return "Business/Project Goals";
};

export function GoalWaterJarVisualizer({
  goals,
  onSegmentClick,
  className
}: GoalWaterJarVisualizerProps) {
  const [isAnimating, setIsAnimating] = useState(true);
  const [highlightedCategory, setHighlightedCategory] = useState<string | null>(null);
  const prefersReducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // Calculate actual weightage percentages (not normalized)
  const distribution = useMemo(() => {
    const categoryWeightage: Record<string, number> = {
      'Business/Project Goals': 0,
      'Functional/Behavioral Competencies': 0,
      'Innovation/Initiatives/Collaboration': 0
    };

    goals.forEach((goal) => {
      const mappedCategory = mapCategoryToDistribution(goal.category);
      const weightage = goal.weightage || 0;
      categoryWeightage[mappedCategory] += weightage;
    });

    // Return actual weightage values (not normalized to 100%)
    return CATEGORY_ORDER.map((catName) => ({
      name: catName,
      value: Math.round(categoryWeightage[catName]),
      color: CATEGORY_COLORS[catName]?.base || "#4facfe"
    }));
  }, [goals]);

  const goalsByCategory = useMemo(() => {
    const map = new Map<string, TeamGoal[]>();
    CATEGORY_ORDER.forEach((cat) => map.set(cat, []));
    goals.forEach((goal) => {
      const mappedCategory = mapCategoryToDistribution(goal.category);
      const existing = map.get(mappedCategory) || [];
      map.set(mappedCategory, [...existing, goal]);
    });
    return map;
  }, [goals]);

  useEffect(() => {
    if (prefersReducedMotion.current) {
      setIsAnimating(false);
      return;
    }
    const timer = setTimeout(() => setIsAnimating(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleSegmentClick = (category: string) => {
    const categoryGoals = goalsByCategory.get(category) || [];
    if (categoryGoals.length > 0 && onSegmentClick) {
      onSegmentClick(category, categoryGoals);
    }
  };

  const handleSegmentHover = (category: string | null) => {
    setHighlightedCategory(category);
  };

  // Calculate total filled percentage
  const totalFilled = distribution.reduce((sum, item) => sum + item.value, 0);
  const emptySpace = Math.max(0, 100 - totalFilled);

  // Calculate cumulative heights for stacking (from bottom)
  let cumulativeHeight = 0;
  const layers = distribution.map((item, index) => {
    const height = item.value;
    const currentY = cumulativeHeight;
    cumulativeHeight += height;
    return {
      ...item,
      height,
      y: currentY,
      index
    };
  });

  return (
    <div className={cn("flex flex-col items-center justify-center w-full py-4 px-2", className)}>
      <div className="relative w-full max-w-[200px] mx-auto flex-shrink-0" style={{ paddingBottom: "8px" }}>
        {/* Glass/Jar Container */}
        <div className="relative w-full h-[220px] rounded-t-2xl rounded-b-lg border-4 border-border/60 bg-background/40 backdrop-blur-sm shadow-lg overflow-hidden" style={{ boxSizing: "border-box" }}>
          {/* Empty Space at Top */}
          {emptySpace > 0 && (
            <div
              className="absolute top-0 left-0 right-0 bg-transparent"
              style={{
                height: `${emptySpace}%`
              }}
            />
          )}

          {/* Water Layers */}
          {layers.map((layer) => {
            const colors = CATEGORY_COLORS[layer.name] || CATEGORY_COLORS["Business/Project Goals"];
            const isHighlighted = highlightedCategory === layer.name;
            const hasGoals = (goalsByCategory.get(layer.name) || []).length > 0;

            return (
              <div
                key={layer.name}
                className={cn(
                  "absolute left-0 right-0 bottom-0 cursor-pointer transition-all duration-300",
                  isHighlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background z-10",
                  !hasGoals && "opacity-50 cursor-not-allowed",
                  !prefersReducedMotion.current && isAnimating && "animate-water-fill"
                )}
                style={{
                  height: `${layer.height}%`,
                  bottom: `${layer.y}%`,
                  background: `linear-gradient(to top, ${colors.dark}, ${colors.base}, ${colors.light})`,
                  clipPath: "inset(0 0 0 0)",
                  animationDelay: prefersReducedMotion.current ? "0s" : `${layer.index * 150}ms`
                }}
                onClick={() => handleSegmentClick(layer.name)}
                onMouseEnter={() => handleSegmentHover(layer.name)}
                onMouseLeave={() => handleSegmentHover(null)}
                role="button"
                tabIndex={hasGoals ? 0 : -1}
                aria-label={`${layer.name}: ${layer.value}%`}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && hasGoals) {
                    e.preventDefault();
                    handleSegmentClick(layer.name);
                  }
                }}
              >
                {/* Wave Animation at Top */}
                {!prefersReducedMotion.current && layer.height > 0 && (
                  <div
                    className="absolute top-0 left-0 right-0 h-3 opacity-80 animate-water-wave"
                    style={{
                      background: `linear-gradient(to bottom, ${colors.light}, transparent)`,
                      clipPath: "polygon(0 100%, 100% 100%, 100% 0, 0 0)",
                      animationDelay: `${layer.index * 500}ms`
                    }}
                  />
                )}

                {/* Label and Percentage Overlay */}
                {layer.height > 12 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-2 pointer-events-none">
                    <span
                      className={cn(
                        "text-[10px] font-semibold text-white drop-shadow-lg text-center leading-tight w-full",
                        layer.height < 25 && "text-[9px]",
                        "break-words hyphens-auto"
                      )}
                      style={{
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                        maxWidth: "100%",
                        lineHeight: "1.2"
                      }}
                    >
                      {layer.name}
                    </span>
                    <span
                      className={cn(
                        "text-lg font-bold text-white drop-shadow-lg mt-0.5",
                        layer.height < 25 && "text-base"
                      )}
                    >
                      {layer.value}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Glass Reflection Effect */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-0 top-0 bottom-0 w-1/3 bg-gradient-to-r from-white/20 to-transparent rounded-t-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

