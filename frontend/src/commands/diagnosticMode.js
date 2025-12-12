// ==========================================
//  FORGE TERMINAL DIAGNOSTIC MODE
// ==========================================
export const diagnosticMode = {
  name: "diagnose",
  description: "Diagnose keyboard, focus, overlays, and terminal DOM state",
  usage: "/diagnose [keyboard|focus|overlays|terminal|all]",
  
  async run({ args, print }) {
    const mode = args[0] || "all";

    const results = {
      keyboard: null,
      focus: null,
      overlays: null,
      terminal: null
    };

    // ---- Helper: get xterm textarea ----
    function getTextarea() {
      return document.querySelectorAll(".xterm-helper-textarea");
    }

    // ---- Helper: get terminal container ----
    function getContainer() {
      return document.querySelector(".terminal-inner") ||
             document.querySelector("#terminal") ||
             document.querySelector(".xterm");
    }

    // ---- TEST: Keyboard space behavior ----
    async function testKeyboard() {
      return new Promise((resolve) => {
        let fired = false;
        let prevented = false;

        const handler = (e) => {
          if (e.code === "Space") {
            fired = true;
            if (e.defaultPrevented) prevented = true;
          }
        };

        window.addEventListener("keydown", handler);

        setTimeout(() => {
          window.removeEventListener("keydown", handler);

          resolve({
            spaceEventSeen: fired,
            wasPrevented: prevented
          });
        }, 500);
      });
    }

    // ---- TEST: Focus behavior ----
    async function testFocus() {
      const states = [];
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          states.push(String(document.activeElement?.className || document.activeElement?.tagName));
        }, 50);

        setTimeout(() => {
          clearInterval(interval);
          resolve({
            history: states.slice(0, 10),
            endedOn: states[states.length - 1],
            textareaCount: getTextarea().length
          });
        }, 500);
      });
    }

    // ---- TEST: Overlay blocking ----
    function testOverlays() {
      const termContainer = getContainer();
      if (!termContainer) {
        return { error: "Terminal container not found." };
      }

      const termRect = termContainer.getBoundingClientRect();
      const overlapping = [];

      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        if (el === termContainer || el.closest(".xterm")) continue;

        const rect = el.getBoundingClientRect();
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left < termRect.right &&
          rect.right > termRect.left &&
          rect.top < termRect.bottom &&
          rect.bottom > termRect.top
        ) {
          const style = window.getComputedStyle(el);
          if (style.zIndex !== "auto" && style.pointerEvents !== "none") {
            overlapping.push({
              element: el.tagName,
              class: el.className,
              zIndex: style.zIndex,
              pointerEvents: style.pointerEvents
            });
          }
        }
      }

      return { overlapping };
    }

    // ---- TEST: Terminal mount state ----
    function testTerminal() {
      const textareaCount = getTextarea().length;
      const container = getContainer();

      if (!container) return { containerMissing: true };

      const style = window.getComputedStyle(container);

      return {
        textareaCount,
        containerComputedStyle: {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          width: container.offsetWidth,
          height: container.offsetHeight
        },
        inIframe: window.self !== window.top,
        iframeSandbox:
          window.self !== window.top
            ? window.frameElement?.getAttribute("sandbox") || "none"
            : "none"
      };
    }

    // ==========================================
    // EXECUTION
    // ==========================================
    if (mode === "keyboard" || mode === "all") {
      results.keyboard = await testKeyboard();
    }
    if (mode === "focus" || mode === "all") {
      results.focus = await testFocus();
    }
    if (mode === "overlays" || mode === "all") {
      results.overlays = testOverlays();
    }
    if (mode === "terminal" || mode === "all") {
      results.terminal = testTerminal();
    }

    // ==========================================
    // PRESENT RESULTS
    // ==========================================
    print("=== Forge Diagnostic Report ===");

    if (results.keyboard)
      print("\n[Keyboard Test]\n" + JSON.stringify(results.keyboard, null, 2));

    if (results.focus)
      print("\n[Focus Test]\n" + JSON.stringify(results.focus, null, 2));

    if (results.overlays)
      print("\n[Overlay Test]\n" + JSON.stringify(results.overlays, null, 2));

    if (results.terminal)
      print("\n[Terminal Mount Test]\n" + JSON.stringify(results.terminal, null, 2));

    print("\n=== End of Report ===");
  }
};
