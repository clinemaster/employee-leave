// Shared helper for turning an RTK Query / fetchBaseQuery error into a
// human-readable message. Backend errors arrive as either:
//   - { detail: "..." }                          (WorkflowError, PermissionDenied, etc.)
//   - { field_name: ["msg", ...], ... }           (DRF serializer validation errors)
// Without this, unhandled mutation rejections crash silently (an uncaught
// promise rejection in the console) instead of telling the user what went
// wrong — always call this in a catch block and display the result.
export function extractErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      if (typeof record.detail === "string") {
        return record.detail;
      }
      const parts = Object.entries(record).map(([field, messages]) => {
        const text = Array.isArray(messages) ? messages.join(" ") : String(messages);
        return `${field}: ${text}`;
      });
      if (parts.length > 0) return parts.join(" | ");
    }
  }
  return fallback;
}
