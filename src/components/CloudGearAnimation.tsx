/**
 * Cloud & Gear Animation Component
 * Company logo animation with rotating gear and bouncing cloud
 */

interface CloudGearAnimationProps {
  settings?: {
    gearRotationSpeed?: number;
    cloudBounceDuration?: number;
    enableSparkles?: boolean;
  };
}

export const CloudGearAnimation = ({ settings }: CloudGearAnimationProps) => {
  const gearSpeed = settings?.gearRotationSpeed || 15;
  const bounceDuration = settings?.cloudBounceDuration || 3;
  const showSparkles = settings?.enableSparkles !== false;

  return (
    <svg
      viewBox="0 0 120 120"
      className="w-full h-full"
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Vibrant gradient for gear - more anime style */}
        <linearGradient id="gearGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="1" />
          <stop offset="30%" stopColor="#2563eb" stopOpacity="1" />
          <stop offset="70%" stopColor="#1e40af" stopOpacity="1" />
          <stop offset="100%" stopColor="#1e3a8a" stopOpacity="1" />
        </linearGradient>
        
        {/* Bright cloud gradient - more anime style */}
        <radialGradient id="cloudGradient" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="70%" stopColor="#f8fafc" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.9" />
        </radialGradient>
        
        {/* Enhanced shadow filter */}
        <filter id="gearShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
          <feOffset dx="2" dy="2" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.4" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        
        <filter id="cloudShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
          <feOffset dx="1" dy="1" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.3" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        
        {/* Glow effect */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Blue Gear - Rotating BEHIND cloud */}
      <g 
        className="animate-gear-rotate"
        style={{ 
          transformOrigin: '60px 60px',
          animationDuration: `${gearSpeed}s`
        }}
      >
        {/* Base circle for gear body - smaller radius */}
        <circle cx="60" cy="60" r="38" fill="url(#gearGradient)" filter="url(#gearShadow)" />
        
        {/* Gear teeth - 12 teeth, angular and mechanical looking */}
        {[...Array(12)].map((_, i) => {
          const centerAngle = (i * 30 - 90) * Math.PI / 180; // Center angle of each tooth
          const totalAngle = 30 * Math.PI / 180; // 30 degrees per tooth
          
          // Tooth dimensions - making them more rectangular/angular
          const rootRadius = 38; // Base of gear (where teeth start)
          const tipRadius = 48; // Tip of teeth
          const toothBaseWidth = totalAngle * 0.4; // Width at base (40% of total angle)
          const gapWidth = totalAngle * 0.6; // Gap between teeth (60% of total angle)
          
          // Calculate tooth shape points - creating a rectangular tooth
          const angle1 = centerAngle - gapWidth / 2; // Start of gap
          const angle2 = centerAngle - toothBaseWidth / 2; // Start of tooth base
          const angle3 = centerAngle; // Center of tooth
          const angle4 = centerAngle + toothBaseWidth / 2; // End of tooth base
          const angle5 = centerAngle + gapWidth / 2; // End of gap
          
          // Create angular tooth shape
          const x1 = 60 + Math.cos(angle1) * rootRadius; // Gap point 1
          const y1 = 60 + Math.sin(angle1) * rootRadius;
          const x2 = 60 + Math.cos(angle2) * rootRadius; // Tooth base start
          const y2 = 60 + Math.sin(angle2) * rootRadius;
          const x3 = 60 + Math.cos(angle2) * tipRadius; // Tooth tip start
          const y3 = 60 + Math.sin(angle2) * tipRadius;
          const x4 = 60 + Math.cos(angle3) * tipRadius; // Tooth tip center (slightly extended)
          const y4 = 60 + Math.sin(angle3) * tipRadius;
          const x5 = 60 + Math.cos(angle4) * tipRadius; // Tooth tip end
          const y5 = 60 + Math.sin(angle4) * tipRadius;
          const x6 = 60 + Math.cos(angle4) * rootRadius; // Tooth base end
          const y6 = 60 + Math.sin(angle4) * rootRadius;
          const x7 = 60 + Math.cos(angle5) * rootRadius; // Gap point 2
          const y7 = 60 + Math.sin(angle5) * rootRadius;
          
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} L ${x4} ${y4} L ${x5} ${y5} L ${x6} ${y6} L ${x7} ${y7} Z`}
              fill="url(#gearGradient)"
            />
          );
        })}
        
        {/* Inner hub with spokes for mechanical look */}
        <circle cx="60" cy="60" r="24" fill="url(#gearGradient)" opacity="0.9" />
        
        {/* Spoke details - 6 spokes */}
        {[...Array(6)].map((_, i) => {
          const spokeAngle = (i * 60 - 90) * Math.PI / 180;
          const x1 = 60 + Math.cos(spokeAngle) * 18;
          const y1 = 60 + Math.sin(spokeAngle) * 18;
          const x2 = 60 + Math.cos(spokeAngle) * 24;
          const y2 = 60 + Math.sin(spokeAngle) * 24;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(59, 130, 246, 0.6)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}
        
        {/* Outer ring detail */}
        <circle cx="60" cy="60" r="38" fill="none" stroke="rgba(59, 130, 246, 0.3)" strokeWidth="0.5" />
      </g>
      
      {/* White Cloud - Floating ON TOP of gear with anime bounce */}
      <g 
        className="animate-cloud-bounce"
        style={{ animationDuration: `${bounceDuration}s` }}
      >
        {/* Main cloud body - more fluffy */}
        <ellipse cx="60" cy="50" rx="20" ry="16" fill="url(#cloudGradient)" filter="url(#cloudShadow)" />
        <ellipse cx="46" cy="53" rx="14" ry="12" fill="url(#cloudGradient)" />
        <ellipse cx="74" cy="53" rx="14" ry="12" fill="url(#cloudGradient)" />
        <ellipse cx="52" cy="48" rx="11" ry="9" fill="url(#cloudGradient)" />
        <ellipse cx="68" cy="48" rx="11" ry="9" fill="url(#cloudGradient)" />
        
        {/* Bright highlights for anime effect */}
        <ellipse cx="56" cy="47" rx="7" ry="6" fill="#ffffff" opacity="0.8" />
        <ellipse cx="64" cy="47" rx="7" ry="6" fill="#ffffff" opacity="0.8" />
        <ellipse cx="60" cy="48" rx="5" ry="4" fill="#ffffff" opacity="0.9" />
      </g>
      
      {/* Sparkle effects - anime style */}
      {showSparkles && (
        <g className="animate-sparkle">
          <circle cx="45" cy="35" r="2" fill="#ffffff" opacity="0.8">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="75" cy="38" r="1.5" fill="#ffffff" opacity="0.7">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="2.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="50" cy="70" r="1.5" fill="#ffffff" opacity="0.6">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="70" cy="72" r="2" fill="#ffffff" opacity="0.7">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </g>
      )}
    </svg>
  );
};

