// Barrel export for all app-specific portfolio capture and config definitions.
//
// A portfolio runner imports from here to get the full set of per-app configs
// without needing to know which files exist in this directory.

export { EZTEST_PORTFOLIO_CONFIG } from './eztest.mjs';
export { MBL2PC_PORTFOLIO_CONFIG } from './mbl2pc.mjs';
