package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/mikejsmith1985/forge-terminal/internal/jira"
)

// handleJiraConfig handles GET /api/jira/config and POST /api/jira/config.
func handleJiraConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		cfg, err := jira.LoadConfig()
		if err != nil {
			log.Printf("[Jira] Failed to load config: %v", err)
			http.Error(w, `{"error":"failed to load config"}`, http.StatusInternalServerError)
			return
		}
		// Never send the raw token to the client — send a masked version.
		safe := *cfg
		if safe.APIToken != "" {
			safe.APIToken = "••••••••"
		}
		json.NewEncoder(w).Encode(safe)

	case http.MethodPost:
		var incoming jira.Config
		if err := json.NewDecoder(r.Body).Decode(&incoming); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		// If the client sends the masked token placeholder, keep the existing token.
		if incoming.APIToken == "••••••••" || incoming.APIToken == "" {
			existing, _ := jira.LoadConfig()
			if existing != nil {
				incoming.APIToken = existing.APIToken
			}
		}

		if err := jira.SaveConfig(&incoming); err != nil {
			log.Printf("[Jira] Failed to save config: %v", err)
			http.Error(w, `{"error":"failed to save config"}`, http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]bool{"success": true})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleJiraConfigVerify handles POST /api/jira/config/verify.
func handleJiraConfigVerify(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	cfg, err := jira.LoadConfig()
	if err != nil || !cfg.IsConfigured() {
		http.Error(w, `{"error":"Jira is not configured"}`, http.StatusBadRequest)
		return
	}

	client := jira.NewClient(cfg)
	count, err := client.Verify()
	if err != nil {
		log.Printf("[Jira] Verify failed: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"projectCount": count,
	})
}

// handleJiraIssue routes /api/jira/issue/* requests.
func handleJiraIssue(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	cfg, err := jira.LoadConfig()
	if err != nil || !cfg.IsConfigured() {
		http.Error(w, `{"error":"Jira is not configured"}`, http.StatusBadRequest)
		return
	}
	client := jira.NewClient(cfg)

	// Parse the key and optional sub-resource from the URL path.
	// Expected formats: /api/jira/issue/{key}  or  /api/jira/issue/{key}/comment|transition|transitions
	path := strings.TrimPrefix(r.URL.Path, "/api/jira/issue/")
	parts := strings.SplitN(path, "/", 2)
	key := parts[0]
	sub := ""
	if len(parts) == 2 {
		sub = parts[1]
	}

	switch {
	// POST /api/jira/issue (no key) → create
	case key == "" || (r.Method == http.MethodPost && sub == ""):
		var req jira.CreateIssueRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}
		if req.Fields.Project.Key == "" {
			req.Fields.Project.Key = cfg.DefaultProjectKey
		}
		if req.Fields.Project.Key == "" {
			http.Error(w, `{"error":"No project key — set a Default Project in Settings → Jira, or enter a project key in the create form."}`, http.StatusBadRequest)
			return
		}
		issue, err := client.CreateIssue(&req)
		if err != nil {
			log.Printf("[Jira] CreateIssue failed: %v", err)
			http.Error(w, jsonError(err.Error()), http.StatusBadGateway)
			return
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(issue)

	// GET /api/jira/issue/{key}
	case r.Method == http.MethodGet && sub == "":
		issue, err := client.GetIssue(key)
		if err != nil {
			log.Printf("[Jira] GetIssue %s failed: %v", key, err)
			http.Error(w, jsonError(err.Error()), http.StatusBadGateway)
			return
		}
		json.NewEncoder(w).Encode(issue)

	// PATCH /api/jira/issue/{key}
	case r.Method == http.MethodPatch && sub == "":
		var fields map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&fields); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}
		if err := client.UpdateIssue(key, fields); err != nil {
			log.Printf("[Jira] UpdateIssue %s failed: %v", key, err)
			http.Error(w, jsonError(err.Error()), http.StatusBadGateway)
			return
		}
		json.NewEncoder(w).Encode(map[string]bool{"success": true})

	// GET /api/jira/issue/{key}/transitions
	case r.Method == http.MethodGet && sub == "transitions":
		transitions, err := client.GetTransitions(key)
		if err != nil {
			log.Printf("[Jira] GetTransitions %s failed: %v", key, err)
			http.Error(w, jsonError(err.Error()), http.StatusBadGateway)
			return
		}
		json.NewEncoder(w).Encode(transitions)

	// POST /api/jira/issue/{key}/transition
	case r.Method == http.MethodPost && sub == "transition":
		var body struct {
			TransitionID string `json:"transitionId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}
		if err := client.DoTransition(key, body.TransitionID); err != nil {
			log.Printf("[Jira] DoTransition %s failed: %v", key, err)
			http.Error(w, jsonError(err.Error()), http.StatusBadGateway)
			return
		}
		json.NewEncoder(w).Encode(map[string]bool{"success": true})

	// POST /api/jira/issue/{key}/comment
	case r.Method == http.MethodPost && sub == "comment":
		var body struct {
			Body string `json:"body"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}
		comment, err := client.AddComment(key, body.Body)
		if err != nil {
			log.Printf("[Jira] AddComment %s failed: %v", key, err)
			http.Error(w, jsonError(err.Error()), http.StatusBadGateway)
			return
		}
		json.NewEncoder(w).Encode(comment)

	default:
		http.Error(w, "Not found", http.StatusNotFound)
	}
}

// handleJiraProjects handles GET /api/jira/projects.
func handleJiraProjects(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	cfg, err := jira.LoadConfig()
	if err != nil || !cfg.IsConfigured() {
		http.Error(w, `{"error":"Jira is not configured"}`, http.StatusBadRequest)
		return
	}
	client := jira.NewClient(cfg)

	projects, err := client.ListProjects()
	if err != nil {
		log.Printf("[Jira] ListProjects failed: %v", err)
		http.Error(w, jsonError(err.Error()), http.StatusBadGateway)
		return
	}
	json.NewEncoder(w).Encode(projects)
}

// handleJiraSearch handles GET /api/jira/search?jql=...
func handleJiraSearch(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	cfg, err := jira.LoadConfig()
	if err != nil || !cfg.IsConfigured() {
		http.Error(w, `{"error":"Jira is not configured"}`, http.StatusBadRequest)
		return
	}
	client := jira.NewClient(cfg)

	jql := r.URL.Query().Get("jql")
	if jql == "" {
		jql = "assignee = currentUser() ORDER BY updated DESC"
	}

	issues, total, err := client.Search(jql, 20)
	if err != nil {
		log.Printf("[Jira] Search failed: %v", err)
		http.Error(w, jsonError(err.Error()), http.StatusBadGateway)
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"issues": issues,
		"total":  total,
	})
}

// handleJiraSuggest handles GET /api/jira/suggest/branch?key=... and /api/jira/suggest/pr?key=...
func handleJiraSuggest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	cfg, err := jira.LoadConfig()
	if err != nil || !cfg.IsConfigured() {
		http.Error(w, `{"error":"Jira is not configured"}`, http.StatusBadRequest)
		return
	}
	client := jira.NewClient(cfg)

	key := r.URL.Query().Get("key")
	if key == "" {
		http.Error(w, `{"error":"key parameter required"}`, http.StatusBadRequest)
		return
	}

	issue, err := client.GetIssue(key)
	if err != nil {
		log.Printf("[Jira] Suggest: GetIssue %s failed: %v", key, err)
		http.Error(w, jsonError(err.Error()), http.StatusBadGateway)
		return
	}

	// Determine type: "branch" or "pr"
	suggestType := strings.TrimPrefix(r.URL.Path, "/api/jira/suggest/")
	switch suggestType {
	case "branch":
		suggestion := jira.SuggestBranch(issue, cfg.BranchTemplate)
		json.NewEncoder(w).Encode(map[string]string{
			"suggestion": suggestion,
			"key":        issue.Key,
			"summary":    issue.Fields.Summary,
		})
	case "pr":
		suggestion := jira.SuggestPR(issue, cfg.PRTemplate)
		json.NewEncoder(w).Encode(map[string]string{
			"suggestion": suggestion,
			"key":        issue.Key,
			"summary":    issue.Fields.Summary,
		})
	default:
		http.Error(w, `{"error":"unknown suggest type"}`, http.StatusNotFound)
	}
}

// jsonError returns a JSON-encoded error string.
func jsonError(msg string) string {
	b, _ := json.Marshal(map[string]string{"error": msg})
	return string(b)
}
