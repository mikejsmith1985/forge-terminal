/**
 * tourSteps.js
 *
 * The step-based feature tour has been replaced by the ConnectionDiagnosticWizard.
 * This file is kept for backward compatibility with useGuidedTour.js.
 *
 * TOUR_VERSION is bumped so that existing users who completed the old tour will
 * see the new connection diagnostic wizard on their next launch.
 */

const TOUR_STEPS = [];

const TOUR_STORAGE_KEY = 'forge_tour_completed';

// Bumping the version causes the wizard to show once for users who completed the old tour.
const TOUR_VERSION = '5.2.10';

export { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION };
