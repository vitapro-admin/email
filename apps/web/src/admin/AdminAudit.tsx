import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../api";
import type { AuditEntry } from "../types";
import { errorText, formatDateTime } from "./shared";

const ACTIONS: Record<string, string> = {
  "auth.login": "Prihlásenie",
  "auth.denied": "Odmietnuté prihlásenie",
  "user.create": "Vytvorený používateľ",
  "user.create-first-superadmin": "Vytvorený prvý superadmin",
  "user.update": "Upravený používateľ",
  "user.disable": "Zablokovaný účet",
  "user.enable": "Odblokovaný účet",
  "user.photo": "Zmenená fotografia",
  "user.photo-remove": "Odstránená fotografia",
  "role.create": "Vytvorená rola",
  "role.update": "Upravená rola",
  "role.delete": "Zmazaná rola",
  "department.create": "Pridané oddelenie",
  "department.update": "Upravené oddelenie",
  "branch.create": "Pridaná pobočka",
  "branch.update": "Upravená pobočka",
};

const summary = (details: Record<string, unknown>): string => {
  const parts = Object.entries(details).map(
    ([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`,
  );
  return parts.join(" · ");
};

export function AdminAudit() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before?: number) => {
    try {
      const { entries: page } = await adminApi.audit(before);
      setEntries((old) => (before ? [...old, ...page] : page));
      setMore(page.length === 50);
      setError(null);
    } catch (e) {
      setError(errorText(e, "Záznam sa nepodarilo načítať."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="admin-page" aria-label="Záznam zmien">
      <header className="admin-head">
        <h1>Záznam zmien</h1>
        <button type="button" className="secondary" onClick={() => void load()}>
          Obnoviť
        </button>
      </header>
      <p className="muted">Záznam sa len dopĺňa. Nedá sa upraviť ani zmazať.</p>
      {error && (
        <div role="alert" className="error pad">
          {error}
        </div>
      )}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Kedy</th>
            <th>Kto</th>
            <th>Čo</th>
            <th>Podrobnosti</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="nowrap">{formatDateTime(e.at)}</td>
              <td>{e.actorLogin}</td>
              <td>{ACTIONS[e.action] ?? e.action}</td>
              <td className="muted small">{summary(e.details)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {more && entries.length > 0 && (
        <button
          type="button"
          className="secondary"
          onClick={() => void load(entries[entries.length - 1]?.id)}
        >
          Načítať staršie
        </button>
      )}
    </section>
  );
}
