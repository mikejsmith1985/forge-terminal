/**
 * useGuidedTour.js - Connection Diagnostic Wizard controller for Forge Terminal
 *
 * Controls when the connection diagnostic wizard is shown:
 *   - First run: shown automatically if never completed for this version
 *   - Manual: triggerWizard('manual') from Settings
 *   - Spawn failed: triggerWizard('spawnFailed') from ForgeTerminal on close code 4005
 *
 * The old feature-tour logic is preserved for backward compat but the wizard
 * replaces the step-based overlay in the UI.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION } from '../config/tourSteps';

/**
 * Helper function to safely get DOMRect of a target element
 * @param {string} selector - CSS selector to find the element
 * @returns {DOMRect|null} - The bounding rectangle or null if not found
 */
export const getRect = (selector) => {
  if (!selector) return null;

  // Handle comma-separated selectors
  const selectors = selector.split(',').map((s) => s.trim());

  for (const sel of selectors) {
    try {
      const element = document.querySelector(sel);
      if (element) {
        return element.getBoundingClientRect();
      }
    } catch (e) {
      console.warn(`[Tour] Invalid selector: ${sel}`);
    }
  }

  return null;
};

const useGuidedTour = (actionHandlers = {}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [targetRect, setTargetRect] = useState(null);
  const [isReady, setIsReady] = useState(false);

  // Wizard-specific state — drives ConnectionDiagnosticWizard.
  const [isWizardVisible, setIsWizardVisible] = useState(false);
  const [wizardTriggerReason, setWizardTriggerReason] = useState('firstRun');

  const resizeObserverRef = useRef(null);
  const targetElementRef = useRef(null);
  const actionHandlersRef = useRef(actionHandlers);

  // Keep action handlers ref updated
  useEffect(() => {
    actionHandlersRef.current = actionHandlers;
  }, [actionHandlers]);

  // Check if tour should start on mount
  useEffect(() => {
    // BACKDOOR: Disable tour for testing if flag is set
    if (localStorage.getItem('forge_tour_completed') === 'true' || 
        localStorage.getItem('tour_disabled') === 'true') {
      setIsReady(true);
      return;
    }

    const checkTourStatus = () => {
      // Never auto-show the diagnostic wizard — it only fires on PTY spawn failure
      // (close code 4005 → triggerWizard('spawnFailed')). Auto-showing it on first
      // run or version changes causes a false "Cannot Reach Server" error because
      // the backend may still be initializing when the fetch fires.
      const storedData = localStorage.getItem(TOUR_STORAGE_KEY);
      if (!storedData || (() => { try { return JSON.parse(storedData).version !== TOUR_VERSION; } catch { return true; } })()) {
        // Silently stamp the current version so future checks pass without triggering.
        localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ version: TOUR_VERSION, completedAt: new Date().toISOString() }));
      }
      setIsReady(true);
    };

    checkTourStatus();
  }, []);

  // Find target element using selector or fallback
  const findTargetElement = useCallback((step) => {
    if (!step || !step.selector) return null;

    // Try primary selector(s)
    const selectors = step.selector.split(',').map((s) => s.trim());
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    // Try fallback selector(s)
    if (step.fallbackSelector) {
      const fallbackSelectors = step.fallbackSelector.split(',').map((s) => s.trim());
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element) return element;
      }
    }

    return null;
  }, []);

  // Update target rectangle when step changes or window resizes
  const updateTargetRect = useCallback(() => {
    const step = TOUR_STEPS[currentStep];
    if (!step) {
      setTargetRect(null);
      return;
    }

    const element = findTargetElement(step);
    targetElementRef.current = element;

    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right,
      });
    } else {
      // No element found - will use centered fallback
      setTargetRect(null);
    }
  }, [currentStep, findTargetElement]);

  // Set up resize observer and window resize handler
  useEffect(() => {
    if (!isActive) return;

    updateTargetRect();

    // Update on window resize
    const handleResize = () => {
      requestAnimationFrame(updateTargetRect);
    };
    window.addEventListener('resize', handleResize);

    // Set up ResizeObserver for target element changes
    if (targetElementRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserverRef.current = new ResizeObserver(() => {
        requestAnimationFrame(updateTargetRect);
      });
      resizeObserverRef.current.observe(targetElementRef.current);
    }

    // Also update periodically in case elements are loading
    const intervalId = setInterval(updateTargetRect, 500);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      clearInterval(intervalId);
    };
  }, [isActive, currentStep, updateTargetRect]);

  // Execute an action handler if defined
  const executeAction = useCallback((actionName) => {
    if (actionName && actionHandlersRef.current[actionName]) {
      console.log('[Tour] Executing action:', actionName);
      actionHandlersRef.current[actionName]();
    }
  }, []);

  // Navigate to next step
  const nextStep = useCallback(() => {
    const currentStepData = TOUR_STEPS[currentStep];
    
    // Execute action if defined (v3.9.0: runs before advancing)
    if (currentStepData?.action) {
      executeAction(currentStepData.action);
      // Small delay to let the action complete (e.g., modal opening)
      setTimeout(() => {
        if (currentStep < TOUR_STEPS.length - 1) {
          setCurrentStep((prev) => prev + 1);
        } else {
          completeTour();
        }
      }, 400);
    } else if (currentStepData?.onAdvance) {
      // Legacy support for onAdvance
      executeAction(currentStepData.onAdvance);
      setTimeout(() => {
        if (currentStep < TOUR_STEPS.length - 1) {
          setCurrentStep((prev) => prev + 1);
        } else {
          completeTour();
        }
      }, 300);
    } else {
      if (currentStep < TOUR_STEPS.length - 1) {
        setCurrentStep((prev) => prev + 1);
      } else {
        completeTour();
      }
    }
  }, [currentStep, executeAction]);

  // Navigate to previous step
  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  // Skip/dismiss the tour - also closes any modal that was opened
  const skipTour = useCallback(() => {
    // Check if current step has a modal open and close it
    const currentStepData = TOUR_STEPS[currentStep];
    if (currentStepData?.requiresModalOpen) {
      // Close the modal based on type
      if (currentStepData.requiresModalOpen === 'routerConfig') {
        executeAction('closeRouterConfig');
      }
    }
    completeTour();
  }, [currentStep, executeAction]);

  // Complete the tour and save to localStorage
  const completeTour = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    setTargetRect(null);
    setIsWizardVisible(false);

    localStorage.setItem(
      TOUR_STORAGE_KEY,
      JSON.stringify({
        version: TOUR_VERSION,
        completedAt: new Date().toISOString(),
      })
    );
  }, []);

  // Restart the tour (useful for testing/demo)
  const restartTour = useCallback(() => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  /**
   * Opens the diagnostic wizard programmatically.
   * Called by ForgeTerminal when close code 4005 fires, or from Settings.
   *
   * @param {'firstRun'|'spawnFailed'|'manual'} reason - Why the wizard is being shown
   */
  const triggerWizard = useCallback((reason = 'manual') => {
    setWizardTriggerReason(reason);
    setIsWizardVisible(true);
  }, []);

  /** Closes the diagnostic wizard and marks the tour/wizard as completed. */
  const closeWizard = useCallback(() => {
    setIsWizardVisible(false);
    // Persist completion so we don't show on next startup.
    localStorage.setItem(
      TOUR_STORAGE_KEY,
      JSON.stringify({
        version: TOUR_VERSION,
        completedAt: new Date().toISOString(),
      })
    );
  }, []);

  return {
    // Legacy tour state (kept for backward compat; no longer rendered)
    isActive,
    isReady,
    currentStep,
    totalSteps: TOUR_STEPS.length,
    stepData: isActive ? TOUR_STEPS[currentStep] : null,
    targetRect,
    nextStep,
    prevStep,
    skipTour,
    restartTour,
    getRect,

    // Diagnostic wizard state
    isWizardVisible,
    wizardTriggerReason,
    triggerWizard,
    closeWizard,
  };
};

export default useGuidedTour;
