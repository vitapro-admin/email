import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, tasksApi } from "./api";
import { formatShort } from "./format";
import { Logo } from "./Logo";
import { ModuleNav } from "./ModuleNav";
import { TopBar } from "./TopBar";
import type { Me, TaskOwner, TaskScope, TaskSummary } from "./types";

interface Props {
  me: Me;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenMail: () => void;
  onOpenAdmin?: () => void;
  onLogout: () => void;
}

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export function Tasks({ me, theme, onToggleTheme, onOpenMail, onOpenAdmin, onLogout }: Props) {
  const canManage = me.permissions.includes("tasks:manage");
  const [scope, setScope] = useState<TaskScope>("all");
  const [search, setSearch] = useState("");
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<TaskOwner[]>([]);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks((await tasksApi.list(scope, search)).tasks);
      setError(null);
    } catch (e) {
      setError(errorText(e, "Úlohy sa nepodarilo načítať."));
    }
  }, [scope, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    tasksApi
      .assignees()
      .then((r) => setAssignees(r.users))
      .catch(() => undefined);
  }, [canManage]);

  const task = tasks.find((t) => t.id === selected) ?? null;

  const replace = (updated: TaskSummary) =>
    setTasks((list) => list.map((t) => (t.id === updated.id ? updated : t)));

  const assign = async (id: number, ownerId: number | null) => {
    setError(null);
    try {
      replace((await tasksApi.assign(id, ownerId)).task);
      setNotice("Úloha bola pridelená.");
      window.setTimeout(() => setNotice(null), 3000);
      void load();
    } catch (e) {
      setError(errorText(e, "Úlohu sa nepodarilo prideliť."));
    }
  };

  const scopes: { key: TaskScope; label: string }[] = [
    { key: "all", label: "Všetky" },
    { key: "mine", label: "Moje" },
    ...(canManage ? [{ key: "unassigned" as const, label: "Nepridelené" }] : []),
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <Logo className="sidebar-logo" />
        <ModuleNav current="tasks" onOpenMail={onOpenMail} onOpenTasks={() => undefined} />
        {canManage && (
          <button type="button" className="primary wide" onClick={() => setCreating(true)}>
            Nová úloha
          </button>
        )}
        <nav aria-label="Úlohy">
          {scopes.map((s) => (
            <button
              key={s.key}
              type="button"
              className="folder"
              aria-current={s.key === scope ? "page" : undefined}
              onClick={() => {
                setScope(s.key);
                setSelected(null);
              }}
            >
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="main">
        <TopBar
          user={me.user}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onLogout={onLogout}
          {...(onOpenAdmin ? { onOpenAdmin } : {})}
        />
        <div className="content">
          <section className="list" aria-label="Zoznam úloh">
            <div className="list-search">
              <input
                type="search"
                placeholder="Hľadať v úlohách"
                aria-label="Hľadať v úlohách"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {error && (
              <div role="alert" className="error pad">
                {error}
              </div>
            )}
            {tasks.length === 0 && !error && <p className="empty">Žiadne úlohy.</p>}
            <ul>
              {tasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="row"
                    aria-current={t.id === selected ? "true" : undefined}
                    onClick={() => setSelected(t.id)}
                  >
                    <span className="row-top">
                      <span className="row-from">{t.customerName ?? "Bez zákazníka"}</span>
                      <span className="row-date">{formatShort(t.lastActivityAt)}</span>
                    </span>
                    <span className="row-subject">{t.title}</span>
                    <span className="row-meta">
                      {t.status && <span className="chip">{t.status}</span>}
                      <span className="muted small">{t.owner ? t.owner.name : "nepridelená"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="reader task-detail" aria-label="Detail úlohy">
            {notice && (
              <div role="status" className="notice">
                {notice}
              </div>
            )}
            {!task && <p className="empty">Vyberte úlohu zo zoznamu.</p>}
            {task && (
              <>
                <header className="reader-head">
                  <h2>{task.title}</h2>
                  <p className="muted small">
                    {task.source === "crm"
                      ? `Event z CRM č. ${task.crmEventId}. Údaje z CRM sa tu len čítajú.`
                      : "Lokálny návrh, v CRM ešte nevznikol."}
                  </p>
                </header>
                {task.removedInCrm && (
                  <p className="notice">Tento event už v CRM neexistuje alebo bol odstránený.</p>
                )}
                <dl className="facts">
                  <dt>Stav</dt>
                  <dd>{task.status ?? "—"}</dd>
                  <dt>Kategória</dt>
                  <dd>{task.category ?? "—"}</dd>
                  <dt>Priorita</dt>
                  <dd>{task.priority ?? "—"}</dd>
                  <dt>Zákazník</dt>
                  <dd>{task.customerName ?? "—"}</dd>
                  <dt>Vlastník</dt>
                  <dd>
                    {canManage ? (
                      <select
                        aria-label="Vlastník úlohy"
                        value={task.owner?.id ?? ""}
                        onChange={(e) =>
                          void assign(task.id, e.target.value ? Number(e.target.value) : null)
                        }
                      >
                        <option value="">Nepridelená</option>
                        {assignees.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (task.owner?.name ?? "Nepridelená")
                    )}
                  </dd>
                </dl>
                <div className="placeholder-box">
                  <strong>Komunikácia</strong>
                  <p className="muted">
                    E-maily a interné správy k tejto úlohe pribudnú v ďalšej etape. Zatiaľ vidíte
                    základné údaje a viete úlohu prideliť.
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {creating && (
        <NewTask
          assignees={assignees}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            setSelected(created.id);
            void load();
          }}
        />
      )}
    </div>
  );
}

function NewTask({
  assignees,
  onClose,
  onCreated,
}: {
  assignees: TaskOwner[];
  onClose: () => void;
  onCreated: (task: TaskSummary) => void;
}) {
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated((await tasksApi.create(title, ownerId ? Number(ownerId) : null)).task);
    } catch (e) {
      setError(errorText(e, "Úlohu sa nepodarilo vytvoriť."));
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="modal small-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Nová úloha"
        onSubmit={submit}
      >
        <header className="modal-head">
          <h2>Nová úloha</h2>
        </header>
        <p className="muted small">
          Lokálny návrh. Do CRM sa zapíše až neskôr, vždy najprv ako náhľad a so schválením.
        </p>
        <label className="field">
          <span>Názov</span>
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Vlastník (voliteľne)</span>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Nepridelená</option>
            {assignees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <footer className="modal-foot">
          <span className="spacer" />
          <button type="button" className="secondary" onClick={onClose}>
            Zavrieť
          </button>
          <button type="submit" className="primary" disabled={busy || !title.trim()}>
            Vytvoriť
          </button>
        </footer>
      </form>
    </div>
  );
}
