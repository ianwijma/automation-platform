import { getAiSettings } from "../core/ai-settings.js";
import type { Database } from "bun:sqlite";
import type {
  ExecutionDependencies,
  AgentDispatch,
  RunRecord,
  NodeExecutionRecord,
} from "../core/execution-engine.js";
import type { CapabilityReport } from "../core/node-contract.js";
import type { CredentialVault } from "../core/credential-vault.js";
import type { EnvResolver } from "../core/env-resolver.js";
import type { ArtifactStore } from "../api/artifacts.js";
import { LocalAgent } from "./local-agent.js";

export class AgentDispatcher implements ExecutionDependencies {
  protected agents = new Map<string, AgentDispatch>();
  protected db?: Database;
  private controllers = new Map<string, AbortController>();
  private stateMap = new Map<string, unknown>();
  private runs: RunRecord[] = [];
  private nodeExecutions: NodeExecutionRecord[] = [];
  private vault: CredentialVault | null;
  private envResolver: EnvResolver | null;

  readonly now = () => new Date();

  constructor(
    vault?: CredentialVault,
    envResolver?: EnvResolver,
    private artifactStore?: ArtifactStore,
  ) {
    this.vault = vault ?? null;
    this.envResolver = envResolver ?? null;
    this.registerAgent(new LocalAgent(artifactStore));
  }

  attachDatabase(db: Database): void {
    this.db = db;
    db.prepare(
      "INSERT OR IGNORE INTO agents (id,name,is_local,status) VALUES ('local','Local machine',1,'online')",
    ).run();
    for (const row of db
      .query<
        { record_json: string },
        []
      >("SELECT record_json FROM runs WHERE record_json IS NOT NULL")
      .all()) {
      const run: RunRecord = JSON.parse(row.record_json);
      if (run.status === "running" || run.status === "queued") {
        run.status = "interrupted";
        run.error =
          "Platform stopped during execution; actions were not replayed";
        run.finishedAt = new Date().toISOString();
        for (const attempt of run.nodeExecutions)
          if (attempt.status === "running") {
            attempt.status = "interrupted";
            this.updateNodeExecution(attempt.id, attempt);
          }
        this.saveRun(run);
      }
    }
  }
  registerRunControl(id: string, controller: AbortController): void {
    if (this.controllers.size >= 16)
      throw new Error(
        "Concurrent run limit reached (16); wait for an active run to finish",
      );
    this.controllers.set(id, controller);
  }
  releaseRunControl(id: string): void {
    this.controllers.delete(id);
  }
  cancelRun(id: string): boolean {
    const control = this.controllers.get(id);
    if (!control) return false;
    control.abort(new Error("Cancelled"));
    return true;
  }
  async shutdown(): Promise<void> {
    for (const control of this.controllers.values())
      control.abort(new Error("Platform shutting down"));
    const deadline = Date.now() + 5000;
    while (this.controllers.size && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 10));
  }
  getStateSnapshot(automationId: string): Record<string, unknown> {
    if (this.db)
      return Object.fromEntries(
        this.db
          .query<{ key: string; value_json: string }, [string]>(
            "SELECT key,value_json FROM state WHERE automation_id=?",
          )
          .all(automationId)
          .map((r) => [r.key, JSON.parse(r.value_json)]),
      );
    return Object.fromEntries(
      [...this.stateMap]
        .filter(([key]) => key.startsWith(`${automationId}:`))
        .map(([key, value]) => [key.slice(automationId.length + 1), value]),
    );
  }

  setVault(vault: CredentialVault): void {
    this.vault = vault;
  }

  setEnvResolver(envResolver: EnvResolver): void {
    this.envResolver = envResolver;
  }

  registerAgent(agent: AgentDispatch): void {
    this.agents.set(agent.agentId, agent);
  }

  getAgentForTarget(
    target: { kind: string; value?: string },
    _requiredCaps?: Partial<CapabilityReport>,
  ): AgentDispatch {
    const local = this.agents.get("local")!;

    if (target.kind === "local") {
      return local;
    }

    if (target.kind === "machine") {
      if (
        !target.value ||
        target.value === "local" ||
        target.value === local.agentId
      ) {
        return local;
      }
      throw new Error(
        `Remote agents not yet supported (target: ${target.value})`,
      );
    }

    if (target.kind === "tag" || target.kind === "any") {
      return local;
    }

    throw new Error(`Unknown target kind: ${target.kind}`);
  }

  sensitiveEnvValues(agentId: string, automationId: string): string[] {
    return (this.envResolver?.listVars() ?? [])
      .filter(
        (v) =>
          v.isSecret &&
          (v.scope === "global" ||
            (v.scope === "automation" && v.scopeId === automationId) ||
            (v.scope === "machine" && v.scopeId === agentId)),
      )
      .map(
        (v) =>
          this.envResolver!.getVar(
            v.scope as "global" | "automation" | "machine",
            v.scopeId,
            v.key,
          ) ?? "",
      );
  }
  resolveAiSecrets(): Record<string, string> {
    if (!this.db) return {};
    const settings = getAiSettings(this.db);
    return {
      apiKey: settings.apiKey ?? "",
      endpoint: settings.endpoint ?? "https://openrouter.ai/api/v1",
      model: settings.model,
    };
  }
  resolveEnv(
    agentId: string,
    automationId: string,
    _nodeType: string,
  ): Record<string, string> {
    if (!this.envResolver) return {};
    return this.envResolver.resolveForExecution(agentId, automationId);
  }

  resolveSecrets(
    _agentId: string,
    credentialRefs: Record<string, unknown>,
  ): Record<string, string> {
    const refs = credentialRefs as { type?: string; name?: string };
    if (!refs.name) return {};
    if (!this.vault) throw new Error("Credential vault unavailable");
    const credential = this.vault.getCredentialByName(refs.name);
    if (!credential || credential.type !== refs.type)
      throw new Error(`Missing credential ${refs.name} of type ${refs.type}`);
    return credential.values;
  }

  getState(automationId: string, key: string): unknown {
    if (this.db) {
      const row = this.db
        .query<
          { value_json: string },
          [string, string]
        >("SELECT value_json FROM state WHERE automation_id=? AND key=?")
        .get(automationId, key);
      return row ? JSON.parse(row.value_json) : undefined;
    }
    return this.stateMap.get(`${automationId}:${key}`);
  }

  setState(automationId: string, key: string, value: unknown): void {
    if (this.db) {
      this.db
        .prepare(
          "INSERT INTO state(automation_id,key,value_json) VALUES(?,?,?) ON CONFLICT(automation_id,key) DO UPDATE SET value_json=excluded.value_json,updated_at=datetime('now')",
        )
        .run(automationId, key, JSON.stringify(value) ?? "null");
      return;
    }
    this.stateMap.set(`${automationId}:${key}`, value);
  }

  saveRun(record: RunRecord): void {
    record = {
      ...record,
      nodeExecutions: record.nodeExecutions.map((n) =>
        this.compactExecution(n),
      ),
    };
    if (this.db) {
      const version = this.db
        .query("SELECT id FROM automation_versions WHERE id=?")
        .get(record.versionId);
      this.db
        .prepare(
          "INSERT INTO runs(id,automation_id,version_id,mode,status,started_at,finished_at,error,record_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,finished_at=excluded.finished_at,error=excluded.error,record_json=excluded.record_json",
        )
        .run(
          record.id,
          record.automationId,
          version ? record.versionId : null,
          record.mode,
          record.status,
          record.startedAt,
          record.finishedAt,
          record.error,
          JSON.stringify(record),
        );
      return;
    }
    const idx = this.runs.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      this.runs[idx] = record;
    } else {
      this.runs.push(record);
    }
  }

  saveNodeExecution(record: NodeExecutionRecord): void {
    record = this.compactExecution(record);
    if (this.db) {
      this.db
        .prepare(
          "INSERT INTO node_executions(id,run_id,node_id,agent_id,status,attempt,simulated,pinned,started_at,duration_ms,error_json,record_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,agent_id=excluded.agent_id,duration_ms=excluded.duration_ms,error_json=excluded.error_json,record_json=excluded.record_json",
        )
        .run(
          record.id,
          record.runId,
          record.nodeId,
          record.agentId,
          record.status,
          record.attempt,
          record.simulated ? 1 : 0,
          record.pinned ? 1 : 0,
          record.startedAt,
          record.durationMs,
          record.error,
          JSON.stringify(record),
        );
      return;
    }
    this.nodeExecutions.push(record);
  }

  private compactExecution(record: NodeExecutionRecord): NodeExecutionRecord {
    if (
      !this.artifactStore ||
      (record.payloadArtifact &&
        record.input === null &&
        record.output === null)
    )
      return record;
    const bytes = Buffer.from(
      JSON.stringify({
        input: record.input,
        output: record.output,
        outputs: record.outputs,
        simulation: record.simulation,
      }),
    );
    if (bytes.length <= 1024 * 1024) return record;
    const meta = this.artifactStore.storeArtifact(
      bytes,
      "application/json",
      `${record.nodeId}-payload.json`,
      record.runId,
    );
    return {
      ...record,
      input: null,
      output: null,
      outputs: undefined,
      simulation: record.simulation
        ? { ...record.simulation, data: undefined }
        : undefined,
      payloadArtifact: {
        $artifact: meta.id,
        mime: meta.mime,
        size: meta.size,
        name: meta.name,
      },
    };
  }
  getRun(runId: string, hydrate = false): RunRecord | undefined {
    const row = this.db
      ?.query<
        { record_json: string },
        [string]
      >("SELECT record_json FROM runs WHERE id=?")
      .get(runId);
    const record: RunRecord | undefined = this.db
      ? row?.record_json
        ? JSON.parse(row.record_json)
        : undefined
      : this.runs.find((r) => r.id === runId);
    if (record && hydrate)
      return {
        ...record,
        nodeExecutions: record.nodeExecutions.map((n) => {
          if (!n.payloadArtifact) return n;
          const data = this.artifactStore?.getArtifact(
            n.payloadArtifact.$artifact,
          );
          if (!data)
            throw new Error(
              "Recorded payload expired or unavailable; run upstream nodes again",
            );
          return { ...n, ...JSON.parse(data.data.toString()) };
        }),
      };
    return record;
  }

  getAllRuns(): RunRecord[] {
    if (this.db)
      return this.db
        .query<{ record_json: string }, []>(
          "SELECT record_json FROM runs WHERE record_json IS NOT NULL ORDER BY started_at DESC LIMIT 1000",
        )
        .all()
        .map((r) => JSON.parse(r.record_json));
    return [...this.runs];
  }

  updateNodeExecution(id: string, updates: Partial<NodeExecutionRecord>): void {
    if (this.db) {
      const row = this.db
        .query<
          { record_json: string },
          [string]
        >("SELECT record_json FROM node_executions WHERE id=?")
        .get(id);
      if (row)
        this.saveNodeExecution({ ...JSON.parse(row.record_json), ...updates });
      return;
    }
    const idx = this.nodeExecutions.findIndex((r) => r.id === id);
    if (idx >= 0) {
      Object.assign(this.nodeExecutions[idx], updates);
    }
  }
}
