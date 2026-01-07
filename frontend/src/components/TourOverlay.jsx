/**
 * TourOverlay.jsx - Interactive Tour Overlay for Forge Terminal v3.12.4
 *
 * Complete redesign with:
 * - Center-positioned cards with arrows pointing to UI elements
 * - Pulsing border/glow effect instead of spotlight cutout
 * - Markdown support for content
 * - Interactive element highlighting
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, X, Sparkles } from 'lucide-react';
import { getRect } from '../hooks/useGuidedTour';
import './TourOverlay.css';

const PADDING = 12; // Padding around highlighted element
const ARROW_SIZE = 40; // Size of arrow element

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

  // Calculate arrow position and rotation
  const arrowStyle = useMemo(() => {
    if (!targetRect || !step?.spotlight || !step?.arrow) {
      return null;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;

    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    let style = {
      position: 'fixed',
      width: `${ARROW_SIZE}px`,
      height: `${ARROW_SIZE}px`,
      pointerEvents: 'none',
      zIndex: 10002,
    };

    // Position arrow based on direction
    switch (step.arrow) {
      case 'up':
        style.left = `${centerX}px`;
        style.top = `${centerY - 180}px`; // Above center card
        style.transform = 'translateX(-50%) rotate(0deg)';
        break;
      case 'down':
        style.left = `${centerX}px`;
        style.top = `${centerY + 180}px`; // Below center card
        style.transform = 'translateX(-50%) rotate(180deg)';
        break;
      case 'left':
        style.left = `${centerX - 240}px`; // Left of center card
        style.top = `${centerY}px`;
        style.transform = 'translateY(-50%) rotate(-90deg)';
        break;
      case 'right':
        style.left = `${centerX + 240}px`; // Right of center card
        style.top = `${centerY}px`;
        style.transform = 'translateY(-50%) rotate(90deg)';
        break;
      case 'up-left':
        style.left = `${centerX - 170}px`;
        style.top = `${centerY - 140}px`;
        style.transform = 'rotate(-45deg)';
        break;
      case 'up-right':
        style.left = `${centerX + 170}px`;
        style.top = `${centerY - 140}px`;
        style.transform = 'rotate(45deg)';
        break;
      case 'down-left':
        style.left = `${centerX - 170}px`;
        style.top = `${centerY + 140}px`;
        style.transform = 'rotate(-135deg)';
        break;
      case 'down-right':
        style.left = `${centerX + 170}px`;
        style.top = `${centerY + 140}px`;
        style.transform = 'rotate(135deg)';
        break;
      default:
        return null;
    }

    return style;
  }, [targetRect, step]);

  // Format content with markdown-like support
  const formattedContent = useMemo(() => {
    if (!step?.content) return '';

    let content = step.content;

    // Replace **bold** with <strong>
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Replace bullet points
    content = content.replace(/^•\s+/gm, '<li>');

    // Wrap list items
    if (content.includes('<li>')) {
      content = content.replace(/<li>/g, '<ul><li>');
      content = content.replace(/<\/li>\n<li>/g, '</li><li>');
      content = content.replace(/<li>(.*?)(?=\n|$)/g, '<li>$1</li></ul>');
      // Clean up nested ul tags
      content = content.replace(/<\/ul>\n<ul>/g, '');
    }

    // Convert \n\n to <br><br> for paragraphs
    content = content.replace(/\n\n/g, '<br><br>');

    return content;
  }, [step]);

  if (!step) return null;

  const isLastStep = step.isFinal || currentStep === totalSteps - 1;
  const showHighlight = step.spotlight && targetRect;
  const showArrow = showHighlight && step.arrow && arrowStyle;

  return (
    <div className={`tour-overlay ${isAnimating ? 'tour-overlay-entering' : ''}`}>
      {/* Semi-transparent backdrop */}
      <div className="tour-backdrop" onClick={onSkip} />

      {/* Pulsing border/glow around target element (Option B) */}
      {showHighlight && (
        <div
          className="tour-highlight-pulse"
          style={{
            position: 'fixed',
            top: targetRect.top - PADDING,
            left: targetRect.left - PADDING,
            width: targetRect.width + PADDING * 2,
            height: targetRect.height + PADDING * 2,
            border: '3px solid rgba(147, 51, 234, 0.8)', // Purple border
            borderRadius: '8px',
            boxShadow: `
              0 0 0 2px rgba(147, 51, 234, 0.4),
              0 0 20px rgba(147, 51, 234, 0.6),
              0 0 40px rgba(147, 51, 234, 0.3)
            `,
            animation: 'tour-pulse 2s ease-in-out infinite',
            pointerEvents: 'none',
            zIndex: 10001,
          }}
        />
      )}

      {/* Arrow removed - was distracting and unnecessary */}

      {/* Center-positioned tooltip card */}
      <div
        className="tour-tooltip"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        <div className="tour-tooltip-header">
          <div className="tour-tooltip-icon">
            <Sparkles size={18} />
          </div>
          <h3 className="tour-tooltip-title">{step.title}</h3>
          <button className="tour-tooltip-close" onClick={onSkip} title="Skip tour">
            <X size={16} />
          </button>
        </div>

        <div
          className="tour-tooltip-content"
          dangerouslySetInnerHTML={{ __html: formattedContent }}
        />

        <div className="tour-tooltip-footer">
          <div className="tour-tooltip-progress">
            Step {currentStep + 1} of {totalSteps}
            <div className="tour-progress-bar">
              <div
                className="tour-progress-fill"
                style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
              />
            </div>
          </div>

          <div className="tour-tooltip-actions">
            <button className="tour-btn tour-btn-skip" onClick={onSkip}>
              {isLastStep ? 'Close' : 'Skip Tour'}
            </button>
            <button className="tour-btn tour-btn-next" onClick={onNext}>
              {isLastStep ? 'Get Started 🚀' : 'Next'}
              {!isLastStep && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TourOverlay;
