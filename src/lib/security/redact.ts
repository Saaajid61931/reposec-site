const sensitiveKey = /authorization|cookie|token|secret|password|private.?key|signature|raw.?body/i;
const secretShape = /\b(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?|AKIA[0-9A-Z]{16})\b/g;

export function redactText(value: string, maxLength = 4000) {
  return value.replace(secretShape, "[REDACTED]").slice(0, maxLength);
}

export function safeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (typeof value === "string") return redactText(value, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => safeMetadata(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, item]) => [key, sensitiveKey.test(key) ? "[REDACTED]" : safeMetadata(item, depth + 1)]),
    );
  }
  return String(value);
}
