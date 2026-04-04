// handlers_mcp.go implements the HTTP endpoint for the Forge Workflow MCP server.
//
// Copilot CLI connects to this endpoint as an MCP server, giving agents access
// to workflow-enforcement tools and resources. The endpoint uses the Streamable
// HTTP transport defined in the MCP specification (2024-11-05).
//
// Agents configure this server in their .agent.md frontmatter:
//
//	mcp-servers:
//	  forge-workflow:
//	    type: http
//	    url: http://localhost:3005/api/mcp
package main

import (
	"io"
	"log"
	"net/http"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
)

// handleMCP serves the Forge Workflow MCP server over HTTP.
//
// All MCP requests are POST requests with a JSON-RPC 2.0 body.
// The project path is taken from the ?path= query parameter, falling back to
// the server's working directory. This allows multi-project support without
// requiring separate server instances.
func handleMCP(responseWriter http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost && request.Method != http.MethodGet {
		http.Error(responseWriter, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// GET requests return server metadata (useful for health checks and discovery).
	if request.Method == http.MethodGet {
		responseWriter.Header().Set("Content-Type", "application/json")
		responseWriter.WriteHeader(http.StatusOK)
		responseWriter.Write([]byte(`{"name":"forge-workflow","version":"1.0.0","protocol":"mcp/2024-11-05"}`))
		return
	}

	// Resolve the project path: query param > current working directory.
	projectPath := request.URL.Query().Get("path")
	if projectPath == "" {
		projectPath = "."
	}

	rawRequestBody, err := io.ReadAll(request.Body)
	if err != nil {
		http.Error(responseWriter, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer request.Body.Close()

	mcpServer := mcp.NewServer(projectPath)
	rawResponse, err := mcpServer.HandleRequest(rawRequestBody)
	if err != nil {
		log.Printf("[MCP] Server error: %v", err)
		http.Error(responseWriter, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Notifications return no response body (nil from HandleRequest).
	if rawResponse == nil {
		responseWriter.WriteHeader(http.StatusNoContent)
		return
	}

	responseWriter.Header().Set("Content-Type", "application/json")
	responseWriter.WriteHeader(http.StatusOK)
	responseWriter.Write(rawResponse)
}
