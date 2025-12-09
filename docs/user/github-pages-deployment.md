# GitHub Pages Deployment Guide

Forge Terminal can be deployed to GitHub Pages for platform-agnostic access. This guide covers the three deployment modes.

## Overview

After Phase 2 implementation, the frontend is automatically deployed to GitHub Pages on every push to `main`. You can access it at:

```
https://[your-username].github.io/forge-terminal/
```

## Three Deployment Modes

### 1. Local Development (Recommended for Development)

Run the Go backend locally and use the GitHub Pages frontend:

```bash
# Step 1: Build and run the Go backend
make run
# Or manually:
cd frontend && npm install && npm run build
cd ..
go build -o bin/forge ./cmd/forge
./bin/forge

# This starts the backend on http://localhost:8333
```

```bash
# Step 2: Open the GitHub Pages frontend
# Navigate to: https://[your-username].github.io/forge-terminal/

# Step 3: Configure API endpoint
# 1. Click the settings gear icon (top-right)
# 2. Go to "API Configuration"
# 3. Enter backend URL: http://localhost:8333
# 4. Click "Test Connection" to verify
# 5. Click "Apply"
```

**Advantages**:
- Full terminal access with PTY support
- All features work (AM logging, commands, themes)
- Fast, no network latency
- Perfect for development and testing

**Limitations**:
- Requires local terminal or SSH access
- Backend port (8333) must be accessible from your browser

### 2. GitHub Codespaces (Platform-Agnostic, No Local Setup)

Run forge-terminal in GitHub Codespaces for instant cloud-based terminal access:

```bash
# Step 1: Create a GitHub Codespace
# 1. Go to: https://github.com/mikejsmith1985/forge-terminal
# 2. Click "Code" → "Codespaces" → "Create codespace on main"
# 3. Wait for the Codespace to load (2-3 minutes)

# Step 2: Build and run the backend
# In the Codespace terminal:
cd frontend && npm install && npm run build
cd ..
make run

# This starts the backend on http://localhost:8333 (inside Codespace)
```

```bash
# Step 3: Expose the port
# 1. In Codespace, press F1
# 2. Type "Ports: Expose Port"
# 3. Enter port: 8333
# 4. The port is now accessible via HTTPS tunnel

# The port configuration will show the forwarding URL like:
# https://[codespace-id]-8333.app.github.dev
```

```bash
# Step 4: Configure frontend API endpoint
# 1. Open GitHub Pages: https://[your-username].github.io/forge-terminal/
# 2. Click settings → API Configuration
# 3. Enter the forwarded URL from Step 3
# 4. Click "Test Connection"
# 5. Click "Apply"
```

**Advantages**:
- No local installation required
- Works from any browser (Mac, Windows, Linux)
- Full PTY support via Codespace container
- All features available
- Free tier includes limited Codespace hours

**Limitations**:
- Requires GitHub account
- Limited free hours per month (120 hours)
- WebSocket requires port forwarding setup
- Slightly higher latency than local

### 3. Embedded Binary Deployment (Current Default)

The Go binary includes an embedded frontend for standalone operation:

```bash
# Download the binary from releases
wget https://github.com/mikejsmith1985/forge-terminal/releases/download/v1.x.x/forge-linux-amd64

chmod +x forge-linux-amd64
./forge-linux-amd64

# Automatically opens browser at http://localhost:8333
```

**Advantages**:
- Single file, no dependencies
- Works offline
- Fastest performance
- Cross-platform support

**Limitations**:
- Must download and run binary locally
- Platform-specific binaries needed
- Can't be used from remote machines

---

## Architecture

### Frontend Components

Located in `frontend/src/`:
- **`config.js`** - API endpoint configuration
- **`hooks/useAPI.js`** - API and WebSocket connection hooks
- **`components/APIConfigPanel.jsx`** - UI for changing API endpoint

### Backend Components

Located in `cmd/forge/`:
- **`middleware.go`** - CORS and security headers
- **`main.go`** - HTTP server setup with middleware

### Automatic Deployment

The `.github/workflows/deploy-pages.yml` workflow:
1. Triggers on pushes to `main` branch (frontend changes)
2. Builds frontend with Vite
3. Deploys to GitHub Pages
4. Available at `https://[username].github.io/forge-terminal/`

---

## Security

### CORS (Cross-Origin Resource Sharing)

The backend allows requests from:
- `http://localhost:*` - Local development
- `https://*.github.io` - GitHub Pages
- `https://*.app.github.dev` - GitHub Codespaces
- `https://*.csb.app` - Cloud-based setups

To restrict to specific origins, set environment variable:

```bash
export ALLOWED_ORIGINS="https://myname.github.io/forge-terminal/,https://mycodespace.app.github.dev"
./forge
```

### Security Headers

All API responses include:
- `X-Content-Type-Options: nosniff` - Prevent MIME type attacks
- `X-Frame-Options: DENY` - Prevent clickjacking
- `X-XSS-Protection: 1; mode=block` - XSS protection
- `Content-Security-Policy` - Restrict inline scripts

### WebSocket Security

- Uses `wss://` (WSS) for encrypted Codespaces connections
- Uses `ws://` (WS) for local connections
- Origin validation prevents unauthorized connections

---

## Troubleshooting

### "Cannot connect to backend"

1. Verify backend is running:
   ```bash
   curl http://localhost:8333/api/version
   ```

2. Check API configuration in frontend:
   - Click settings → API Configuration
   - Verify backend URL is correct
   - Click "Test Connection"

3. Check browser console (F12) for errors:
   - Network tab shows connection attempts
   - Console shows detailed error messages

### "WebSocket connection failed"

**For Codespaces**:
1. Ensure port 8333 is exposed:
   - F1 → "Ports" → Check port 8333 listed
   - Right-click port → "Copy Forwarded Address"

2. Update API configuration with forwarded URL:
   - Include protocol: `https://` (not `http://`)
   - Example: `https://mycodespace-8333.app.github.dev`

**For local**:
1. Check backend is running on 8333
2. Check firewall allows localhost connections
3. Try `http://127.0.0.1:8333` instead of `http://localhost:8333`

### "CORS error in console"

This means frontend origin is not allowed by backend:

```bash
# Enable all origins for development (NOT for production)
export ALLOWED_ORIGINS="*"
./forge

# Or specify allowed origins
export ALLOWED_ORIGINS="https://myname.github.io,http://localhost:3000"
./forge
```

### Terminal commands not working

1. Verify WebSocket connection:
   - Open browser DevTools (F12)
   - Network tab → filter "WS"
   - Look for `/ws` connection

2. Check backend logs for errors:
   - Look for "WebSocket" messages
   - Check PTY initialization logs

3. Try refreshing the page:
   - Backend may have restarted
   - Frontend will reconnect automatically

---

## Configuration Reference

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ALLOWED_ORIGINS` | Comma-separated CORS whitelist | `http://localhost:*,https://*.github.io,https://*.app.github.dev` |
| `VITE_API_BASE` | Frontend API base URL (build time) | Auto-detected |
| `FORGE_PORT` | Port to run backend on | Auto-detect (8333, 8080, 9000, 3000, 3333) |

### Frontend Configuration (Runtime)

Set via Settings → API Configuration panel in UI, or via JavaScript:

```javascript
// In browser console
window.__forgeAPIConfig.setAPIBase("https://mybackend.example.com")
```

This saves to localStorage and persists across sessions.

---

## API Endpoints

All endpoints support CORS. WebSocket endpoint requires upgrade:

```
GET  /api/version              - Get backend version
GET  /api/config               - Get configuration
GET  /api/commands             - List commands
POST /api/commands             - Save commands
WS   /ws                       - Terminal session (WebSocket)
```

Full API documentation: See `docs/developer/api.md`

---

## Next Steps

1. **For Local Development**: Run `make run` and configure frontend to `http://localhost:8333`

2. **For Codespaces**: Create a Codespace, run backend, expose port, configure frontend

3. **For Production**: Use the embedded binary (default deployment method)

4. **For Custom Deployment**: Modify `ALLOWED_ORIGINS` environment variable

---

## See Also

- [Architecture Documentation](../developer/architecture-web.md)
- [GitHub Pages Deployment (Developer Guide)](../developer/codespaces-setup.md)
- [Project README](../../README.md)
