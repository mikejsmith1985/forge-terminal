// Package assistant provides the core AI assistant logic.
package assistant

import (
"context"
"fmt"
"log"
"time"

"github.com/mikejsmith1985/forge-terminal/internal/am"
"github.com/mikejsmith1985/forge-terminal/internal/assistant/providers"
"github.com/mikejsmith1985/forge-terminal/internal/llm"
"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

// Core is the central assistant that manages all AI features.
type Core struct {
visionRegistry *vision.Registry
visionParser   *vision.Parser
llmDetector    *llm.Detector
amSystem       *am.System
ollamaClient   *OllamaClient
knowledgeBase  *KnowledgeBase
ragEngine      *RAGEngine
activeProvider providers.AIProvider
}

// NewCore creates a new assistant core with all AI features.
func NewCore(amSystem *am.System) *Core {
visionRegistry := vision.NewRegistry()
visionParser := vision.NewParser(8192, visionRegistry) // 8KB buffer

// Initialize Ollama client with defaults
// Users can set FORGE_OLLAMA_MODEL env var to use specific model
ollamaClient := NewOllamaClient("", "")

// Initialize knowledge base
knowledgeBase := NewKnowledgeBase()

// Initialize RAG components
embeddingsClient := NewEmbeddingsClient("", "")
vectorStore := NewVectorStore()
ragEngine := NewRAGEngine(embeddingsClient, vectorStore, ollamaClient, knowledgeBase)

log.Printf("[Assistant] Core initialized")

// Default to Claude provider
defaultProvider := providers.NewClaudeProvider()

return &Core{
visionRegistry: visionRegistry,
visionParser:   visionParser,
llmDetector:    llm.NewDetector(),
amSystem:       amSystem,
ollamaClient:   ollamaClient,
knowledgeBase:  knowledgeBase,
ragEngine:      ragEngine,
activeProvider: defaultProvider,
}
}

// SetProvider switches the active AI provider.
func (c *Core) SetProvider(name string) error {
switch name {
case "claude":
c.activeProvider = providers.NewClaudeProvider()
case "copilot":
c.activeProvider = providers.NewCopilotProvider()
default:
return fmt.Errorf("unknown provider: %s", name)
}
log.Printf("[Assistant] Switched to provider: %s", name)
return nil
}

// Ask sends a prompt to the active provider and streams events to the EventBus.
func (c *Core) Ask(ctx context.Context, prompt string, tabID string) error {
if c.activeProvider == nil {
return fmt.Errorf("no active provider")
}

// Default options for now
opts := providers.AskOptions{
Model:  "default",
Stream: true,
}

stream, err := c.activeProvider.Ask(ctx, prompt, opts)
if err != nil {
return err
}

// Process stream in background to not block caller
go func() {
for event := range stream {
// Map provider events to AM LayerEvents
layerEvent := &am.LayerEvent{
Layer:     2, // Assistant Layer
TabID:     tabID,
Timestamp: time.Now(),
Metadata:  make(map[string]interface{}),
}

switch event.Type {
case "thinking":
layerEvent.Type = "assistant_thinking"
layerEvent.Metadata["content"] = event.Content
case "text":
layerEvent.Type = "assistant_response"
layerEvent.Metadata["content"] = event.Content
case "tool_use":
layerEvent.Type = "assistant_tool_use"
layerEvent.Metadata["tool"] = event.Meta["name"]
layerEvent.Metadata["params"] = event.Meta
case "error":
layerEvent.Type = "assistant_error"
layerEvent.Metadata["error"] = event.Content
case "done":
layerEvent.Type = "assistant_done"
default:
continue
}

am.EventBus.Publish(layerEvent)
}
}()

return nil
}

// GetVisionParser returns the vision parser (for terminal handler).
func (c *Core) GetVisionParser() *vision.Parser {
return c.visionParser
}

// GetLLMDetector returns the LLM detector (for terminal handler).
func (c *Core) GetLLMDetector() *llm.Detector {
return c.llmDetector
}

// GetAMSystem returns the AM system (for terminal handler).
func (c *Core) GetAMSystem() *am.System {
return c.amSystem
}

// ProcessTerminalOutput analyzes terminal output and detects patterns.
func (c *Core) ProcessTerminalOutput(data []byte) *vision.Match {
if c.visionParser == nil {
return nil
}
return c.visionParser.Feed(data)
}

// DetectLLMCommand analyzes input to detect LLM commands.
func (c *Core) DetectLLMCommand(commandLine string) *llm.DetectedCommand {
if c.llmDetector == nil {
return &llm.DetectedCommand{Detected: false}
}
return c.llmDetector.DetectCommand(commandLine)
}

// EnableVision enables vision pattern detection.
func (c *Core) EnableVision() {
if c.visionParser != nil {
c.visionParser.SetEnabled(true)
log.Printf("[Assistant] Vision enabled")
}
}

// DisableVision disables vision pattern detection.
func (c *Core) DisableVision() {
if c.visionParser != nil {
c.visionParser.SetEnabled(false)
c.visionParser.Clear()
log.Printf("[Assistant] Vision disabled")
}
}

// VisionEnabled returns whether vision is currently enabled.
func (c *Core) VisionEnabled() bool {
if c.visionParser == nil {
return false
}
return c.visionParser.Enabled()
}

// GetOllamaClient returns the Ollama client for external use.
func (c *Core) GetOllamaClient() *OllamaClient {
return c.ollamaClient
}

// GetRAGEngine returns the RAG engine for external use.
func (c *Core) GetRAGEngine() *RAGEngine {
return c.ragEngine
}

// GetKnowledgeBase returns the knowledge base for external use.
func (c *Core) GetKnowledgeBase() *KnowledgeBase {
return c.knowledgeBase
}

