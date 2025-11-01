/**
 * Backup: Previous HR Character Animation Component
 * Saved for potential reuse if needed
 */

export const HRCharacterAnimation = () => (
  <svg
    viewBox="0 0 120 120"
    className="w-full h-full animate-bounce-slow"
    style={{ animationDuration: '3s' }}
  >
    {/* Character Body */}
    <circle cx="60" cy="85" r="15" fill="hsl(var(--primary))" opacity="0.9" />
    
    {/* Character Head */}
    <circle cx="60" cy="55" r="18" fill="hsl(var(--primary-foreground))" opacity="0.9" />
    
    {/* Hair */}
    <path
      d="M 45 50 Q 45 40, 50 40 Q 55 35, 60 40 Q 65 35, 70 40 Q 75 40, 75 50"
      fill="hsl(var(--primary))"
      opacity="0.8"
      className="animate-pulse-slow"
    />
    
    {/* Eyes */}
    <circle cx="54" cy="53" r="2" fill="hsl(var(--primary))" />
    <circle cx="66" cy="53" r="2" fill="hsl(var(--primary))" />
    
    {/* Smile */}
    <path
      d="M 52 60 Q 60 65, 68 60"
      stroke="hsl(var(--primary))"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
    />
    
    {/* Arms (moving) */}
    <g className="animate-arm-swing">
      <line
        x1="45"
        y1="75"
        x2="35"
        y2="85"
        stroke="hsl(var(--primary))"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.9"
      />
      <line
        x1="75"
        y1="75"
        x2="85"
        y2="85"
        stroke="hsl(var(--primary))"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.9"
      />
    </g>
    
    {/* Work Document/Paper */}
    <rect
      x="30"
      y="90"
      width="20"
      height="15"
      fill="hsl(var(--background))"
      stroke="hsl(var(--primary))"
      strokeWidth="1.5"
      rx="2"
      className="animate-document-float"
    />
    <line
      x1="33"
      y1="93"
      x2="47"
      y2="93"
      stroke="hsl(var(--muted-foreground))"
      strokeWidth="1"
      opacity="0.5"
    />
    <line
      x1="33"
      y1="97"
      x2="45"
      y2="97"
      stroke="hsl(var(--muted-foreground))"
      strokeWidth="1"
      opacity="0.5"
    />
    
    {/* Laptop/Screen */}
    <rect
      x="70"
      y="88"
      width="25"
      height="18"
      fill="hsl(var(--background))"
      stroke="hsl(var(--primary))"
      strokeWidth="1.5"
      rx="2"
      className="animate-screen-glow"
    />
    <rect
      x="72"
      y="90"
      width="21"
      height="12"
      fill="hsl(var(--primary))"
      opacity="0.2"
    />
    <rect
      x="73"
      y="91"
      width="19"
      height="2"
      fill="hsl(var(--primary))"
      opacity="0.4"
    />
  </svg>
);

