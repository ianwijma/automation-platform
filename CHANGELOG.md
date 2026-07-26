# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-07-26

### Added

- Visual automation editor with React Flow canvas and 26 node types
- Execution engine with topological sort, retry, and timeout
- Local agent dispatch for in-process execution
- WSS-based fleet agent protocol with capability-aware targeting
- Tauri v2 desktop shell with sidecar, tray, and autostart
- Vision nodes: screenshot, OCR, image detection, LLM vision
- Input nodes: mouse click/move, keyboard type/key
- Trigger nodes: manual, schedule (cron), webhook, polling
- Logic nodes: if, switch, merge, loop, delay, set, code
- System nodes: command
- State nodes: get, set
- Error nodes: throw
- AES-256-GCM envelope encryption credential vault
- 3-scope environment variable system (machine > automation > global)
- Automation versioning with auto-version on save
- AI chat panel with OpenRouter integration and structured diff apply
- Re-run-from-node with pinned upstream data
- Payload retention toggle (savePayloads: false)
- Export/import automation with credential rebinding
- Content-addressed artifact store with TTL
- Sandboxed JS expression evaluator ({{ }})
- Dry-run mode with simulation reports
- CLI: serve, join, agent, ui, doctor, install-service
- Single binary compilation (~102MB) via `bun build --compile`
- SQLite with WAL mode and embedded SQL migrations
- 132 tests passing
