#!/bin/bash
# Comprehensive Forge Release Watcher Management

show_status() {
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                                                                  ║"
    echo "║     🔥 FORGE TERMINAL RELEASE WATCHER - SYSTEMD SERVICE 🔥      ║"
    echo "║                                                                  ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Service status
    if systemctl --user is-active forge-release-watcher.service >/dev/null 2>&1; then
        echo "✅ Status: RUNNING (systemd service)"
    else
        echo "❌ Status: NOT RUNNING"
    fi
    
    # Enabled at boot?
    if systemctl --user is-enabled forge-release-watcher.service >/dev/null 2>&1; then
        echo "✅ Auto-start: ENABLED (survives reboots)"
    else
        echo "⚠️  Auto-start: DISABLED"
    fi
    
    # Lingering enabled?
    if loginctl show-user $USER | grep -q "Linger=yes"; then
        echo "✅ Persistence: ENABLED (runs when logged out)"
    else
        echo "⚠️  Persistence: DISABLED"
    fi
    
    echo ""
    echo "📊 Service Details:"
    systemctl --user status forge-release-watcher.service --no-pager | head -15
    
    echo ""
    echo "📦 Current Version:"
    if [ -f /home/mikej/projects/forge-terminal/.forge/last-release-check ]; then
        cat /home/mikej/projects/forge-terminal/.forge/last-release-check
    else
        echo "   (not yet checked)"
    fi
    
    echo ""
    echo "📝 Recent Activity:"
    tail -5 ~/.forge/release-watcher.log
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

show_help() {
    echo "Forge Release Watcher Management"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  status    - Show current status (default)"
    echo "  start     - Start the watcher service"
    echo "  stop      - Stop the watcher service"
    echo "  restart   - Restart the watcher service"
    echo "  logs      - View live logs (Ctrl+C to exit)"
    echo "  enable    - Enable auto-start at boot"
    echo "  disable   - Disable auto-start at boot"
    echo "  install   - Install/reinstall the service"
    echo "  uninstall - Remove the service completely"
    echo ""
}

case "${1:-status}" in
    status)
        show_status
        ;;
    start)
        systemctl --user start forge-release-watcher.service
        echo "✅ Service started"
        ;;
    stop)
        systemctl --user stop forge-release-watcher.service
        echo "⏹️  Service stopped"
        ;;
    restart)
        systemctl --user restart forge-release-watcher.service
        echo "🔄 Service restarted"
        ;;
    logs)
        echo "📝 Live logs (Ctrl+C to exit)..."
        journalctl --user -u forge-release-watcher.service -f
        ;;
    enable)
        systemctl --user enable forge-release-watcher.service
        loginctl enable-linger $USER
        echo "✅ Service enabled (auto-start at boot)"
        ;;
    disable)
        systemctl --user disable forge-release-watcher.service
        echo "⏹️  Service disabled (will not auto-start)"
        ;;
    install)
        mkdir -p ~/.config/systemd/user
        cp /home/mikej/projects/forge-terminal/scripts/forge-release-watcher.service ~/.config/systemd/user/
        systemctl --user daemon-reload
        systemctl --user enable --now forge-release-watcher.service
        loginctl enable-linger $USER
        echo "✅ Service installed and started"
        ;;
    uninstall)
        systemctl --user stop forge-release-watcher.service 2>/dev/null
        systemctl --user disable forge-release-watcher.service 2>/dev/null
        rm -f ~/.config/systemd/user/forge-release-watcher.service
        systemctl --user daemon-reload
        echo "🗑️  Service uninstalled"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
