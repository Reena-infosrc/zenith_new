import { useCallback } from 'react';

/**
 * Hook to preserve scroll position when switching tabs
 */
export function usePreserveScroll() {
  const preserveScroll = useCallback(() => {
    const currentScroll = window.scrollY;
    
    // Restore scroll position after DOM update
    requestAnimationFrame(() => {
      window.scrollTo({ top: currentScroll, behavior: 'instant' });
    });
  }, []);

  return { preserveScroll };
}

