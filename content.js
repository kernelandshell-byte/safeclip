// Runs on every page. Listens for the browser's native "copy" event.
// It does NOT poll or watch the clipboard, it only reacts when the user
// actually presses Ctrl/Cmd+C or uses "Copy" from a context menu.
(function () {
  function getCopiedText() {
    const active = document.activeElement;

    // Text copied from an <input> or <textarea> doesn't show up in
    // window.getSelection(), so we read it from the field directly.
    if (
      active &&
      (active.tagName === "TEXTAREA" || active.tagName === "INPUT") &&
      typeof active.selectionStart === "number" &&
      typeof active.selectionEnd === "number" &&
      active.selectionEnd > active.selectionStart
    ) {
      return active.value.substring(active.selectionStart, active.selectionEnd);
    }

    const selection = window.getSelection ? window.getSelection().toString() : "";
    return selection || "";
  }

  document.addEventListener("copy", () => {
    const text = (getCopiedText() || "").trim();
    if (!text) return;

    // Skip absurdly huge selections so we don't bloat local storage.
    const clipped = text.length > 5000 ? text.slice(0, 5000) : text;

    chrome.runtime.sendMessage({ type: "CLIP_COPY", text: clipped }).catch(() => {
      // Extension context can occasionally be unavailable (e.g. right after
      // an update); failing silently is fine here, nothing to recover.
    });
  });
})();
