/**
 * tourSteps.js - Enterprise Workflow Tour for Forge Terminal v6.0.0
 *
 * Interactive guided tour explaining Forge's Enterprise Workflow system:
 * - What the Enterprise Workflow is and why every project uses it
 * - Setup wizard: Detect → Preset → Configure → Apply
 * - Compliance scanner, quality modes, and module system
 * - Code Tutor integration and skill files
 * - Branching standards, human-readable code, and living CHANGELOG
 */

const TOUR_STEPS = [
  // ============================================================================
  // WELCOME
  // ============================================================================
  {
    id: 'welcome',
    selector: null,
    title: 'Welcome to Forge Terminal! 🏗️',
    content: 'Forge treats **every project** like a Fortune 500 enterprise project — structured, documented, and compliance-checked from day one.\n\nThis tour walks you through the **Enterprise Workflow** system: how it scaffolds your project, enforces quality standards, and keeps Copilot aligned with your team\'s rules.',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // ENTERPRISE WORKFLOW CARD
  // ============================================================================
  {
    id: 'enterprise-workflow-card',
    selector: '.enterprise-workflow-card',
    fallbackSelector: '.sidebar',
    title: 'Enterprise Workflow Card 🛡️',
    content: 'The **shield icon** in the sidebar is your Enterprise Workflow command center. At a glance you can see:\n\n• **Module count** — how many workflow modules are active\n• **Quality mode** — BEST or FAST\n• **Compliance status** — passing, warnings, or violations\n\nExpand the card to access the setup wizard, compliance details, and module configuration.',
    placement: 'right',
    spotlight: true,
  },

  // ============================================================================
  // SETUP WIZARD
  // ============================================================================
  {
    id: 'setup-wizard',
    selector: null,
    title: 'Setup Wizard ⚡',
    content: 'Click **"Setup Workflow"** to launch the 4-step wizard:\n\n1. **Detect** — scans your project\n2. **Preset** — choose a configuration template\n3. **Configure** — toggle individual modules\n4. **Apply** — scaffold everything\n\nIt takes about **30 seconds** to set up an entire enterprise structure. One click, zero boilerplate.',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // PROJECT DETECTION
  // ============================================================================
  {
    id: 'project-detection',
    selector: null,
    title: 'Step 1 — Project Detection 🔍',
    content: 'The wizard\'s first step **auto-detects** your project:\n\n• **Language & framework** — Go, Node, Python, Rust, and more\n• **Existing files** — what you already have (README, CI configs, etc.)\n• **What\'s missing** — gaps in documentation, testing, or workflow config\n\nBased on the scan, it recommends which modules to enable. No guesswork required.',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // PRESETS & MODULES
  // ============================================================================
  {
    id: 'presets-modules',
    selector: null,
    title: 'Step 2 — Presets & Modules 📦',
    content: 'Choose from **built-in presets** or create your own:\n\n• **Full Enterprise** — all 11 modules, maximum governance\n• **Lightweight** — essentials only, minimal overhead\n• **Custom** — toggle modules individually\n\nThe 11 modules cover: copilot instructions, skill files, git hooks, PR templates, changelog, code quality, branching strategy, testing standards, documentation, task classification, and workflow enforcement.',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // QUALITY MODE
  // ============================================================================
  {
    id: 'quality-mode',
    selector: null,
    title: 'Quality Mode — BEST vs FAST 🎯',
    content: '**BEST mode** uses premium AI models for architecture decisions and enables multi-agent orchestration. Code changes go through a review pipeline before being applied.\n\n**FAST mode** is for rapid prototyping — quicker responses, fewer guardrails.\n\nWe recommend **BEST — always.** Enterprise quality is the whole point. You can switch modes anytime from the workflow card.',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // WHAT GETS SCAFFOLDED
  // ============================================================================
  {
    id: 'scaffolded-files',
    selector: null,
    title: 'What Gets Scaffolded 📂',
    content: 'When you click **Apply**, the wizard creates:\n\n• `copilot-instructions.md` — system instructions for Copilot\n• **8+ skill files** in `.github/skills/`\n• **Git hooks** — pre-commit validation\n• **PR template** — standardized pull request format\n• `CHANGELOG.md` — living project history\n• **Workflow config** — `forge.toml` settings\n\nAll generated in one click. Every file is editable — the scaffold is a starting point, not a cage.',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // COMPLIANCE SCANNER
  // ============================================================================
  {
    id: 'compliance-scanner',
    selector: '.enterprise-workflow-card',
    fallbackSelector: '.sidebar',
    title: 'Compliance Scanner ✅',
    content: 'The **badge** on the workflow card shows your compliance status at a glance. Expand the card to see the full report:\n\n• ✅ **Passing checks** — files and configs that meet standards\n• ⚠️ **Warnings** — non-blocking issues to address\n• ❌ **Violations** — blocking problems with exact file and line details\n\nThe scanner runs automatically and updates as you work. Fix violations before merging to stay compliant.',
    placement: 'right',
    spotlight: true,
  },

  // ============================================================================
  // CODE TUTOR INTEGRATION
  // ============================================================================
  {
    id: 'code-tutor',
    selector: null,
    title: 'Code Tutor Integration 🎓',
    content: 'When files change, you\'ll see a **toast notification** offering a Code Tutor walkthrough. Code Tutor explains changes at varying depths:\n\n• **Overview** — what changed and why\n• **Detailed** — function-by-function breakdown\n• **Line-by-line** — deep dive into every change\n\nToggle Code Tutor with **Ctrl+Shift+T**. It\'s especially useful for onboarding new team members or reviewing unfamiliar code.',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // SKILLS & COPILOT INSTRUCTIONS
  // ============================================================================
  {
    id: 'skills-instructions',
    selector: '.command-cards-sidebar',
    fallbackSelector: '.sidebar',
    title: 'Skills & Copilot Instructions 🧠',
    content: 'Skills live in `.github/skills/` and teach Copilot CLI your project\'s rules. Key skills include:\n\n• **workflow-enforcer** — activates on every code change\n• **code-quality** — enforces human-readable standards\n• **testing-standards** — TDD workflow and coverage\n• **branching-strategy** — GitHub Flow enforcement\n\n`copilot-instructions.md` is loaded automatically as **system instructions** — Copilot reads it before every interaction.',
    placement: 'right',
    spotlight: true,
  },

  // ============================================================================
  // BRANCHING & PR STANDARDS
  // ============================================================================
  {
    id: 'branching-pr',
    selector: null,
    title: 'Branching & PR Standards 🌿',
    content: '**GitHub Flow** is enforced with standardized branch prefixes:\n\n• `feature/*` — new features\n• `fix/*` — bug fixes\n• `chore/*` — maintenance tasks\n• `docs/*` — documentation updates\n\nThe **PR template** ensures every merge is documented with context, testing notes, and changelog entries. **Pre-commit hooks** validate your changes before you push — catching issues locally, not in CI.',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // HUMAN-READABLE CODE
  // ============================================================================
  {
    id: 'human-readable-code',
    selector: '.terminal-container',
    fallbackSelector: '.terminal-outer-container',
    title: 'Human-Readable Code 📖',
    content: 'The workflow enforces code that **anyone can read**:\n\n• **Descriptive variable names** — no single-letter variables (`i`, `x`, `tmp`)\n• **Clear function naming** — intent is obvious from the name\n• **Readable comments** — written for non-developers, not just the compiler\n\nThe compliance scanner **flags violations** automatically. The goal: any team member can open any file and understand what it does.',
    placement: 'center',
    spotlight: true,
  },

  // ============================================================================
  // LIVING CHANGELOG
  // ============================================================================
  {
    id: 'living-changelog',
    selector: null,
    title: 'Living CHANGELOG 📝',
    content: '`CHANGELOG.md` is the **single source of truth** for what changed in your project. It\'s updated in every PR — no exceptions.\n\n• No auxiliary status docs or task logs\n• No "progress.md" or "notes.txt" cluttering the repo\n• One file, always current, always accurate\n\nThe Enterprise Workflow enforces this discipline so your project history is always clean and auditable.',
    placement: 'center',
    spotlight: false,
  },

  // ============================================================================
  // COMPLETION
  // ============================================================================
  {
    id: 'ready-to-build',
    selector: null,
    title: 'Ready to Build! 🚀',
    content: '**Quick start:**\n\n1. Expand the **Enterprise Workflow** card in the sidebar\n2. Click **Setup Workflow**\n3. Pick a preset (Full Enterprise recommended)\n4. Click **Apply** — done!\n\nReplay this tour anytime from **Settings**. Happy building!',
    placement: 'center',
    spotlight: false,
    isFinal: true,
  },
];

const TOUR_STORAGE_KEY = 'forge_tour_completed';
const TOUR_VERSION = '5.1.1'; // v6.0.0: Rewritten tour focused on Enterprise Workflow system

export { TOUR_STEPS, TOUR_STORAGE_KEY, TOUR_VERSION };
