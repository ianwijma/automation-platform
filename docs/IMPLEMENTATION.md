# Repair implementation and verification

Recorded 2026-10-17. This describes the repaired working tree, not a published release. The design baseline remains in [PLAN.md](../PLAN.md); reconciled acceptance criteria and intentionally deferred work are in [TASKS.md](../TASKS.md).

## Purpose and retained architecture

The product combines two workloads: interactive Linux desktop automation and unattended data/system automation. A visual graph, manual debugging, production triggers and AI-assisted editing share one runtime. Fleet targets change where a node executes, not the meaning of its inputs, outputs, state or artifacts.

The useful foundations were retained: the Bun/TypeScript service, React Flow canvas, node registry and items model, SQLite data model, envelope-encrypted credentials, versioned definitions, WebSocket agents and Tauri shell. A wholesale stack migration would not have addressed the defects between these pieces.

The main architectural problem was that interfaces and UI surfaces existed without reliable end-to-end behavior. Graph routing, triggers, persistence, remote context, actual cancellation and packaging needed integration work. A large green unit suite was not evidence that an installed desktop app or a real fleet workflow worked.

## What changed

| Area | Repair | Main source/evidence |
|---|---|---|
| Contracts | Runtime graph/item/port/run validation, shared frontend API types, generated node palette schema | `src/core/schemas.ts`, `scripts/catalog.ts`, `ui/src/types.ts` |
| Execution | Trigger selection, active branch routing, merges, explicit loop continuation/done paths, per-item typed expressions, separate attempts | `src/core/execution-engine.ts`, `src/core/reliability.test.ts` |
| Isolation | QuickJS instead of host evaluation; bounded memory/CPU; synchronous code outputs validated before state commit | `src/core/sandbox.ts`, `src/nodes/logic-code.ts` |
| Cancellation | Abort propagation through agents, fetch, delays and OCR; bounded output; shell process-group termination | `src/core/safe-spawn.ts`, `src/core/cancellation.ts`, `src/agent/local-agent.ts` |
| Durable execution | SQLite state and immutable definition snapshots, running attempts persisted, restart interruption without replay, replay from retained inputs | `src/agent/dispatcher.ts`, run/rerun API tests |
| Dry runs | Required simulators for side effects, pure transformations execute, isolated state overlay, visible simulation reports | Engine/local-agent and browser tests |
| Triggers | Server-owned Croner/polling jobs, active-version isolation, timezone validation, persisted polling cursor, non-overlap, stopAfter, visible errors, real webhook input | `src/api/trigger-manager.ts`, live integration tests |
| Failure handling | Active error automations receive redacted events; bounded/cycle-safe chains; no error handler on dry/cancelled/uncertain runs | `src/api/runs.ts`, reliability tests |
| Fleet | Protocol v2 validation, one-use enrollment then persistent hashed identity, reconnect/revocation, target capability/load checks, remote state writes and artifact transfer | `src/api/wss-hub.ts`, `src/agent/wss-client.ts`, `src/api/live-integration.test.ts` |
| Secrets/network | Loopback default, Host/Origin checks, administrator bearer/session auth for network deployment, write-only credential APIs, external key file, encrypted secret env/AI settings, persisted-record redaction | `src/api/security.ts`, `src/core/secret-store.ts`, reliability and browser tests |
| Payloads | Artifact expiry and size limits, checksum validation, large recorded payload spilling, readable replay failure after expiry | `src/api/artifacts.ts`, dispatcher, artifact/reliability tests |
| Editor | Invalid-input save/run blocking, revision conflict protection, immutable version preview, credential/env/fleet/import forms, execution settings, async runs with cancellation | `ui/src/store.ts`, editor/settings/run components, browser tests |
| AI | Validated all-or-nothing graph diffs, explicit approval, stale-proposal rejection, revision refresh after applying, provider model picker | AI service/routes and controlled-provider browser test |
| Desktop | Shared X11/window/region driver; portal helper for GNOME/KDE; compositor adapters; artifact-backed capture; offline English OCR; bounded ImageMagick matching | `src/core/desktop-driver.ts`, `desktop/bridge`, `desktop/adapters`, native smoke scripts |
| Distribution | Embedded UI/WASM/OCR/bridge; compressed desktop runtime resource; pinned workspace toolchain/locks; unprivileged container and TLS proxy configuration; Linux CI | `build.ts`, `desktop`, `Dockerfile`, `compose.yaml`, `.github/workflows/verify.yml` |

The unused prototype scheduler and polling manager were removed. Their isolated tests did not exercise the real server; replacement tests actually activate cron/polling and observe execution and deactivation. Existing user edits were preserved, and formatter-only changes outside the repair were removed.

## Verification evidence

All automated checks used temporary profiles, test-owned windows or disposable containers. No existing profile was deleted, no automation was run against the user's desktop applications, and no paid AI provider call was made.

| Check | Result and scope |
|---|---|
| TypeScript and Vite UI build | Pass; the frontend consumes the shared API types and generated catalog |
| `bun test src/ --coverage` | **515 passed, 0 failed**, 64 files; 83.51% function / 85.20% line coverage in this run |
| Full Chromium suite | **123 passed, 0 failed**, including the starter import, authenticated login, cancellation and controlled-provider AI approval/revision flows |
| Real fleet transport | Pass: actual loopback HTTP/WebSocket server/client, enrollment/reconnect identity, revocation, state writes, bidirectional artifacts, agent attribution. This is not a physical multi-host WAN test |
| Background execution | Pass: actual cron fires, polling changes are observed, persistent count/dedup, stopAfter and deactivation stop firing |
| Process cancellation | Pass: cancelling a command kills its process group before a delayed file-write side effect |
| Recovery/replay | Pass: interrupted attempts recover without replay; immutable history/state survive dispatcher replacement; large payloads hydrate and expiry blocks replay |
| Security regression | Pass: hostile origins/hosts rejected, write-only credential/env UI/API, secret redaction, HttpOnly login session, sandbox host access denied and runaway code interrupted |
| AI editing | Pass with a controlled local provider: proposal leaves graph unchanged until approved; reject/approve works; apply and subsequent save work; stale remote changes are rejected; model list loads |
| Starter workflow | Pass through the browser: import the README example, run, verify stored result 42 |
| Owned X11 desktop | Pass: title/PID discovery, focus, window capture artifact, offline OCR, typing and window-relative click using Xvfb and an owned Xlib fixture |
| Portable executable | Pass from an empty directory: embedded UI/assets, API, SQLite, sandbox and offline OCR, followed by shutdown |
| Rust portal bridge | Cargo check/test pass; one key/chord mapping test. Real portals/compositor sessions are not covered |
| Native packages | Debian and AppImage builds pass; the Debian payload matches `dist/ap` byte-for-byte and its extracted runtime passes the portable/OCR smoke. See packaging notes below; interactive shell acceptance remains open |
| Container | Build and disposable runtime pass: administrator authentication, embedded UI, non-root command execution, offline OCR and deterministic real image matching |
| Compose | Configuration validates. A public-domain TLS/ACME deployment was not performed |
| Hosted CI | Workflow implemented; no GitHub Actions run or published artifacts claimed |

The unit coverage numbers exclude the separate native/browser smoke coverage. They are useful for finding omissions, not a production-readiness score. The UI build also warns about its main bundle size; code splitting is a performance follow-up rather than an execution blocker.

## Packaging defects found by real builds

The original Tauri configuration and sidecar layout did not produce a usable packaged runtime. Building the portable executable also needed the static UI and runtime assets embedded rather than references back into the checkout.

AppImage's linuxdeploy rewrites ELF binaries; that rewrite broke Bun's embedded executable payload. The desktop package now carries `resources/ap.gz`. The shell extracts its exact bytes into a content-hashed application cache directory with private executable permissions, then starts that file. The standalone `dist/ap` remains directly executable. `scripts/package-smoke.ts` checks the packaged payload against the standalone binary and runs it from an extracted temporary directory.

This host also has an AppImageLauncher interception incompatibility with the downloaded packaging plugin. Local validation used a fresh temporary Tauri cache and a temporary plugin copy with its AppImage interception marker disabled; no system configuration or installed cache was modified. The resulting application package keeps its normal AppImage format. CI uses a clean Ubuntu runner without that host integration. If a developer sees linuxdeploy plugin exit 127 or extraction errors on an AppImageLauncher host, use a clean packaging environment; do not assume the application code is responsible.

## Boundaries that remain

- **Wayland acceptance:** GNOME/KDE portal consent, restore/revocation, window adapters, mixed scaling, multiple monitors, keyboard layouts and cancellation need real sessions. Follow [DESKTOP-ACCEPTANCE.md](DESKTOP-ACCEPTANCE.md). Other compositors are unsupported targets for now.
- **Interactive shell acceptance:** tray actions, close-to-tray behavior, second-instance focus, autostart through logout/reboot and quit/orphan checks must be exercised on the supported desktops. Building an installer does not prove them.
- **Distribution:** packages are unsigned development builds. Hosted CI, clean-machine installation and a release signing/update process are still release work.
- **Remote reality:** loopback fleet behavior is verified. Real multiple hosts, TLS reverse proxies, unstable networks and mixed desktop sessions need deployment acceptance. An interrupted action remains uncertain, not automatically retryable.
- **Data compatibility:** use a fresh profile for this prototype repair. Historical plaintext keys fail closed. Export/rebind workflows deliberately; do not claim old snapshots/FK layouts are all migrated.
- **Resource limits:** 16 concurrent runs, 1,000 nodes, 5,000 edges, 10,000 output items/16 MiB per node, 32 MiB per artifact and bounded WebSocket messages. Artifacts currently transfer whole, not chunked/resumable. ImageMagick template matching is CPU-intensive; large templates/screens may require a region and a longer timeout. A larger benchmark hit its timeout; only the deterministic small-template correctness case is certified here.
- **Trust:** shell workflows have the agent user's privileges. The QuickJS sandbox protects user expressions/code; it does not turn the whole product into a hostile-workflow sandbox. Image pixels, arbitrary artifacts and deliberately transformed/literal secrets are not automatically scrubbed.
- **Persistence policy:** runs are durable but there is no historical run-retention UI, backup scheduler or exactly-once external side-effect guarantee. Polling state is automation-scoped and persists until explicitly reset.
- **Extensions:** plugin loading and self-update fail explicitly. Isolated plugin execution, verified updates, streaming artifacts, event triggers, multi-user/RBAC and telemetry remain separate work.
- **Editor refinements:** explicit rename/remove field controls and a data-tree expression picker remain. Live paid-provider quality/latency and vision model behavior need configured-service acceptance.

## Next release sequence

1. Run the checked-in CI on the branch and retain its unsigned artifacts and logs.
2. Execute the GNOME/KDE and interactive shell acceptance matrix; fix failures before calling those environments supported.
3. Install on a clean Linux machine and run a TLS-protected two-agent workflow with real capture/input and an intentional network interruption.
4. Choose artifact/run retention and backup policies; profile image-matching workloads and introduce streaming artifacts if the bounded protocol is insufficient.
5. Publish signed packages only after these gates pass. Implement plugins and updates as separate, reviewable capabilities.
