/**
 * Copy text to the clipboard.
 *
 * Uses the modern Clipboard API when available (HTTPS / localhost).
 * Falls back to the legacy execCommand approach for HTTP or older browsers.
 *
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} true on success, false on failure
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Legacy fallback — works on HTTP and in some older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}
