package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/tutor"
)

var (
	tutorSessionMgr *tutor.SessionManager
	tutorExplainer  *tutor.Explainer
	tutorWatchers   = make(map[string]*tutor.Watcher) // sessionID → watcher
	tutorMu         sync.Mutex
)

func initTutor() {
	tutorSessionMgr = tutor.NewSessionManager()
	tutorExplainer = tutor.NewExplainer()
}

// handleTutorSessions handles POST (create), GET (list), DELETE (remove) for tutor sessions.
func handleTutorSessions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		var req struct {
			ProjectPath string `json:"projectPath"`
			Mode        string `json:"mode"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON request", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.ProjectPath) == "" {
			http.Error(w, "projectPath is required", http.StatusBadRequest)
			return
		}

		mode := tutor.ModeOnDemand
		if req.Mode == "live" {
			mode = tutor.ModeLive
		}

		log.Printf("[Tutor API] Scanning project: %s", req.ProjectPath)
		learningPath, err := tutor.ScanProject(req.ProjectPath)
		if err != nil {
			log.Printf("[Tutor API] Error scanning project: %v", err)
			http.Error(w, "Failed to scan project: "+err.Error(), http.StatusInternalServerError)
			return
		}

		session, err := tutorSessionMgr.CreateSession(req.ProjectPath, learningPath, mode)
		if err != nil {
			log.Printf("[Tutor API] Error creating session: %v", err)
			http.Error(w, "Failed to create session: "+err.Error(), http.StatusInternalServerError)
			return
		}

		if mode == tutor.ModeLive {
			tutorMu.Lock()
			watcher := tutor.NewWatcher(req.ProjectPath, session.ID)
			if err := watcher.Start(); err != nil {
				log.Printf("[Tutor API] Warning: failed to start watcher: %v", err)
			} else {
				tutorWatchers[session.ID] = watcher
				log.Printf("[Tutor API] Started watcher for session %s", session.ID)
			}
			tutorMu.Unlock()
		}

		log.Printf("[Tutor API] Created session %s with %d files", session.ID, len(learningPath.Files))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(session)

	case http.MethodGet:
		sessions := tutorSessionMgr.ListSessions()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sessions)

	case http.MethodDelete:
		sessionID := r.URL.Query().Get("id")
		if sessionID == "" {
			http.Error(w, "Query parameter 'id' is required", http.StatusBadRequest)
			return
		}

		tutorMu.Lock()
		if watcher, ok := tutorWatchers[sessionID]; ok {
			watcher.Stop()
			delete(tutorWatchers, sessionID)
			log.Printf("[Tutor API] Stopped watcher for session %s", sessionID)
		}
		tutorMu.Unlock()

		if err := tutorSessionMgr.DeleteSession(sessionID); err != nil {
			log.Printf("[Tutor API] Error deleting session %s: %v", sessionID, err)
			http.Error(w, "Failed to delete session: "+err.Error(), http.StatusNotFound)
			return
		}

		log.Printf("[Tutor API] Deleted session %s", sessionID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Session deleted",
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleTutorSession returns a specific session by ID extracted from the URL path.
func handleTutorSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionID := strings.TrimPrefix(r.URL.Path, "/api/tutor/sessions/")
	if sessionID == "" {
		http.Error(w, "Session ID is required", http.StatusBadRequest)
		return
	}

	session, err := tutorSessionMgr.GetSession(sessionID)
	if err != nil {
		log.Printf("[Tutor API] Session not found: %s: %v", sessionID, err)
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session)
}

// handleTutorNavigate handles session navigation (next, prev, skip, goto).
func handleTutorNavigate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		SessionID string `json:"sessionId"`
		Action    string `json:"action"`
		Index     int    `json:"index"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}
	if req.SessionID == "" {
		http.Error(w, "sessionId is required", http.StatusBadRequest)
		return
	}

	var session *tutor.TutorSession
	var err error

	switch req.Action {
	case "next":
		session, err = tutorSessionMgr.Advance(req.SessionID)
	case "prev":
		session, err = tutorSessionMgr.GoBack(req.SessionID)
	case "skip":
		session, err = tutorSessionMgr.Skip(req.SessionID)
	case "goto":
		session, err = tutorSessionMgr.GoTo(req.SessionID, req.Index)
	default:
		http.Error(w, "Invalid action: must be next, prev, skip, or goto", http.StatusBadRequest)
		return
	}

	if err != nil {
		log.Printf("[Tutor API] Navigation error (%s): %v", req.Action, err)
		http.Error(w, "Navigation failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("[Tutor API] Session %s navigated: %s → index %d", req.SessionID, req.Action, session.CurrentIndex)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session)
}

// handleTutorExplain generates an explanation for the current file in a session.
func handleTutorExplain(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		SessionID string `json:"sessionId"`
		// Question is optional — when present, AnswerQuestion is called instead of ExplainFile.
		Question string `json:"question"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}
	if req.SessionID == "" {
		http.Error(w, "sessionId is required", http.StatusBadRequest)
		return
	}

	session, err := tutorSessionMgr.GetSession(req.SessionID)
	if err != nil {
		log.Printf("[Tutor API] Session not found for explain: %v", err)
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	if session.CurrentIndex < 0 || session.CurrentIndex >= len(session.LearningPath.Files) {
		http.Error(w, "Current file index is out of range", http.StatusBadRequest)
		return
	}

	entry := session.LearningPath.Files[session.CurrentIndex]

	var explanation *tutor.FileExplanation

	if strings.TrimSpace(req.Question) != "" {
		// Route to focused question-answering — not cached, tailored to the specific question.
		log.Printf("[Tutor API] Answering question about %s: %q", entry.Path, req.Question)
		explanation, err = tutorExplainer.AnswerQuestion(
			context.Background(),
			session.ProjectPath,
			entry,
			session.LearningPath,
			session.Settings.Depth,
			req.Question,
		)
	} else {
		// Standard file explanation — cached by content hash + depth.
		var reviewedFiles []string
		for path, status := range session.Progress {
			if status == tutor.StatusReviewed {
				reviewedFiles = append(reviewedFiles, path)
			}
		}
		log.Printf("[Tutor API] Explaining file: %s (depth=%s, naming=%s)", entry.Path, session.Settings.Depth, session.Settings.NamingReview)
		explanation, err = tutorExplainer.ExplainFile(
			context.Background(),
			session.ProjectPath,
			entry,
			session.LearningPath,
			session.Settings.Depth,
			session.Settings.NamingReview,
			reviewedFiles,
		)
	}

	if err != nil {
		log.Printf("[Tutor API] Error explaining %s: %v", entry.Path, err)
		http.Error(w, "Failed to explain file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(explanation)
}

// handleTutorLearningPath previews a learning path without creating a session.
func handleTutorLearningPath(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ProjectPath string `json:"projectPath"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.ProjectPath) == "" {
		http.Error(w, "projectPath is required", http.StatusBadRequest)
		return
	}

	log.Printf("[Tutor API] Generating learning path preview for: %s", req.ProjectPath)
	learningPath, err := tutor.ScanProject(req.ProjectPath)
	if err != nil {
		log.Printf("[Tutor API] Error scanning project: %v", err)
		http.Error(w, "Failed to scan project: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(learningPath)
}

// handleTutorSettings handles GET (read) and PUT (update) for tutor settings.
func handleTutorSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		sessionID := r.URL.Query().Get("sessionId")
		if sessionID != "" {
			session, err := tutorSessionMgr.GetSession(sessionID)
			if err != nil {
				log.Printf("[Tutor API] Session not found for settings: %v", err)
				http.Error(w, "Session not found", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(session.Settings)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(tutor.DefaultSettings())

	case http.MethodPut:
		var req struct {
			SessionID string              `json:"sessionId"`
			Settings  tutor.TutorSettings `json:"settings"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON request", http.StatusBadRequest)
			return
		}
		if req.SessionID == "" {
			http.Error(w, "sessionId is required", http.StatusBadRequest)
			return
		}

		// Get old settings to detect live mode changes
		session, err := tutorSessionMgr.GetSession(req.SessionID)
		if err != nil {
			log.Printf("[Tutor API] Session not found for settings update: %v", err)
			http.Error(w, "Session not found", http.StatusNotFound)
			return
		}
		oldLiveMode := session.Settings.LiveMode

		if err := tutorSessionMgr.UpdateSettings(req.SessionID, req.Settings); err != nil {
			log.Printf("[Tutor API] Error updating settings: %v", err)
			http.Error(w, "Failed to update settings: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Handle live mode toggle
		tutorMu.Lock()
		if req.Settings.LiveMode && !oldLiveMode {
			if _, exists := tutorWatchers[req.SessionID]; !exists {
				watcher := tutor.NewWatcher(session.ProjectPath, req.SessionID)
				if err := watcher.Start(); err != nil {
					log.Printf("[Tutor API] Warning: failed to start watcher: %v", err)
				} else {
					tutorWatchers[req.SessionID] = watcher
					log.Printf("[Tutor API] Started watcher for session %s (live mode enabled)", req.SessionID)
				}
			}
		} else if !req.Settings.LiveMode && oldLiveMode {
			if watcher, exists := tutorWatchers[req.SessionID]; exists {
				watcher.Stop()
				delete(tutorWatchers, req.SessionID)
				log.Printf("[Tutor API] Stopped watcher for session %s (live mode disabled)", req.SessionID)
			}
		}
		tutorMu.Unlock()

		log.Printf("[Tutor API] Updated settings for session %s", req.SessionID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":  true,
			"settings": req.Settings,
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleTutorWatcher polls for file-change notifications from a session watcher.
func handleTutorWatcher(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		http.Error(w, "Query parameter 'sessionId' is required", http.StatusBadRequest)
		return
	}

	tutorMu.Lock()
	watcher, exists := tutorWatchers[sessionID]
	tutorMu.Unlock()

	if !exists || !watcher.IsActive() {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]tutor.WatcherNotification{})
		return
	}

	// Non-blocking read with 100ms timeout
	var notifications []tutor.WatcherNotification
	timeout := time.After(100 * time.Millisecond)
	for {
		select {
		case notification := <-watcher.Notifications():
			notifications = append(notifications, notification)
		case <-timeout:
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(notifications)
			return
		}
	}
}
