// Keeps the LG-Builder architecture diagram tied to the code it depicts.
//
// A diagram is the easiest thing on a portfolio to fake, because nobody checks
// it. This does: every node name the diagram draws must be a node the real
// orchestrator registers, and the clarification-round limit must match the
// constant the graph actually enforces.
//
// The source lives in a sibling repository, so the source-checking tests skip
// when it is absent rather than failing a build that has no way to satisfy them.
// The structural tests always run.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  ARCHITECTURE_CONTROL_PLANE,
  ARCHITECTURE_FLOW,
  ARCHITECTURE_NODE_KINDS,
  ARCHITECTURE_OBSERVABILITY,
  ARCHITECTURE_ROUTES,
  ARCHITECTURE_STATE_OBJECT,
  MAX_CLARIFICATION_ROUNDS,
} from './architecture.mjs';

const ORCHESTRATOR_SOURCE_PATH = path.join(
  'C:', 'ProjectsWin', 'DBAI', 'workflow-poc', 'langgraph_orchestrator.py',
);

function readOrchestratorSource() {
  if (!fs.existsSync(ORCHESTRATOR_SOURCE_PATH)) {
    return null;
  }
  return fs.readFileSync(ORCHESTRATOR_SOURCE_PATH, 'utf8');
}

function collectDiagramNodeNames() {
  const flowNodeNames = ARCHITECTURE_FLOW
    .filter((flowStep) => flowStep.nodeName)
    .map((flowStep) => flowStep.nodeName);
  const routeNodeNames = ARCHITECTURE_ROUTES
    .flatMap((route) => route.steps.map((routeStep) => routeStep.nodeName));

  return [...flowNodeNames, ...routeNodeNames];
}

// ── Structural: always run ──────────────────────────────────────────────────

test('every drawn node declares a kind the legend explains', () => {
  const legendKindIds = new Set(ARCHITECTURE_NODE_KINDS.map((nodeKind) => nodeKind.id));
  const drawnSteps = [...ARCHITECTURE_FLOW, ...ARCHITECTURE_ROUTES.flatMap((route) => route.steps)];

  for (const drawnStep of drawnSteps) {
    assert.ok(
      legendKindIds.has(drawnStep.kind),
      `"${drawnStep.title}" uses kind "${drawnStep.kind}", which the legend does not explain.`,
    );
  }
});

test('the diagram shows a pause, a loop back, and a way out of the loop', () => {
  const allSteps = ARCHITECTURE_ROUTES.flatMap((route) => route.steps);

  assert.ok(
    allSteps.some((routeStep) => routeStep.kind === 'pause'),
    'the diagram must show where the graph waits for a person.',
  );
  assert.ok(
    ARCHITECTURE_ROUTES.some((route) => route.loopsBackTo),
    'the diagram must show the clarification loop returning to validation.',
  );
  assert.ok(
    ARCHITECTURE_ROUTES.some((route) => route.id === 'blocked_path'),
    'the diagram must show the circuit breaker that ends the loop.',
  );
});

test('the control plane is drawn as separate from the graph', () => {
  // The whole point of the diagram is that the graph waits and something else
  // decides for how long. If that separation is lost, it misrepresents the design.
  assert.match(ARCHITECTURE_CONTROL_PLANE.title, /outside the graph/i);
  assert.ok(ARCHITECTURE_CONTROL_PLANE.stages.length >= 3);
});

test('each observability layer answers a different question', () => {
  assert.equal(ARCHITECTURE_OBSERVABILITY.length, 3);

  const scopes = new Set(ARCHITECTURE_OBSERVABILITY.map((observabilityLayer) => observabilityLayer.scope));
  assert.equal(scopes.size, 3, 'two layers claim the same scope.');

  for (const observabilityLayer of ARCHITECTURE_OBSERVABILITY) {
    assert.ok(observabilityLayer.layer && observabilityLayer.answers);
  }
});

// ── Source-checked: run when the orchestrator is available ──────────────────

test('every node the diagram draws is registered by the real orchestrator', (testContext) => {
  const orchestratorSource = readOrchestratorSource();
  if (!orchestratorSource) {
    return testContext.skip('DBAI orchestrator not present on this machine.');
  }

  // Node names reach add_node either as a literal or via the step catalog, so
  // the check is that the string appears in the orchestrator or its catalog.
  const catalogSource = fs.readFileSync(
    path.join('C:', 'ProjectsWin', 'DBAI', 'workflow-poc', 'workflow_step_catalog.py'),
    'utf8',
  );
  const combinedSource = `${orchestratorSource}\n${catalogSource}`;

  for (const nodeName of collectDiagramNodeNames()) {
    assert.ok(
      combinedSource.includes(`"${nodeName}"`),
      `the diagram draws "${nodeName}", which the orchestrator does not register.`,
    );
  }
});

test('the state object is named exactly as the orchestrator declares it', (testContext) => {
  const orchestratorSource = readOrchestratorSource();
  if (!orchestratorSource) {
    return testContext.skip('DBAI orchestrator not present on this machine.');
  }

  assert.ok(
    orchestratorSource.includes(`class ${ARCHITECTURE_STATE_OBJECT}(TypedDict`),
    `${ARCHITECTURE_STATE_OBJECT} is not the state class the orchestrator declares.`,
  );
});

test('the clarification-round limit matches the constant the graph enforces', (testContext) => {
  const orchestratorSource = readOrchestratorSource();
  if (!orchestratorSource) {
    return testContext.skip('DBAI orchestrator not present on this machine.');
  }

  const limitMatch = orchestratorSource.match(/MAX_CLARIFICATION_ROUNDS\s*=\s*(\d+)/);
  assert.ok(limitMatch, 'MAX_CLARIFICATION_ROUNDS is no longer declared in the orchestrator.');
  assert.equal(
    Number(limitMatch[1]),
    MAX_CLARIFICATION_ROUNDS,
    'the diagram states a different clarification-round limit than the code enforces.',
  );
});
