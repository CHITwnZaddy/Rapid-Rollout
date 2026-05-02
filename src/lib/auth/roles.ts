export const APP_ROLES = ["user", "manager", "admin"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAdminRole(role: unknown): role is "admin" {
  return role === "admin";
}

export function isManagerRole(role: unknown): role is "manager" {
  return role === "manager";
}

export function isManagerOrAdminRole(role: unknown): role is "manager" | "admin" {
  return role === "manager" || role === "admin";
}
