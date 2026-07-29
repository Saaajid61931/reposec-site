const secretShape = /\b(?:sk_(?:live|test)_[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?)\b/g;
const sensitiveKey = /authorization|cookie|token|secret|password|private.?key|signature|repository.?source/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (typeof value === "string") return value.replace(secretShape, "[REDACTED]").slice(0, 1000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitize(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).slice(0, 50).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : sanitize(item, depth + 1),
      ]),
    );
  }
  return String(value);
}

function write(level: "info" | "warn" | "error", message: string, metadata?: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(metadata ? { metadata: sanitize(metadata) } : {}),
  })}\n`);
}

export const log = {
  info: (message: string, metadata?: Record<string, unknown>) => write("info", message, metadata),
  warn: (message: string, metadata?: Record<string, unknown>) => write("warn", message, metadata),
  error: (message: string, metadata?: Record<string, unknown>) => write("error", message, metadata),
};
