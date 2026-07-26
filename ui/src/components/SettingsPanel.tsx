import { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { X, Save, Eye, EyeOff } from "lucide-react";

export function SettingsPanel() {
  const aiSettings = useAppStore((s) => s.aiSettings);
  const fetchAiSettings = useAppStore((s) => s.fetchAiSettings);
  const updateAiSettings = useAppStore((s) => s.updateAiSettings);
  const toggleSettings = useAppStore((s) => s.toggleSettings);

  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAiSettings();
  }, [fetchAiSettings]);

  useEffect(() => {
    if (aiSettings) {
      setModel(aiSettings.aiModel);
      setEndpoint(aiSettings.aiEndpoint ?? "");
      setApiKey("");
    }
  }, [aiSettings]);

  const handleSave = async () => {
    setSaving(true);
    const updates: { aiApiKey?: string; aiModel?: string; aiEndpoint?: string } = {};
    if (apiKey) updates.aiApiKey = apiKey;
    if (model) updates.aiModel = model;
    if (endpoint) updates.aiEndpoint = endpoint;
    await updateAiSettings(updates);
    setApiKey("");
    setSaving(false);
  };

  return (
    <div className="flex h-full flex-col bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <span className="text-xs font-semibold text-gray-200">Settings</span>
        <button
          onClick={toggleSettings}
          className="rounded px-1.5 py-0.5 text-[11px] text-gray-500 hover:text-gray-300"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            AI Provider
          </h3>

          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-gray-400">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={aiSettings?.hasApiKey ? "••••••••" : "Enter API key"}
                  className="w-full rounded border border-gray-700 bg-gray-900 pr-8 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-gray-400">Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. gpt-4o"
                className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-gray-400">Endpoint</label>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="e.g. https://api.openai.com/v1"
                className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              <Save className="h-3 w-3" />
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
