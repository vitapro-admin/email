import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../api";
import type { AdminRole, Me, PermissionGroup } from "../types";
import { errorText } from "./shared";

const RESTRICTED = ["roles:manage", "mailbox:emergency-access"];

export function AdminRoles({ me, canEditRoles }: { me: Me; canEditRoles: boolean }) {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [selected, setSelected] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([adminApi.roles(), adminApi.permissions()]);
      setRoles(r.roles);
      setGroups(g.groups);
      setError(null);
    } catch (e) {
      setError(errorText(e, "Roly sa nepodarilo načítať."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = (role: AdminRole | "new") => {
    setNotice(null);
    setError(null);
    if (role === "new") {
      setSelected("new");
      setName("");
      setDescription("");
      setPermissions([]);
    } else {
      setSelected(role.id);
      setName(role.name);
      setDescription(role.description);
      setPermissions(role.permissions);
    }
  };

  const current = typeof selected === "number" ? roles.find((r) => r.id === selected) : undefined;
  const isSuperadminRole = current?.key === "superadmin";
  const readOnly = !canEditRoles || isSuperadminRole;

  const toggle = (key: string) =>
    setPermissions((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key]));

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (selected === "new") {
        const { role } = await adminApi.createRole({ name, description, permissions });
        await load();
        choose(role);
      } else if (current) {
        const patch = current.builtin ? { permissions } : { name, description, permissions };
        await adminApi.updateRole(current.id, patch);
        await load();
      }
      setNotice("Uložené.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!current || !window.confirm(`Zmazať rolu „${current.name}“?`)) return;
    setBusy(true);
    try {
      await adminApi.deleteRole(current.id);
      setSelected(null);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-page" aria-label="Roly">
      <header className="admin-head">
        <h1>Roly</h1>
        {canEditRoles && (
          <button type="button" className="primary" onClick={() => choose("new")}>
            Nová rola
          </button>
        )}
      </header>
      {!canEditRoles && (
        <p className="notice">Roly môžete len prezerať. Upravovať ich môže superadmin.</p>
      )}
      <div className="roles-layout">
        <ul className="role-list">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="role-item"
                aria-current={r.id === selected ? "true" : undefined}
                onClick={() => choose(r)}
              >
                <strong>{r.name}</strong>
                <span className="muted small">
                  {r.userCount} {r.userCount === 1 ? "používateľ" : "používateľov"}
                  {r.builtin ? " · vstavaná" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="role-detail">
          {selected === null ? (
            <p className="empty">Vyberte rolu.</p>
          ) : (
            <>
              {isSuperadminRole && (
                <p className="notice">
                  Superadmin má vždy všetky oprávnenia a rolu nemožno upravovať.
                </p>
              )}
              <label className="field">
                <span>Názov</span>
                <input
                  value={name}
                  disabled={readOnly || Boolean(current?.builtin)}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Popis</span>
                <input
                  value={description}
                  disabled={readOnly || Boolean(current?.builtin)}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              {groups.map((g) => (
                <fieldset key={g.key} className="perm-group" disabled={readOnly}>
                  <legend>{g.label}</legend>
                  {g.permissions.map((p) => (
                    <label key={p.key} className="check">
                      <input
                        type="checkbox"
                        checked={isSuperadminRole || permissions.includes(p.key)}
                        disabled={RESTRICTED.includes(p.key) && !me.isSuperadmin}
                        onChange={() => toggle(p.key)}
                      />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
              {notice && <div className="notice-ok">{notice}</div>}
              {!readOnly && (
                <footer className="modal-foot">
                  {current && !current.builtin && (
                    <button
                      type="button"
                      className="danger"
                      disabled={busy}
                      onClick={() => void remove()}
                    >
                      Zmazať rolu
                    </button>
                  )}
                  <span className="spacer" />
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || !name.trim()}
                    onClick={() => void save()}
                  >
                    {selected === "new" ? "Vytvoriť" : "Uložiť"}
                  </button>
                </footer>
              )}
            </>
          )}
          {selected === null && error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
