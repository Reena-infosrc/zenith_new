import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export function FeedbackRelatedLink({
  href,
  title,
  subtitle,
  icon,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <Link
      to={href}
      className="group flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 transition-colors hover:bg-accent/40 hover:border-border"
    >
      <span className="mt-0.5 text-muted-foreground group-hover:text-foreground" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-medium text-foreground">
          {title}
          <ChevronRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-70 group-hover:translate-x-0" />
        </span>
        <span className="block text-xs text-muted-foreground leading-snug">{subtitle}</span>
      </span>
    </Link>
  );
}
