// Short, human-readable reference code for error correlation.
// An SE can read "L7MZ1K-A3F" over the phone; Austin can grep
// Vercel logs for the same string. Format: base36 timestamp +
// 3-char random suffix = 9-11 chars total, collision-resistant
// within a single deployment's log window.
export function generateReferenceCode(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${ts}-${rand}`;
}
