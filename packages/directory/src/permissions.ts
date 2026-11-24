/** Every permission the system knows. Roles are bundles of these. */
export const PERMISSION_GROUPS = [
  {
    key: "modules",
    label: "Prístup k modulom",
    permissions: [
      { key: "module:mail", label: "Pošta" },
      { key: "module:support", label: "Podpora obchodu" },
      { key: "module:sales", label: "Obchod a ponuky" },
      { key: "module:service", label: "Servis a sanitácia" },
      { key: "module:distribution", label: "Distribúcia a trasy" },
      { key: "module:finance", label: "Ekonomika" },
      { key: "module:technical", label: "Technické zabezpečenie" },
      { key: "module:management", label: "Manažment a prehľady" },
    ],
  },
  {
    key: "tasks",
    label: "Úlohy",
    permissions: [
      { key: "tasks:view:own", label: "Vidieť vlastné úlohy" },
      { key: "tasks:view:department", label: "Vidieť úlohy svojho oddelenia" },
      { key: "tasks:view:all", label: "Vidieť všetky úlohy" },
      { key: "tasks:manage", label: "Vytvárať a prideľovať úlohy" },
    ],
  },
  {
    key: "administration",
    label: "Správa",
    permissions: [
      { key: "users:view", label: "Vidieť používateľov" },
      { key: "users:manage", label: "Spravovať používateľov a zoznamy" },
      { key: "roles:manage", label: "Spravovať roly (len superadmin)" },
      { key: "audit:view", label: "Vidieť záznam zmien" },
      { key: "settings:manage", label: "Spravovať nastavenia" },
      { key: "mailbox:emergency-access", label: "Výnimočný prístup k schránke (len superadmin)" },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

const KNOWN = new Set<string>(ALL_PERMISSIONS);
export const isPermission = (value: string): value is Permission => KNOWN.has(value);

/** Only a superadmin may give these to a role. */
export const RESTRICTED_PERMISSIONS: readonly Permission[] = [
  "roles:manage",
  "mailbox:emergency-access",
];

/** Roles that only a superadmin may give, take away, edit or hold while being managed. */
export const PRIVILEGED_ROLE_KEYS: readonly string[] = ["superadmin", "admin"];
export const SUPERADMIN_KEY = "superadmin";
