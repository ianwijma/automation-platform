export function parseCliFlags(args: string[]): {
  port?: number;
  noBrowser?: boolean;
  publicUrl?: string;
  token?: string;
  pluginsDir?: string;
  rest: string[];
} {
  const result: {
    port?: number;
    noBrowser?: boolean;
    publicUrl?: string;
    token?: string;
    pluginsDir?: string;
    rest: string[];
  } = { rest: [] };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--port") {
      const next = args[++i];
      const n = parseInt(next, 10);
      if (!Number.isNaN(n)) result.port = n;
    } else if (arg === "--no-browser") {
      result.noBrowser = true;
    } else if (arg === "--public-url") {
      result.publicUrl = args[++i];
    } else if (arg === "--token") {
      result.token = args[++i];
    } else if (arg === "--plugins-dir") {
      result.pluginsDir = args[++i];
    } else {
      result.rest.push(arg);
    }
    i++;
  }

  return result;
}
