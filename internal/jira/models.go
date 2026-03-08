package jira

// Issue represents a Jira issue.
type Issue struct {
	ID     string      `json:"id"`
	Key    string      `json:"key"`
	Self   string      `json:"self,omitempty"`
	Fields IssueFields `json:"fields"`
}

// IssueFields holds the field data of a Jira issue.
type IssueFields struct {
	Summary     string      `json:"summary"`
	Description interface{} `json:"description,omitempty"` // string (server) or ADF doc (cloud)
	Status      *Status     `json:"status,omitempty"`
	Priority    *Priority   `json:"priority,omitempty"`
	IssueType   *IssueType  `json:"issuetype,omitempty"`
	Assignee    *User       `json:"assignee,omitempty"`
	Reporter    *User       `json:"reporter,omitempty"`
	Labels      []string    `json:"labels,omitempty"`
	Project     *ProjectRef `json:"project,omitempty"`
	StoryPoints *float64    `json:"story_points,omitempty"`
	Created     string      `json:"created,omitempty"`
	Updated     string      `json:"updated,omitempty"`
}

// Status represents a Jira issue status.
type Status struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Priority represents a Jira issue priority.
type Priority struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// IssueType represents a Jira issue type.
type IssueType struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// User represents a Jira user.
type User struct {
	AccountID   string `json:"accountId,omitempty"`
	Name        string `json:"name,omitempty"`
	DisplayName string `json:"displayName"`
	EmailAddress string `json:"emailAddress,omitempty"`
}

// ProjectRef is the minimal project reference embedded in issues.
type ProjectRef struct {
	ID   string `json:"id"`
	Key  string `json:"key"`
	Name string `json:"name"`
}

// Project represents a full Jira project.
type Project struct {
	ID   string `json:"id"`
	Key  string `json:"key"`
	Name string `json:"name"`
	Self string `json:"self,omitempty"`
}

// Comment represents a single comment on a Jira issue.
type Comment struct {
	ID      string `json:"id,omitempty"`
	Author  *User  `json:"author,omitempty"`
	Body    interface{} `json:"body"` // string or ADF
	Created string `json:"created,omitempty"`
	Updated string `json:"updated,omitempty"`
}

// CommentsWrapper wraps the Jira comments list response.
type CommentsWrapper struct {
	Comments []Comment `json:"comments"`
	Total    int       `json:"total"`
}

// Transition represents an available Jira workflow transition.
type Transition struct {
	ID   string          `json:"id"`
	Name string          `json:"name"`
	To   *Status         `json:"to,omitempty"`
}

// TransitionsWrapper wraps the Jira transitions response.
type TransitionsWrapper struct {
	Transitions []Transition `json:"transitions"`
}

// SearchResult is the response from /rest/api/2/search.
type SearchResult struct {
	Total  int     `json:"total"`
	Issues []Issue `json:"issues"`
}

// CreateIssueRequest is the body for creating a new issue.
type CreateIssueRequest struct {
	Fields CreateIssueFields `json:"fields"`
}

// CreateIssueFields contains the fields needed to create an issue.
type CreateIssueFields struct {
	Summary     string      `json:"summary"`
	Description interface{} `json:"description,omitempty"`
	Project     ProjectRef  `json:"project"`
	IssueType   IssueType   `json:"issuetype"`
	Priority    *Priority   `json:"priority,omitempty"`
	Labels      []string    `json:"labels,omitempty"`
}

// UpdateIssueRequest is the body for updating issue fields.
type UpdateIssueRequest struct {
	Fields map[string]interface{} `json:"fields"`
}

// AddCommentRequest is the body for adding a comment.
type AddCommentRequest struct {
	Body interface{} `json:"body"`
}

// TransitionRequest is the body for executing a transition.
type TransitionRequest struct {
	Transition struct {
		ID string `json:"id"`
	} `json:"transition"`
}
