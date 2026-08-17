/**
 * Decides whether a terminal tab should have its saved working directory
 * restored by typing a `cd` into the shell, and builds that command.
 *
 * Why this exists: the decision used to be an inline condition inside
 * ForgeTerminal's socket-open handler, and it only excluded sockets that had
 * dropped and *retried*. A first-attempt socket that the server answers with
 * SESSION_REATTACHED — the ordinary case after an app restart or a page reload —
 * was therefore treated as a fresh shell, so a `cd "<dir>"` was typed into a
 * shell that was already sitting in that directory. The shell echoed it, which
 * is why switching to a background tab revealed `cd` commands nobody had typed,
 * and why a CLI agent running in that tab received the text as a prompt entry.
 *
 * Pulling the rule out of the closure also lets the caller re-check it at the
 * moment the command would actually be sent, rather than a second earlier when
 * the reattach signal has not yet arrived.
 */

// How long to wait after the socket opens before restoring the directory. The
// delay exists purely so a freshly started shell has finished drawing its first
// prompt; sending sooner interleaves the command with the prompt.
export const DIRECTORY_RESTORE_DELAY_MS = 800;

/**
 * Reports whether this tab's saved working directory should be restored by
 * injecting a `cd` into its shell.
 *
 * Restoring is a narrow fallback, not the main mechanism: the backend already
 * starts every shell in the correct directory, so the only shell that can be in
 * the wrong place is a brand-new one belonging to a hidden tab.
 *
 * @param {object} [options]
 * @param {string} [options.savedDirectory] - The directory this tab remembers.
 * @param {boolean} [options.isVisible] - Whether the tab is on screen.
 * @param {boolean} [options.wasReconnection] - Whether the socket dropped and retried.
 * @param {boolean} [options.wasSessionReattached] - Whether the server handed
 *   back an already-running shell instead of starting a new one.
 * @returns {boolean} True only when a `cd` is both needed and safe to send.
 */
export function shouldRestoreDirectory(options) {
  if (!options || !options.savedDirectory) {
    return false;
  }
  // The visible tab's shell was started in the right directory by the backend,
  // and a `cd` here would clutter the screen the developer is looking at.
  if (options.isVisible) {
    return false;
  }
  // A retried socket reattaches to the shell it left behind — already correct.
  if (options.wasReconnection) {
    return false;
  }
  // The server reattached a live shell. It kept its own directory (and may be
  // running an interactive CLI), so anything typed here is unwanted input.
  if (options.wasSessionReattached) {
    return false;
  }
  return true;
}

/**
 * Builds the shell-specific command that moves a shell to `directory`.
 *
 * @param {string} [shellType] - 'wsl', 'cmd', or a PowerShell-compatible shell.
 * @param {string} directory - The directory to move to.
 * @returns {string} The command including its trailing Enter, or '' if there is
 *   no directory to move to.
 */
export function buildDirectoryRestoreCommand(shellType, directory) {
  if (!directory) {
    return '';
  }
  if (shellType === 'wsl') {
    // A "~" path must stay unquoted so the shell expands it, so spaces are
    // backslash-escaped instead of relying on the quotes.
    return directory.startsWith('~')
      ? `cd ${directory.replace(/ /g, '\\ ')}\r`
      : `cd "${directory}"\r`;
  }
  if (shellType === 'cmd') {
    // Without /d, cmd changes directory but stays on the current drive.
    return `cd /d "${directory}"\r`;
  }
  return `cd "${directory}"\r`;
}
