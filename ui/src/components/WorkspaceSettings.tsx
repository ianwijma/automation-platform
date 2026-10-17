import { useEffect, useState } from "react";
import { fetchJson } from "../hooks/useApi";
import { useAppStore } from "../store";
import type { AutomationDefinition, AgentResponse } from "../types";

export interface CredentialMetadata {
  id: string;
  name: string;
  type: string;
}
interface EnvVar {
  scope: string;
  scopeId: string | null;
  key: string;
  value?: string;
  isSecret: boolean;
}
interface PortableAutomation {
  formatVersion?: number;
  automation: AutomationDefinition;
  credentials?: Array<{ name: string; type: string }>;
  envVars?: EnvVar[];
}
const field = "w-full rounded border border-gray-700 bg-gray-900 p-2 text-xs";
const button =
  "rounded border border-gray-700 px-2 py-1 text-xs hover:bg-gray-800 disabled:opacity-40";

export function WorkspaceSettings() {
  const currentId = useAppStore((s) => s.currentAutomationId);
  const definition = useAppStore((s) => s.currentDefinition);
  const agents = useAppStore((s) => s.agents);
  const automations = useAppStore((s) => s.automations);
  const preview = useAppStore((s) => s.isPreviewMode);
  const [credentials, setCredentials] = useState<CredentialMetadata[]>([]);
  const [variables, setVariables] = useState<EnvVar[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [credentialId, setCredentialId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("api_key");
  const [values, setValues] = useState('{"apiKey":""}');
  const [scope, setScope] = useState("global");
  const [machine, setMachine] = useState("local");
  const [envKey, setEnvKey] = useState("");
  const [envValue, setEnvValue] = useState("");
  const [secret, setSecret] = useState(false);
  const [joinToken, setJoinToken] = useState("");
  const [portable, setPortable] = useState<PortableAutomation | null>(null);
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [secretBindings, setSecretBindings] = useState<Record<string, string>>(
    {},
  );
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [triggerErrors, setTriggerErrors] = useState<
    Array<{ id: string; error: string }>
  >([]);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      fetchJson<Array<{ id: string; error: string }>>("/api/triggers/status")
        .then((errors) => {
          if (active) setTriggerErrors(errors);
        })
        .catch(() => {});
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function refresh() {
    const [c, v] = await Promise.all([
      fetchJson<CredentialMetadata[]>("/api/credentials"),
      fetchJson<EnvVar[]>("/api/env"),
    ]);
    setCredentials(c);
    setVariables(v);
    await useAppStore.getState().fetchAgents();
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      fetchJson<CredentialMetadata[]>("/api/credentials"),
      fetchJson<EnvVar[]>("/api/env"),
    ])
      .then(([c, v]) => {
        if (active) {
          setCredentials(c);
          setVariables(v);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice("Saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function setAutomationSettings(
    update: Partial<AutomationDefinition["settings"]>,
  ) {
    useAppStore.setState((s) =>
      s.currentDefinition && !s.isPreviewMode
        ? {
            currentDefinition: {
              ...s.currentDefinition,
              settings: { ...s.currentDefinition.settings, ...update },
            },
            isDirty: true,
          }
        : {},
    );
  }
  async function exportFile() {
    const store = useAppStore.getState();
    await store.saveAutomation();
    if (useAppStore.getState().saveError || useAppStore.getState().isDirty)
      throw new Error("Save the draft before exporting.");
    const data = await fetchJson(`/api/automations/${currentId}/export`);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${definition?.name ?? "automation"}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile() {
    if (!portable) return;
    const automation = structuredClone(portable.automation);
    for (const node of automation.nodes) {
      if (node.credentials) {
        const bound = credentials.find(
          (c) => c.id === bindings[node.credentials!.name],
        );
        if (!bound || bound.type !== node.credentials.type)
          throw new Error(
            `Select a matching credential for ${node.credentials.name}.`,
          );
        node.credentials = { name: bound.name, type: bound.type };
      }
      if (node.target.kind === "machine") {
        const target = targets[node.id];
        if (!target) throw new Error(`Select a target for ${node.name}.`);
        node.target =
          target === "local"
            ? { kind: "local" }
            : { kind: "machine", value: target };
      }
    }
    const envVars = Object.fromEntries(
      (portable.envVars ?? []).map((v) => {
        if (v.isSecret && !secretBindings[v.key])
          throw new Error(`Enter a value for ${v.key}.`);
        return [
          v.key,
          {
            value: v.isSecret ? secretBindings[v.key] : (v.value ?? ""),
            isSecret: v.isSecret,
          },
        ];
      }),
    );
    const result = await fetchJson<{ id: string }>("/api/import", {
      method: "POST",
      body: JSON.stringify({ automation, credentials: {}, envVars }),
    });
    setPortable(null);
    setSecretBindings({});
    await useAppStore.getState().fetchAutomations();
    await useAppStore.getState().selectAutomation(result.id);
  }
  return (
    <div className="mt-4 space-y-4 text-gray-300">
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-green-400">
          {notice}
        </p>
      )}
      {triggerErrors
        .filter((e) => e.id === currentId || e.id.startsWith(`${currentId}:`))
        .map((e) => (
          <p role="alert" className="text-xs text-red-400" key={e.id}>
            Background trigger: {e.error}
          </p>
        ))}
      {definition && (
        <fieldset
          disabled={preview || busy}
          className="space-y-2 border-t border-gray-800 pt-3"
        >
          <legend className="text-sm">Automation settings</legend>
          <label className="block text-xs">
            Run timeout (seconds)
            <input
              className={field}
              type="number"
              min="1"
              max="86400"
              value={definition.settings.runTimeoutSec}
              onChange={(e) =>
                setAutomationSettings({ runTimeoutSec: Number(e.target.value) })
              }
            />
          </label>
          <label className="block text-xs">
            <input
              type="checkbox"
              checked={definition.settings.savePayloads}
              onChange={(e) =>
                setAutomationSettings({ savePayloads: e.target.checked })
              }
            />{" "}
            Retain execution inputs and outputs
          </label>
          <label className="block text-xs">
            On failure, run automation
            <select
              className={field}
              value={definition.settings.errorAutomationId ?? ""}
              onChange={(e) =>
                setAutomationSettings({
                  errorAutomationId: e.target.value || null,
                })
              }
            >
              <option value="">None</option>
              {automations
                .filter((a) => a.id !== currentId && a.activeVersionId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <p className="text-xs text-gray-500">
            The error automation must be active with one Manual Trigger. It
            receives failedRunId, automationId, and error.
          </p>
          <button
            className={button}
            onClick={() =>
              void act(async () => {
                await useAppStore.getState().saveAutomation();
                const error = useAppStore.getState().saveError;
                if (error) throw new Error(error);
              })
            }
          >
            Save automation settings
          </button>
        </fieldset>
      )}
      <fieldset
        disabled={busy}
        className="space-y-2 border-t border-gray-800 pt-3"
      >
        <legend className="text-sm">Credentials</legend>
        <p className="text-xs text-gray-500">
          Values are encrypted and never displayed after saving. Select a
          credential in a node to use it.
        </p>
        <label className="block text-xs">
          Credential
          <select
            className={field}
            value={credentialId}
            onChange={(e) => {
              setCredentialId(e.target.value);
              setValues('{"apiKey":""}');
            }}
          >
            <option value="">New credential</option>
            {credentials.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        </label>
        {!credentialId && (
          <>
            <label className="block text-xs">
              Name
              <input
                className={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              Type
              <input
                className={field}
                value={type}
                onChange={(e) => setType(e.target.value)}
              />
            </label>
          </>
        )}
        <label className="block text-xs">
          Replacement fields (JSON object)
          <textarea
            className={field}
            rows={3}
            value={values}
            onChange={(e) => setValues(e.target.value)}
            spellCheck={false}
          />
        </label>
        <button
          className={button}
          onClick={() =>
            void act(async () => {
              const parsed = JSON.parse(values);
              if (
                !parsed ||
                Array.isArray(parsed) ||
                typeof parsed !== "object" ||
                Object.values(parsed).some((v) => typeof v !== "string")
              )
                throw new Error(
                  "Credential fields must be a JSON object of strings.",
                );
              await fetchJson(
                credentialId
                  ? `/api/credentials/${credentialId}`
                  : "/api/credentials",
                {
                  method: credentialId ? "PUT" : "POST",
                  body: JSON.stringify({ name, type, values: parsed }),
                },
              );
              setValues('{"apiKey":""}');
              setName("");
              await refresh();
            })
          }
        >
          {credentialId ? "Replace credential values" : "Create credential"}
        </button>
        {credentialId && (
          <button
            className={button}
            onClick={() =>
              void act(async () => {
                await fetchJson(`/api/credentials/${credentialId}`, {
                  method: "DELETE",
                });
                setCredentialId("");
                await refresh();
              })
            }
          >
            Delete credential
          </button>
        )}
      </fieldset>
      <fieldset
        disabled={busy}
        className="space-y-2 border-t border-gray-800 pt-3"
      >
        <legend className="text-sm">Environment</legend>
        <label className="block text-xs">
          Scope
          <select
            className={field}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="global">Global</option>
            <option value="automation" disabled={!currentId}>
              Current automation
            </option>
            <option value="machine">Machine</option>
          </select>
        </label>
        {scope === "machine" && (
          <label className="block text-xs">
            Machine
            <select
              className={field}
              value={machine}
              onChange={(e) => setMachine(e.target.value)}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-xs">
          Variable name
          <input
            className={field}
            value={envKey}
            onChange={(e) => setEnvKey(e.target.value)}
          />
        </label>
        <label className="block text-xs">
          Value
          <input
            className={field}
            type={secret ? "password" : "text"}
            value={envValue}
            onChange={(e) => setEnvValue(e.target.value)}
          />
        </label>
        <label className="text-xs">
          <input
            type="checkbox"
            checked={secret}
            onChange={(e) => setSecret(e.target.checked)}
          />{" "}
          Secret
        </label>
        <button
          className={button}
          onClick={() =>
            void act(async () => {
              await fetchJson("/api/env", {
                method: "POST",
                body: JSON.stringify({
                  scope,
                  scopeId:
                    scope === "automation"
                      ? currentId
                      : scope === "machine"
                        ? machine
                        : null,
                  key: envKey,
                  value: envValue,
                  isSecret: secret,
                }),
              });
              setEnvValue("");
              await refresh();
            })
          }
        >
          Save variable
        </button>
        {variables.map((v) => (
          <div
            className="flex items-center justify-between gap-2 text-xs"
            key={`${v.scope}:${v.scopeId}:${v.key}`}
          >
            <span>
              {v.key} · {v.scope}
              {v.isSecret ? " · secret" : ` = ${v.value}`}
            </span>
            <button
              className={button}
              aria-label={`Delete variable ${v.key}`}
              onClick={() =>
                void act(async () => {
                  const query = new URLSearchParams({
                    scope: v.scope,
                    key: v.key,
                  });
                  if (v.scopeId) query.set("scopeId", v.scopeId);
                  await fetchJson(`/api/env?${query}`, { method: "DELETE" });
                  await refresh();
                })
              }
            >
              Delete
            </button>
          </div>
        ))}
      </fieldset>
      <fieldset
        disabled={busy}
        className="space-y-2 border-t border-gray-800 pt-3"
      >
        <legend className="text-sm">Fleet</legend>
        {agents.map((agent) => (
          <AgentSettings
            key={agent.id}
            agent={agent}
            onSave={(work) =>
              act(async () => {
                await work();
                await refresh();
              })
            }
          />
        ))}
        <button
          className={button}
          onClick={() =>
            void act(async () => {
              const result = await fetchJson<{ token: string }>(
                "/api/agents/join-tokens",
                {
                  method: "POST",
                  body: JSON.stringify({ uses: 1, ttlHours: 1 }),
                },
              );
              setJoinToken(result.token);
            })
          }
        >
          Create one-hour join token
        </button>
        {joinToken && (
          <div className="space-y-1">
            <p className="text-xs">
              Run on the other machine using your reachable HTTPS platform URL:
            </p>
            <code className="block break-all text-xs">
              ap join {location.origin} --token {joinToken}
            </code>
            <button className={button} onClick={() => setJoinToken("")}>
              Hide token
            </button>
          </div>
        )}
      </fieldset>
      <fieldset
        disabled={busy}
        className="space-y-2 border-t border-gray-800 pt-3"
      >
        <legend className="text-sm">Sharing</legend>
        <button
          className={button}
          disabled={!currentId || preview}
          onClick={() => void act(exportFile)}
        >
          Export current automation
        </button>
        <label className="block text-xs">
          Import automation
          <input
            className={field}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void act(async () => {
                  const data = JSON.parse(await file.text());
                  if (
                    !data.automation?.nodes ||
                    !Array.isArray(data.automation.nodes)
                  )
                    throw new Error("Choose an automation export.");
                  setPortable(data);
                  setBindings({});
                  setSecretBindings({});
                  setTargets({});
                });
            }}
          />
        </label>
        {portable && (
          <div className="space-y-2">
            <p className="text-xs">
              Import “{portable.automation.name}” as a new inactive automation.
            </p>
            {[
              ...new Map(
                portable.automation.nodes
                  .filter((n) => n.credentials)
                  .map((n) => [n.credentials!.name, n.credentials!]),
              ).values(),
            ].map((ref) => (
              <label className="block text-xs" key={ref.name}>
                Bind credential {ref.name}
                <select
                  className={field}
                  value={bindings[ref.name] ?? ""}
                  onChange={(e) =>
                    setBindings({ ...bindings, [ref.name]: e.target.value })
                  }
                >
                  <option value="">Select credential</option>
                  {credentials
                    .filter((c) => c.type === ref.type)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            {(portable.envVars ?? [])
              .filter((v) => v.isSecret)
              .map((v) => (
                <label className="block text-xs" key={v.key}>
                  Secret {v.key}
                  <input
                    className={field}
                    type="password"
                    value={secretBindings[v.key] ?? ""}
                    onChange={(e) =>
                      setSecretBindings({
                        ...secretBindings,
                        [v.key]: e.target.value,
                      })
                    }
                  />
                </label>
              ))}
            {portable.automation.nodes
              .filter((n) => n.target.kind === "machine")
              .map((n) => (
                <label className="block text-xs" key={n.id}>
                  Machine for {n.name}
                  <select
                    className={field}
                    value={targets[n.id] ?? ""}
                    onChange={(e) =>
                      setTargets({ ...targets, [n.id]: e.target.value })
                    }
                  >
                    <option value="">Select machine</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            <button className={button} onClick={() => void act(importFile)}>
              Import with these bindings
            </button>
            <button className={button} onClick={() => setPortable(null)}>
              Cancel import
            </button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
function AgentSettings({
  agent,
  onSave,
}: {
  agent: AgentResponse;
  onSave(work: () => Promise<void>): Promise<void>;
}) {
  const [tags, setTags] = useState(agent.tags.join(", "));
  return (
    <div className="space-y-1 rounded border border-gray-800 p-2 text-xs">
      <p>
        {agent.name} · {agent.status} ·{" "}
        {String(agent.capabilities?.display ?? "no display")}
      </p>
      <label>
        Tags (comma separated)
        <input
          className={field}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </label>
      <button
        className={button}
        onClick={() =>
          void onSave(async () => {
            await fetchJson(`/api/agents/${agent.id}/tags`, {
              method: "PUT",
              body: JSON.stringify({
                tags: tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              }),
            });
          })
        }
      >
        Save tags
      </button>
      {!agent.isLocal && (
        <button
          className={button}
          onClick={() =>
            void onSave(async () => {
              await fetchJson(`/api/agents/${agent.id}`, { method: "DELETE" });
            })
          }
        >
          Revoke agent
        </button>
      )}
    </div>
  );
}
