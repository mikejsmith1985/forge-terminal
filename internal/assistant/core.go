// Package assistant provides the core AI assistant logic.
// Package assistant provides the core AI assistant logic.
package assistant

import (
	"log"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
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

	return &Core{
		visionRegistry: visionRegistry,
		visionParser:   visionParser,
		llmDetector:    llm.NewDetector(),
		amSystem:       amSystem,
		ollamaClient:   ollamaClient,
		knowledgeBase:  knowledgeBase,
		ragEngine:      ragEngine,
	}
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


