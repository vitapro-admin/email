import { useState } from "react";
import { Logo } from "../Logo";
import { TopBar } from "../TopBar";
import type { Me } from "../types";
import { AdminAudit } from "./AdminAudit";
import { AdminLists } from "./AdminLists";
import { AdminRoles } from "./AdminRoles";
import { AdminUsers } from "./AdminUsers";

interface Props {
  me: Me;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onBack: () => void;
  onLogout: () => void;
}

type Tab = "users" | "roles" | "lists" | "audit";

export function Admin({ me, theme, onToggleTheme, onBack, onLogout }: Props) {
  const can = (permission: string) => me.permissions.includes(permission);
  const manage = can("users:manage");
  const tabs: { key: Tab; label: string }[] = [
    { key: "users", label: "Používatelia" },
    { key: "roles", label: "Roly" },
    { key: "lists", label: "Zoznamy" },
    ...(can("audit:view") ? [{ key: "audit" as const, label: "Záznam zmien" }] : []),
  ];
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="app admin">
      <aside className="sidebar">
        <Logo className="sidebar-logo" />
        <button type="button" className="secondary wide" onClick={onBack}>
          ← Späť do pošty
        </button>
        <nav aria-label="Správa">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className="folder"
              aria-current={t.key === tab ? "page" : undefined}
              onClick={() => setTab(t.key)}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="main">
        <TopBar user={me.user} theme={theme} onToggleTheme={onToggleTheme} onLogout={onLogout} />
        <div className="admin-content">
          {tab === "users" && <AdminUsers me={me} canManage={manage} />}
          {tab === "roles" && <AdminRoles me={me} canEditRoles={can("roles:manage")} />}
          {tab === "lists" && <AdminLists canManage={manage} />}
          {tab === "audit" && <AdminAudit />}
        </div>
      </div>
    </div>
  );
}
