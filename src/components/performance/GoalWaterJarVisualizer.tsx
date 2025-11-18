import { useState, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";
import type { TeamGoal } from "./TeamMemberGoalsCard";

interface GoalWaterJarVisualizerProps {
  goals: TeamGoal[];
  onSegmentClick?: (category: string, goals: TeamGoal[]) => void;
  className?: string;
}

const CATEGORY_COLORS: Record<string, { base: string; light: string; dark: string }> = {
  "Business/Project Goals": {
    base: "hsl(150, 60%, 50%)", // Vibrant green
    light: "hsl(150, 60%, 60%)",
    dark: "hsl(150, 60%, 40%)"
  },
  "Functional/Behavioral Competencies": {
    base: "#00f2fe", // Cyan blue
    light: "#33f5ff",
    dark: "#00c9d4"
  },
  "Innovation/Initiatives/Collaboration": {
    base: "hsl(40, 90%, 58%)", // Warm yellow-orange blend
    light: "hsl(40, 90%, 68%)",
    dark: "hsl(40, 90%, 48%)"
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

  // Get thunderbolt color based on total fill percentage
  const getThunderboltColor = (percentage: number) => {
    if (percentage >= 100) {
      // Bright green for 100%
      return { base: "rgb(34, 197, 94)", rgba: "rgba(34, 197, 94, 0.8)", rgbaLight: "rgba(34, 197, 94, 0.6)" };
    } else if (percentage >= 70) {
      // Light green for 70-90%
      return { base: "rgb(74, 222, 128)", rgba: "rgba(74, 222, 128, 0.8)", rgbaLight: "rgba(74, 222, 128, 0.6)" };
    } else if (percentage >= 30) {
      // Yellow for 30-70%
      return { base: "rgb(250, 204, 21)", rgba: "rgba(250, 204, 21, 0.8)", rgbaLight: "rgba(250, 204, 21, 0.6)" };
    } else if (percentage >= 10) {
      // Dark orange for 10-30%
      return { base: "rgb(249, 115, 22)", rgba: "rgba(249, 115, 22, 0.8)", rgbaLight: "rgba(249, 115, 22, 0.6)" };
    } else {
      // Default gray for < 10%
      return { base: "rgb(156, 163, 175)", rgba: "rgba(156, 163, 175, 0.8)", rgbaLight: "rgba(156, 163, 175, 0.6)" };
    }
  };

  const thunderboltColor = getThunderboltColor(totalFilled);

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
    <div className={cn("flex flex-col items-center justify-center w-full", className)}>
      <div className="relative w-full max-w-[140px] mx-auto flex-shrink-0">
        {/* Battery Container - Modern Glassmorphism Design */}
        <div className="relative w-full rounded-2xl border-2 border-white/20 dark:border-border/40 bg-gradient-to-b from-white/10 via-white/5 to-white/10 dark:from-background/90 dark:via-background/70 dark:to-background/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden transition-all duration-500 hover:shadow-[0_12px_48px_rgba(0,0,0,0.15)] dark:hover:shadow-[0_12px_48px_rgba(0,0,0,0.4)] hover:scale-[1.02]" style={{ boxSizing: "border-box", height: "200px", maxHeight: "200px" }}>
          {/* Battery Top Cap - Enhanced */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-12 h-5 rounded-t-2xl border-2 border-white/20 dark:border-border/40 bg-gradient-to-b from-white/15 to-white/5 dark:from-background/80 dark:to-background/60 z-[20] shadow-[0_4px_16px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]" />
          
          {/* Outer Glow Ring */}
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none blur-xl z-[-1]" />
          
          {/* Inner Glass Effect */}
          <div className="absolute inset-0 pointer-events-none z-[1]">
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent rounded-2xl" />
            <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/15 to-transparent rounded-t-2xl" />
          </div>
          
          {/* Empty Space at Top - Enhanced */}
          {emptySpace > 0 && (
            <div
              className="absolute top-0 left-0 right-0 bg-gradient-to-b from-background/40 via-background/20 to-transparent rounded-t-2xl"
              style={{
                height: `${emptySpace}%`
              }}
            />
          )}

          {/* Energy Layers - Use category colors with lighter versions */}
          {layers.map((layer) => {
            const categoryColors = CATEGORY_COLORS[layer.name] || CATEGORY_COLORS["Business/Project Goals"];
            // Use lighter versions of category colors
            const colors = {
              base: categoryColors.light,
              light: categoryColors.base,
              dark: categoryColors.base
            };
            const isHighlighted = highlightedCategory === layer.name;
            const hasGoals = (goalsByCategory.get(layer.name) || []).length > 0;
            const lightnessMatch = categoryColors.base.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)/);
            const baseLightness = lightnessMatch ? parseInt(lightnessMatch[1], 10) : 50;
            const textClassName = baseLightness > 65 ? "text-foreground" : "text-white";

            return (
              <div
                key={layer.name}
                className={cn(
                  "absolute left-0 right-0 bottom-0 cursor-pointer transition-all duration-700 group/segment",
                  isHighlighted && "ring-2 ring-white/80 dark:ring-primary/60 ring-offset-2 ring-offset-background z-10 shadow-[0_0_30px_rgba(0,0,0,0.3)]",
                  !hasGoals && "opacity-50 cursor-not-allowed",
                  !prefersReducedMotion.current && isAnimating && "animate-water-fill",
                  "hover:brightness-[1.15] hover:saturate-110"
                )}
                style={{
                  height: `${layer.height}%`,
                  bottom: `${layer.y}%`,
                  background: `linear-gradient(to top, 
                    ${colors.dark} 0%, 
                    ${colors.dark} 15%,
                    ${colors.base} 35%, 
                    ${colors.light} 55%,
                    ${colors.base} 75%,
                    ${colors.light} 90%,
                    ${colors.base} 100%
                  )`,
                  clipPath: "inset(0 0 0 0)",
                  animationDelay: prefersReducedMotion.current ? "0s" : `${layer.index * 150}ms`,
                  boxShadow: isHighlighted 
                    ? `inset 0 0 30px ${colors.base}50, inset 0 -10px 20px ${colors.dark}30, 0 0 30px ${colors.base}40` 
                    : `inset 0 4px 12px ${colors.dark}25, inset 0 -2px 8px ${colors.dark}15`
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
                {/* Animated Wave Effect */}
                <div 
                  className="absolute top-0 left-0 right-0 h-2 opacity-70 group-hover/segment:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background: `linear-gradient(to right, 
                      transparent 0%, 
                      ${colors.light}80 25%,
                      ${colors.base} 50%,
                      ${colors.light}80 75%,
                      transparent 100%
                    )`,
                    boxShadow: `0 -4px 12px ${colors.light}70, 0 -2px 6px ${colors.base}50`,
                    filter: "blur(0.5px)"
                  }}
                />

                {/* Shimmer Effect - Enhanced */}
                <div 
                  className="absolute inset-0 opacity-0 group-hover/segment:opacity-100 transition-opacity duration-700 pointer-events-none"
                  style={{
                    background: `linear-gradient(
                      135deg,
                      transparent 0%,
                      rgba(255, 255, 255, 0.4) 30%,
                      rgba(255, 255, 255, 0.5) 50%,
                      rgba(255, 255, 255, 0.4) 70%,
                      transparent 100%
                    )`,
                    backgroundSize: "200% 200%"
                  }}
                />

                {/* Bottom Glow */}
                <div 
                  className="absolute bottom-0 left-0 right-0 h-3 opacity-50 group-hover/segment:opacity-80 transition-opacity"
                  style={{
                    background: `radial-gradient(ellipse at center, ${colors.dark}80, transparent 70%)`,
                    filter: "blur(4px)"
                  }}
                />

                {/* Energy Level Label - Center Aligned */}
                {layer.height > 12 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-2 pointer-events-none z-[5]">
                    <div className="relative w-full flex flex-col items-center justify-center">
                      {/* Text Background Glow - Enhanced */}
                      <div 
                        className="absolute -inset-4 blur-xl opacity-40 group-hover/segment:opacity-60 transition-opacity"
                        style={{
                          background: `radial-gradient(circle, ${colors.base}90, transparent 70%)`,
                        }}
                      />
                      
                      {/* Category Name - Center Aligned */}
                      <span
                        className={cn(
                          "relative text-[10px] font-bold text-center leading-tight w-full block",
                          textClassName,
                          layer.height < 20 && "text-[9px]",
                          layer.height < 15 && "text-[8px]",
                          "break-words hyphens-auto"
                        )}
                        style={{
                          wordBreak: "break-word",
                          overflowWrap: "break-word",
                          maxWidth: "100%",
                          lineHeight: "1.3",
                          textAlign: "center",
                          textShadow: textClassName === "text-white" 
                            ? "0 2px 4px rgba(0,0,0,0.7), 0 0 10px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.8)" 
                            : "0 1px 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.6)"
                        }}
                      >
                        {layer.name}
                      </span>
                      
                      {/* Percentage - Center Aligned */}
                      <span
                        className={cn(
                          "relative text-lg font-black block mt-1.5 text-center",
                          textClassName,
                          layer.height < 20 && "text-base",
                          layer.height < 15 && "text-sm"
                        )}
                        style={{
                          textAlign: "center",
                          textShadow: textClassName === "text-white" 
                            ? "0 3px 8px rgba(0,0,0,0.8), 0 0 16px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.9)" 
                            : "0 2px 5px rgba(255,255,255,1), 0 0 10px rgba(255,255,255,0.8)"
                        }}
                      >
                        {layer.value}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Glowing Thunderbolt Symbol in Center - Enhanced */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[15]">
            <div className="relative">
              {/* Outer Glow Rings */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div 
                  className="absolute w-16 h-16 rounded-full animate-pulse"
                  style={{
                    background: `radial-gradient(circle, ${thunderboltColor.rgbaLight} 0%, transparent 70%)`,
                    filter: "blur(8px)"
                  }}
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div 
                  className="absolute w-12 h-12 rounded-full animate-pulse"
                  style={{
                    background: `radial-gradient(circle, ${thunderboltColor.rgba} 0%, transparent 70%)`,
                    filter: "blur(4px)",
                    animationDelay: "0.5s"
                  }}
                />
              </div>
              {/* Main Glow */}
              <div className="absolute inset-0 flex items-center justify-center">
                <Zap 
                  className="h-12 w-12 blur-md animate-pulse" 
                  style={{ 
                    color: thunderboltColor.base,
                    opacity: 0.5,
                    filter: "blur(8px)"
                  }}
                />
              </div>
              {/* Main Thunderbolt */}
              <Zap 
                className="h-12 w-12 relative z-10 animate-pulse"
                style={{
                  color: thunderboltColor.base,
                  filter: `drop-shadow(0 0 8px ${thunderboltColor.base}) drop-shadow(0 0 16px ${thunderboltColor.rgba}) drop-shadow(0 0 24px ${thunderboltColor.rgbaLight})`,
                  animation: "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite"
                }}
              />
            </div>
          </div>

          {/* Enhanced Reflection Effects */}
          <div className="absolute inset-0 pointer-events-none z-[5]">
            <div className="absolute left-0 top-0 bottom-0 w-2/5 bg-gradient-to-r from-white/25 via-white/15 to-transparent rounded-2xl" />
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-black/8 via-black/4 to-transparent rounded-2xl" />
            <div className="absolute top-0 left-0 right-0 h-1/4 bg-gradient-to-b from-white/20 via-white/10 to-transparent rounded-t-2xl" />
          </div>
          
          {/* Bottom Energy Glow */}
          <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-primary/30 via-primary/15 to-transparent pointer-events-none z-[3] rounded-b-2xl" style={{ filter: "blur(2px)" }} />
          
          {/* Side Border Highlights */}
          <div className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-gradient-to-b from-white/30 via-white/20 to-white/30 rounded-full pointer-events-none z-[6]" />
          <div className="absolute right-0 top-1/4 bottom-1/4 w-1 bg-gradient-to-b from-white/20 via-white/10 to-white/20 rounded-full pointer-events-none z-[6]" />
        </div>
      </div>
    </div>
  );
}

