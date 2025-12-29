package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
	"github.com/mikejsmith1985/forge-terminal/internal/chat"
)

var chatStore *chat.Store
var chatBridge *chat.Bridge

// initChatStore initializes the chat store
func initChatStore(forgeDir string) error {
	var err error
	chatStore, err = chat.GetStore(forgeDir)
	if err != nil {
		return fmt.Errorf("failed to init chat store: %w", err)
	}
	return nil
}

// initChatBridge initializes the chat bridge (AM → Chat sync)
func initChatBridge() {
	if chatStore == nil {
		log.Printf("[ChatBridge] Cannot init: chat store not available")
		return
	}
	chatBridge = chat.NewBridge(chatStore)
	log.Printf("[ChatBridge] Initialized - terminal events will sync to chat")
}

// handleChatMessages handles GET /api/chat/messages
func handleChatMessages(w http.ResponseWriter, r *http.Request) {
	if chatStore == nil {
		http.Error(w, "Chat store not initialized", http.StatusServiceUnavailable)
		return
	}

	switch r.Method {
	case http.MethodGet:
		// Get recent messages
		limitStr := r.URL.Query().Get("limit")
		limit := 100
		if limitStr != "" {
			if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
				limit = l
			}
		}

		sinceStr := r.URL.Query().Get("since")
		var since time.Time
		if sinceStr != "" {
			if t, err := time.Parse(time.RFC3339, sinceStr); err == nil {
				since = t
			}
		}

		var messages []chat.Message
		var err error
		if !since.IsZero() {
			messages, err = chatStore.GetMessages(since, limit)
		} else {
			messages, err = chatStore.GetRecentMessages(limit)
		}

		if err != nil {
			log.Printf("[Chat API] Error getting messages: %v", err)
			http.Error(w, "Failed to get messages", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"messages": messages,
			"count":    len(messages),
		})

	case http.MethodPost:
		// Add new message
		var msg chat.Message
		if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		if err := chatStore.AddMessage(msg); err != nil {
			log.Printf("[Chat API] Error adding message: %v", err)
			http.Error(w, "Failed to add message", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"id":      msg.ID,
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleChatSearch handles GET /api/chat/search
func handleChatSearch(w http.ResponseWriter, r *http.Request) {
	if chatStore == nil {
		http.Error(w, "Chat store not initialized", http.StatusServiceUnavailable)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "Query parameter 'q' required", http.StatusBadRequest)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	messages, err := chatStore.Search(query, limit)
	if err != nil {
		log.Printf("[Chat API] Search error: %v", err)
		http.Error(w, "Search failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"query":    query,
		"messages": messages,
		"count":    len(messages),
	})
}

// handleChatThread handles GET /api/chat/thread/{id}
func handleChatThread(w http.ResponseWriter, r *http.Request) {
	if chatStore == nil {
		http.Error(w, "Chat store not initialized", http.StatusServiceUnavailable)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract thread ID from path
	threadID := r.URL.Path[len("/api/chat/thread/"):]
	if threadID == "" {
		http.Error(w, "Thread ID required", http.StatusBadRequest)
		return
	}

	messages, err := chatStore.GetThread(threadID)
	if err != nil {
		log.Printf("[Chat API] Thread error: %v", err)
		http.Error(w, "Failed to get thread", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"threadId": threadID,
		"messages": messages,
		"count":    len(messages),
	})
}

// handleChatWorkers handles /api/chat/workers
func handleChatWorkers(w http.ResponseWriter, r *http.Request) {
	if chatStore == nil {
		http.Error(w, "Chat store not initialized", http.StatusServiceUnavailable)
		return
	}

	switch r.Method {
	case http.MethodGet:
		workers, err := chatStore.GetWorkers()
		if err != nil {
			log.Printf("[Chat API] Error getting workers: %v", err)
			http.Error(w, "Failed to get workers", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"workers": workers,
			"count":   len(workers),
		})

	case http.MethodPost:
		var worker chat.Worker
		if err := json.NewDecoder(r.Body).Decode(&worker); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		if worker.CreatedAt.IsZero() {
			worker.CreatedAt = time.Now()
		}
		worker.LastActive = time.Now()

		if err := chatStore.RegisterWorker(worker); err != nil {
			log.Printf("[Chat API] Error registering worker: %v", err)
			http.Error(w, "Failed to register worker", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"worker":  worker,
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleChatContext handles GET /api/chat/context - for SLM to get conversation context
func handleChatContext(w http.ResponseWriter, r *http.Request) {
	if chatStore == nil {
		http.Error(w, "Chat store not initialized", http.StatusServiceUnavailable)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	hoursStr := r.URL.Query().Get("hours")
	hours := 24
	if hoursStr != "" {
		if h, err := strconv.Atoi(hoursStr); err == nil && h > 0 {
			hours = h
		}
	}

	maxTokensStr := r.URL.Query().Get("maxTokens")
	maxTokens := 4000
	if maxTokensStr != "" {
		if t, err := strconv.Atoi(maxTokensStr); err == nil && t > 0 {
			maxTokens = t
		}
	}

	context, err := chatStore.GetContextForSLM(hours, maxTokens)
	if err != nil {
		log.Printf("[Chat API] Error getting context: %v", err)
		http.Error(w, "Failed to get context", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"context":       context,
		"hours":         hours,
		"maxTokens":     maxTokens,
		"estimatedTokens": len(context) / 4,
	})
}

// handleChatImageUpload handles POST /api/chat/images
func handleChatImageUpload(w http.ResponseWriter, r *http.Request) {
	if chatStore == nil {
		http.Error(w, "Chat store not initialized", http.StatusServiceUnavailable)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form (max 10MB)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "No image file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Failed to read image", http.StatusInternalServerError)
		return
	}

	filename, err := chatStore.SaveImage(header.Filename, data)
	if err != nil {
		log.Printf("[Chat API] Error saving image: %v", err)
		http.Error(w, "Failed to save image", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"filename": filename,
		"url":      "/api/chat/images/" + filename,
		"size":     len(data),
	})
}

// handleChatImageServe handles GET /api/chat/images/{filename}
func handleChatImageServe(w http.ResponseWriter, r *http.Request) {
	if chatStore == nil {
		http.Error(w, "Chat store not initialized", http.StatusServiceUnavailable)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	filename := r.URL.Path[len("/api/chat/images/"):]
	if filename == "" {
		http.Error(w, "Filename required", http.StatusBadRequest)
		return
	}

	// Security: prevent path traversal
	if len(filename) > 100 || filename[0] == '.' || filename[0] == '/' {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	http.ServeFile(w, r, chatStore.GetImagesDir()+"/"+filename)
}

// WebSocket upgrader for real-time chat
var chatUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for local dev
	},
}

// handleChatWebSocket handles WebSocket connections for real-time updates
func handleChatWebSocket(w http.ResponseWriter, r *http.Request) {
	if chatStore == nil {
		http.Error(w, "Chat store not initialized", http.StatusServiceUnavailable)
		return
	}

	conn, err := chatUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Chat WS] Upgrade error: %v", err)
		return
	}
	defer conn.Close()

	connID := fmt.Sprintf("ws-%d", time.Now().UnixNano())
	msgChan := chatStore.Subscribe(connID)
	defer chatStore.Unsubscribe(connID)

	log.Printf("[Chat WS] Client connected: %s", connID)

	// Send initial recent messages
	messages, err := chatStore.GetRecentMessages(50)
	if err == nil {
		for _, msg := range messages {
			data, _ := json.Marshal(map[string]interface{}{
				"type":    "message",
				"message": msg,
			})
			conn.WriteMessage(websocket.TextMessage, data)
		}
	}

	// Read messages from client in a goroutine
	go func() {
		for {
			_, msgData, err := conn.ReadMessage()
			if err != nil {
				log.Printf("[Chat WS] Read error: %v", err)
				return
			}

			var incoming struct {
				Type    string       `json:"type"`
				Message chat.Message `json:"message"`
			}

			if err := json.Unmarshal(msgData, &incoming); err != nil {
				continue
			}

			if incoming.Type == "message" {
				if err := chatStore.AddMessage(incoming.Message); err != nil {
					log.Printf("[Chat WS] Error adding message: %v", err)
				}
			}
		}
	}()

	// Send new messages to client
	for msg := range msgChan {
		data, err := json.Marshal(map[string]interface{}{
			"type":    "message",
			"message": msg,
		})
		if err != nil {
			continue
		}

		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("[Chat WS] Write error: %v", err)
			return
		}
	}
}
