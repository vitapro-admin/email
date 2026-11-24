import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { adminApi } from "../api";
import type { ListItem } from "../types";
import { errorText } from "./shared";

type Kind = "departments" | "branches";

function ListEditor({ kind, title, canManage }: { kind: Kind; title: string; canManage: boolean }) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await adminApi.items(kind)).items);
    } catch (e) {
      setError(errorText(e));
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    void run(async () => {
      await adminApi.createItem(kind, name.trim());
      setName("");
    });
  };

  const rename = (item: ListItem) => {
    const next = window.prompt("Nový názov", item.name)?.trim();
    if (next && next !== item.name)
      void run(() => adminApi.updateItem(kind, item.id, { name: next }));
  };

  return (
    <div className="list-editor">
      <h2>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id} className={item.active ? undefined : "disabled-row"}>
            <span>{item.name}</span>
            {!item.active && <span className="muted small"> (skryté)</span>}
            {canManage && (
              <span className="row-actions">
                <button type="button" className="link-button" onClick={() => rename(item)}>
                  Premenovať
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    void run(() => adminApi.updateItem(kind, item.id, { active: !item.active }))
                  }
                >
                  {item.active ? "Skryť" : "Zobraziť"}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="empty">Zoznam je prázdny.</p>}
      {canManage && (
        <form className="add-row" onSubmit={add}>
          <input
            placeholder="Nová položka"
            aria-label={`Nová položka: ${title}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="secondary">
            Pridať
          </button>
        </form>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
    </div>
  );
}

export function AdminLists({ canManage }: { canManage: boolean }) {
  return (
    <section className="admin-page" aria-label="Zoznamy">
      <header className="admin-head">
        <h1>Zoznamy</h1>
      </header>
      <p className="muted">
        Oddelenia a pobočky sa vyberajú v profile používateľa. Skrytá položka sa nedá novo vybrať,
        ale ostáva pri ľuďoch, ktorí ju už majú.
      </p>
      <div className="lists-layout">
        <ListEditor kind="departments" title="Oddelenia" canManage={canManage} />
        <ListEditor kind="branches" title="Pobočky" canManage={canManage} />
      </div>
    </section>
  );
}
