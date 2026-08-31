// A right-click menu, shared by every surface that offers one.
//
// Extracted from FileExplorer, where it was a private component. The Projects
// Browser needed the same menu, and a second copy would have been a second set
// of keyboard, dismissal and positioning behaviour to keep in step — which is
// how two menus in one application come to behave differently.
//
// The menu owns one piece of behaviour of its own: an action may report whether
// it succeeded, and the menu holds itself open briefly to say so. That exists
// because copying a path is invisible when it works and equally invisible when
// it fails, and a user cannot tell those apart without being told.

import React, { useEffect, useState } from 'react';
import './ContextMenu.css';

/** How long a result message stays on screen before the menu closes itself. */
const RESULT_MESSAGE_MS = 900;

/**
 * A positioned right-click menu.
 *
 * @param x Viewport x co-ordinate to open at.
 * @param y Viewport y co-ordinate to open at.
 * @param items Menu entries: `{ label, action }`, or `{ separator: true }`.
 * @param onClose Called when the menu should disappear.
 * @param onAction Runs an action. May return a string to show as the result,
 *   or a promise of one; returning nothing closes the menu immediately.
 */
export default function ContextMenu({ x, y, items, onClose, onAction }) {
  const [resultMessage, setResultMessage] = useState(null);

  useEffect(() => {
    // Any click outside dismisses, which is what every other menu on the
    // platform does. Registered on the document because the click that
    // dismisses is by definition not on this element.
    const handleDocumentClick = () => onClose();
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [onClose]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (!resultMessage) return undefined;
    const timer = setTimeout(onClose, RESULT_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [resultMessage, onClose]);

  const runAction = async (actionName) => {
    const outcome = await onAction(actionName);

    // A returned message means the action wants to report something, so the
    // menu stays up long enough to be read. Anything else closes at once.
    if (typeof outcome === 'string' && outcome.length > 0) {
      setResultMessage(outcome);
      return;
    }
    onClose();
  };

  return (
    <div
      className="context-menu"
      style={{ top: y, left: x }}
      role="menu"
      // The menu is inside the element that opened it, so a click here would
      // otherwise bubble to the document listener and dismiss before acting.
      onClick={(event) => event.stopPropagation()}
    >
      {resultMessage
        ? <div className="context-menu-result">{resultMessage}</div>
        : items.map((item, index) => (
          item.separator
            ? <div key={`separator-${index}`} className="context-menu-separator" />
            : (
              <div
                key={item.action}
                className="context-menu-item"
                role="menuitem"
                onClick={() => runAction(item.action)}
              >
                {item.label}
              </div>
            )
        ))}
    </div>
  );
}
