# Instance Lockfile - v3.7.2

## Overview

The instance lockfile prevents multiple Forge Terminal processes from running simultaneously, which can cause:
- Keystroke latency (multiple processes handling the same input)
- Resource contention (CPU, memory)
- WebSocket conflicts
- Database locking issues

## Implementation

### Location
`~/.forge/forge.lock` (or `%USERPROFILE%\.forge\forge.lock` on Windows)

### Mechanism
1. On startup, Forge attempts to acquire an exclusive file lock
2. If successful, writes its PID to the lockfile
3. If another instance is running, exits with an error message
4. On clean shutdown, removes the lockfile
5. Detects and removes stale lockfiles (from crashed processes)

### Platform Support
- **Windows**: Uses `LockFileEx` API for exclusive locks
- **Unix/Linux/macOS**: Uses `flock` for exclusive locks

## Usage

### Normal Operation
```bash
./forge
# [Forge] Instance lock acquired (PID: 12345)
```

### Multiple Instance Attempt
```bash
./forge
# ERROR: another instance of Forge Terminal is already running (PID in ~/.forge/forge.lock)
# 
# If you're sure no other instance is running, remove:
#   ~/.forge/forge.lock
```

### Manual Lockfile Removal
If Forge crashes and leaves a stale lockfile:
```bash
# The lockfile contains the PID of the crashed process
rm ~/.forge/forge.lock
```

The lockfile system automatically detects and removes stale lockfiles, so manual removal is rarely needed.

## Technical Details

### Stale Detection
A lockfile is considered stale if:
1. The PID in the file doesn't correspond to a running process
2. The process is running but doesn't hold the lock (rare, but handled)

### Race Conditions
The implementation handles race conditions where multiple instances try to start simultaneously:
- Uses non-blocking lock acquisition
- Atomic file operations
- Proper error handling

### Testing
Run the test suite:
```bash
cd internal/lockfile
go test -v
```

Tests cover:
- Basic lock acquisition and release
- Stale lockfile detection
- Concurrent lock attempts
- Lockfile cleanup

## Benefits

### Performance
Prevents the ~2x CPU usage and latency spikes seen when multiple instances run.

### User Experience
Clear error message when attempting to start a second instance, with instructions for recovery.

### Reliability
Automatic cleanup of stale lockfiles ensures the system recovers from crashes.

## Related Issues

This feature was added to fix:
- **Keystroke latency**: Multiple processes handling the same terminal input
- **Resource contention**: Two instances competing for CPU, memory, and file system
- **WebSocket conflicts**: Multiple WebSocket connections to the same terminal

## Future Enhancements

Potential improvements:
1. Add a `--force` flag to override the lock (for emergency recovery)
2. Log the port number in the lockfile (for multi-port scenarios)
3. Add inter-process communication for graceful handoff
