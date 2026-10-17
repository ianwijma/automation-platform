/** Redact persistence and API copies, never the data used between live nodes. */
export function redactSecrets<T>(value: T, secrets: Iterable<string> = []): T {
  const values = [...secrets]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  function visit(input: unknown, key = ""): unknown {
    if (
      /^(password|api[_-]?key|authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|secret|token)$/i.test(
        key,
      ) &&
      input != null
    )
      return "[REDACTED]";
    if (typeof input === "string") {
      let text = input;
      for (const secret of values)
        text =
          secret.length < 4
            ? text === secret
              ? "[REDACTED]"
              : text
            : text.split(secret).join("[REDACTED]");
      return text;
    }
    if (Array.isArray(input)) return input.map((v) => visit(v));
    if (input && typeof input === "object")
      return Object.fromEntries(
        Object.entries(input).map(([k, v]) => [k, visit(v, k)]),
      );
    return input;
  }
  return visit(value) as T;
}
