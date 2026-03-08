package jira

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Client is a thin Jira REST API v2 wrapper.
// It supports both Jira Cloud (email + API token, Basic auth) and
// Jira Server / Data Center (PAT, Bearer token).
type Client struct {
	cfg        *Config
	httpClient *http.Client
}

// NewClient creates a Client from the provided Config.
func NewClient(cfg *Config) *Client {
	return &Client{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// apiBase returns the Jira REST API v2 base URL.
func (c *Client) apiBase() string {
	base := strings.TrimRight(c.cfg.BaseURL, "/")
	return base + "/rest/api/2"
}

// do executes an authenticated HTTP request and decodes the JSON response into dest.
// Pass dest=nil to discard the response body.
func (c *Client) do(method, path string, body interface{}, dest interface{}) error {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("jira: marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.apiBase()+path, bodyReader)
	if err != nil {
		return fmt.Errorf("jira: create request: %w", err)
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")

	// Authentication
	switch c.cfg.AuthType {
	case AuthTypeCloud:
		// Basic auth: base64("email:apiToken")
		cred := base64.StdEncoding.EncodeToString([]byte(c.cfg.Email + ":" + c.cfg.APIToken))
		req.Header.Set("Authorization", "Basic "+cred)
	case AuthTypeServer:
		// Bearer token (PAT)
		req.Header.Set("Authorization", "Bearer "+c.cfg.APIToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("jira: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("jira: HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	if dest != nil {
		if err := json.NewDecoder(resp.Body).Decode(dest); err != nil {
			return fmt.Errorf("jira: decode response: %w", err)
		}
	}
	return nil
}

// Verify tests the connection by fetching the current user.
// Returns the number of accessible projects on success.
func (c *Client) Verify() (int, error) {
	var projects []Project
	if err := c.do("GET", "/project", nil, &projects); err != nil {
		return 0, err
	}
	return len(projects), nil
}

// GetIssue fetches a single issue by key (e.g., "PROJ-123").
func (c *Client) GetIssue(key string) (*Issue, error) {
	var issue Issue
	if err := c.do("GET", "/issue/"+url.PathEscape(key), nil, &issue); err != nil {
		return nil, err
	}
	return &issue, nil
}

// CreateIssue creates a new Jira issue.
func (c *Client) CreateIssue(req *CreateIssueRequest) (*Issue, error) {
	var created Issue
	if err := c.do("POST", "/issue", req, &created); err != nil {
		return nil, err
	}
	return &created, nil
}

// UpdateIssue updates fields on an existing issue.
func (c *Client) UpdateIssue(key string, fields map[string]interface{}) error {
	body := UpdateIssueRequest{Fields: fields}
	return c.do("PUT", "/issue/"+url.PathEscape(key), body, nil)
}

// AddComment adds a comment to an issue.
func (c *Client) AddComment(key, body string) (*Comment, error) {
	req := AddCommentRequest{Body: body}
	var comment Comment
	if err := c.do("POST", "/issue/"+url.PathEscape(key)+"/comment", req, &comment); err != nil {
		return nil, err
	}
	return &comment, nil
}

// GetTransitions returns available workflow transitions for an issue.
func (c *Client) GetTransitions(key string) ([]Transition, error) {
	var wrapper TransitionsWrapper
	if err := c.do("GET", "/issue/"+url.PathEscape(key)+"/transitions", nil, &wrapper); err != nil {
		return nil, err
	}
	return wrapper.Transitions, nil
}

// DoTransition executes a workflow transition on an issue.
func (c *Client) DoTransition(key, transitionID string) error {
	var body TransitionRequest
	body.Transition.ID = transitionID
	return c.do("POST", "/issue/"+url.PathEscape(key)+"/transitions", body, nil)
}

// ListProjects returns all projects accessible to the authenticated user.
func (c *Client) ListProjects() ([]Project, error) {
	var projects []Project
	if err := c.do("GET", "/project", nil, &projects); err != nil {
		return nil, err
	}
	return projects, nil
}

// Search runs a JQL query and returns matching issues.
func (c *Client) Search(jql string, maxResults int) ([]Issue, int, error) {
	if maxResults <= 0 {
		maxResults = 20
	}
	path := fmt.Sprintf("/search?jql=%s&maxResults=%d&fields=summary,status,priority,issuetype,assignee,project",
		url.QueryEscape(jql), maxResults)

	var result SearchResult
	if err := c.do("GET", path, nil, &result); err != nil {
		return nil, 0, err
	}
	return result.Issues, result.Total, nil
}

// keyPattern matches Jira issue keys like PROJ-123.
var keyPattern = regexp.MustCompile(`\b([A-Z]{2,10}-\d+)\b`)

// ExtractKeys finds all Jira issue key patterns in a string.
func ExtractKeys(text string) []string {
	matches := keyPattern.FindAllString(text, -1)
	// Deduplicate while preserving order.
	seen := make(map[string]bool)
	var unique []string
	for _, m := range matches {
		if !seen[m] {
			seen[m] = true
			unique = append(unique, m)
		}
	}
	return unique
}

// SuggestBranch generates a git branch name from an issue using the configured template.
func SuggestBranch(issue *Issue, template string) string {
	if template == "" {
		template = "{{type}}/{{key}}-{{slug}}"
	}
	issueType := "feature"
	if issue.Fields.IssueType != nil {
		switch strings.ToLower(issue.Fields.IssueType.Name) {
		case "bug", "defect":
			issueType = "fix"
		case "task", "sub-task":
			issueType = "task"
		case "epic":
			issueType = "epic"
		}
	}
	result := template
	result = strings.ReplaceAll(result, "{{type}}", issueType)
	result = strings.ReplaceAll(result, "{{key}}", strings.ToLower(issue.Key))
	result = strings.ReplaceAll(result, "{{KEY}}", issue.Key)
	result = strings.ReplaceAll(result, "{{slug}}", slugify(issue.Fields.Summary))
	return result
}

// SuggestPR generates a PR title from an issue using the configured template.
func SuggestPR(issue *Issue, template string) string {
	if template == "" {
		template = "{{key}}: {{summary}}"
	}
	result := template
	result = strings.ReplaceAll(result, "{{key}}", issue.Key)
	result = strings.ReplaceAll(result, "{{KEY}}", issue.Key)
	result = strings.ReplaceAll(result, "{{summary}}", issue.Fields.Summary)
	return result
}

// slugify converts a string to a URL-safe slug (lowercase, hyphens).
func slugify(s string) string {
	s = strings.ToLower(s)
	// Replace non-alphanumeric chars with hyphens.
	var b strings.Builder
	prevHyphen := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevHyphen = false
		} else if !prevHyphen {
			b.WriteRune('-')
			prevHyphen = true
		}
	}
	slug := strings.Trim(b.String(), "-")
	// Limit length to keep branch names manageable.
	const maxSlugLen = 40
	if len(slug) > maxSlugLen {
		slug = slug[:maxSlugLen]
		slug = strings.TrimRight(slug, "-")
	}
	return slug
}
