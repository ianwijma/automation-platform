# TASKS — Work Breakdown Structure

> Auto-generated from PLAN.md. Continuously updated.
> Status: `todo` | `in-progress` | `done` | `blocked`

## Legend

- **ID**: `T-NNN` unique task identifier
- **M**: Milestone from PLAN.md
- **Dep**: Task IDs that must complete first
- **Scope**: Brief description of work
- **AC**: Acceptance criteria (testable)
- **Status**: Current state

---

## Shared Contracts (freeze early — all downstream depend on these)

| ID | M | Dep | Scope | AC | Status |
|----|---|-----|-------|----|--------|
| T-001 | M0 | — | Automation definition TypeScript types | Types for Automation, Node, Edge, Target, NodeParams compile; match PLAN §4.1 JSON shape | todo |
| T-002 | M0 | — | Node interface contract | NodeDefinition<P>, RunContext, NodeItem, SimulationReport, PortSchema, CapabilityReport types compile; match PLAN §4.3 | todo |
| T-003 | M0 | — | Agent protocol message types | WSS frame types (hello, capabilities, heartbeat, dispatch, cancel, node_result, node_log, artifact_request, self_update) compile | todo |
| T-004 | M0 | — | API request/response schema types | REST endpoint types for automations, runs, agents, credentials, env, artifacts, ai, system compile | todo |
| T-005 | M0 | — | Expression evaluation contract | `{{ }}` parser + sandboxed evaluator interface; $json, $items, $node, $env, $state, $now accessible | todo |
| T-006 | M0 | — | Items array data model types | NodeItem {json, binary} with $artifact ref type compile | todo |

## M0 — Skeleton & Build

| ID | M | Dep | Scope | AC | Status |
|----|---|-----|-------|----|--------|
| T-010 | M0 | — | Init Bun project: package.json, tsconfig.json, .gitignore, src/ layout | `bun install` succeeds; `bun run build` alias exists | todo |
| T-011 | M0 | T-010 | SQLite migration system | Versioned SQL files in src/db/migrations/; on first boot all tables from PLAN §4.2 created; re-runs are idempotent; test creates and verifies each table | todo |
| T-012 | M0 | T-010 | Bun.serve HTTP skeleton | GET /api/system/info returns {version, mode, uptime}; serves embedded static from ./ui/dist | todo |
| T-013 | M0 | T-010 | CLI entry point: src/cli.ts | `ap` = standalone mode; `ap serve` = platform mode; `ap join <url> --token <tok>` = fleet agent; `ap ui` = open browser; `ap doctor` = capability probe; `ap install-service` = systemd unit. All subcommands parse and route; --port, --no-browser, --public-url flags work | todo |
| T-014 | M0 | T-011,T-012,T-013 | Single-binary build pipeline | `bun build --compile src/main.ts --outfile ap` produces executable; `./ap` boots, binds localhost:7480, serves hello-world UI, SIGTERM shuts clean | todo |
| T-015 | M0 | T-010 | React UI hello-world | Vite+React+Tailwind app in ui/; builds to ui/dist/; renders "Automation Platform" heading; embedded by Bun.serve | todo |
| T-016 | M0 | T-011,T-012 | Config & settings subsystem | settings table read/write; AP_DATA_DIR, AP_PORT, AP_NO_BROWSER env vars honored; first-run bootstraps instance key | todo |
| T-017 | M0 | T-014 | Initial test suite + CI | `bun test` runs all unit tests green; test helper for in-memory SQLite; at least 1 test per subsystem (migrations, HTTP, config) | todo |

## M1 — Local Execution Core

| ID | M | Dep | Scope | AC | Status |
|----|---|-----|-------|----|--------|
| T-020 | M1 | T-001,T-011 | Automation CRUD API + DB | POST/GET/PUT/DELETE /api/automations; creates automation row + first version; draft_json stored; test round-trips definition JSON | todo |
| T-021 | M1 | T-002,T-020 | Node registry | Built-in nodes self-register by type; registry.lookup("system.command") returns definition; nodes declare requiredCapabilities, sideEffecting, paramsSchema | todo |
| T-022 | M1 | T-005,T-006,T-021 | Expression sandbox evaluator | `{{ $json.foo }}` resolves from items; $env resolves scoped vars; sandbox denies require/process; unit tests for each $ variable | todo |
| T-023 | M1 | T-002,T-021 | Execution engine: run orchestrator (local) | Given automation definition, walks graph in topological order; dispatches each node to local agent; records run + node_executions; respects disabled nodes; timeout enforcement | todo |
| T-024 | M1 | T-003,T-023 | Local agent dispatch | Orchestrator dispatches to local agent via in-process function call (same as WSS dispatch but local transport); agent_id always exists for local | todo |
| T-025 | M1 | T-002 | Node: trigger.manual | Manual trigger node: run() yields empty items; no side effects; simulate() identical | todo |
| T-026 | M1 | T-002 | Node: system.command | Runs shell command; stdout/stderr captured as items; sideEffecting=true; simulate() reports "would run: <command>"; requires capabilities: none | todo |
| T-027 | M1 | T-002 | Node: logic.if | Branches on expression; true/false output ports; sideEffecting=false; simulate() same as run() | todo |
| T-028 | M1 | T-002 | Node: logic.switch | Multi-way branch on expression match; sideEffecting=false | todo |
| T-029 | M1 | T-002 | Node: logic.merge | Merges items from multiple input branches (append/keep-key); sideEffecting=false | todo |
| T-030 | M1 | T-002 | Node: logic.loop | Iterates over items array in batches; sideEffecting=false | todo |
| T-031 | M1 | T-002 | Node: logic.delay | Delays execution by N seconds; sideEffecting=false | todo |
| T-032 | M1 | T-002 | Node: error.throw + catch path | error.throw stops run with error; catch-path on any node redirects error to alternate output; sideEffecting=true for throw | todo |
| T-033 | M1 | T-002 | Node: code | Arbitrary JS/TS in sandboxed worker; sideEffecting=true; simulate() reports "would execute user code" | todo |
| T-034 | M1 | T-002 | Node: set/edit | Edit fields on items (add/remove/rename); sideEffecting=false | todo |
| T-035 | M1 | T-002,C2 | Node: state.get/set | state.get reads from automation_scoped KV; state.set writes; sideEffecting=true for set; simulate() reports would-read/would-write | todo |
| T-036 | M1 | T-023,T-024,T-025,T-026,T-027 | Integration test: manual→command→if locally | Full run recorded in DB with I/O; items/expressions resolve; state.get/set works in a real run | todo |
| T-037 | M1 | T-023 | Run records API | GET /api/runs lists runs; GET /api/runs/:id returns with node_executions; node_executions include input/output JSON | todo |
| T-038 | M1 | T-023 | Node execution retry + timeout (C3) | Per-node retry policy (attempts, backoff) enforced; per-node timeout kills long-running node; per-run timeout aborts entire run; test verifies retry exhaustion = fail | todo |

## M2 — Editor & Debugging

| ID | M | Dep | Scope | AC | Status |
|----|---|-----|-------|----|--------|
| T-040 | M2 | T-015 | React Flow canvas integration | Canvas renders nodes + edges; nodes draggable; new automation creates empty canvas; palette sidebar lists node types by category | todo |
| T-041 | M2 | T-001,T-040 | Canvas CRUD round-trips definition | Adding/moving/deleting nodes + edges on canvas updates definition JSON; reload restores canvas state; test: save, reload, verify | todo |
| T-042 | M2 | T-002,T-040 | Auto-generated param forms | Node editor panel renders form fields from paramsSchema; {{ }} expression editor with data-tree picker; target dropdown (local/machine/tag/any) | todo |
| T-043 | M2 | T-037,T-040 | Data preview panels | Per-node input/output panel: table/JSON/raw tabs; image-artifact thumbnails; pin-button; per-node history list (agent name, duration); disabled toggle | todo |
| T-044 | M2 | T-023,T-040 | Single-node + partial run from editor | "Execute step" runs node + predecessors; "Execute from here" runs from selected node; results appear in previews | todo |
| T-045 | M2 | T-005,T-023 | Dry-run toggle in editor | Amber banner when active; side-effecting nodes show SimulationReport; simulated nodes visually hatched; non-side-effecting nodes run normally | todo |
| T-046 | M2 | T-043 | Data pinning | Pin-button freezes node output; pinned data substituted on next run instead of re-executing node; production runs ignore pinned data | todo |
| T-047 | M2 | T-040 | Disabled node flag in editor | Toggle to disable node; disabled nodes skipped during execution; visual indicator on canvas | todo |

## M3 — Desktop Shell (Tauri)

| ID | M | Dep | Scope | AC | Status |
|----|---|-----|-------|----|--------|
| T-050 | M3 | T-014 | Tauri v2 project scaffold in desktop/ | `cargo tauri dev` launches window with hello-world; sidecar config points to ../ap binary | todo |
| T-051 | M3 | T-050 | Sidecar spawn + ready-line parsing | Shell spawns `ap serve --port 0 --no-browser`; parses `AP_READY http://127.0.0.1:<port>` from stdout; loads URL in webview; ready < 5s warm start | todo |
| T-052 | M3 | T-051 | Graceful shutdown | Quit window → SIGTERM to sidecar → `ap` drains + exits; SIGKILL fallback after 10s; verify no orphan process via `ps` | todo |
| T-053 | M3 | T-050 | Single-instance lock | Second launch focuses existing window; no second sidecar spawned | todo |
| T-054 | M3 | T-050 | System tray | Tray icon with status dot (green=up, red=down); "Open" shows/focuses window; "Quit" triggers shutdown | todo |
| T-055 | M3 | T-050 | Start-on-login toggle | Checkbox in tray; toggles XDG autostart .desktop file; survives reboot; off by default | todo |
| T-056 | M3 | T-014,T-050 | AppImage + CI build | `cargo tauri build` produces AppImage; CI emits AppImage for linux-x64; binary inside is the compiled `ap` | todo |
| T-057 | M3 | T-013 | `ap ui` browser-open fallback | `ap ui` opens http://localhost:7480 in default browser; works headlessly (no Tauri) | todo |

## M4 — Vision & Input Nodes

| ID | M | Dep | Scope | AC | Status |
|----|---|-----|-------|----|--------|
| T-060 | M4 | T-002 | Capability probe implementation | Detects: X11/Wayland/none, available tools (tesseract, xdotool, ydotool, maim, scrot, grim), screen availability, input method; result stored as CapabilityReport | todo |
| T-061 | M4 | T-060 | Node: vision.screenshot | Captures screen on X11 (maim/scrot) or Wayland (grim); stores as artifact; requiredCapabilities: {screen:true}; simulate() reports "would capture screen" | todo |
| T-062 | M4 | T-060 | Node: vision.ocr | Auto-detects system tesseract; falls back to WASM tesseract.js; extracts text from artifact; requiredCapabilities: none (WASM fallback); simulate() reports "would OCR image" | todo |
| T-063 | M4 | T-060 | Node: vision.image.detect | Template matching with configurable confidence threshold; requiredCapabilities: {screen:true}; simulate() reports "would detect image at threshold X" | todo |
| T-064 | M4 | T-060 | Node: vision.llm | Sends image artifact + prompt to OpenRouter; model configurable; requiredCapabilities: none (executes on platform); simulate() reports "would send image to LLM" | todo |
| T-065 | M4 | T-060 | Node: input.mouse.click | Click at coordinates or at found image; X11 via xdotool; Wayland via ydotool; requiredCapabilities: {input != "none"}; simulate() reports "would click at (x,y)" | todo |
| T-066 | M4 | T-060 | Node: input.mouse.move | Move mouse to coordinates; same capabilities as click; simulate() reports "would move to (x,y)" | todo |
| T-067 | M4 | T-060 | Node: input.keyboard.type | Type text string; X11 via xdotool; Wayland via ydotool; requiredCapabilities: {input != "none"}; simulate() reports "would type '<text>'" | todo |
| T-068 | M4 | T-060 | Node: input.keyboard.key | Press key combo (e.g. Ctrl+S); same transport; simulate() reports "would press <key>" | todo |
| T-069 | M4 | T-060,T-061,T-062 | Integration: screenshot→OCR on X11 session | Screenshot produces artifact; OCR reads artifact; text extracted; both report correct agent in node_executions | todo |

## M5 — Fleet

| ID | M | Dep | Scope | AC | Status |
|----|---|-----|-------|----|--------|
| T-070 | M5 | T-003,T-023 | WSS hub server | Platform accepts WSS connections at /api/agent/connect; token auth; registers agent with capabilities; heartbeat tracking; 2 missed beats → offline | todo |
| T-071 | M5 | T-003 | WSS agent client | `ap join` stores config; on startup connects WSS; sends hello + capabilities; maintains heartbeat; receives dispatch, sends results | todo |
| T-072 | M5 | T-023,T-070 | Remote agent dispatch | Orchestrator dispatches node to remote agent via WSS; agent executes in sandboxed worker; returns result; node_execution records remote agent_id | todo |
| T-073 | M5 | T-001 | Target resolution with capabilities | Resolve {kind, value} to agent candidate set; filter online; filter capabilities; pick (least-busy / sticky); no candidate → fail per retry policy | todo |
| T-074 | M5 | T-011 | Artifact store + cross-machine transfer | Content-addressed (sha256); chunked upload/download over HTTPS; TTL 72h default; consuming agent pulls on demand; thumbnails for images | todo |
| T-075 | M5 | T-070,T-071 | Offline target failure | Target offline at dispatch → retry per policy → exhausted → node fails → run fails or error path; test verifies "fail loudly" | todo |
| T-076 | M5 | T-070,T-071 | Mid-run disconnect | Agent disconnects mid-run → in-flight nodes interrupted; run marked interrupted; reconnect → retryOnDisconnect nodes re-dispatch; test verifies | todo |
| T-077 | M5 | T-070 | Agent self-update | Platform sends self_update{url,sha256}; agent downloads, verifies hash, swaps binary, restarts; manual trigger from platform UI/CLI | todo |
| T-078 | M5 | T-072,T-073,T-074 | Mixed-execution acceptance test | schedule(local) → command(A) → screenshot(B) → ocr(local) → if(local) → command(A); artifacts cross machines; node_executions show correct agents | todo |

## M6 — Triggers & Activation

| ID | M | Dep | Scope | AC | Status |
|----|---|-----|-------|----|--------|
| T-080 | M6 | T-020 | Activation model | Automation has active/inactive toggle; POST /api/automations/:id/activate|deactivate; only active automations fire triggers; draft edits don't fire until activate | todo |
| T-081 | M6 | T-002 | Node: trigger.schedule | Cron expression; evaluated by platform scheduler; fires on schedule; target field respected for env/state resolution; test fires at correct time | todo |
| T-082 | M6 | T-002 | Node: trigger.webhook | Registers webhook path; test URL at /hooks/test/:autoId/:path (2-min window, editor-listening); prod URL at /hooks/:autoId/:path (requires active); both deliver POST body as items | todo |
| T-083 | M6 | T-002 | Node: trigger.polling | Polls URL/command on interval; $state cursor for dedup; targetable to any machine; test verifies dedup | todo |
| T-084 | M6 | T-081 | Scheduler subsystem | Platform runs cron evaluator; activates scheduled triggers at correct times; timezone per automation setting; test with sub-second timing | todo |
| T-085 | M6 | T-080,T-081,T-082,T-083 | Integration: all trigger types | Manual, schedule, webhook test/prod, polling all produce items that flow through graph; inactive automation never fires | todo |

## M7 — Config, Secrets, Sharing

| ID | M | Dep | Scope | AC | Status |
|----|---|-----|-------|----|--------|
| T-090 | M7 | T-011 | Envelope encryption credential vault | Random data key per credential; wrapped by instance key; CRUD /api/credentials (write-only values); read returns metadata only | todo |
| T-091 | M7 | T-090 | JIT secret delivery | At dispatch, platform resolves credential refs; sends decrypted material over agent's WSS channel; held in worker memory only; never written to agent disk; test verifies file absence | todo |
| T-092 | M7 | T-011 | Env vars 3-scope system | Global / per-automation / per-machine scopes in env_vars table; resolution machine>automation>global; $env.VAR accessible in expressions; is_secret flag; test precedence | todo |
| T-093 | M7 | T-020 | Export automation (no secrets) | GET /api/automations/:id/export returns JSON; credential values absent (references only); env secret values absent (keys only); target machine IDs preserved | todo |
| T-094 | M7 | T-020 | Import automation with rebinding | POST /api/import accepts JSON; prompts for missing credentials; unknown machine IDs → rebind to tags or prompt; test: export then import on fresh DB | todo |

## M8 — Versioning

| ID | M | Dep | Scope | AC | Status |
|----|---|-----|-------|----|--------|
| T-100 | M8 | T-020 | Auto-version on save | Every PUT /api/automations/:id creates new automation_version; version_no increments; test: 3 saves = 3 versions | todo |
| T-101 | M8 | T-100 | Version history API + UI | GET /api/automations/:id/versions lists all; UI shows version list with timestamps; test verifies list matches saves | todo |
| T-102 | M8 | T-100 | Revert to any version | POST /api/automations/:id/revert/:v; restores that version's definition as new draft; creates new version number; activated version pinned for triggers | todo |

## M9 — AI Panel

| ID | M | Dep | Scope | AC | Status |
|----|---|-----|-------|----|--------|
| T-110 | M9 | T-004 | AI chat backend | POST /api/ai/chat; sends prompt + current automation context to OpenRouter; BYO key; model configurable; returns AI response; custom OpenAI-compatible endpoint supported | todo |
| T-111 | M9 | T-110 | Diff generation from AI response | AI response parsed into structured diff (nodes added/removed/params changed); represented as JSON-patch-like operations | todo |
| T-112 | M9 | T-111 | Diff preview + apply in UI | Diff cards shown in AI panel; per-change approve/reject; "Apply approved" updates automation; test: AI proposes "add HTTP request node" → user approves → node appears | todo |
| T-113 | M9 | T-110 | AI provider settings | Settings page for OpenRouter API key, model selector, custom endpoint URL; stored encrypted in credentials store | todo |

## M10 — Hardening & E2E

| ID | M | Dep | Scope | AC | Status |
|----|---|-----|-------|----|--------|
| T-120 | M10 | T-037 | Re-run-from-node | POST /api/runs/:id/rerun-from/:nodeId; uses recorded execution data as input for target node; re-executes from that point; test verifies output matches re-execution | todo |
| T-121 | M10 | T-023 | Payload-retention toggle (C6) | Automation setting savePayloads=false → node_executions store no input/output JSON/artifacts; previews show "not recorded"; test verifies empty payloads | todo |
| T-122 | M10 | T-078 | Mixed-execution E2E full suite | Full mixed-execution scenario (M5 criteria) re-verified; plus edge cases: multiple artifacts, retry on disconnect, timeout; all green | todo |
| T-123 | M10 | T-011 | Migration upgrade path test | Create DB at version N; run migrations to N+1; verify data intact; test: v1 → v2 → v3 sequential | todo |
| T-124 | M10 | — | Full `bun test` suite green | All unit + integration tests pass; no skipped; coverage report generated | todo |

## Parallel Execution Map

Tasks that can run concurrently at project start (no sequential deps within the set):

**Wave 1 (foundation — all independent):**
- T-010 (project init)
- T-001 through T-006 (shared contracts/types — can be authored in parallel in different files)

**Wave 2 (after T-010):**
- T-011 (migrations), T-012 (HTTP skeleton), T-013 (CLI), T-015 (React UI) — all independent

**Wave 3 (after Wave 2):**
- T-014 (build pipeline — needs T-011,T-012,T-013)
- T-016 (config — needs T-011,T-012)
- T-020 (automation CRUD — needs T-001,T-011)
- T-021 (node registry — needs T-002)
- T-022 (expression sandbox — needs T-005,T-006,T-021)
- T-025-T-035 (individual node implementations — needs T-002, can be parallel)
- T-040 (React Flow canvas — needs T-015)

**Wave 4+ (after core engine):**
- M3 desktop shell, M4 vision nodes, M5 fleet can mostly develop in parallel
- M6-M9 depend on prior milestones but overlap significantly

---

## Dependency Graph (simplified)

```
T-010 ─┬─ T-011 ─┬─ T-014
       ├─ T-012 ─┤
       ├─ T-013 ─┘
       └─ T-015 ─── T-040

T-001..T-006 (contracts, parallel)

T-011 + T-001 ─── T-020 ─── T-080 (activation)
T-002 ─┬─ T-021 ─── T-022 (expressions)
       ├─ T-025..T-035 (nodes, parallel)
       └─ T-023 ─┬─ T-024 (local dispatch)
                  ├─ T-036 (integration test)
                  └─ T-037 (run records API)

T-003 + T-023 ─── T-070 (WSS hub) ─── T-071 (WSS client) ─── T-072 (remote dispatch)
T-023 + T-072 + T-073 + T-074 ─── T-078 (mixed-exec test)

T-014 + T-050 ─── T-056 (AppImage CI)
T-060 ─┬─ T-061..T-068 (vision/input nodes, parallel)
       └─ T-069 (vision integration test)
```
