import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError, api } from "./api";
import { Logo } from "./Logo";
import type { Profile } from "./types";

export function Login({ onLoggedIn }: { onLoggedIn: (user: Profile) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { user } = await api.login(username.trim(), password);
      onLoggedIn(user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Prihlásenie sa nepodarilo.");
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <Logo className="login-logo" />
        <h1>Prihlásenie do pošty</h1>
        <div className="field stacked">
          <label htmlFor="username">Meno</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </div>
        <div className="field stacked">
          <label htmlFor="password">Heslo</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div role="alert" className="error">
          {error}
        </div>
        <button type="submit" className="primary wide" disabled={busy}>
          {busy ? "Prihlasujem…" : "Prihlásiť"}
        </button>
        <p className="hint">Vývojové prihlásenie údajmi poštovej schránky.</p>
      </form>
    </main>
  );
}
