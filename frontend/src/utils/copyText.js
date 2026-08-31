// Copies text to the clipboard and says whether it worked.
//
// `navigator.clipboard` is only defined in a secure context. Forge is normally
// opened on localhost, which qualifies — but a tab opened against the machine's
// LAN address over plain HTTP is not, and there the object is simply undefined.
// Calling it there throws, or worse, quietly resolves nothing, and the user is
// left believing they hold a path they do not.
//
// So there are two routes and a returned answer: the modern API when it exists,
// a selection copy when it does not, and `false` when neither worked, so the
// caller can say so instead of pretending.

/**
 * Copies a value to the clipboard.
 *
 * @param {string} value The text to copy. An empty value is refused.
 * @returns {Promise<boolean>} Whether the text reached the clipboard.
 */
export async function copyText(value) {
  // Guard first: writing an empty string would clear whatever the user already
  // had, which is worse than doing nothing.
  if (!value) {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // A denied permission rejects rather than throwing synchronously. Fall
      // through to the selection copy rather than reporting a success that
      // did not happen.
    }
  }

  return copyBySelection(value);
}

/**
 * Copies by selecting the text in an off-screen field.
 *
 * The older `execCommand` route, kept because it works without a secure context
 * and is the only thing available on a plain-HTTP LAN address.
 *
 * @param {string} value The text to copy.
 * @returns {boolean} Whether the browser reported the copy as successful.
 */
function copyBySelection(value) {
  const scratchField = document.createElement('textarea');

  scratchField.value = value;
  // Kept in the layout but out of sight: a field with `display: none` cannot be
  // selected, and selecting is the whole mechanism here.
  scratchField.setAttribute('readonly', '');
  scratchField.style.position = 'fixed';
  scratchField.style.top = '-1000px';
  scratchField.style.opacity = '0';

  document.body.appendChild(scratchField);

  try {
    scratchField.select();
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    // Removed on every path, so a failed copy does not litter the document.
    document.body.removeChild(scratchField);
  }
}
