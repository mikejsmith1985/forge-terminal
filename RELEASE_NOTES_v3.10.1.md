# Forge Terminal v3.10.1 Release Notes

**Release Date:** January 2, 2026

## Summary
Forge Terminal v3.10.1 includes critical stability improvements, bug fixes, and enhancements to the ForgeAssist component and terminal reconnection handling.

## What's New

### Bug Fixes
- **Forge Assist Component**: Fixed component initialization and state management issues
- **Terminal Reconnection**: Improved WebSocket reconnection logic and error handling
- **LLM Logger**: Enhanced logging for better debugging and monitoring
- **Asset Pipeline**: Updated asset hashes for improved caching and delivery
- **E2E Tests**: Added comprehensive test coverage for recent fixes

### Improvements
- Stabilized ForgeAssist and ForgeTerminal component interactions
- Enhanced error recovery mechanisms in WebSocket connections
- Improved test coverage with new E2E test cases

## Files Modified
- `frontend/src/components/ForgeAssist.jsx`
- `frontend/src/components/ForgeTerminal.jsx`
- `internal/am/llm_logger.go`
- `cmd/forge/web/assets/` (asset hash updates)
- `frontend/e2e/` (new test cases)

## Testing
- All changes validated with E2E tests
- WebSocket reconnection scenarios tested
- Component integration verified

## Known Issues
None at this time.

## Contributors
- Development Team

## Upgrade Instructions
1. Download the latest binary from releases
2. Replace existing installation
3. Restart Forge Terminal
4. No configuration changes required

## Support
For issues or questions, please open an issue on GitHub.
