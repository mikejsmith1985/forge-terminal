/**
 * TourOverlay.jsx - Visual Tour Overlay for Forge Terminal v3.3.6
 *
 * Renders a spotlight effect highlighting the target element with a tooltip.
 * Features:
 * - Full-screen mask with spotlight cutout
 * - iOS-style blurred backdrop
 * - Animated tooltip with high-contrast text
 * - Responsive positioning based on target element
 * - Smart viewport boundary detection to prevent cutoff
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, X, Sparkles } from 'lucide-react';
import { getRect } from '../hooks/useGuidedTour';
import './TourOverlay.css';

const PADDING = 8; // Padding around spotlight
const TOOLTIP_OFFSET = 16; // Distance from spotlight to tooltip
const VIEWPORT_MARGIN = 20; // Minimum distance from viewport edge
const TOOLTIP_WIDTH = 380; // Max tooltip width from CSS
const TOOLTIP_HEIGHT = 200; // Estimated tooltip height

const TourOverlay = ({ step, currentStep, totalSteps, onNext, onSkip }) => {
  const [targetRect, setTargetRect] = useState(null);
  const [isAnimating, setIsAnimating] = useState(true);

  // Update target rect on step change and handle resize
  useEffect(() => {
    const updateRect = () => {
      if (step?.selector) {
        const rect = getRect(step.selector);
        if (!rect && step.fallbackSelector) {
          setTargetRect(getRect(step.fallbackSelector));
        } else {
          setTargetRect(rect);
        }
      } else {
        setTargetRect(null);
      }
    };

    // Initial update
    updateRect();

    // Animation entrance
    setIsAnimating(true);
    const animTimer = setTimeout(() => setIsAnimating(false), 300);

    // Update on resize
    window.addEventListener('resize', updateRect);

    // Poll for element visibility (handles dynamic content)
    const pollInterval = setInterval(updateRect, 500);

    return () => {
      window.removeEventListener('resize', updateRect);
      clearInterval(pollInterval);
      clearTimeout(animTimer);
    };
  }, [step]);

  // Calculate tooltip position based on target and placement with viewport bounds checking
  const tooltipStyle = useMemo(() => {
    if (!targetRect || !step?.spotlight) {
      // Center the tooltip
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const placement = step.placement || 'bottom';
    const style = { position: 'fixed' };

    const spotlightRect = {
      top: targetRect.top - PADDING,
      left: targetRect.left - PADDING,
      width: targetRect.width + PADDING * 2,
      height: targetRect.height + PADDING * 2,
      bottom: targetRect.bottom + PADDING,
      right: targetRect.right + PADDING,
    };

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Helper to check if placement would cause cutoff
    const wouldCutOff = (pos) => {
      switch (pos) {
        case 'top':
          return spotlightRect.top - TOOLTIP_OFFSET - TOOLTIP_HEIGHT < VIEWPORT_MARGIN;
        case 'bottom':
          return spotlightRect.bottom + TOOLTIP_OFFSET + TOOLTIP_HEIGHT > viewportHeight - VIEWPORT_MARGIN;
        case 'left':
          return spotlightRect.left - TOOLTIP_OFFSET - TOOLTIP_WIDTH < VIEWPORT_MARGIN;
        case 'right':
          return spotlightRect.right + TOOLTIP_OFFSET + TOOLTIP_WIDTH > viewportWidth - VIEWPORT_MARGIN;
        default:
          return false;
      }
    };

    // Determine best placement (fallback if original would cause cutoff)
    let actualPlacement = placement;
    if (wouldCutOff(placement)) {
      // Try opposite placement first
      const opposites = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
      const opposite = opposites[placement];
      if (opposite && !wouldCutOff(opposite)) {
        actualPlacement = opposite;
      } else {
        // Fall back to center
        actualPlacement = 'center';
      }
    }

    switch (actualPlacement) {
      case 'top':
        style.bottom = viewportHeight - spotlightRect.top + TOOLTIP_OFFSET;
        style.left = Math.max(VIEWPORT_MARGIN, Math.min(
          spotlightRect.left + spotlightRect.width / 2,
          viewportWidth - TOOLTIP_WIDTH / 2 - VIEWPORT_MARGIN
        ));
        style.transform = 'translateX(-50%)';
        break;
      case 'bottom':
        style.top = Math.min(spotlightRect.bottom + TOOLTIP_OFFSET, viewportHeight - TOOLTIP_HEIGHT - VIEWPORT_MARGIN);
        style.left = Math.max(VIEWPORT_MARGIN, Math.min(
          spotlightRect.left + spotlightRect.width / 2,
          viewportWidth - TOOLTIP_WIDTH / 2 - VIEWPORT_MARGIN
        ));
        style.transform = 'translateX(-50%)';
        break;
      case 'left':
        style.right = viewportWidth - spotlightRect.left + TOOLTIP_OFFSET;
        style.top = Math.max(VIEWPORT_MARGIN, Math.min(
          spotlightRect.top + spotlightRect.height / 2,
          viewportHeight - TOOLTIP_HEIGHT / 2 - VIEWPORT_MARGIN
        ));
        style.transform = 'translateY(-50%)';
        break;
      case 'right':
        style.left = Math.min(spotlightRect.right + TOOLTIP_OFFSET, viewportWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN);
        style.top = Math.max(VIEWPORT_MARGIN, Math.min(
          spotlightRect.top + spotlightRect.height / 2,
          viewportHeight - TOOLTIP_HEIGHT / 2 - VIEWPORT_MARGIN
        ));
        style.transform = 'translateY(-50%)';
        break;
      case 'center':
      default:
        style.top = '50%';
        style.left = '50%';
        style.transform = 'translate(-50%, -50%)';
        break;
    }

    return style;
  }, [targetRect, step]);

  // Calculate spotlight mask using clip-path
  const maskStyle = useMemo(() => {
    if (!targetRect || !step?.spotlight) {
      return {};
    }

    const top = Math.max(0, targetRect.top - PADDING);
    const left = Math.max(0, targetRect.left - PADDING);
    const width = targetRect.width + PADDING * 2;
    const height = targetRect.height + PADDING * 2;
    const right = left + width;
    const bottom = top + height;

    // Create a polygon that covers everything except the spotlight area
    // Using inset with border-radius for rounded spotlight
    return {
      clipPath: `polygon(
        0% 0%,
        0% 100%,
        ${left}px 100%,
        ${left}px ${top}px,
        ${right}px ${top}px,
        ${right}px ${bottom}px,
        ${left}px ${bottom}px,
        ${left}px 100%,
        100% 100%,
        100% 0%
      )`,
    };
  }, [targetRect, step]);

  if (!step) return null;

  const isLastStep = step.isFinal || currentStep === totalSteps - 1;
  const showSpotlight = step.spotlight && targetRect;

  return (
    <div className={`tour-overlay ${isAnimating ? 'tour-overlay-entering' : ''}`}>
      {/* Backdrop with spotlight cutout */}
      <div className="tour-backdrop" style={maskStyle} onClick={onSkip} />

      {/* Spotlight glow effect */}
      {showSpotlight && (
        <div
          className="tour-spotlight-glow"
          style={{
            top: targetRect.top - PADDING,
            left: targetRect.left - PADDING,
            width: targetRect.width + PADDING * 2,
            height: targetRect.height + PADDING * 2,
          }}
        />
      )}

      {/* Tooltip */}
      <div className="tour-tooltip" style={tooltipStyle}>
        <div className="tour-tooltip-header">
          <div className="tour-tooltip-icon">
            <Sparkles size={18} />
          </div>
          <h3 className="tour-tooltip-title">{step.title}</h3>
          <button className="tour-tooltip-close" onClick={onSkip} title="Skip tour">
            <X size={16} />
          </button>
        </div>

        <p className="tour-tooltip-content">{step.content}</p>

        <div className="tour-tooltip-footer">
          <div className="tour-tooltip-progress">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`tour-progress-dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'completed' : ''}`}
              />
            ))}
          </div>

          <div className="tour-tooltip-actions">
            <button className="tour-btn tour-btn-skip" onClick={onSkip}>
              {isLastStep ? 'Close' : 'Skip'}
            </button>
            <button className="tour-btn tour-btn-next" onClick={onNext}>
              {isLastStep ? 'Get Started' : 'Next'}
              {!isLastStep && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TourOverlay;
