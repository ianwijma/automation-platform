import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../store";
import type { AiDiff } from "../types";
import { Check, X, Zap, Loader2, Send } from "lucide-react";

function DiffCard({
  diff,
  diffKey,
  approved,
  onToggle,
}: {
  diff: AiDiff;
  diffKey: string;
  approved: boolean;
  onToggle: (key: string) => void;
}) {
  const opColors: Record<string, string> = {
    "add-node": "text-green-400 bg-green-500/10 border-green-500/30",
    "remove-node": "text-red-400 bg-red-500/10 border-red-500/30",
    "update-node-params": "text-blue-400 bg-blue-500/10 border-blue-500/30",
    "add-edge": "text-green-400 bg-green-500/10 border-green-500/30",
    "remove-edge": "text-red-400 bg-red-500/10 border-red-500/30",
    "update-settings": "text-purple-400 bg-purple-500/10 border-purple-500/30",
  };

  const color = opColors[diff.op] ?? "text-gray-400 bg-gray-500/10 border-gray-500/30";

  return (
    <div
      className={`rounded border px-2.5 py-2 ${color}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px]">
              {diff.op}
            </span>
            <span className="truncate text-[11px] text-gray-400">
              {diff.path}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-gray-300">{diff.description}</p>
        </div>
        <button
          onClick={() => onToggle(diffKey)}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
            approved
              ? "bg-indigo-500 text-white"
              : "bg-gray-800 text-gray-600 hover:text-gray-400"
          }`}
        >
          {approved ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

export function AiPanel() {
  const aiMessages = useAppStore((s) => s.aiMessages);
  const aiLoading = useAppStore((s) => s.aiLoading);
  const aiDiffApproval = useAppStore((s) => s.aiDiffApproval);
  const sendAiMessage = useAppStore((s) => s.sendAiMessage);
  const toggleDiffApproval = useAppStore((s) => s.toggleDiffApproval);
  const applyApprovedDiffs = useAppStore((s) => s.applyApprovedDiffs);
  const setShowAiPanel = useAppStore((s) => s.setShowAiPanel);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, aiLoading]);

  const hasApprovedDiffs = Object.values(aiDiffApproval).some((v) => v);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || aiLoading) return;
    setInput("");
    sendAiMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-xs font-semibold text-gray-200">AI Assistant</span>
        </div>
        <button
          onClick={() => setShowAiPanel(false)}
          className="rounded px-1.5 py-0.5 text-[11px] text-gray-500 hover:text-gray-300"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {aiMessages.length === 0 && !aiLoading && (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-xs text-gray-600">
              Ask the AI assistant to help build your automation.
              <br />
              It can add nodes, modify parameters, and suggest changes.
            </p>
          </div>
        )}

        {aiMessages.map((msg) => (
          <div key={msg.id} className="mb-3">
            <div
              className={`rounded-lg px-3 py-2 text-xs ${
                msg.role === "user"
                  ? "ml-4 bg-indigo-600/20 text-indigo-200"
                  : "mr-2 bg-gray-900 text-gray-300"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>

            {msg.diffs && msg.diffs.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                  Suggested Changes
                </div>
                {msg.diffs.map((diff, i) => {
                  const key = `${msg.id}-diff-${i}`;
                  return (
                    <DiffCard
                      key={key}
                      diff={diff}
                      diffKey={key}
                      approved={aiDiffApproval[key] ?? false}
                      onToggle={toggleDiffApproval}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {aiLoading && (
          <div className="mb-3 mr-2 flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {hasApprovedDiffs && (
        <div className="border-t border-gray-800 px-3 py-2">
          <button
            onClick={applyApprovedDiffs}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Zap className="h-3 w-3" />
            Apply Approved Changes
          </button>
        </div>
      )}

      <div className="border-t border-gray-800 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the AI assistant..."
            disabled={aiLoading}
            className="flex-1 rounded border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-indigo-500/50 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={aiLoading || !input.trim()}
            className="flex items-center justify-center rounded-md bg-indigo-600 px-2.5 py-1.5 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
