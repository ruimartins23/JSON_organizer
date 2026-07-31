/**
 * macOS differs in two places that reach the UI: the modifier key, and what
 * Chrome's share dialog can capture audio from.
 */
export const isMac = /mac/i.test(
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform,
);
