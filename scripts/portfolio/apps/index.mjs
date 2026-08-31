// Barrel exports for all app-specific portfolio display and capture definitions.

export { FORGE_TERMINAL_APP, FORGE_TERMINAL_PORTFOLIO_CONFIG } from './forge-terminal.mjs';
export { LGBUILDER_APP, LGBUILDER_PORTFOLIO_CONFIG } from './lgbuilder.mjs';
export { MBL2PC_APP, MBL2PC_PORTFOLIO_CONFIG } from './mbl2pc.mjs';
export { NODE_TOOLBOX_APP, NODE_TOOLBOX_PORTFOLIO_CONFIG } from './nodetoolbox.mjs';
export { U2_COUNTER_APP, U2_COUNTER_PORTFOLIO_CONFIG } from './u2-counter.mjs';

import { FORGE_TERMINAL_APP, FORGE_TERMINAL_PORTFOLIO_CONFIG } from './forge-terminal.mjs';
import { LGBUILDER_APP, LGBUILDER_PORTFOLIO_CONFIG } from './lgbuilder.mjs';
import { MBL2PC_APP, MBL2PC_PORTFOLIO_CONFIG } from './mbl2pc.mjs';
import { NODE_TOOLBOX_APP, NODE_TOOLBOX_PORTFOLIO_CONFIG } from './nodetoolbox.mjs';
import { U2_COUNTER_APP, U2_COUNTER_PORTFOLIO_CONFIG } from './u2-counter.mjs';

export const PORTFOLIO_APP_DEFINITIONS = [
  FORGE_TERMINAL_APP,
  U2_COUNTER_APP,
  NODE_TOOLBOX_APP,
  LGBUILDER_APP,
  MBL2PC_APP,
];

export const PORTFOLIO_CAPTURE_CONFIGS = [
  FORGE_TERMINAL_PORTFOLIO_CONFIG,
  U2_COUNTER_PORTFOLIO_CONFIG,
  NODE_TOOLBOX_PORTFOLIO_CONFIG,
  LGBUILDER_PORTFOLIO_CONFIG,
  MBL2PC_PORTFOLIO_CONFIG,
];
