// The LG-Builder architecture diagram, and the observability layers beneath it.
//
// Read off the source rather than described from memory: every node name here
// is the literal string passed to `add_node` in workflow-poc/langgraph_orchestrator.py,
// so a reader who opens the repo finds the same names. The accompanying test
// checks that against the real file when it is present.
//
// The distinction the diagram has to get right is what the graph owns and what
// it does not. LangGraph owns the pause: `hitl_pause_node` suspends with the
// dynamic `interrupt()` primitive and state is checkpointed per super-step under
// `thread_id == run_id`. The SLA clock, the escalation, and the auto-rejection
// are a separate control plane that resolves that pause from outside. Drawing
// them as one blob would misrepresent the design.

export const ARCHITECTURE_STATE_OBJECT = 'OrchestrationGraphState';

// How many Product Owner clarification cycles a ticket may take before the
// graph stops re-questioning and parks it for a human. Mirrors
// MAX_CLARIFICATION_ROUNDS in langgraph_orchestrator.py.
export const MAX_CLARIFICATION_ROUNDS = 3;

// Node kinds, and what each one means. The legend renders from this, so the
// diagram can never carry a shape the reader has no key for.
export const ARCHITECTURE_NODE_KINDS = [
  { id: 'agent', label: 'Agent', detail: 'Reads context, decides, writes back' },
  { id: 'function', label: 'Function', detail: 'Deterministic — no model call' },
  { id: 'pause', label: 'Human pause', detail: 'Graph suspends until a person answers' },
  { id: 'terminal', label: 'Terminal', detail: 'Run ends here' },
];

// The compiled graph, top to bottom. `nodeName` is the literal LangGraph node
// id; `title` is what a reader needs to understand it.
export const ARCHITECTURE_FLOW = [
  {
    id: 'trigger',
    kind: 'function',
    title: 'Service ticket raised',
    detail: 'A webhook on the system of record starts a run.',
    isExternal: true,
  },
  {
    id: 'intake',
    nodeName: 'intake_node',
    kind: 'function',
    title: 'Normalise the ticket',
    detail: 'Fetches the raw payload and shapes it into the run state.',
  },
  {
    id: 'validation',
    nodeName: 'validation_node',
    kind: 'agent',
    title: 'Evaluate Definition of Ready',
    detail: 'Judges the ticket against the DoR criteria and routes the run.',
    isDecision: true,
  },
];

// The four routes out of validation_node, in the order add_conditional_edges
// declares them.
export const ARCHITECTURE_ROUTES = [
  {
    id: 'ready_path',
    label: 'ready_path',
    tone: 'ready',
    summary: 'Definition of Ready satisfied',
    steps: [
      {
        nodeName: 'action_steps_node',
        kind: 'function',
        title: 'Run the blueprint actions in order',
        detail: 'One generic node rather than one per action, which is what lets the same '
          + 'connector appear more than once in a flow — create the tracker issue, write back '
          + 'to the system of record, and so on.',
      },
    ],
    endsAt: 'Run complete',
  },
  {
    id: 'not_ready_path',
    label: 'not_ready_path',
    tone: 'loop',
    summary: 'Something required is missing',
    steps: [
      {
        nodeName: 'gap_analysis_node',
        kind: 'agent',
        title: 'Generate the questions worth asking',
        detail: 'Works out which DoR criteria are unmet and writes the clarifying questions '
          + 'a Product Owner can actually answer.',
      },
      {
        nodeName: 'hitl_pause_node',
        kind: 'pause',
        title: 'Suspend until a person answers',
        detail: 'Calls LangGraph\'s dynamic interrupt(). State is checkpointed per super-step '
          + 'under thread_id == run_id, so the pause survives a process restart. Resumed in '
          + 'place with Command(resume=answer).',
      },
    ],
    loopsBackTo: 'validation_node',
    loopNote: `Re-validated on every answer. After ${MAX_CLARIFICATION_ROUNDS} rounds the loop `
      + 'stops on its own rather than re-questioning forever.',
  },
  {
    id: 'blocked_path',
    label: 'blocked_path',
    tone: 'blocked',
    summary: `${MAX_CLARIFICATION_ROUNDS} clarification rounds exhausted`,
    steps: [
      {
        nodeName: 'blocked_node',
        kind: 'terminal',
        title: 'Park for senior review',
        detail: 'The circuit breaker. A ticket whose answers never satisfy the DoR would '
          + 'otherwise loop forever, posting a fresh checkpoint and spending tokens each cycle.',
      },
    ],
    endsAt: 'Run ends — needs a human',
  },
  {
    id: 'error_path',
    label: 'error_path',
    tone: 'error',
    summary: 'Unrecoverable failure',
    steps: [
      {
        nodeName: 'error_node',
        kind: 'terminal',
        title: 'Record and stop',
        detail: 'Failures terminate the run rather than being retried into a loop.',
      },
    ],
    endsAt: 'Run ends — failed',
  },
];

// What sits outside the graph. This is the distinction the diagram exists to
// make: the graph waits, and something else decides how long waiting is allowed
// to last.
export const ARCHITECTURE_CONTROL_PLANE = {
  title: 'Outside the graph — the SLA control plane',
  detail:
    'The graph has no clock. A separate watcher owns how long a pause may last: it notifies the '
    + 'channel, escalates to a wider audience when the first window expires, and auto-rejects '
    + 'when the second does — resolving the suspended run from outside. That is why every waiting '
    + 'limit is a setting on the policy screen rather than a value compiled into the graph.',
  stages: [
    { label: 'Notify', detail: 'Questions posted to the channel with the run\'s checkpoint id' },
    { label: 'Escalate', detail: 'Wider audience, questions restated, countdown shown' },
    { label: 'Auto-reject', detail: 'Ticket moved to rejected — an unanswered question is an outcome' },
  ],
};

// Three layers, three different questions. Kept as a callout rather than a
// second diagram: three rows do not need a picture.
export const ARCHITECTURE_OBSERVABILITY = [
  {
    layer: 'Langfuse',
    scope: 'LLM',
    answers: 'Which model call, how many tokens, what did it cost, how slow was it',
  },
  {
    layer: 'Azure Application Insights',
    scope: 'Infrastructure',
    answers: 'Container and server health, and the production signals that open a defect run',
  },
  {
    layer: 'Admin console',
    scope: 'Workflow',
    answers: 'Pipeline state, which runs are paused and on whom, and the decision audit trail',
  },
];
