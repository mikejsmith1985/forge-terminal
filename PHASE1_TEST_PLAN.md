# Phase 1 Test Plan - Comprehensive Testing Strategy

**Created:** December 11, 2025  
**Phase:** Phase 1 - Stabilization  
**Duration:** Week 2 (Dec 18-24)  
**Target:** v1.23.0-rc1 Release Candidate  

---

## 1. TEST PLAN OVERVIEW

### 1.1 Scope
This test plan covers all P0 "Must Fix" items and critical stability/performance tests required for v1.23.0-rc1 release candidate.

### 1.2 Test Categories
1. **Memory & Performance Tests** - Verify memory management and performance fixes
2. **Stability Tests** - Verify error handling and recovery mechanisms
3. **UX Tests** - Verify user experience improvements
4. **Integration Tests** - Verify component interactions
5. **Regression Tests** - Ensure no new bugs from changes

### 1.3 Test Environment
- OS: Linux (Ubuntu 20.04+)
- Node Version: 18+
- Go Version: 1.20+
- Browser: Chromium/Chrome (latest)
- Test Runners: Jest, Playwright, Go testing

### 1.4 Success Criteria for Phase 1
- ✅ All P0 tests PASS
- ✅ Memory usage stable (<200MB)
- ✅ No critical bugs reported
- ✅ Error boundaries catching errors
- ✅ WebSocket reconnection working
- ✅ No regression issues

---

## 2. MEMORY & PERFORMANCE TESTS

### 2.1 Memory Baseline Test

**Test Name:** `test-memory-baseline`  
**Type:** Performance  
**Duration:** 2 minutes (baseline), 12 hours (full)  
**Frequency:** Once per build

**Steps:**
1. Start fresh application instance
2. Monitor memory every 10 seconds using `/proc/[pid]/status`
3. Simulate user activity (no heavy operations)
4. Record: initial, final, peak, and growth metrics

**Expected Results:**
- Initial: ~10 MB (startup)
- Final: ~17-30 MB (stable)
- Peak: <200 MB
- Growth: Stabilizes after 30 seconds
- No unbounded growth over time

**Pass Criteria:**
- ✅ Final memory <200 MB
- ✅ No growth after 30 seconds
- ✅ Peak <300 MB

**Script:** `test-phase1-memory.sh` (already created)

---

### 2.2 Large Output Handling Test

**Test Name:** `test-large-output`  
**Type:** Performance  
**Duration:** 5 minutes  
**Frequency:** Once per build

**Setup:**
```bash
# Generate 10MB of test output
dd if=/dev/zero bs=1M count=10 | xxd | head -100000 > test-data/large-output.txt
```

**Steps:**
1. Open terminal
2. Run command that outputs 10MB of data
3. Verify terminal doesn't freeze
4. Verify scrolling remains responsive
5. Verify memory stays under 300MB

**Expected Results:**
- Terminal remains responsive
- No freeze or hang
- Scrolling works smoothly
- Memory stays stable

**Pass Criteria:**
- ✅ No freeze during output
- ✅ <50ms render time
- ✅ Memory <300 MB during output
- ✅ Scrolling responsive

---

### 2.3 Long-Running Session Test

**Test Name:** `test-long-session`  
**Type:** Stability  
**Duration:** 30 minutes  
**Frequency:** Once per phase

**Steps:**
1. Start application
2. Run automated commands every 5 minutes
3. Monitor memory, CPU, responsiveness
4. Check for leaks or degradation

**Expected Results:**
- Memory stable over time
- No degradation in responsiveness
- No CPU spikes
- Application remains stable

**Pass Criteria:**
- ✅ Memory growth <10MB total
- ✅ No responsiveness degradation
- ✅ CPU usage <5% average
- ✅ Application stable entire duration

---

## 3. STABILITY TESTS

### 3.1 Error Boundary Test

**Test Name:** `test-error-boundaries`  
**Type:** Unit/Integration  
**Duration:** 2 minutes  
**Frequency:** On every build

**Test Cases:**

#### 3.1.1 Render Error Caught
```
Test: Throw error in child component
Expected: Error boundary catches error
Expected: Fallback UI displays
Expected: "Try Again" button appears
Expected: "Reload Page" button appears
```

#### 3.1.2 Error Recovery
```
Test: User clicks "Try Again"
Expected: Error state clears
Expected: App attempts recovery
Expected: User can interact normally
```

#### 3.1.3 Multiple Errors
```
Test: Throw 4 errors in succession
Expected: Each caught by error boundary
Expected: Error count displays after 3
Expected: Warning message appears
```

**Files to Modify:**
- `frontend/src/__tests__/ErrorBoundary.test.jsx` (create)

**Pass Criteria:**
- ✅ All error cases caught
- ✅ Fallback UI displays
- ✅ Recovery works
- ✅ Error logging works

---

### 3.2 WebSocket Reconnection Test

**Test Name:** `test-websocket-reconnection`  
**Type:** Integration  
**Duration:** 10 minutes  
**Frequency:** Once per build

**Test Cases:**

#### 3.2.1 Connection Lost & Recovered
```
Test: Simulate WebSocket disconnect
Expected: Client detects disconnect
Expected: Auto-reconnection attempt (within 5 seconds)
Expected: Connection re-established
Expected: Pending commands resume
```

#### 3.2.2 Network Interruption Recovery
```
Test: Interrupt network (iptables drop)
Expected: Client timeout after 30 seconds
Expected: Reconnection attempt
Expected: Connection restored
Expected: No data loss
```

#### 3.2.3 Server Restart Recovery
```
Test: Stop and restart server
Expected: Client detects disconnect
Expected: Auto-reconnect within 10 seconds
Expected: Session restored
Expected: No data loss
```

**Implementation:**
- Use Playwright to test WebSocket behavior
- Mock WebSocket disconnects
- Verify reconnection logic

**Pass Criteria:**
- ✅ Reconnection within 5 seconds
- ✅ No data loss on reconnection
- ✅ Handles multiple disconnects
- ✅ Graceful degradation

---

### 3.3 PTY Cleanup Test

**Test Name:** `test-pty-cleanup`  
**Type:** Integration  
**Duration:** 5 minutes  
**Frequency:** Once per build

**Test Cases:**

#### 3.3.1 Process Cleanup on Tab Close
```
Test: Open multiple terminal tabs
Test: Start long-running process in each
Test: Close a tab
Expected: Process in closed tab is killed
Expected: Other tabs remain open
Expected: No zombie processes
```

#### 3.3.2 Memory Release on Close
```
Test: Open tabs with heavy processes
Test: Monitor memory
Test: Close tabs
Expected: Memory released
Expected: No memory spike
Expected: Final memory <50MB with no tabs
```

#### 3.3.3 Shell State on Close
```
Test: Set environment variables in terminal
Test: Close tab
Test: Open new tab
Expected: Shell state is clean
Expected: No environment pollution
```

**Implementation:**
- Check `/proc/[pid]/fd` for open processes
- Monitor `/proc/[pid]/status` for memory changes
- Verify shell process cleanup

**Pass Criteria:**
- ✅ All child processes killed
- ✅ Memory released properly
- ✅ No zombie processes
- ✅ Shell state clean

---

### 3.4 File System Edge Cases Test

**Test Name:** `test-filesystem-edge-cases`  
**Type:** Integration  
**Duration:** 10 minutes  
**Frequency:** Once per build

**Test Cases:**

#### 3.4.1 Permission Denied Handling
```
Test: Try to access restricted directory
Expected: Error message displayed
Expected: Graceful error handling
Expected: App doesn't crash
```

#### 3.4.2 Path Not Found Handling
```
Test: Change to non-existent directory
Expected: Error message displayed
Expected: Directory stays in previous location
Expected: No app crash
```

#### 3.4.3 Disk Full Handling
```
Test: Write to full disk (simulate with low space)
Expected: Error message displayed
Expected: Graceful handling
Expected: No app crash
```

#### 3.4.4 Symbolic Links
```
Test: Create and traverse symlinks
Expected: Symlinks handled correctly
Expected: Paths resolve properly
Expected: No infinite loops
```

**Pass Criteria:**
- ✅ All errors handled gracefully
- ✅ Clear error messages
- ✅ No app crashes
- ✅ User can recover

---

## 4. UX TESTS

### 4.1 Error Message Quality Test

**Test Name:** `test-error-messages`  
**Type:** Manual/Usability  
**Duration:** 15 minutes  
**Frequency:** Once per phase

**Criteria for Good Error Messages:**
1. Clear: User understands what went wrong
2. Actionable: User knows what to do
3. Polite: Not angry or technical jargon
4. Helpful: Suggests next steps

**Test Cases:**

#### 4.1.1 Permission Error
```
Error Scenario: Access denied to directory
Evaluate:
  - Is message clear? (Yes/No)
  - Is message actionable? (Yes/No)
  - Would typical user understand? (Yes/No)
Target: 5/5 users understand the issue
```

#### 4.1.2 Connection Error
```
Error Scenario: WebSocket connection failed
Evaluate:
  - Does user know connection is down? (Yes/No)
  - Does user know why? (Yes/No)
  - Does user know what to do? (Yes/No)
Target: 5/5 users can take action
```

#### 4.1.3 File Not Found Error
```
Error Scenario: Open non-existent file
Evaluate:
  - Is error message clear? (Yes/No)
  - Should user retry or cancel? Clear? (Yes/No)
Target: 5/5 users understand options
```

**Pass Criteria:**
- ✅ All error messages clear
- ✅ 5/5 test users understand
- ✅ All messages actionable
- ✅ No technical jargon

---

### 4.2 Loading States Test

**Test Name:** `test-loading-states`  
**Type:** Manual/Usability  
**Duration:** 10 minutes  
**Frequency:** Once per phase

**Criteria:**
1. Loading indicator visible for >1 second operations
2. Clear indication that operation is in progress
3. Not intrusive or annoying
4. Properly hidden when complete

**Test Cases:**

#### 4.2.1 Tab Opening
```
Test: Open new terminal tab
Expected: Loading indicator appears
Expected: Indicator visible until ready
Expected: Indicator hidden when complete
Expected: Indicator is clear and visible
```

#### 4.2.2 File Explorer Loading
```
Test: Open large directory
Expected: Loading indicator appears
Expected: Directory lists when ready
Expected: No frozen UI appearance
```

#### 4.2.3 Settings Loading
```
Test: Open settings modal
Expected: Content loads with indicator
Expected: No blank modal state
```

**Pass Criteria:**
- ✅ All async operations have loading state
- ✅ Loading indicators visible and clear
- ✅ Indicators properly hidden
- ✅ No frozen UI appearance

---

## 5. INTEGRATION TESTS

### 5.1 Tab Management Test

**Test Name:** `test-tab-management`  
**Type:** Integration  
**Duration:** 10 minutes  
**Frequency:** Once per build

**Test Cases:**

#### 5.1.1 Create/Close Tabs
```
Test: Create 10 tabs
Expected: All tabs open successfully
Test: Close tabs in random order
Expected: Remaining tabs stay functional
Expected: No errors or crashes
```

#### 5.1.2 Tab Switching
```
Test: Create 5 tabs with different directories
Test: Switch between tabs rapidly
Expected: Directory context preserved
Expected: No data mixing between tabs
Expected: Smooth switching
```

#### 5.1.3 Tab Persistence
```
Test: Create 3 tabs with specific directories
Test: Close application
Test: Reopen application
Expected: All 3 tabs restored
Expected: Directories preserved
Expected: Terminal history preserved
```

**Pass Criteria:**
- ✅ All tab operations work
- ✅ No data corruption between tabs
- ✅ Context preserved
- ✅ Persistence works

---

### 5.2 Terminal Output Test

**Test Name:** `test-terminal-output`  
**Type:** Integration  
**Duration:** 15 minutes  
**Frequency:** Once per build

**Test Cases:**

#### 5.2.1 Text Rendering
```
Test: Echo various text patterns:
  - ASCII text
  - Unicode characters
  - ANSI color codes
  - Special characters
Expected: All rendered correctly
Expected: Colors display properly
Expected: No garbled output
```

#### 5.2.2 Scroll Performance
```
Test: Generate 10K lines of output
Expected: Rendering is smooth
Expected: No frame drops
Expected: Scroll is responsive
```

#### 5.2.3 Copy/Paste
```
Test: Copy text from terminal
Test: Paste to different location
Expected: Text copied correctly
Expected: Special characters preserved
Expected: Colors not copied (expected)
```

**Pass Criteria:**
- ✅ All text renders correctly
- ✅ ANSI codes handled properly
- ✅ Scrolling smooth and responsive
- ✅ Copy/paste works

---

## 6. REGRESSION TESTS

### 6.1 Existing Features Still Work

**Test Name:** `test-regression`  
**Type:** Functional  
**Duration:** 20 minutes  
**Frequency:** Before every release

**Features to Test:**
1. Terminal execution
2. File explorer
3. Monaco editor
4. Tab switching
5. Settings persistence
6. Theme switching
7. Shell configuration
8. Copy/paste
9. Search functionality
10. Session restoration

**For Each Feature:**
```
1. Feature still works? (Yes/No)
2. Performance degraded? (Yes/No/Unknown)
3. New bugs introduced? (Yes/No)
4. Behavior changed unexpectedly? (Yes/No)
```

**Pass Criteria:**
- ✅ All features still work
- ✅ No performance degradation
- ✅ No new bugs introduced
- ✅ Behavior unchanged

---

## 7. TEST EXECUTION SCHEDULE

### Week 2 (Dec 18-24)

**Dec 18-19 (Mon-Tue):**
- [ ] Run memory baseline test
- [ ] Run error boundary unit tests
- [ ] Run WebSocket reconnection test
- [ ] Run PTY cleanup test

**Dec 20-21 (Wed-Thu):**
- [ ] Run filesystem edge cases test
- [ ] Run UX error message test (manual)
- [ ] Run UX loading states test (manual)
- [ ] Run tab management integration test
- [ ] Run terminal output test
- [ ] Run regression test (full feature suite)

**Dec 22-23 (Fri-Sat):**
- [ ] Large output handling test
- [ ] Long-running session test (30 min)
- [ ] Re-test any failed tests
- [ ] Compile test results

**Dec 23-24 (Sat-Sun):**
- [ ] Final verification of all tests
- [ ] Document any issues found
- [ ] Build v1.23.0-rc1
- [ ] Prepare release notes

---

## 8. TEST RESULT DOCUMENTATION

### 8.1 Test Result Template

```
Test Name:        [test-name]
Date/Time:        [YYYY-MM-DD HH:MM UTC]
Tester:           [Name]
Duration:         [X minutes]
Environment:      [OS, Browser, etc.]

Result:           [PASS/FAIL]
Issues Found:     [List any issues]
Performance:      [Metrics if applicable]
Notes:            [Any observations]

Sign-off:         [Tester name, date]
```

### 8.2 Results Storage

Create: `test-results/phase1-results/`

```
test-results/phase1-results/
├─ 2025-12-18-memory-baseline.txt
├─ 2025-12-18-error-boundaries.txt
├─ 2025-12-19-websocket-reconnection.txt
├─ 2025-12-20-pty-cleanup.txt
├─ 2025-12-20-filesystem-edge-cases.txt
├─ 2025-12-20-uX-errors.txt
├─ 2025-12-20-uX-loading.txt
├─ 2025-12-20-tab-management.txt
├─ 2025-12-20-terminal-output.txt
├─ 2025-12-21-regression.txt
├─ 2025-12-22-large-output.txt
├─ 2025-12-22-long-session.txt
└─ PHASE1_TEST_SUMMARY.md
```

---

## 9. SUCCESS CRITERIA FOR PHASE 1

### 9.1 All Tests Must Pass

| Test Category | Required | Result |
|--------------|----------|--------|
| Memory baseline | PASS | [ ] |
| Error boundaries | PASS | [ ] |
| WebSocket reconnection | PASS | [ ] |
| PTY cleanup | PASS | [ ] |
| Filesystem edge cases | PASS | [ ] |
| Error messages | PASS | [ ] |
| Loading states | PASS | [ ] |
| Tab management | PASS | [ ] |
| Terminal output | PASS | [ ] |
| Regression tests | PASS | [ ] |
| Large output handling | PASS | [ ] |
| Long-running session | PASS | [ ] |

**Final Status:** [ ] All tests PASS → Release v1.23.0-rc1

---

## 10. CONTINGENCY PLANS

### 10.1 If Test Fails

**Critical Failure (Blocker):**
1. Stop execution
2. Investigate root cause
3. Create fix
4. Re-test
5. If not fixed by Dec 22 EOD: Escalate

**Non-Critical Failure:**
1. Document issue
2. Create ticket for Phase 2
3. Continue with other tests
4. Note in release notes

### 10.2 If Timeline Pressure

**If falling behind on Dec 21:**
- Reduce regression test scope to critical features only
- Skip manual UX tests (if automated tests pass)
- Focus on P0 critical tests

**If still failing Dec 22:**
- Defer non-critical test results to Phase 2
- Release v1.23.0-rc1 with known issues list
- Continue testing in Phase 2

---

## 11. APPROVAL & SIGN-OFF

**Test Plan Created:** December 11, 2025  
**Test Plan Approved:** [ ] Engineering Lead  
**Testing Start:** December 18, 2025  
**Testing Complete:** December 23, 2025  
**RC Release:** December 24, 2025  

**Sign-off:**
```
Tester Name: _________________
Date: _________________
Status: [ ] APPROVED [ ] PENDING [ ] BLOCKED
```

---

**Test Plan Version:** 1.0  
**Status:** READY FOR EXECUTION  
**Next Step:** Execute tests starting Dec 18

EOF
