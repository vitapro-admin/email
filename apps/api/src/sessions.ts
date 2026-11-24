import { randomBytes } from "node:crypto";
import type { Sender } from "@aquapro/email-render";

export interface Session {
  id: string;
  username: string;
  /**
   * Mailbox password, kept ONLY in server memory so the server can reach the mailbox for this user.
   * Development login only. Production uses OIDC with a mail-server master user instead.
   */
  password: string;
  profile: Sender;
  createdAt: number;
  lastSeen: number;
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly idleMs: number,
    private readonly maxMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  create(username: string, password: string, profile: Sender): Session {
    const id = randomBytes(32).toString("base64url");
    const now = this.now();
    const session: Session = { id, username, password, profile, createdAt: now, lastSeen: now };
    this.sessions.set(id, session);
    return session;
  }

  /** Returns the session and extends its idle time, or undefined when missing or expired. */
  get(id: string | undefined): Session | undefined {
    if (!id) return undefined;
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const now = this.now();
    if (now - session.lastSeen > this.idleMs || now - session.createdAt > this.maxMs) {
      this.sessions.delete(id);
      return undefined;
    }
    session.lastSeen = now;
    return session;
  }

  /** True when the session exists and has not expired. Does not extend it. */
  has(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    const now = this.now();
    return now - session.lastSeen <= this.idleMs && now - session.createdAt <= this.maxMs;
  }

  destroy(id: string | undefined): void {
    if (id) this.sessions.delete(id);
  }

  /** Removes expired sessions. Called periodically. */
  sweep(): void {
    const now = this.now();
    for (const [id, s] of this.sessions) {
      if (now - s.lastSeen > this.idleMs || now - s.createdAt > this.maxMs)
        this.sessions.delete(id);
    }
  }

  get size(): number {
    return this.sessions.size;
  }
}
