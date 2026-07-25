import { useEffect, useState } from "react";

interface SystemInfo {
  version: string;
  mode: string;
  uptime: number;
}

type NavItem = {
  id: string;
  label: string;
  icon: string;
};

const navItems: NavItem[] = [
  { id: "automations", label: "Automations", icon: "⚡" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

function App() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<string>("automations");

  useEffect(() => {
    fetch("/api/system/info")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setSystemInfo(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
      });
  }, []);

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <aside className="flex w-56 flex-col border-r border-gray-800 bg-gray-900">
        <div className="flex h-14 items-center gap-2 border-b border-gray-800 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white">
            AP
          </div>
          <span className="text-sm font-semibold tracking-wide text-gray-200">
            Automation Platform
          </span>
        </div>
        <nav className="flex-1 px-2 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveNav(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    activeNav === item.id
                      ? "bg-indigo-600/20 text-indigo-400"
                      : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {systemInfo && (
          <div className="border-t border-gray-800 px-4 py-3 text-xs text-gray-500">
            v{systemInfo.version}
          </div>
        )}
      </aside>

      <main className="flex flex-1 flex-col overflow-y-auto">
        <header className="flex h-14 items-center justify-between border-b border-gray-800 px-6">
          <h1 className="text-lg font-semibold text-gray-100">
            Automation Platform
          </h1>
          {systemInfo && (
            <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-xs font-medium text-emerald-400">
              {systemInfo.mode}
            </span>
          )}
        </header>

        <div className="flex-1 p-6">
          {error && (
            <div className="mb-6 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-400">
              Failed to load system info: {error}
            </div>
          )}

          {systemInfo && (
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Version
                </p>
                <p className="mt-2 text-2xl font-bold text-gray-100">
                  {systemInfo.version}
                </p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Mode
                </p>
                <p className="mt-2 text-2xl font-bold text-gray-100">
                  {systemInfo.mode}
                </p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Uptime
                </p>
                <p className="mt-2 text-2xl font-bold text-gray-100">
                  {formatUptime(systemInfo.uptime)}
                </p>
              </div>
            </div>
          )}

          {!systemInfo && !error && (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              Loading system info…
            </div>
          )}

          {activeNav === "automations" && (
            <div className="mt-8">
              <h2 className="mb-4 text-base font-semibold text-gray-200">
                Automations
              </h2>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-500">
                No automations yet. Create your first automation to get started.
              </div>
            </div>
          )}

          {activeNav === "settings" && (
            <div className="mt-8">
              <h2 className="mb-4 text-base font-semibold text-gray-200">
                Settings
              </h2>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-500">
                Settings panel coming soon.
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default App;
