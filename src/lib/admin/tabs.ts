export const ADMIN_TABS = ["overview", "users", "plans", "settings", "audit"] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];
