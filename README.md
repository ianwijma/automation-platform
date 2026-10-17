# Automation Platform

A self-hosted, AI-enabled Linux automation platform with a visual editor, fleet execution, and an optional desktop shell. It combines desktop workflows (capture, OCR, window targeting and input) with unattended command, data, schedule, webhook and polling workflows.

## Status

The repair implementation preserves Bun, TypeScript, React Flow, SQLite and Tauri. The engine now executes connected branches and loop batches, records durable run attempts, cancels actual work, and uses the same execution context for local and remote agents. The editor saves validated definitions and exposes credentials, scoped environment variables, execution settings, fleet enrollment and portable imports.

Verified locally: TypeScript and UI builds; unit/integration and Chromium suites; real loopback fleet transport with reconnect, state and artifact transfer; an isolated X11 desktop workflow; a portable executable launched outside the checkout; a Tauri Debian package; and a container build. See [implementation and verification](docs/IMPLEMENTATION.md) for exact evidence, limitations and remaining release gates. This is a development build, not a claim of production readiness or tested support on every Linux desktop.

GNOME/KDE Wayland support has a compiled portal helper and compositor adapters. It still needs actual GNOME and KDE session acceptance testing. Plugins and agent self-update are deliberately disabled until isolated plugin execution and verified update delivery exist.

## Run locally

Use Bun **1.3.9** and Rust **1.95.0** for the tested build toolchain. Node.js 22+ is used for Playwright. The Rust toolchain is needed to build the desktop bridge; it is not needed to run the resulting executable.

```bash
bun install --frozen-lockfile
bun run build:ui
bun run dev
```

Open the URL printed after `AP_READY`. The server binds `127.0.0.1` by default. Development mode builds the offline OCR worker; run `bun run build:ui` again after editing the frontend.

To build the portable Linux executable:

```bash
bun run build
./dist/ap serve --no-browser
./dist/ap doctor
```

The executable embeds the UI, QuickJS sandbox, desktop bridge, OCR worker and English OCR data. Runtime helpers are extracted into the profile's `runtime/` directory. The desktop shell separately caches its unchanged executable under its application cache directory. System desktop utilities remain prerequisites; “portable” does not mean statically linked or independent of the host desktop session.

For the first workflow, open **Settings → Import automation**, choose [examples/first-workflow.json](examples/first-workflow.json), import, select it, and click **Run**. It calculates a value and stores it in automation state. **Dry run** uses a temporary state overlay. Node previews show the inputs, outputs and executing agent.

## Linux desktop dependencies

For X11 on Debian/Ubuntu:

```bash
sudo apt install xdotool wmctrl maim imagemagick tesseract-ocr
```

`maim` can fall back to `scrot` or ImageMagick's `import`. English OCR also works through the bundled offline WASM engine when system Tesseract is absent. Template matching requires ImageMagick's `compare` command.

For GNOME/KDE Wayland, use the matching `xdg-desktop-portal` backend, PipeWire, GStreamer with its PipeWire plugin, and ImageMagick. The desktop must grant screen-sharing and remote-input consent. Window title/PID/app targeting additionally requires the matching adapter in [desktop/adapters](desktop/adapters/README.md). Other Wayland compositors are outside the current support target. Headless containers provide the control plane; run desktop agents inside the user's graphical session.

Targets can select a screen, an unambiguous window, or a region. Title selectors are regular expressions. Input coordinates are relative to the selected window or region. Ambiguous or missing windows fail explicitly. See [desktop acceptance matrix](docs/DESKTOP-ACCEPTANCE.md).

## Desktop application

On Debian/Ubuntu, install the Tauri build dependencies first:

```bash
sudo apt install build-essential libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
bun run --cwd desktop dev
bun run --cwd desktop build --bundles deb,appimage
```

The workspace install includes the pinned Tauri CLI. Builds produce bundles under `desktop/src-tauri/target/release/bundle/`. The shell starts its bundled `ap` sidecar on a loopback port, loads the UI, and stops the service on quit. Tray and autostart integration still need interactive release acceptance on the supported desktops.

## Fleet and unattended deployment

For network access, set a random `AP_ADMIN_TOKEN` of at least 32 characters and an HTTPS `AP_PUBLIC_URL`. Terminate TLS at a reverse proxy; do not expose the platform's HTTP port directly. The UI asks for the administrator token and establishes an HttpOnly session. This is a single-administrator platform, without multi-user authorization.

The provided Compose setup runs an unprivileged control plane behind Caddy:

```bash
export AP_ADMIN_TOKEN="$(openssl rand -hex 32)"
export AP_DOMAIN=automation.example.com
docker compose up --build -d
```

Point the domain to the host and allow ports 80/443 for TLS provisioning. For a local trial, omit `AP_DOMAIN` and use `https://localhost`; Caddy uses its local CA, which must be trusted by the client. Keep the administrator token somewhere secure. Compose does not publish the internal HTTP port. Persistent volumes contain the database, encryption key and artifacts.

Create a one-use token in **Settings → Fleet**, then on another machine:

```bash
./dist/ap join https://automation.example.com --token JOIN_TOKEN
./dist/ap agent
```

Enrollment exchanges the join token for a persistent identity stored in a mode-0600 `agent.json`. Reconnect preserves the agent ID and tags; revoke an agent from Settings to invalidate its identity. Run GUI agents in the desktop session, with its display and session D-Bus environment. Fleet dispatch is capability-aware and uses a bounded WebSocket protocol. A disconnect during an action is recorded as an uncertain, interrupted outcome; actions are not automatically replayed.

## Execution behavior

- **Drafts and activation:** manual runs use the saved draft; production triggers use the activated version. Save then activate again to publish changes. Invalid cron, timezone, polling or webhook configuration fails activation.
- **Graph:** IF/Switch route only matching ports. Merge combines active inputs. Loop batches use `out → body → continue`, with a separate `done` path. Other cycles are rejected. Disabled nodes produce no output, so dependent paths stop.
- **Expressions and code:** `{{ }}` preserves JSON types. Expressions and synchronous JS/TS code run in QuickJS with CPU/memory limits and no host filesystem, network, `process` or `require`. Use Command for authorized OS operations. Code receives `ctx.items`, `ctx.$json`, `ctx.$env` and `ctx.$state`.
- **Dry runs:** pure logic executes normally; side-effecting nodes must provide a simulation. State changes remain in the dry-run overlay. Simulations are shown in the run panel.
- **Timeouts and retries:** run and node timeouts propagate cancellation to commands, fetches and OCR workers. Commands run in cancellable process groups. Default retry is one attempt; enable retries deliberately for actions that can safely repeat.
- **History and replay:** attempts and immutable definitions persist in SQLite. On restart, unfinished work becomes interrupted, without replay. Single-node and rerun requests return an accepted run immediately, so they remain cancellable. Rerun requires retained inputs and uses the original definition.
- **Triggers:** cron runs in the platform, polling executes on the selected agent, and polling state persists. Overlapping fires of the same background trigger are suppressed. Missed cron events during downtime are not replayed. A polling `stopAfter` count persists across activation until its state is reset or the node is replaced.
- **Webhooks:** configure one path segment and method. Production `/hooks/:automationId/:path` requires activation. The editor's Listen action opens `/hooks/test/:automationId/:path` for two minutes. Accepted requests return immediately. Configured webhook URLs are public entry points; apply sender authentication at the reverse proxy where needed.
- **Failure automation:** full runs can invoke an active automation with one Manual Trigger, receiving `failedRunId`, `automationId`, and a redacted `error`. Cycles/deep chains are stopped. Dry runs, cancelled runs and uncertain disconnects do not invoke it.

## Secrets, state and artifacts

Credentials and secret environment variables are encrypted; credential APIs return metadata only. Environment precedence is machine → automation → global. The encryption key lives outside SQLite in `ap.db.key` (mode 0600); `AP_MASTER_KEY` optionally wraps it with a passphrase. Back up the database, key and artifacts together, and keep the same passphrase when restoring.

Use a **fresh profile** when trying this repaired prototype:

```bash
AP_DATA_DIR="$HOME/.config/ap-repaired" ./dist/ap serve
```

Existing profiles are not deleted. Legacy plaintext instance keys are rejected with instructions instead of silently reusing them. Export definitions and rebind credentials if migrating prototype data. Do not assume every historical schema or secret format has a tested migration.

Known secret values and sensitive fields are redacted from persisted execution records, while live node data remains usable. Redaction does not inspect image pixels, arbitrary artifact contents, encoded/transformed secrets, or literal secrets pasted into commands. Shell nodes execute with the agent user's OS permissions; this application is not a sandbox for untrusted workflows.

Artifacts are SHA-256-addressed, expire after 72 hours by default, and are limited to 32 MiB each. Recorded node payloads above 1 MiB spill to an artifact. Fleet artifacts currently use bounded whole WebSocket messages, not streaming/chunked transfer. Expired payloads cannot be replayed. Redacted historical inputs cannot reproduce a removed secret; rerun upstream nodes to resolve it again. `savePayloads=false` suppresses recorded node I/O; required working artifacts still exist until expiry.

## AI assistant

Configure an OpenRouter or OpenAI-compatible endpoint, key and model in Settings. The assistant proposes structured node/edge/settings diffs; changes require explicit approval. The backend validates every operation and rejects stale proposals if the saved draft changed. Provider keys and secret environment values are not included in the graph context. Workflow content you put in prompts or node parameters is sent to the configured provider. Live paid-provider behavior remains an integration acceptance check; automated tests use controlled responses.

## Configuration

| Variable | Meaning |
|---|---|
| `AP_DATA_DIR` | Profile directory; default `~/.config/ap` |
| `AP_PORT` | HTTP port; default 7480; 0 selects a free port |
| `AP_HOST` | Bind address; default `127.0.0.1` |
| `AP_PUBLIC_URL` | Externally reachable HTTPS origin for reverse-proxied access |
| `AP_ADMIN_TOKEN` | Administrator bearer token; required for network binding |
| `AP_MASTER_KEY` | Optional passphrase for the external instance key |
| `AP_NO_BROWSER` | Disable automatic browser launch |
| `AP_OCR_LANG_PATH` | Directory of local `*.traineddata.gz` files for additional OCR languages |
| `AP_DESKTOP_BRIDGE` | Override the bundled native helper path for development |

## Verification and structure

```bash
bun run check                       # TypeScript, UI build, unit/integration tests
bunx playwright install chromium
bun run test:e2e                     # Browser + API tests
bun run test:desktop                 # Owned Xvfb window; requires X11 dev tools
bun run build
bun run test:portable                # Executable from an empty temporary directory
cargo test --locked --manifest-path desktop/bridge/Cargo.toml
docker build -t automation-platform:implementation-test .
bun run scripts/container-smoke.ts   # Disposable container; removes its own data
```

CI builds the portable executable and unsigned desktop packages, runs browser and disposable X11 checks, and verifies the container. Actual GNOME/KDE sessions and interactive shell behavior remain explicit release gates.

`src/core` owns validated contracts, sandbox and execution; `src/agent` owns transport and dispatch; `src/api` owns HTTP, triggers and artifact storage; `src/nodes` contains 26 built-ins; `ui` is the visual editor; `desktop/bridge` is the native portal helper; `desktop/src-tauri` is the shell. `ui/src/node-catalog.json` is generated by `scripts/catalog.ts` from the backend registry. Add built-in nodes there, then regenerate the catalog with `bun run build:ui`.

[PLAN.md](PLAN.md) preserves the design baseline and amendments. [TASKS.md](TASKS.md) tracks evidence and remaining work. Plugins, unsigned self-update, event triggers, RBAC, telemetry and plugin distribution are not enabled features of this build.
