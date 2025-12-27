/**
 * AM (Artificial Memory) Session Recovery Types
 * 
 * These types support the v2 session-based recovery system
 * which provides project-organized, human-readable session storage.
 */

/**
 * Session status enum
 */
export const SessionStatus = {
  ACTIVE: 'active',
  COMPLETE: 'complete',
  CRASHED: 'crashed',
  RECOVERED: 'recovered',
};

/**
 * Project context for a session
 */
export interface ProjectContext {
  name: string;          // e.g., "forge-terminal"
  path: string;          // e.g., "/home/user/projects/forge-terminal"
  gitBranch?: string;    // e.g., "main"
  gitRemote?: string;    // e.g., "github.com/user/repo"
}

/**
 * Session summary for UI display
 */
export interface SessionSummary {
  id: string;
  project: string;
  provider: string;
  startTime: string;     // ISO 8601
  duration: number;      // nanoseconds
  turnCount: number;
  lastTopic: string;     // First 100 chars of last user message
  recoveryPrompt: string;
  status: 'active' | 'complete' | 'crashed' | 'recovered';
}

/**
 * Project summary for grouped display
 */
export interface ProjectSummary {
  name: string;
  path: string;
  sessionCount: number;
  lastActivity: string;  // ISO 8601
  recoverCount: number;  // Sessions needing recovery
  recentSessions: SessionSummary[];
}

/**
 * Full session data (for detailed view)
 */
export interface Session {
  id: string;
  tabId: string;
  project: ProjectContext;
  startTime: string;
  endTime?: string;
  provider?: string;
  turns: ConversationTurn[];
  rawCaptures?: RawCapture[];
  recoveryPrompt?: string;
  status: 'active' | 'complete' | 'crashed' | 'recovered';
}

/**
 * Conversation turn in a session
 */
export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  provider?: string;
  captureMethod?: string;
  parseConfidence?: number;
}

/**
 * Raw PTY capture reference
 */
export interface RawCapture {
  timestamp: string;
  contentHash: string;
  byteOffset: number;
  byteLength: number;
}

/**
 * WebSocket event for real-time updates
 */
export interface AMSessionEvent {
  type: 'AM_SESSION_START' | 'AM_SESSION_END' | 'AM_TURN_CAPTURED' | 'AM_SNAPSHOT_SAVED';
  sessionId: string;
  tabId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Recovery state for crash detection
 */
export interface RecoveryState {
  hasRecoverableSessions: boolean;
  sessions: SessionSummary[];
  projects: ProjectSummary[];
}

/**
 * API response types
 */
export interface SessionsResponse {
  success: boolean;
  sessions: SessionSummary[];
  count: number;
  error?: string;
}

export interface ProjectsResponse {
  success: boolean;
  projects: ProjectSummary[];
  count: number;
  error?: string;
}

export interface SessionDetailResponse {
  success: boolean;
  session?: SessionSummary;
  error?: string;
}
