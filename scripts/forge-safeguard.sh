#!/usr/bin/env bash
# Forge Process Safeguard Script
# Prevents accidental killing of the active Forge session
# Version: v3.11.6
# CRITICAL: This prevents $100M+ session kill disasters
#
# Usage:
#   source forge-safeguard.sh
#   safe_kill <PID>

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color
BG_RED='\033[41m'

test_is_safe_to_kill() {
    local target_pid=$1
    local forge_pid=$FORGE_INSTANCE_PID
    local forge_port=$FORGE_INSTANCE_PORT
    
    echo -e "\n${YELLOW}🔍 PROCESS KILL SAFETY CHECK${NC}"
    echo -e "${YELLOW}================================${NC}"
    
    # Layer 1: Environment Variables
    echo -e "\n${CYAN}[Layer 1] Environment Variables:${NC}"
    if [ -n "$forge_pid" ]; then
        echo -e "  ${GREEN}✓ FORGE_INSTANCE_PID = $forge_pid${NC}"
    else
        echo -e "  ${YELLOW}⚠ FORGE_INSTANCE_PID not set${NC}"
    fi
    
    if [ -n "$forge_port" ]; then
        echo -e "  ${GREEN}✓ FORGE_INSTANCE_PORT = $forge_port${NC}"
    else
        echo -e "  ${YELLOW}⚠ FORGE_INSTANCE_PORT not set${NC}"
    fi
    
    # Layer 2: Port Ownership Check
    echo -e "\n${CYAN}[Layer 2] Port Ownership:${NC}"
    local port_owners=()
    local common_ports=(3005 9999)
    
    if [ -n "$forge_port" ]; then
        common_ports+=($forge_port)
    fi
    
    for port in "${common_ports[@]}"; do
        if command -v lsof &> /dev/null; then
            local owner=$(lsof -ti :$port 2>/dev/null | head -1)
            if [ -n "$owner" ]; then
                port_owners+=($owner)
                echo -e "  ${GREEN}✓ Port $port owned by PID: $owner${NC}"
            fi
        elif command -v ss &> /dev/null; then
            local owner=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1)
            if [ -n "$owner" ]; then
                port_owners+=($owner)
                echo -e "  ${GREEN}✓ Port $port owned by PID: $owner${NC}"
            fi
        fi
    done
    
    # Layer 3: Parent Process Chain
    echo -e "\n${CYAN}[Layer 3] Parent Process Chain:${NC}"
    local current_pid=$$
    local parent_chain=($current_pid)
    
    echo -e "  ${WHITE}Current Shell PID: $current_pid${NC}"
    
    local proc_pid=$current_pid
    while [ $proc_pid -gt 1 ]; do
        if [ "$(uname)" == "Darwin" ]; then
            # macOS
            local parent_pid=$(ps -p $proc_pid -o ppid= 2>/dev/null | tr -d ' ')
        else
            # Linux
            local parent_pid=$(ps -o ppid= -p $proc_pid 2>/dev/null | tr -d ' ')
        fi
        
        if [ -z "$parent_pid" ] || [ "$parent_pid" == "0" ] || [ "$parent_pid" == "1" ]; then
            break
        fi
        
        parent_chain+=($parent_pid)
        local parent_name=$(ps -p $parent_pid -o comm= 2>/dev/null)
        echo -e "    ${GRAY}↑ Parent: $parent_name (PID: $parent_pid)${NC}"
        
        proc_pid=$parent_pid
        
        # Prevent infinite loop
        if [ ${#parent_chain[@]} -gt 20 ]; then
            break
        fi
    done
    
    # Layer 4: Target Process Analysis
    echo -e "\n${CYAN}[Layer 4] Target Process Analysis:${NC}"
    
    if ! ps -p $target_pid &> /dev/null; then
        echo -e "  ${YELLOW}⚠ Target process PID $target_pid not found (already dead?)${NC}"
        return 0  # Safe to "kill" - it's already gone
    fi
    
    local target_name=$(ps -p $target_pid -o comm= 2>/dev/null)
    local target_path=$(ps -p $target_pid -o args= 2>/dev/null | awk '{print $1}')
    
    echo -e "  ${WHITE}Target: $target_name (PID: $target_pid)${NC}"
    echo -e "  ${GRAY}Path: $target_path${NC}"
    
    # CRITICAL CHECKS
    local is_dangerous=0
    local reasons=()
    
    # Check 1: Is it in parent chain?
    for pid in "${parent_chain[@]}"; do
        if [ "$pid" == "$target_pid" ]; then
            is_dangerous=1
            reasons+=("🚨 TARGET IS IN YOUR PARENT PROCESS CHAIN")
            break
        fi
    done
    
    # Check 2: Is it the env var PID?
    if [ -n "$forge_pid" ] && [ "$forge_pid" == "$target_pid" ]; then
        is_dangerous=1
        reasons+=("🚨 TARGET IS YOUR ACTIVE FORGE SESSION (FORGE_INSTANCE_PID=$forge_pid)")
    fi
    
    # Check 3: Does it own a Forge port?
    for owner in "${port_owners[@]}"; do
        if [ "$owner" == "$target_pid" ]; then
            is_dangerous=1
            reasons+=("🚨 TARGET OWNS A FORGE PORT (likely active session)")
            break
        fi
    done
    
    # Check 4: Is it a forge process?
    if [[ "$target_name" =~ forge ]] || [[ "$target_path" =~ forge ]]; then
        echo -e "\n  ${YELLOW}⚠ WARNING: Target is a forge process${NC}"
        
        # Extra verification for forge processes
        for owner in "${port_owners[@]}"; do
            if [ "$owner" == "$target_pid" ]; then
                is_dangerous=1
                break
            fi
        done
        
        if [ -n "$forge_pid" ] && [ "$forge_pid" == "$target_pid" ]; then
            is_dangerous=1
        fi
    fi
    
    # VERDICT
    echo -e "\n${YELLOW}================================${NC}"
    if [ $is_dangerous -eq 1 ]; then
        echo -e "${BG_RED}${WHITE}❌ DANGER: KILLING THIS PROCESS WILL TERMINATE YOUR SESSION!${NC}"
        echo ""
        for reason in "${reasons[@]}"; do
            echo -e "   ${RED}$reason${NC}"
        done
        echo ""
        echo -e "${RED}This has historically cost \$100M+ from lost context and work.${NC}"
        echo ""
        return 1
    else
        echo -e "${GREEN}✅ SAFE: Process is not in your parent chain or active Forge session${NC}"
        echo ""
        return 0
    fi
}

safe_kill() {
    local target_pid=$1
    
    if [ -z "$target_pid" ]; then
        echo -e "${RED}Usage: safe_kill <PID>${NC}"
        return 1
    fi
    
    if ! test_is_safe_to_kill "$target_pid"; then
        echo -e "\n${RED}⚠️  KILL OPERATION BLOCKED${NC}"
        echo -e "${YELLOW}If you REALLY want to kill this process and understand the consequences,${NC}"
        echo -e "${YELLOW}type exactly:${NC}"
        echo ""
        echo -e "${BG_RED}${WHITE}    \"I UNDERSTAND THIS WILL KILL MY SESSION\"${NC}"
        echo ""
        read -p "Your response: " confirmation
        
        if [ "$confirmation" == "I UNDERSTAND THIS WILL KILL MY SESSION" ]; then
            echo -e "\n${RED}💀 User explicitly confirmed session kill. Proceeding...${NC}"
            kill -9 "$target_pid"
        else
            echo -e "\n${GREEN}✋ Kill operation aborted. Your session is safe.${NC}"
        fi
    else
        echo -e "\n${GREEN}✅ Proceeding with safe kill...${NC}"
        kill -9 "$target_pid"
    fi
}

# Display banner when sourced
echo -e "${CYAN}🛡️  Forge Process Safeguard loaded${NC}"
echo -e "${GRAY}   Use safe_kill instead of kill for forge processes${NC}"
