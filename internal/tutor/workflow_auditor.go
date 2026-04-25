package tutor

import (
	"log"
	"os"
	"path/filepath"
	"strings"
)

// WorkflowAuditContext holds Forge Workflow information that the tutor
// uses to augment explanations with quality audit feedback.
type WorkflowAuditContext struct {
	// WorkflowActive is true when the project has a .forge/workflow.json
	WorkflowActive bool
	// QualityMode is "best" or "fast"
	QualityMode string
	// AuditNaming tells the tutor to flag single-letter or non-descriptive names
	AuditNaming bool
	// AuditComments tells the tutor to flag missing/unclear comments
	AuditComments bool
	// AuditReadability tells the tutor to flag complex or hard-to-read code
	AuditReadability bool
}

// DetectWorkflowContext reads the project's .forge/workflow.json (if it exists)
// and builds a WorkflowAuditContext. If the file doesn't exist, returns an
// empty context with WorkflowActive = false.
func DetectWorkflowContext(projectPath string) WorkflowAuditContext {
	workflowPath := filepath.Join(projectPath, ".forge", "workflow.json")

	data, err := os.ReadFile(workflowPath)
	if err != nil {
		return WorkflowAuditContext{WorkflowActive: false}
	}

	// Simple JSON field extraction — avoids importing the workflow package
	// (which would create a circular dependency).
	content := string(data)

	context := WorkflowAuditContext{
		WorkflowActive:   true,
		QualityMode:      extractJSONField(content, "qualityMode"),
		AuditNaming:      true,
		AuditComments:    true,
		AuditReadability: true,
	}

	// Check if code-quality module is enabled (simple string search)
	if !strings.Contains(content, "code-quality") {
		context.AuditNaming = false
		context.AuditComments = false
		context.AuditReadability = false
	}

	log.Printf("[Tutor Auditor] Detected workflow context: active=%v mode=%s",
		context.WorkflowActive, context.QualityMode)

	return context
}

// BuildAuditPromptSection returns additional prompt instructions that tell
// the LLM to include quality audit findings in its explanation.
// Returns an empty string if workflow auditing is not active.
func BuildAuditPromptSection(auditContext WorkflowAuditContext) string {
	if !auditContext.WorkflowActive {
		return ""
	}

	var promptSection strings.Builder

	promptSection.WriteString("\n## Quality Audit (Forge Workflow)\n")
	promptSection.WriteString("This project has an active Forge Workflow. ")
	promptSection.WriteString("In addition to your normal explanation, add a final section:\n\n")
	promptSection.WriteString("## Quality Audit\n")
	promptSection.WriteString("Review the code against these enterprise standards and flag any findings:\n\n")

	if auditContext.AuditNaming {
		promptSection.WriteString("### Naming Standards\n")
		promptSection.WriteString("- Flag any single-letter variables (except i, j, k in loops, w/r for HTTP handlers, _ for unused)\n")
		promptSection.WriteString("- Flag abbreviations that aren't universally understood (e.g., 'cfg' is OK, 'sm' is not)\n")
		promptSection.WriteString("- Booleans should use is/has/can/should prefix\n")
		promptSection.WriteString("- Functions should start with a verb\n")
		promptSection.WriteString("- Use descriptive names: 'lastName' not 'x', 'sessionManager' not 'sm'\n")
		promptSection.WriteString("- Mark good names with ✅ and violations with ⚠️\n\n")
	}

	if auditContext.AuditComments {
		promptSection.WriteString("### Comment Quality\n")
		promptSection.WriteString("- Flag non-obvious logic that lacks a comment\n")
		promptSection.WriteString("- Comments should be readable by non-developers (explain WHY, not WHAT)\n")
		promptSection.WriteString("- Flag any magic numbers or strings without explanation\n")
		promptSection.WriteString("- Mark good comments with ✅ and missing/poor comments with ⚠️\n\n")
	}

	if auditContext.AuditReadability {
		promptSection.WriteString("### Readability\n")
		promptSection.WriteString("- Flag functions longer than 40 lines\n")
		promptSection.WriteString("- Flag deeply nested logic (>3 levels)\n")
		promptSection.WriteString("- Flag complex boolean expressions without named variables\n")
		promptSection.WriteString("- Suggest improvements for any readability concerns\n\n")
	}

	promptSection.WriteString("Format each finding as:\n")
	promptSection.WriteString("- ⚠️ **Category** (line N): Description of the issue and suggested fix\n")
	promptSection.WriteString("- ✅ **Category**: Description of what's done well\n")
	promptSection.WriteString("\nIf there are no findings, say: \"✅ All quality checks pass — this file meets enterprise standards.\"\n")

	return promptSection.String()
}

// extractJSONField does a simple string-based extraction of a JSON field value.
// This avoids importing encoding/json for a lightweight operation.
func extractJSONField(jsonContent string, fieldName string) string {
	searchKey := `"` + fieldName + `"`
	keyIndex := strings.Index(jsonContent, searchKey)
	if keyIndex == -1 {
		return ""
	}

	// Find the colon after the key
	afterKey := jsonContent[keyIndex+len(searchKey):]
	colonIndex := strings.Index(afterKey, ":")
	if colonIndex == -1 {
		return ""
	}

	// Find the value (between quotes)
	afterColon := afterKey[colonIndex+1:]
	firstQuote := strings.Index(afterColon, `"`)
	if firstQuote == -1 {
		return ""
	}
	afterFirstQuote := afterColon[firstQuote+1:]
	endQuote := strings.Index(afterFirstQuote, `"`)
	if endQuote == -1 {
		return ""
	}

	return afterFirstQuote[:endQuote]
}
