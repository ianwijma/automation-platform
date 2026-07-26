# Contributing to Automation Platform

Thanks for your interest in contributing! This document covers the process and conventions.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<you>/automation-platform.git`
3. Install dependencies: `bun install && cd ui && npm install && cd ..`
4. Create a feature branch: `git checkout -b feature/my-feature`
5. Make your changes and add tests
6. Run the test suite: `bun test`
7. Run type checking: `bun run typecheck`
8. Push and open a Pull Request

## Development

```bash
bun run dev          # Start the platform in development mode
bun test             # Run all tests
bun run typecheck    # TypeScript type checking
bun run build        # Build the single binary
cd ui && npm run dev # Start the UI dev server (separate terminal)
```

## Code Conventions

### TypeScript

- **No comments** unless explicitly requested — code should be self-documenting
- **No `any` types** — use proper type definitions
- **Immutable data** — prefer `const`, spread operators, and `Readonly` types
- **Named exports** — prefer named exports over default exports
- **File naming** — kebab-case for all files (`my-component.tsx`, `node-registry.ts`)
- **Import style** — use `.js` extensions in imports (ESM with Bun)

### Node Types

All node types follow the `NodeDefinition` contract from `src/core/node-contract.ts`:

```typescript
const definition: NodeDefinition<Params> = {
  type: "category.name",
  version: 1,
  displayName: "Human Name",
  category: "category",
  sideEffecting: boolean,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: { param: { type: "string", description: "..." } },
  requiredCapabilities: [],

  async run(ctx: RunContext<Params>): Promise<NodeItem[]> {
    // ...
  },

  async simulate(ctx: RunContext<Params>): Promise<SimulationReport> {
    return { description: "...", wouldDo: "..." };
  },
};

nodeRegistry.register(definition);
```

### API Routes

Routes are registered in `src/api/routes.ts` as objects with `method`, `pattern`, and `handler`:

```typescript
{
  method: "GET",
  pattern: "/api/resource/:id",
  handler: (ctx, _req, params) => {
    return json({ id: params.id });
  },
},
```

### Testing

- Tests use Bun's built-in test runner (`bun:test`)
- Test files go in `test/` and follow the pattern `<feature>.test.ts`
- Every new node type, API endpoint, and core feature must have tests
- Run `bun test` before every commit

### Commits

- Use the present tense: "add feature" not "added feature"
- Reference task IDs when applicable: "T-090: add credential vault"
- Keep commits focused — one logical change per commit

## Pull Requests

- Fill out the PR template completely
- Link related issues
- Include tests for new functionality
- Ensure `bun test` and `bun run typecheck` pass
- Keep PRs small and focused — large PRs will be asked to split

## Reporting Issues

- Use the Bug Report template for bugs
- Use the Feature Request template for new ideas
- Include reproduction steps, expected behavior, and actual behavior
- Mention your OS, Bun version, and platform version

## Architecture Decisions

Key invariants that must be preserved:

1. **DX-first** — one binary, zero-config local, single-flag fleet join
2. **Unified execution model** — local and remote agents use the same `AgentDispatch` interface
3. **Single binary** — all migrations embedded as string constants, no filesystem reads for DB setup
4. **No special-casing** — a node running locally vs. remotely is transparent to the graph

## Questions?

Open an issue with the "question" label or start a Discussion.
