# Automation Platform

A self-hosted, AI-enabled Linux automation platform with a visual editor, fleet execution, and a desktop shell.

## Features

- **Visual Editor** — React Flow canvas with 26+ node types across 6 categories (triggers, logic, system, state, vision, input)
- **Unified Execution Model** — local and remote agents use the identical `AgentDispatch` interface; no special-casing
- **Fleet Execution** — WSS-based agent protocol, capability-aware target resolution (local/machine/tag/any)
- **Desktop Shell** — Tauri v2 sidecar that spawns the platform, system tray, autostart (Linux-first AppImage)
- **AI Assistant** — OpenRouter-backed chat with structured diff generation and one-click apply
- **Credential Vault** — AES-256-GCM envelope encryption, JIT secret delivery, optional passphrase wrapping
- **3-Scope Env Vars** — machine > automation > global precedence with secret resolution
- **Version History** — auto-version on every save, revert to any version, labeled releases
- **Re-run from Node** — partial re-execution with pinned upstream data
- **Payload Retention Toggle** — `savePayloads: false` nullifies I/O in execution records

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.3
- Linux (primary target; macOS works for development)
- Node.js >= 18 (for UI build)

### Install & Run

```bash
# Clone
git clone https://github.com/ianwijma/automation-platform.git
cd automation-platform

# Install dependencies
bun install

# Run in development mode
bun run dev

# Build the single binary (~102MB)
bun run build

# The binary prints AP_READY on stdout when the server is listening
./ap serve --port 42000
```

### Desktop App (Tauri)

```bash
cd desktop
cargo tauri dev    # development
cargo tauri build  # produces AppImage
```

### Fleet Agent

```bash
# Generate a join token from the platform
# Then on the remote machine:
./ap join --url ws://your-server:42000/api/agent/connect --token <token>
./ap agent
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Desktop Shell (Tauri v2)                       │
│  ┌─────────────────────────────────────────────┐│
│  │  React UI (React Flow + Tailwind CSS v4)    ││
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐      ││
│  │  │ Canvas  │ │ AI Panel │ │ History  │      ││
│  │  └─────────┘ └──────────┘ └──────────┘      ││
│  └─────────────────────────────────────────────┘│
│  Bun.serve (HTTP + WSS)                         │
│  ┌──────┐ ┌───────┐ ┌──────┐ ┌────────────┐     │
│  │Engine│ │Vault  │ │Router│ │ Fleet Hub   │     │
│  └──────┘ └───────┘ └──────┘ └────────────┘     │
│  SQLite (WAL) · Artifact Store (content-addressed)│
└─────────────────────────────────────────────────┘
         ▲ WSS ▲          ▲ WSS ▲
    ┌────┘      └────┐  ┌─┘     └──┐
    │ Agent A       │  │ Agent B  │
    │ (Linux host)  │  │ (Raspberry Pi)│
    └───────────────┘  └─────────────┘
```

### Key Principles

1. **DX-first** — one binary, zero-config local, single-flag fleet join
2. **Unified execution** — local/remote are identical agent records in graph semantics
3. **n8n-style items** — `{json, binary}` with `$artifact` refs
4. **Sandboxed expressions** — `{{ }}` JS expressions evaluated per-node

## Node Types

| Category | Nodes |
|----------|-------|
| **Triggers** | manual, schedule (cron), webhook, polling |
| **Logic** | if, switch, merge, loop, delay, set, code |
| **System** | command |
| **State** | get, set |
| **Vision** | screenshot, ocr, image.detect, llm |
| **Input** | mouse.click, mouse.move, keyboard.type, keyboard.key |
| **Error** | throw |

## Configuration

Environment variables:

| Variable | Description |
|----------|-------------|
| `AP_PORT` | HTTP server port (default: 42000) |
| `AP_DATA_DIR` | Data directory (default: `~/.automation-platform`) |
| `AP_MASTER_KEY` | Optional passphrase wrapping the instance encryption key |
| `AP_LOG_LEVEL` | Log level: debug, info, warn, error (default: info) |

## Testing

```bash
bun test              # Run all tests
bun test test/fleet   # Run specific test file
bun run typecheck     # TypeScript type checking
```

## Project Structure

```
src/
  core/       # Types, execution engine, expressions, node registry, crypto
  agent/      # Local agent, fleet dispatcher, WSS client, capability probe
  api/        # HTTP routes, WSS hub, artifacts, webhooks, AI service
  nodes/      # All node type implementations
  cli/        # CLI subcommands (serve, join, agent, doctor)
  db/         # SQLite database with embedded migrations
ui/            # React + React Flow + Tailwind CSS v4 editor
desktop/       # Tauri v2 desktop shell
test/          # Test files
```

## License

MIT — see [LICENSE](./LICENSE)
