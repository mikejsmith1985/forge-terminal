// Barrel exports for all app-specific portfolio display and capture definitions.

export { EZTEST_APP, EZTEST_PORTFOLIO_CONFIG } from './eztest.mjs';
export { FORGE_TERMINAL_APP, FORGE_TERMINAL_PORTFOLIO_CONFIG } from './forge-terminal.mjs';
export { MBL2PC_APP, MBL2PC_PORTFOLIO_CONFIG } from './mbl2pc.mjs';
export { NODE_TOOLBOX_APP, NODE_TOOLBOX_PORTFOLIO_CONFIG } from './nodetoolbox.mjs';
export { QUIKEYS_APP, QUIKEYS_PORTFOLIO_CONFIG } from './quikeys.mjs';

import { EZTEST_APP, EZTEST_PORTFOLIO_CONFIG } from './eztest.mjs';
import { FORGE_TERMINAL_APP, FORGE_TERMINAL_PORTFOLIO_CONFIG } from './forge-terminal.mjs';
import { MBL2PC_APP, MBL2PC_PORTFOLIO_CONFIG } from './mbl2pc.mjs';
import { NODE_TOOLBOX_APP, NODE_TOOLBOX_PORTFOLIO_CONFIG } from './nodetoolbox.mjs';
import { QUIKEYS_APP, QUIKEYS_PORTFOLIO_CONFIG } from './quikeys.mjs';

export const PORTFOLIO_APP_DEFINITIONS = [
  FORGE_TERMINAL_APP,
  NODE_TOOLBOX_APP,
  EZTEST_APP,
  MBL2PC_APP,
  QUIKEYS_APP,
];

export const PORTFOLIO_CAPTURE_CONFIGS = [
  FORGE_TERMINAL_PORTFOLIO_CONFIG,
  NODE_TOOLBOX_PORTFOLIO_CONFIG,
  EZTEST_PORTFOLIO_CONFIG,
  MBL2PC_PORTFOLIO_CONFIG,
  QUIKEYS_PORTFOLIO_CONFIG,
];
