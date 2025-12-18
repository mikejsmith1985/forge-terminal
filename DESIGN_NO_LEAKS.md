# Design Specification: Zero Leak Architecture

## 1. Objective
Ensure the Forge Terminal application (Frontend + Backend) operates with **zero memory leaks** and **zero CPU leaks**. This requires strict resource management, bounded buffers, and deterministic cleanup of all asynchronous operations.

## 2. Frontend Strategy (React)

### 2.1. Component Lifecycle & Side Effects
*   **Strict Cleanup:** Every `useEffect` that creates a resource (timer, subscription, event listener) MUST return a cleanup function.
*   **Async State Safety:** All async operations (fetch, promises) inside components MUST check if the component is still mounted before updating state, or use `AbortController` to cancel the operation.
*   **Timer Management:**
    *   Avoid raw `setTimeout` / `setInterval` where possible.
    *   Use custom hooks (`useInterval`, `useTimeout`) that handle cleanup automatically.
    *   If raw timers are used, store the ID in a `ref` and clear it in the cleanup function.

### 2.2. WebSocket & EventSource Management
*   **Connection Lifecycle:** WebSocket and EventSource connections must be explicitly closed when the hosting component unmounts.
*   **Reconnection Logic:** Recursive reconnection logic (e.g., `setTimeout` in `onerror`) must be cancellable. The cleanup function must clear any pending reconnection timers.

### 2.3. Terminal & DOM Resources
*   **xterm.js Disposal:** The `Terminal` instance must be disposed (`term.dispose()`) when the component unmounts.
*   **DOM Listeners:** Global event listeners (`window.addEventListener`) must be removed.
*   **Large State:** Avoid storing unbounded logs in React state. Use circular buffers or offload to the DOM (xterm.js handles its own buffer).

## 3. Backend Strategy (Go)

### 3.1. Goroutine Management
*   **Lifecycle:** Every goroutine must have a defined exit condition (channel close, context cancellation, or error).
*   **Context Propagation:** Use `context.Context` to propagate cancellation signals to all spawned goroutines.
*   **WaitGroups:** Use `sync.WaitGroup` to ensure all child goroutines have exited before closing a session/handler.

### 3.2. Resource Bounding
*   **Input Buffers:** The `inputBuffer` (used for command detection) MUST have a hard size limit (e.g., 4KB). If it exceeds this limit without a newline, it should be reset or truncated to prevent OOM attacks.
*   **Accumulators:** `amInputAccumulator` and `llmOutputBuffer` must be capped. Even if reset frequently, a massive burst of data could spike memory usage.

### 3.3. Global State
*   **Session Maps:** Ensure `h.sessions.Delete(id)` is called in a `defer` block to guarantee cleanup even on panic or early return.
*   **LLM Loggers:** Ensure `am.RemoveLLMLogger(id)` is called when a session ends.

## 4. Specific Actionable Fixes

### 4.1. Frontend: `App.jsx` (SSE Reconnection)
**Current Issue:** `connectSSE` uses a recursive `setTimeout` for reconnection that is not cleared on unmount.
**Fix:**
1.  Store the reconnection timeout ID in a `useRef`.
2.  Clear this timeout in the `useEffect` cleanup function.
3.  Close `eventSource` in cleanup.

### 4.2. Frontend: `AMMonitor.jsx` (Async State)
**Current Issue:** `checkStatus` updates state after `await fetch(...)` without checking if mounted.
**Fix:**
1.  Use a `isMounted` ref (or `AbortController`).
2.  In `checkStatus`, check `if (!isMounted.current) return;` before `setState`.

### 4.3. Backend: `internal/terminal/handler.go` (Unbounded Buffers)
**Current Issue:** `inputBuffer` (strings.Builder) grows indefinitely if no newline is received.
**Fix:**
1.  Check `inputBuffer.Len()` before writing.
2.  If `Len() > MaxBufferSize` (e.g., 8KB), reset the buffer.
3.  Apply similar logic to `amInputAccumulator` and `llmOutputBuffer`.

## 5. Verification Plan

### 5.1. Frontend Verification
1.  **Heap Snapshot:** Take a heap snapshot in Chrome DevTools.
2.  **Stress Test:** Open/Close tabs 50 times.
3.  **Heap Snapshot:** Take another snapshot.
4.  **Comparison:** Verify no `Terminal`, `WebSocket`, or detached DOM nodes are accumulating.

### 5.2. Backend Verification
1.  **Go pprof:** Use `net/http/pprof` to monitor heap and goroutine count.
2.  **Load Test:** Connect 50 clients, send data, disconnect.
3.  **Check:** Ensure goroutine count returns to baseline.
