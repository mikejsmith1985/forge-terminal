#!/bin/bash
# Quick test of LLM command detection

echo "Testing LLM Command Detection"
echo "=============================="
echo ""

# Test the Go detector directly
cd internal/llm
go test -v -run TestDetectCommand 2>&1 | head -50
