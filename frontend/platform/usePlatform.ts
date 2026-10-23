import { getContext } from "../app/AppContext";
import { platform, type Platform } from "./platform";

/** What this build can do (bank, shutdown, download button…), see platform.ts. */
export function usePlatform(): Platform {
  return platform(getContext().meta.app);
}
