import type {
  SystemInfoResponse,
  AutomationResponse,
  AutomationDefinition,
  RunResponse,
  NodeExecutionResponse,
  AutomationVersionResponse,
  AiChatResponse,
  AiDiff,
  AiSettingsResponse,
} from "../types";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function getSystemInfo(): Promise<SystemInfoResponse> {
  return fetchJson("/api/system/info");
}

export function listAutomations(): Promise<AutomationResponse[]> {
  return fetchJson("/api/automations");
}

export function getAutomation(id: string): Promise<AutomationResponse> {
  return fetchJson(`/api/automations/${id}`);
}

export function createAutomation(
  name: string,
  definition: AutomationDefinition,
): Promise<AutomationResponse> {
  return fetchJson("/api/automations", {
    method: "POST",
    body: JSON.stringify({ name, definition }),
  });
}

export function updateAutomation(
  id: string,
  definition: AutomationDefinition,
): Promise<AutomationResponse> {
  return fetchJson(`/api/automations/${id}`, {
    method: "PUT",
    body: JSON.stringify({ definition }),
  });
}

export function deleteAutomation(id: string): Promise<void> {
  return fetchJson(`/api/automations/${id}`, { method: "DELETE" });
}

export function activateAutomation(id: string): Promise<AutomationResponse> {
  return fetchJson(`/api/automations/${id}/activate`, { method: "POST" });
}

export function deactivateAutomation(id: string): Promise<AutomationResponse> {
  return fetchJson(`/api/automations/${id}/deactivate`, { method: "POST" });
}

export function runAutomation(
  id: string,
  options: { mode?: string; dryRun?: boolean },
): Promise<RunResponse> {
  return fetchJson(`/api/automations/${id}/run`, {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export function listRuns(automationId?: string): Promise<RunResponse[]> {
  const params = automationId ? `?automationId=${automationId}` : "";
  return fetchJson(`/api/runs${params}`);
}

export function getRun(id: string): Promise<RunResponse> {
  return fetchJson(`/api/runs/${id}`);
}

export function listNodeExecutions(
  runId: string,
): Promise<NodeExecutionResponse[]> {
  return fetchJson(`/api/runs/${runId}/executions`);
}

export function listVersions(
  automationId: string,
): Promise<AutomationVersionResponse[]> {
  return fetchJson(`/api/automations/${automationId}/versions`);
}

export function revertToVersion(
  automationId: string,
  versionNo: number,
): Promise<AutomationResponse> {
  return fetchJson(`/api/automations/${automationId}/revert/${versionNo}`, {
    method: "POST",
  });
}

export function labelVersion(
  automationId: string,
  versionId: string,
  label: string,
): Promise<{ success: boolean }> {
  return fetchJson(
    `/api/automations/${automationId}/versions/${versionId}/label`,
    {
      method: "PUT",
      body: JSON.stringify({ label }),
    },
  );
}

export function sendAiChat(
  messages: Array<{ role: string; content: string }>,
  automationId?: string,
  model?: string,
): Promise<AiChatResponse> {
  return fetchJson("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ messages, automationId, model }),
  });
}

export function applyAiDiffs(
  automationId: string,
  diffs: AiDiff[],
): Promise<{ automationId: string; definition: AutomationDefinition }> {
  return fetchJson("/api/ai/apply", {
    method: "POST",
    body: JSON.stringify({ automationId, diffs }),
  });
}

export function listAiModels(): Promise<{ models: string[] }> {
  return fetchJson("/api/ai/models");
}

export function getSettings(): Promise<AiSettingsResponse> {
  return fetchJson("/api/settings");
}

export function updateSettings(settings: {
  aiApiKey?: string;
  aiModel?: string;
  aiEndpoint?: string;
}): Promise<AiSettingsResponse> {
  return fetchJson("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}
