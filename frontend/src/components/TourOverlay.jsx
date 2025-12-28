/**
 * TourOverlay.jsx - Visual Tour Overlay for Forge Terminal v3.3.0
 *
 * Renders a spotlight effect highlighting the target element with a tooltip.
 * Features:
 * - Full-screen mask with spotlight cutout
 * - iOS-style blurred backdrop
 * - Animated tooltip with high-contrast text
 * - Responsive positioning based on target element
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, X, Sparkles } from 'lucide-react';
import { getRect } from '../hooks/useGuidedTour';
import './TourOverlay.css';

const PADDING = 8; // Padding around spotlight
const TOOLTIP_OFFSET = 16; // Distance from spotlight to tooltip

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

  // Calculate tooltip position based on target and placement
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

    switch (placement) {
      case 'top':
        style.bottom = window.innerHeight - spotlightRect.top + TOOLTIP_OFFSET;
        style.left = spotlightRect.left + spotlightRect.width / 2;
        style.transform = 'translateX(-50%)';
        break;
      case 'bottom':
        style.top = spotlightRect.bottom + TOOLTIP_OFFSET;
        style.left = spotlightRect.left + spotlightRect.width / 2;
        style.transform = 'translateX(-50%)';
        break;
      case 'left':
        style.right = window.innerWidth - spotlightRect.left + TOOLTIP_OFFSET;
        style.top = spotlightRect.top + spotlightRect.height / 2;
        style.transform = 'translateY(-50%)';
        break;
      case 'right':
        style.left = spotlightRect.right + TOOLTIP_OFFSET;
        style.top = spotlightRect.top + spotlightRect.height / 2;
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
