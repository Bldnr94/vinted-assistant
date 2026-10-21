// Whether the Pro tab is shown: the "I sell as a business" switch in the business profile (step 10 of the
// plan owns the profile; this file only reads that one flag so the navigation does not depend on it).
import { useEffect, useState } from "react";

export const PROFILE_KEY = "business-profile";
export const PROFILE_EVENT = "va:profile-changed"; // fired whenever the profile is saved

export function parseProFlag(raw: string | null): boolean {
  try {
    return JSON.parse(raw ?? "{}")?.sellsAsBusiness === true;
  } catch {
    return false;
  }
}

function readProEnabled(): boolean {
  try {
    return parseProFlag(localStorage.getItem(PROFILE_KEY));
  } catch {
    return false;
  }
}

export function useProEnabled(): boolean {
  const [on, setOn] = useState(readProEnabled);
  useEffect(() => {
    const refresh = () => setOn(readProEnabled());
    window.addEventListener(PROFILE_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_EVENT, refresh);
  }, []);
  return on;
}
