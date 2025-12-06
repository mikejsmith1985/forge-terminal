#!/bin/bash
# Webhook Server for GitHub Release Notifications
# Listens for webhook POST requests and triggers handshake generation

PORT=${PORT:-8765}
LOG_FILE=".forge/webhook-server.log"

echo "🌐 Starting Forge Webhook Server on port $PORT..."
echo "   Listening for GitHub release webhooks"
echo "   Log file: $LOG_FILE"

mkdir -p "$(dirname "$LOG_FILE")"

# Simple HTTP server using socat or nc
if command -v socat &> /dev/null; then
    while true; do
        echo "[$(date)] Waiting for webhook..." | tee -a "$LOG_FILE"
        
        # Listen for HTTP request
        REQUEST=$(echo -e "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nWebhook received" | \
            socat TCP-LISTEN:$PORT,reuseaddr,fork STDIO | \
            head -n 20)
        
        # Check if it's a release event
        if echo "$REQUEST" | grep -q "X-GitHub-Event: release"; then
            echo "[$(date)] 🎉 Release webhook received!" | tee -a "$LOG_FILE"
            
            # Extract version from payload
            VERSION=$(echo "$REQUEST" | grep -o '"tag_name":"[^"]*"' | sed 's/"tag_name":"\([^"]*\)"/\1/')
            
            if [ -n "$VERSION" ]; then
                echo "[$(date)] 📦 Version: $VERSION" | tee -a "$LOG_FILE"
                
                # Trigger handshake generation
                echo "[$(date)] 🔄 Generating handshake..." | tee -a "$LOG_FILE"
                make handshake-doc 2>&1 | tee -a "$LOG_FILE"
                
                # Notification
                if command -v notify-send &> /dev/null; then
                    notify-send "Forge Terminal Released" "Version $VERSION - Handshake updated"
                fi
                
                echo "[$(date)] ✅ Handshake updated for $VERSION" | tee -a "$LOG_FILE"
            fi
        fi
        
        sleep 1
    done
else
    echo "❌ socat not installed. Install with: sudo apt-get install socat"
    exit 1
fi
