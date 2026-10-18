# PLAN — AI-Enabled Linux Automation Platform

> **Status (repair pass, 2026-10-17):** The implementation and evidence are tracked in [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) and [TASKS.md](TASKS.md). The historical design below remains useful context; the repair amendments immediately below supersede conflicting details.
> **Non-negotiable invariants:**
> 1. **DX-first setup** — one install path, zero-config local use, single-flag fleet onboarding.
> 2. **Unified execution model** — one binary; no local/remote special-casing in graph semantics. Any design that branches on "is local" in orchestration logic is a defect.

---

## Repair amendments — current implementation contract

- Preserve Bun/TypeScript, React Flow, SQLite and Tauri. Prioritize a usable local desktop and unattended data/system runtime before extension distribution.
- Both local and remote dispatch use the same node context, cancellation, state and artifact contracts. Protocol v2 validates frames, exchanges a one-use enrollment token for a persistent identity, and preserves identity on reconnect.
- User expressions and synchronous code use QuickJS memory/CPU isolation. Built-in OS actions run with the agent user's privileges and cancellable process groups. Plugins are disabled until a separately isolated runtime exists; agent self-update is disabled until verified update delivery exists.
- GNOME/KDE Wayland uses RemoteDesktop/ScreenCast portals with explicit consent and optional compositor window adapters. This supersedes ydotool/grim assumptions. X11 uses xdotool/wmctrl and capture utilities. Wayland session acceptance is a release gate, not established support from a successful compile.
- Desktop packaging stores a compressed runtime resource, extracted unchanged before launch. AppImage ELF rewriting must not touch the Bun executable. The standalone output is `dist/ap`.
- Bind loopback by default. Network deployment requires administrator authentication and an HTTPS public origin behind a reverse proxy. This remains a single-administrator trusted-workflow product.
- Default retries are one attempt. Disconnects during an action and interrupted runs after restart are never automatically replayed. A user must reconcile uncertain side effects before rerunning.
- Artifacts currently use bounded whole-message transfer, with 32 MiB per artifact, 72-hour default expiry and payload spilling above 1 MiB. Chunked streaming, thumbnails and resumable transfers remain future work.
- Prototype data is disposable for the repair. Preserve existing profiles; use a fresh `AP_DATA_DIR` and explicit export/rebinding. Historical plaintext key formats fail closed. No implicit data deletion or promise of a fully backward-compatible migration.
- Completion requires observable end-to-end outcomes. Unit tests, browser/API tests, a real loopback fleet test, owned X11 test, portable binary test and container test are automated. Native compositor and interactive shell checks are recorded separately in [the desktop matrix](docs/DESKTOP-ACCEPTANCE.md).

## 1. Final Requirements (as amended)

Original requirements 1–8 stand, amended by the approved change log (§1.1). Consolidated:

1. **Setup & DX** — one install path: single Bun-compiled binary or `docker compose up`. Local-only use = zero setup. Fleet onboarding = `ap join <url> --token <tok>`. Every decision is evaluated against setup friction.
2. **Node-graph builder** — React + React Flow editor, n8n/Node-RED-comparable. Node categories: execution (any target), OCR (cheap default), image/icon detection (configurable confidence), LLM vision (fallback), logic (branch/loop/merge/delay/error), full input control (mouse/keyboard). Plugin mechanism: npm packages in sandboxed workers (format in MVP, registry UI post-MVP).
3. **Configuration & secrets** — env vars at global / per-automation / per-machine scopes, resolved at runtime on the executing machine (machine scope most specific). Encrypted credential store; just-in-time secret delivery over WSS; exports contain references only, with import-time prompts.
4. **Testing & debugging** — single-node execution on any target; partial execution; dry-run with per-node `simulate()` contract (never acts, always reported, clearly badged in UI); n8n-style previews (inline I/O per node, table/JSON/raw views, data pinning, per-node history **including which target ran it**); re-run-from-node using recorded data; disabled-node flag; per-automation payload-retention toggle.
5. **AI-assisted building** — chat panel alongside canvas; AI proposes automations/edits as previewable diffs; applied only on explicit approval; OpenRouter (BYO key), model configurable; OpenAI-compatible endpoint as escape hatch.
6. **Versioning** — automatic per save; full un-gated history; revert to any version (revert itself creates a new version).
7. **Sharing** — portable export/import across instances; no secret values; machine targets rebind via tags/roles with prompts for unknown IDs.
8. **Triggers** — manual, schedule/cron, webhook (separate **test vs production** URLs), polling, event-based (file/system — post-MVP); observable triggers (file/system/polling) execute **on their target machine**.
9. **Desktop app (C12)** — minimal Tauri v2 shell bundling the `ap` binary as a sidecar: starts the service on launch, renders the local URL in the OS webview, stops the service on quit. System tray + start-on-login. Linux-first packaging.

### 1.1 Approved change log

| # | Change | Evidence | Impact |
|---|--------|----------|--------|
| C1 | Capability advertisement + capability-aware targeting | Fleet model unprecedented; screen/OCR/input nodes need session guarantees | Agent protocol, target resolution, UI badges |
| C2 | Persistent automation-scoped KV state nodes — **in MVP** | Node-RED context; polling "last-seen" patterns | +2 nodes, 1 table |
| C3 | Node-level retry, per-node timeout, per-run timeout | n8n retry-on-fail/timeouts; fleet failure semantics | Execution policy object |
| C4 | n8n-style items array + `{{ }}` sandboxed-JS expressions | Both competitors; loop/branch semantics; crossover familiarity | Node interface, previews |
| C5 | Dry-run = per-node `simulate()` + run flag | No competitor has it; differentiator | Node interface + UI |
| C6 | Per-automation payload-retention toggle | n8n redaction is Enterprise-only | Execution storage |
| C7 | Sub-automations post-MVP; interface shaped now | Both competitors have them | Explicit node I/O schema now |
| C8 | Test vs production webhook URLs | n8n DX | Webhook trigger design |
| C9 | Re-run-from-node + disabled nodes | n8n debug-in-editor | Replayable execution records |
| C10 | Deferred: log streaming/OTel, git sync, multi-user/RBAC, external secret stores, MCP server, evaluations | Enterprise-tier in n8n | MVP out-of-scope list |
| C11 | **Full input control (mouse/keyboard) in MVP** *(user override)* | User decision | X11 via xdotool first-class; Wayland via ydotool/uinput; capability probe + explicit unsupported-error |
| C12 | **Desktop app:** Tauri v2 sidecar shell (spawn service, render URL, stop on quit) + tray + start-on-login; Linux-first packaging | User request; lightest wrapper preserving single-binary story | New milestone M3; CI gains Rust/Tauri packaging lane; sidecar contract (§2.2); deferred: Windows/macOS packaging, shell auto-updater |

---

## 2. Architecture

### 2.1 Components

```
┌────────────────────────────────────────────────────────────┐
│  Platform (one binary: `ap` / `ap serve`)                   │
│  ├─ HTTP API (REST, Bun.serve) + embedded React editor     │
│  ├─ WSS Hub (agent connections)                            │
│  ├─ Orchestrator (run scheduling, dispatch, target         │
│  │   resolution, retry/timeout policy, artifact routing)   │
│  ├─ Scheduler (cron), Webhook gateway, Polling manager     │
│  ├─ Artifact store (content-addressed, TTL'd, streaming)   │
│  ├─ Credential vault (envelope-encrypted)                  │
│  ├─ AI service (OpenRouter, diff generation)               │
│  └─ SQLite (bun:sqlite, WAL)                               │
├────────────────────────────────────────────────────────────┤
│  Agent (same binary, always present)                       │
│  ├─ In-process "local agent" (standalone mode) OR          │
│  │   WSS client (`ap join` fleet mode)                     │
│  ├─ Node executor (sandboxed workers; built-ins + plugins) │
│  ├─ Capability probe (display server, tools, arch, screen) │
│  ├─ Env/secret resolver (scoped, JIT)                      │
│  ├─ Artifact uploader/downloader (chunked)                 │
│  └─ Self-updater (manual trigger from platform/CLI)        │
├────────────────────────────────────────────────────────────┤
│  Desktop shell (C12, optional packaging)                   │
│  └─ Tauri v2 app: spawns `ap` sidecar, renders local URL   │
│     in OS webview, tray icon, start-on-login toggle        │
└────────────────────────────────────────────────────────────┘
```

**Unified model preserved by construction:** every machine, including the local one, is an *agent record* in the same `agents` table with the same capability report and the same dispatch semantics. The local agent differs only in transport (in-process function calls instead of WSS frames) — an implementation detail invisible to graph semantics, target resolution, data previews, and failure handling.

### 2.2 Installation & modes

- `curl … | sh` or package → single binary `ap`. First run: standalone mode (platform + local agent + UI on `http://localhost:7480`, no auth, binds 127.0.0.1).
- `ap serve --public-url https://…` → platform mode (auth enabled, generates join tokens).
- `ap join https://platform --token <tok>` → fleet agent mode: stores enrollment in `~/.config/ap/agent.json`, connects outbound WSS, appears in target list.
- `docker compose up` → same binary in a container (platform or agent via env).
- `ap install-service` → optional systemd unit, one command.
- **Desktop shell (C12):** AppImage (Linux-first) containing the Tauri shell + `ap` sidecar binary. Double-click → service starts, window renders the app; quit → service stops.

**Sidecar contract (shell ↔ `ap`):**
- Shell spawns `ap serve --port 0 --no-browser`; `ap` picks a free port, prints `AP_READY http://127.0.0.1:<port>` on stdout; shell parses it and loads the URL.
- Shell sends SIGTERM on quit; `ap` shuts down gracefully (drain runs, close DB). SIGKILL fallback after 10s.
- Single-instance lock in the shell; second launch focuses the existing window.
- Tray: status dot (service up/down), "Open", "Start on login" checkbox (XDG autostart), "Quit".

### 2.3 Registration & agent protocol

1. Platform issues join token (single-use or N-use, expiring).
2. Agent connects `wss://platform/api/agent/connect` with token; TLS + token auth; platform records agent (name, tags, version, capabilities).
3. Heartbeat every 15s; 2 missed beats → `offline`.
4. Frames (JSON in MVP): `hello`, `capabilities`, `heartbeat`, `dispatch`, `cancel`, `node_result`, `node_log`, `artifact_request`, `update_available`, `self_update`.

### 2.4 Targeting & capabilities

- Node `target`: `{ kind: "local" | "machine" | "tag" | "any", value?: string }` — default `local`.
- Capability report: `{ os, arch, display: "x11"|"wayland"|"none", tools: ["tesseract","xdotool","ydotool",…], screen: bool, input: "xdotool"|"ydotool"|"none", gpu?: bool }`.
- Node types declare **required capabilities** (e.g., screenshot → `screen:true`; input → `input != none`).
- Resolution at dispatch: candidate set (by kind) → filter online → filter capabilities → pick (machine: itself; tag/any: least-busy, sticky-prefer-last for cache locality). No candidate → node fails per retry policy, **loudly**.

### 2.5 Cross-machine data movement

- Inter-node payload = items array; **inline in the execution record up to 1 MB** per node output.
- Larger data → **artifact**: content-addressed (sha256), chunked upload to platform over HTTPS, referenced in items as `{ "$artifact": "<id>", "mime", "size", "name" }`. Consuming node's agent pulls it on demand (streamed). TTL default 72h (configurable); thumbnails for image artifacts to keep previews fast.
- Screenshots/screen-derived data are always artifacts (never inline).

### 2.6 Failure semantics (C3)

- **Target offline at dispatch:** retry policy (default: 3 attempts, exp. backoff 2s→30s); exhausted → node fails → run takes error path or fails.
- **Mid-run disconnect:** in-flight node executions on that agent marked `interrupted`; run marked `interrupted`; on agent reconnect, `retryOnDisconnect: true` nodes re-dispatch (idempotency note surfaced for side-effecting nodes); otherwise run fails loudly.
- **No silent queueing in MVP** — offline = fail loudly; optional per-automation "queue while offline" flag post-MVP.
- Per-node timeout (default 5 min), per-run timeout (default 1 h), both configurable.

### 2.7 Secrets & env resolution

- Credential vault: envelope encryption — random data key per credential, wrapped by instance key (generated at first run; optional master passphrase via OS keyring or `AP_MASTER_KEY`). SQLCipher evaluated and rejected: app-level envelope encryption is simpler, portable, and sufficient.
- **JIT delivery:** secret material is sent over the agent's authenticated WSS channel only at dispatch time, held in worker memory for the run, never written to agent disk.
- Env precedence (most specific wins): **machine > automation > global**. Resolution happens on the executing machine at node start; `${VAR}` and `{{ $env.VAR }}` both consult it.
- Exports: credentials referenced by `(type, name)`; env secrets referenced by key. Import prompts for missing values; unknown machine IDs in targets rebind to tags or prompt.

---

## 3. Tech stack decisions

| Decision | Choice | Rationale | Trade-off accepted |
|---|---|---|---|
| Runtime/language | **Bun + TypeScript** | `bun build --compile` single binary; `bun:sqlite`; `bun test`; npm ecosystem for plugin model; TS end-to-end | Native GUI automation is weak in JS → shell-out strategy with capability probe |
| Single binary | `bun build --compile` per OS/arch (linux-x64/arm64 first) | DX invariant | ~90–110 MB binary; cross-compile CI matrix |
| UI | React + Vite + TS + **React Flow** + Tailwind, embedded into binary | De-facto node-graph stack | Bundle discipline to keep binary lean |
| DB | SQLite via `bun:sqlite`, WAL; migrations via versioned SQL files | Zero-config DX | Single-writer; fine at our scale; Postgres option post-MVP |
| Agent transport | Outbound **WSS** (JSON frames MVP) | NAT-friendly, zero inbound config | Long-lived connection management |
| Inter-node data | n8n-style items array + artifact refs (C4) | Proven model | Per-item semantics complexity in node contract |
| Expressions | Sandboxed JS inside `{{ }}` (`$json`, `$items`, `$node`, `$env`, `$state`, `$now`) | n8n muscle memory | Sandbox must be hermetic (see risks) |
| OCR | System `tesseract` if present → else bundled WASM tesseract.js | Zero-dep DX with fast path | WASM is slower; capability probe decides |
| Screen capture | X11: `maim`/`scrot`/`import`(ImageMagick); Wayland: `grim`/XDG portal | No native modules | Tool availability varies → capability report + actionable error |
| Input control | X11: `xdotool`; Wayland: `ydotool` (uinput) | C11 (user) | Wayland input fragmented; top risk, mitigations §9 |
| LLM | OpenRouter (BYO key) + OpenAI-compatible endpoint | Requirement; vision calls execute **on platform** (images as artifacts) so keys never reach agents | Platform needs outbound net for vision nodes |
| Plugin sandbox | Bun **Worker** per plugin package + capability permissions (fs/net/env off by default); subprocess fallback if isolation proves insufficient | n8n-like authoring, safer than in-process | True isolation limits of Workers (risk §9) |
| Auth | Local: none (localhost bind). Platform: single admin token → session cookie; agent tokens scoped per agent | Small-team fit | No RBAC until post-MVP |
| Desktop shell | **Tauri v2**, sidecar pattern, Linux-first (AppImage, .deb if cheap) | C12; lightest wrapper; Rust only in CI packaging | Windows/macOS packaging deferred; shell auto-updater deferred |

---

## 4. Data models

### 4.1 Automation definition (stored per version; illustrative)

```jsonc
{
  "schemaVersion": 1,
  "name": "Nightly report check",
  "settings": { "runTimeoutSec": 3600, "savePayloads": true, "errorAutomationId": null },
  "nodes": [
    {
      "id": "n1", "type": "trigger.schedule", "typeVersion": 1, "name": "Every night",
      "target": { "kind": "local" },                 // default; uniform on ALL nodes incl. triggers
      "params": { "cron": "0 2 * * *" },
      "retry": { "attempts": 3, "backoffSec": [2, 8, 30] },
      "timeoutSec": 300, "disabled": false,
      "position": { "x": 120, "y": 200 }
    },
    {
      "id": "n2", "type": "system.command", "typeVersion": 1, "name": "Fetch metrics",
      "target": { "kind": "machine", "value": "web-01" },
      "params": { "command": "uptime && df -h", "shell": "/bin/bash" },
      "credentials": null
    },
    {
      "id": "n3", "type": "vision.ocr", "typeVersion": 1, "name": "Read screen",
      "target": { "kind": "tag", "value": "desktop" },
      "params": { "image": "{{ $items[0].binary.screenshot }}", "lang": "eng" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "sourcePort": "out", "target": "n2", "targetPort": "in" },
    { "id": "e2", "source": "n2", "sourcePort": "out", "target": "n3", "targetPort": "in" }
  ]
}
```

**Inter-node item:** `{ "json": {…}, "binary": { "screenshot": { "$artifact": "sha256:…", "mime": "image/png", "size": 812344 } } }`

### 4.2 Tables (SQLite, abbreviated)

- `automations(id, name, active_version_id, draft_json, settings_json, created_at, updated_at)`
- `automation_versions(id, automation_id, version_no, definition_json, label, created_at)`
- `agents(id, name, is_local, tags_json, capabilities_json, version, status, last_seen_at, enrolled_at)`
- `runs(id, automation_id, version_id, mode[manual|trigger|dry|partial], status[queued|running|success|error|interrupted|cancelled], trigger_json, started_at, finished_at, error)`
- `node_executions(id, run_id, node_id, agent_id, status, attempt, simulated, input_json|input_artifact, output_json|output_artifact, pinned, started_at, duration_ms, error_json)`
- `artifacts(id(sha256), size, mime, name, created_run_id, expires_at)`
- `credentials(id, name, type, enc_blob, created_at)` · `env_vars(scope[global|automation|machine], scope_id, key, value, is_secret)`
- `state(automation_id, key, value_json, updated_at)` · `join_tokens(token_hash, uses_left, expires_at)` · `settings(key, value)`

### 4.3 Node interface (design sketch — the plugin contract; built-ins use it too)

```ts
interface NodeDefinition<P = unknown> {
  type: string;                       // "vision.ocr"
  version: number;
  displayName: string; category: string; icon?: string;
  requiredCapabilities?: Partial<CapabilityReport>;   // C1
  sideEffecting: boolean;             // if true, MUST implement simulate()
  inputs: PortSchema[]; outputs: PortSchema[];        // shaped for C7 sub-automations
  paramsSchema: JSONSchema;           // drives auto-generated param forms
  run(ctx: RunContext<P>): Promise<NodeItem[]>;
  simulate?(ctx: RunContext<P>): Promise<SimulationReport>; // C5
}
```

---

## 5. API surface

**REST (platform):**
- `…/automations` CRUD, `POST /:id/activate|deactivate`, `GET /:id/versions`, `POST /:id/revert/:v`, `GET /:id/export`, `POST /import`
- `…/runs` list/get, `GET /:runId/nodes/:nodeId/data`, `POST /automations/:id/run` (full|partial|single-node, `dryRun`, `fromNodeId`), `POST /runs/:id/cancel`, `POST /runs/:id/rerun-from/:nodeId`
- `…/agents` list/update/tags, `POST /agents/join-tokens`, `POST /agents/:id/update`
- `…/credentials` CRUD (write-only values); `…/env` per scope
- `PUT/GET /artifacts/:id` (chunked, agent-token or session)
- `POST /ai/chat`, `POST /ai/apply`; `GET /system/info`

**Webhooks (public):** `POST /hooks/test/:automationId/:path` (editor-listening mode, 2-min window) and `POST /hooks/:automationId/:path` (production, requires active).

**Agent protocol (WSS):** `hello{caps,version}` → `welcome{agentId}`; `heartbeat`; `dispatch{nodeExecutionId, node, params(resolved), items, secrets}`; `node_log`, `node_result{status, items, artifacts}`, `cancel`, `artifact_request`, `self_update{url, sha256}`.

---

## 6. UI/UX plan

- **Editor:** React Flow canvas; palette grouped by category; drag-wire; auto-generated param forms from `paramsSchema` with expression editors (`{{ }}` + data-tree picker).
- **Targeting UX:** every execution-capable node shows a **target badge** (icon + label, e.g. 🖥 local / 🖧 web-01 / 🏷 desktop / ⚡ any). One dropdown on the node + in its editor; default `local`. Canvas toggle "group by target" draws subtle colored lanes/clusters so mixed-target graphs read at a glance. Offline/incapable targets get a red badge *before* run.
- **Previews:** n8n-style input/output panels per node — table/JSON/raw, image-artifact thumbnails, pin-button, per-node history (with **agent name** and duration), disabled toggle, "execute step" (partial run), "re-run from here".
- **Dry-run:** global toggle; amber banner; side-effecting nodes show their `SimulationReport` ("would run: `rm -rf /tmp/x`"); simulated nodes visually hatched.
- **Runs:** execution list + run detail (graph replay with per-node status, target, timing, error); interrupted runs clearly marked with resume/retry affordances.
- **AI panel:** right-side chat; proposals arrive as **diff cards** (node added/removed/param changed, JSON-patch preview + visual canvas diff); per-change approve/reject, then "Apply approved".
- **Settings:** env vars (3 scopes), credentials, agents (capabilities, tags, update button), AI provider (OpenRouter key, model picker, custom endpoint).
- **Desktop shell (C12):** native window rendering the embedded UI; tray with status/Open/Start-on-login/Quit; single-instance.

---

## 7. MVP definition

**IN:** unified binary + standalone/platform/agent modes; local + fleet mixed-target execution; capability-aware targeting; artifact store; nodes — `system.command`, `fs.read/write`, `http.request`, vision set (`screenshot`, `ocr`, `image.detect` w/ confidence, `llm.vision`), input set (`mouse.click/move`, `keyboard.type/key`) per C11, logic (`if`, `switch`, `merge`, `loop`, `delay`, `error.throw/catch-path`, `code`, `set/edit`, `state.get/set`); triggers (manual, schedule, webhook test/prod, polling); env scopes + credential vault + JIT secrets; single-node/partial/dry-run/pinning/re-run-from-node; previews; versioning + revert; export/import with rebinding; AI chat panel (diff-apply); agents UI + self-update; plugin **format** (manifest + sandboxed loader, local folder/npm specifiers); **desktop shell (Tauri sidecar, Linux-first, tray + autostart)**.

**OUT (post-MVP):** event triggers (file/system), sub-automations, registry/palette UI, multi-user/RBAC, git sync, external secret stores, log streaming/OTel, offline queueing, MCP server, evaluations, Postgres option, mobile UI, **Windows/macOS desktop packaging, desktop-shell auto-updater**.

---

## 8. Implementation milestones

| # | Milestone | Independently testable acceptance criteria |
|---|---|---|
| M0 | Skeleton & build | `bun build --compile` produces one binary serving embedded UI hello-world; `bun test` CI green; versioned migrations run on first boot |
| M1 | Local execution core | Create automation via API; run `trigger.manual → system.command → if` locally; items/expressions resolve; run + node records with I/O stored; `state.get/set` works |
| M2 | Editor & debugging | Canvas CRUD round-trips definition; previews show table/JSON/raw; pin data alters next manual run; disabled node skipped; single-node + partial run pass; dry-run executes `simulate()` only and badges it |
| **M3** | **Desktop shell (Tauri)** | Double-clicking the AppImage starts the service and shows the app with **no terminal**; ready-in-window in <5s warm start; quitting the app stops the service (no orphan `ap` process, verified via `ps`); tray shows live up/down status + Open/Quit; start-on-login toggle survives reboot (XDG autostart); second launch focuses existing window; `ap ui` browser-open fallback works headlessly; CI emits AppImage for linux-x64 |
| M4 | Vision & input nodes | On X11 and Wayland sessions: screenshot→artifact; OCR extracts known text (system + WASM paths); `image.detect` honors confidence threshold; `llm.vision` answers content question via OpenRouter; click/type perform on X11 and ydotool-capable Wayland; clean "unsupported" errors elsewhere |
| M5 | Fleet | `ap join` enrolls in <60s; agent shows capabilities; **mixed-execution acceptance (see below)**; artifact crosses machines; offline target fails loudly after retries; mid-run disconnect → interrupted + resume; self-update swaps binary and reconnects |
| M6 | Triggers & activation | Draft edits don't fire until activate; cron fires on time; webhook test URL delivers to listening editor, prod URL only when active; polling trigger with `$state` cursor dedupes |
| M7 | Config, secrets, sharing | Env precedence machine>automation>global verified on-agent; secret delivered JIT (absent from agent disk, verified); export contains zero secret values; import prompts + rebinds unknown machine IDs to tags |
| M8 | Versioning | Every save versions; history lists all; revert restores and creates new version; activated version pinned for triggers |
| M9 | AI panel | Chat proposes diff for "build X"; per-change approve; apply yields valid runnable automation; model/key configurable; works with custom OpenAI-compatible endpoint |
| M10 | Hardening & E2E | Re-run-from-node reproduces recorded outputs; payload-retention toggle stores no I/O; full E2E suite incl. mixed-execution scenario green; migration + upgrade path tested |

**Mixed-execution acceptance test (M5, re-verified in M10):** schedule trigger (local) → `system.command` on machine A (produces text) → `screenshot` on machine B (artifact) → `vision.ocr` on **local** reading B's artifact → `if` on local branching on OCR text → `system.command` follow-up on A. Pass criteria: correct routing per badge, artifact transferred B→platform→local, per-node records show agent A/B/local correctly, and the same graph runs identically when "local" is the only agent (no special-casing proof).

---

## 9. Open risks & trade-offs

1. **Wayland input fragmentation (highest):** uinput/ydotool needs root/group setup; portals vary. *Mitigation:* capability probe, first-run diagnostic (`ap doctor`) with distro-specific fix hints, explicit node-level errors, docs. X11 fully supported.
2. **Sandbox hermeticity:** Bun Worker + `node:vm` coverage is imperfect for hostile plugins/expressions. *Mitigation:* plugins are trust-on-install (n8n's stance) + permission manifest; expressions evaluated *inside* the worker sandbox; subprocess isolation as fallback if testing shows escapes.
3. **Single-binary size & native tool deps:** ~100 MB binary; screenshot/OCR/input rely on system tools. *Mitigation:* `ap doctor` + capability report + one-line install hints; WASM OCR fallback keeps zero-dep path alive.
4. **SQLite at scale:** fine for target audience; Postgres adapter deferred (C10).
5. **Deferred scope** (C10 + C12 list): documented seams only; no partial builds.
6. **Trigger clock semantics:** schedule evaluated on platform clock; observable triggers run on-target. Timezone per automation setting; documented.
7. **Idempotency on reconnect:** retrying side-effecting nodes may double-act; surfaced via `retryOnDisconnect` default-false for side-effecting nodes and a UI warning.
8. **Desktop shell (C12):** Tauri pulls webkit2gtk on Linux (system dep, standard on desktops); shell auto-updater deferred — the `ap` binary self-updates independently, so a stale shell is cosmetic only.
