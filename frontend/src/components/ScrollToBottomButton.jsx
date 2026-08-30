// The round control pinned to the bottom-right of a terminal pane that returns the
// view to the newest output.
import { ArrowDownToLine } from 'lucide-react';
import { canScrollToBottom } from '../utils/terminalScrollTarget';
import { ALTERNATE_SCREEN_BUFFER } from '../utils/terminalTuiState';

const ICON_SIZE_PX = 16;

const TITLE_SCROLL_VIEWPORT = 'Scroll to bottom (Ctrl+End)';
const TITLE_SEND_END_KEY = 'Send Ctrl+End to the running app to jump to its latest output';

/**
 * ScrollToBottomButton renders the "jump back to the newest output" control.
 *
 * It is deliberately inert while there is nothing a click could achieve — an ordinary
 * shell already showing its newest output. Offering a live button in that state was
 * reported as "this button doesn't work", and a live button also stole clicks from the
 * terminal text underneath it.
 *
 * @param {boolean} isScrolledUp     True when the viewport sits above the newest output.
 * @param {boolean} isAlternateScreen True while a full-screen program owns the screen.
 * @param {Function} onScrollToBottom Invoked when the user asks to return to the bottom.
 */
export default function ScrollToBottomButton({
  isScrolledUp,
  isAlternateScreen = false,
  onScrollToBottom,
}) {
  const bufferType = isAlternateScreen ? ALTERNATE_SCREEN_BUFFER : 'normal';
  const isActionable = canScrollToBottom({ bufferType, isScrolledUp });

  return (
    <button
      className={`scroll-to-bottom-btn${isActionable ? ' is-scrolled-up' : ''}`}
      onClick={onScrollToBottom}
      disabled={!isActionable}
      title={isAlternateScreen ? TITLE_SEND_END_KEY : TITLE_SCROLL_VIEWPORT}
      aria-label="Scroll to bottom"
    >
      <ArrowDownToLine size={ICON_SIZE_PX} />
    </button>
  );
}
