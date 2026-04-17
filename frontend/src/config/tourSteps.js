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
const TOUR_VERSION = '6.0.0'; // v6.0.0: Rewritten tour focused on Enterprise Workflow system

export { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION };
