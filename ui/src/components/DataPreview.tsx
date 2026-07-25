import { useState } from "react";
import type { NodeItem } from "../types";
import { Pin, PinOff } from "lucide-react";

type ViewTab = "table" | "json" | "raw";
type IOTab = "input" | "output";

function TableView({ items }: { items: NodeItem[] }) {
  if (items.length === 0) {
    return <div className="py-3 text-center text-[11px] text-gray-600">No items</div>;
  }

  const keys = new Set<string>();
  for (const item of items) {
    for (const k of Object.keys(item.json)) {
      keys.add(k);
  }
  }
  const columns = Array.from(keys);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="px-2 py-1 text-left text-gray-500">#</th>
            {columns.map((col) => (
              <th key={col} className="px-2 py-1 text-left text-gray-500">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b border-gray-800/50">
              <td className="px-2 py-1 text-gray-500">{idx}</td>
              {columns.map((col) => (
                <td key={col} className="max-w-[200px] truncate px-2 py-1 text-gray-300">
                  {item.json[col] !== undefined ? String(item.json[col]) : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JsonView({ data }: { data: unknown }) {
  const formatted = JSON.stringify(data, null, 2);
  return (
    <pre className="max-h-[300px] overflow-auto bg-gray-900 p-2 font-mono text-[11px] text-gray-300">
      {formatted}
    </pre>
  );
}

function RawView({ data }: { data: unknown }) {
  const raw = JSON.stringify(data);
  return (
    <pre className="max-h-[300px] overflow-auto bg-gray-900 p-2 font-mono text-[11px] text-gray-400 break-all">
      {raw}
    </pre>
  );
}

export function DataPreview({
  input,
  output,
  pinned,
  onTogglePin,
}: {
  input: NodeItem[] | null;
  output: NodeItem[] | null;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const [ioTab, setIoTab] = useState<IOTab>("output");
  const [viewTab, setViewTab] = useState<ViewTab>("table");

  const data = ioTab === "input" ? input : output;
  const items = data ?? [];

  const VIEW_TABS: { key: ViewTab; label: string }[] = [
    { key: "table", label: "Table" },
    { key: "json", label: "JSON" },
    { key: "raw", label: "Raw" },
  ];

  const IO_TABS: { key: IOTab; label: string }[] = [
    { key: "input", label: "Input" },
    { key: "output", label: "Output" },
  ];

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 px-2 py-1">
        <div className="flex gap-1">
          {IO_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setIoTab(tab.key)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                ioTab === tab.key
                  ? "bg-gray-700 text-gray-200"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={onTogglePin}
          className={`rounded p-1 transition-colors ${
            pinned ? "text-amber-400" : "text-gray-600 hover:text-gray-400"
          }`}
          title={pinned ? "Unpin data" : "Pin data"}
        >
          {pinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-800 px-2 py-1">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setViewTab(tab.key)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium ${
              viewTab === tab.key
                ? "bg-gray-700 text-gray-200"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {viewTab === "table" && <TableView items={items} />}
        {viewTab === "json" && <JsonView data={data} />}
        {viewTab === "raw" && <RawView data={data} />}
      </div>
    </div>
  );
}
