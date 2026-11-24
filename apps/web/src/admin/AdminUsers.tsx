import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { adminApi, photoUrl } from "../api";
import type { AdminRole, AdminUser, ListItem, Me, UserInputBody } from "../types";
import { Modal, PRIVILEGED, errorText } from "./shared";

interface Form {
  login: string;
  email: string;
  titleBefore: string;
  firstName: string;
  lastName: string;
  titleAfter: string;
  position: string;
  phone: string;
  landline: string;
  departmentId: string;
  branchId: string;
  roleIds: number[];
}

const emptyForm: Form = {
  login: "",
  email: "",
  titleBefore: "",
  firstName: "",
  lastName: "",
  titleAfter: "",
  position: "",
  phone: "",
  landline: "",
  departmentId: "",
  branchId: "",
  roleIds: [],
};

const fromUser = (u: AdminUser): Form => ({
  login: u.login,
  email: u.email,
  titleBefore: u.titleBefore ?? "",
  firstName: u.firstName,
  lastName: u.lastName,
  titleAfter: u.titleAfter ?? "",
  position: u.position ?? "",
  phone: u.phone ?? "",
  landline: u.landline ?? "",
  departmentId: u.departmentId ? String(u.departmentId) : "",
  branchId: u.branchId ? String(u.branchId) : "",
  roleIds: u.roles.map((r) => r.id),
});

const toBody = (f: Form): UserInputBody => ({
  email: f.email.trim(),
  titleBefore: f.titleBefore.trim() || null,
  firstName: f.firstName.trim(),
  lastName: f.lastName.trim(),
  titleAfter: f.titleAfter.trim() || null,
  position: f.position.trim() || null,
  phone: f.phone.trim() || null,
  landline: f.landline.trim() || null,
  departmentId: f.departmentId ? Number(f.departmentId) : null,
  branchId: f.branchId ? Number(f.branchId) : null,
  roleIds: f.roleIds,
});

const displayName = (u: AdminUser): string =>
  [u.titleBefore, u.firstName, u.lastName].filter(Boolean).join(" ") +
  (u.titleAfter ? `, ${u.titleAfter}` : "");

const initialsOf = (u: AdminUser): string =>
  `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase();

function UserPhoto({ user, version }: { user: AdminUser; version: number }) {
  return user.hasPhoto ? (
    <img className="avatar" src={photoUrl(user.id, version)} alt="" />
  ) : (
    <span className="avatar" aria-hidden="true">
      {initialsOf(user)}
    </span>
  );
}

export function AdminUsers({ me, canManage }: { me: Me; canManage: boolean }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [departments, setDepartments] = useState<ListItem[]>([]);
  const [branches, setBranches] = useState<ListItem[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const [u, r, d, b] = await Promise.all([
        adminApi.users({ search: search.trim() || undefined, status: status || undefined }),
        adminApi.roles(),
        adminApi.items("departments"),
        adminApi.items("branches"),
      ]);
      setUsers(u.users);
      setRoles(r.roles);
      setDepartments(d.items);
      setBranches(b.items);
      setError(null);
    } catch (e) {
      setError(errorText(e, "Používateľov sa nepodarilo načítať."));
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const nameOf = useMemo(() => {
    const d = new Map(departments.map((x) => [x.id, x.name]));
    return (id: number | null) => (id ? (d.get(id) ?? "") : "");
  }, [departments]);

  return (
    <section className="admin-page" aria-label="Používatelia">
      <header className="admin-head">
        <h1>Používatelia</h1>
        {canManage && (
          <button type="button" className="primary" onClick={() => setEditing("new")}>
            Nový používateľ
          </button>
        )}
      </header>
      <div className="admin-filters">
        <input
          type="search"
          placeholder="Hľadať meno, prihlasovacie meno alebo e-mail"
          aria-label="Hľadať používateľa"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="Stav" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Všetci</option>
          <option value="active">Aktívni</option>
          <option value="disabled">Zablokovaní</option>
        </select>
      </div>
      {error && (
        <div role="alert" className="error pad">
          {error}
        </div>
      )}
      <table className="admin-table">
        <thead>
          <tr>
            <th />
            <th>Meno</th>
            <th>Funkcia</th>
            <th>Oddelenie</th>
            <th>Roly</th>
            <th>Stav</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.status === "disabled" ? "disabled-row" : undefined}>
              <td>
                <UserPhoto user={u} version={photoVersion} />
              </td>
              <td>
                <button type="button" className="link-button" onClick={() => setEditing(u)}>
                  {displayName(u)}
                </button>
                <div className="muted small">
                  {u.login} · {u.email}
                </div>
              </td>
              <td>{u.position ?? ""}</td>
              <td>{nameOf(u.departmentId)}</td>
              <td>
                {u.roles.map((r) => (
                  <span key={r.id} className="chip">
                    {r.name}
                  </span>
                ))}
              </td>
              <td>{u.status === "active" ? "Aktívny" : "Zablokovaný"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && !error && <p className="empty">Nikto nezodpovedá filtru.</p>}

      {editing && (
        <UserDialog
          me={me}
          user={editing === "new" ? null : editing}
          roles={roles}
          departments={departments}
          branches={branches}
          canManage={canManage}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setPhotoVersion((v) => v + 1);
            void load();
          }}
        />
      )}
    </section>
  );
}

function UserDialog({
  me,
  user,
  roles,
  departments,
  branches,
  canManage,
  onClose,
  onSaved,
}: {
  me: Me;
  user: AdminUser | null;
  roles: AdminRole[];
  departments: ListItem[];
  branches: ListItem[];
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(user ? fromUser(user) : emptyForm);
  const [current, setCurrent] = useState<AdminUser | null>(user);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);

  const isSelf = current !== null && current.id === me.user.id;
  const targetPrivileged = current?.roles.some((r) => PRIVILEGED.includes(r.key)) ?? false;
  // Only a superadmin may touch an admin or superadmin. The server checks this too.
  const readOnly = !canManage || (targetPrivileged && !me.isSuperadmin && !isSelf);
  const rolesLocked = readOnly || (isSelf && !me.isSuperadmin);
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (current) {
        const body = toBody(form);
        const result = await adminApi.updateUser(
          current.id,
          rolesLocked ? { ...body, roleIds: undefined } : body,
        );
        setCurrent(result.user);
      } else {
        const result = await adminApi.createUser({ ...toBody(form), login: form.login.trim() });
        setCurrent(result.user);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async () => {
    if (!current) return;
    setError(null);
    setBusy(true);
    try {
      const next = current.status === "active" ? "disabled" : "active";
      setCurrent((await adminApi.setStatus(current.id, next)).user);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = async (file: File | undefined) => {
    if (!file || !current) return;
    setError(null);
    try {
      await adminApi.setPhoto(current.id, file);
      setCurrent({ ...current, hasPhoto: true });
      setPhotoVersion((v) => v + 1);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const removePhoto = async () => {
    if (!current) return;
    try {
      await adminApi.removePhoto(current.id);
      setCurrent({ ...current, hasPhoto: false });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const field = (
    label: string,
    key: keyof Form,
    props: { required?: boolean; type?: string } = {},
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        type={props.type ?? "text"}
        required={props.required}
        disabled={readOnly || (key === "login" && current !== null)}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </label>
  );

  return (
    <Modal title={current ? "Používateľ" : "Nový používateľ"} onClose={onClose}>
      <form className="user-form" onSubmit={save}>
        {readOnly && canManage && (
          <p className="notice">Admina a superadmina môže upravovať len superadmin.</p>
        )}
        {current && (
          <div className="photo-row">
            <UserPhoto user={current} version={photoVersion} />
            {!readOnly && (
              <>
                <label className="secondary file-button">
                  Nahrať fotografiu
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(e) => void changePhoto(e.target.files?.[0])}
                  />
                </label>
                {current.hasPhoto && (
                  <button type="button" className="secondary" onClick={() => void removePhoto()}>
                    Odstrániť
                  </button>
                )}
              </>
            )}
            <span className="muted small">
              Fotografia sa ukazuje v aplikácii, nie v podpise e-mailu.
            </span>
          </div>
        )}
        <div className="form-grid">
          {field("Prihlasovacie meno", "login", { required: true })}
          {field("E-mail", "email", { required: true, type: "email" })}
          {field("Titul pred menom", "titleBefore")}
          {field("Meno", "firstName", { required: true })}
          {field("Priezvisko", "lastName", { required: true })}
          {field("Titul za menom", "titleAfter")}
          {field("Funkcia", "position")}
          {field("Telefón", "phone")}
          {field("Pevná linka (voliteľne)", "landline")}
          <label className="field">
            <span>Oddelenie</span>
            <select
              disabled={readOnly}
              value={form.departmentId}
              onChange={(e) => set("departmentId", e.target.value)}
            >
              <option value="">—</option>
              {departments
                .filter((d) => d.active || String(d.id) === form.departmentId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Pobočka (voliteľne)</span>
            <select
              disabled={readOnly}
              value={form.branchId}
              onChange={(e) => set("branchId", e.target.value)}
            >
              <option value="">—</option>
              {branches
                .filter((b) => b.active || String(b.id) === form.branchId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <fieldset className="roles-field" disabled={rolesLocked}>
          <legend>Roly</legend>
          {roles.map((r) => {
            const privileged = PRIVILEGED.includes(r.key);
            const checked = form.roleIds.includes(r.id);
            return (
              <label key={r.id} className="check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={privileged && !me.isSuperadmin}
                  onChange={() =>
                    set(
                      "roleIds",
                      checked ? form.roleIds.filter((x) => x !== r.id) : [...form.roleIds, r.id],
                    )
                  }
                />
                <span>{r.name}</span>
              </label>
            );
          })}
          {isSelf && !me.isSuperadmin && (
            <p className="muted small">Vlastné roly nemôžete meniť.</p>
          )}
        </fieldset>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <footer className="modal-foot">
          {current && canManage && !readOnly && !isSelf && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => void toggleStatus()}
            >
              {current.status === "active" ? "Zablokovať účet" : "Odblokovať účet"}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="secondary" onClick={onClose}>
            Zavrieť
          </button>
          {!readOnly && (
            <button type="submit" className="primary" disabled={busy}>
              {current ? "Uložiť" : "Vytvoriť"}
            </button>
          )}
        </footer>
      </form>
    </Modal>
  );
}
