import { useEffect, useState } from "react";

export function useMediaQuery(query: string) {
  const getMatches = () => {
    if (typeof window === "undefined" || typeof window.matchMedia === "undefined") {
      return false;
    }
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState<boolean>(getMatches);

  useEffect(() => {
    const matchMedia = typeof window !== "undefined" ? window.matchMedia(query) : null;
    if (!matchMedia) return;

    const handleChange = () => setMatches(matchMedia.matches);
    handleChange();
    matchMedia.addEventListener("change", handleChange);
    return () => matchMedia.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}
