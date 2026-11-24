import { withTransaction } from "@aquapro/db";
import type { Db, Queryable } from "@aquapro/db";
import type { Access } from "@aquapro/directory";
import {
  CUSTOMER_NAME_FIELD,
  EVENT_FIELDS,
  REFERENCE_ENTITIES,
  mapEvent,
  referenceName,
} from "./mapping.js";

export class TaskError extends Error {
  constructor(
    readonly code: "forbidden" | "not-found" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "TaskError";
  }
}

export interface TaskOwner {
  id: number;
  name: string;
}

export interface TaskSummary {
  id: number;
  /** "crm" = event mirrored from the CRM, "local" = draft that does not exist in the CRM yet. */
  source: "crm" | "local";
  crmEventId: string | null;
  title: string;
  status: string | null;
  category: string | null;
  priority: string | null;
  customerName: string | null;
  owner: TaskOwner | null;
  removedInCrm: boolean;
  createdAt: Date;
  lastActivityAt: Date;
}

export type TaskScope = "all" | "mine" | "unassigned";

interface Row {
  id: string;
  crm_event_id: string | null;
  local_title: string | null;
  owner_user_id: string | null;
  created_at: Date;
  last_activity_at: Date;
  event: Record<string, unknown> | null;
  removed_at: Date | null;
  owner_name: string | null;
  customer: Record<string, unknown> | null;
  status_row: Record<string, unknown> | null;
  category_row: Record<string, unknown> | null;
  priority_row: Record<string, unknown> | null;
}

function ownerName(r: { first_name: string; last_name: string }): string {
  return `${r.first_name} ${r.last_name}`;
}

export class TaskService {
  constructor(private readonly db: Db) {}

  /** Creates a task for every CRM event that does not have one yet. Safe to run repeatedly. */
  async adoptEvents(): Promise<number> {
    const { rowCount } = await this.db.query(
      `insert into tasks (crm_event_id)
         select r.crm_id from crm_records r
          where r.entity = 'events' and r.removed_at is null
       on conflict (crm_event_id) do nothing`,
    );
    return rowCount ?? 0;
  }

  async list(
    actor: Access,
    filter: { search?: string; scope?: TaskScope } = {},
  ): Promise<TaskSummary[]> {
    const params: unknown[] = [];
    const where: string[] = [this.visibility(actor, params)];
    if (filter.scope === "mine") {
      params.push(actor.userId);
      where.push(`t.owner_user_id = $${params.length}`);
    } else if (filter.scope === "unassigned") {
      where.push("t.owner_user_id is null");
    }
    if (filter.search?.trim()) {
      params.push(EVENT_FIELDS.title);
      const field = params.length;
      params.push(`%${filter.search.trim().toLowerCase()}%`);
      where.push(`lower(coalesce(t.title, r.data ->> $${field}, '')) like $${params.length}`);
    }
    const { rows } = await this.db.query<Row>(
      `${this.select()} where ${where.join(" and ")} order by t.last_activity_at desc, t.id desc limit 300`,
      this.selectParams(params),
    );
    return rows.map((r) => this.toSummary(r));
  }

  async get(actor: Access, id: number): Promise<TaskSummary> {
    return this.load(this.db, actor, id);
  }

  async createLocal(
    actor: Access,
    input: { title: string; ownerId?: number | null },
  ): Promise<TaskSummary> {
    this.needManage(actor);
    const title = input.title.trim();
    if (title === "" || title.length > 200)
      throw new TaskError("invalid", "Názov úlohy musí mať 1 až 200 znakov.");
    return withTransaction(this.db, async (tx) => {
      if (input.ownerId) await this.requireActiveUser(tx, input.ownerId);
      const { rows } = await tx.query<{ id: string }>(
        "insert into tasks (title, owner_user_id, created_by) values ($1, $2, $3) returning id",
        [title, input.ownerId ?? null, actor.userId],
      );
      const id = Number(rows[0]?.id);
      await this.audit(tx, actor, "task.create", id, { title, ownerId: input.ownerId ?? null });
      return this.load(tx, actor, id, true);
    });
  }

  async assign(actor: Access, id: number, ownerId: number | null): Promise<TaskSummary> {
    this.needManage(actor);
    return withTransaction(this.db, async (tx) => {
      await this.load(tx, actor, id); // refuses tasks the person may not see
      const existing = await tx.query<{ owner_user_id: string | null }>(
        "select owner_user_id from tasks where id = $1 for update",
        [id],
      );
      if (!existing.rows[0]) throw new TaskError("not-found", "Úloha neexistuje.");
      if (ownerId !== null) await this.requireActiveUser(tx, ownerId);
      await tx.query(
        "update tasks set owner_user_id = $1, last_activity_at = now() where id = $2",
        [ownerId, id],
      );
      await this.audit(tx, actor, "task.assign", id, {
        from:
          existing.rows[0].owner_user_id === null ? null : Number(existing.rows[0].owner_user_id),
        to: ownerId,
      });
      // The assigner may lose sight of the task after handing it over, so read it without the visibility rule.
      return this.load(tx, actor, id, true);
    });
  }

  /** Active colleagues a task may be assigned to. */
  async assignees(actor: Access): Promise<TaskOwner[]> {
    this.needManage(actor);
    const { rows } = await this.db.query<{ id: string; first_name: string; last_name: string }>(
      "select id, first_name, last_name from users where status = 'active' order by last_name, first_name",
    );
    return rows.map((r) => ({ id: Number(r.id), name: ownerName(r) }));
  }

  // ------------------------------------------------------------------ internals

  private needManage(actor: Access): void {
    if (!actor.permissions.has("tasks:manage"))
      throw new TaskError("forbidden", "Na túto akciu nemáte oprávnenie.");
  }

  /**
   * SQL condition for what the person may see. Permissions combine: all tasks, tasks of their
   * department, their own tasks. Whoever manages tasks (creates and assigns them) sees all of them,
   * otherwise a task would vanish from their list the moment they hand it over.
   */
  private visibility(actor: Access, params: unknown[]): string {
    const p = actor.permissions;
    if (p.has("tasks:view:all") || p.has("tasks:manage") || actor.isSuperadmin) return "true";
    const parts: string[] = [];
    if (p.has("tasks:view:own")) {
      params.push(actor.userId);
      parts.push(`(t.owner_user_id = $${params.length} or t.created_by = $${params.length})`);
    }
    if (p.has("tasks:view:department") && actor.departmentId !== null) {
      params.push(actor.departmentId);
      parts.push(
        `t.owner_user_id in (select id from users where department_id = $${params.length})`,
      );
    }
    if (!p.has("tasks:view:own") && !p.has("tasks:view:department")) {
      throw new TaskError("forbidden", "Úlohy nemáte oprávnenie vidieť.");
    }
    return parts.length ? `(${parts.join(" or ")})` : "false";
  }

  private select(): string {
    return `select t.id, t.crm_event_id, t.title as local_title, t.owner_user_id, t.created_at, t.last_activity_at,
              r.data as event, r.removed_at,
              case when u.id is null then null else u.first_name || ' ' || u.last_name end as owner_name,
              c.data as customer, st.data as status_row, ca.data as category_row, pr.data as priority_row
         from tasks t
         left join crm_records r on r.entity = 'events' and r.crm_id = t.crm_event_id
         left join users u on u.id = t.owner_user_id
         left join crm_records c on c.entity = 'customers' and c.crm_id = r.data ->> '${EVENT_FIELDS.customer}'
         left join crm_records st on st.entity = '${REFERENCE_ENTITIES.status}' and st.crm_id = r.data ->> '${EVENT_FIELDS.status}'
         left join crm_records ca on ca.entity = '${REFERENCE_ENTITIES.category}' and ca.crm_id = r.data ->> '${EVENT_FIELDS.category}'
         left join crm_records pr on pr.entity = '${REFERENCE_ENTITIES.priority}' and pr.crm_id = r.data ->> '${EVENT_FIELDS.priority}'`;
  }

  private selectParams(params: unknown[]): unknown[] {
    return params;
  }

  private async load(
    q: Queryable,
    actor: Access,
    id: number,
    skipVisibility = false,
  ): Promise<TaskSummary> {
    const params: unknown[] = [id];
    const visible = skipVisibility ? "true" : this.visibility(actor, params);
    const { rows } = await q.query<Row>(`${this.select()} where t.id = $1 and ${visible}`, params);
    if (!rows[0]) throw new TaskError("not-found", "Úloha neexistuje alebo ju nemôžete vidieť.");
    return this.toSummary(rows[0]);
  }

  private toSummary(r: Row): TaskSummary {
    const fields = r.event ? mapEvent(r.event) : null;
    const customerName =
      r.customer && typeof r.customer[CUSTOMER_NAME_FIELD] === "string"
        ? String(r.customer[CUSTOMER_NAME_FIELD])
        : null;
    return {
      id: Number(r.id),
      source: r.crm_event_id === null ? "local" : "crm",
      crmEventId: r.crm_event_id,
      title: r.local_title ?? fields?.title ?? "(úloha z CRM, údaje chýbajú)",
      status: fields?.statusId
        ? (referenceName(r.status_row ?? undefined) ?? `Stav ${fields.statusId}`)
        : r.crm_event_id === null
          ? "Návrh"
          : null,
      category: fields?.categoryId
        ? (referenceName(r.category_row ?? undefined) ?? `Kategória ${fields.categoryId}`)
        : null,
      priority: fields?.priorityId
        ? (referenceName(r.priority_row ?? undefined) ?? `Priorita ${fields.priorityId}`)
        : null,
      customerName,
      owner:
        r.owner_user_id === null || r.owner_name === null
          ? null
          : { id: Number(r.owner_user_id), name: r.owner_name },
      removedInCrm: r.removed_at !== null,
      createdAt: r.created_at,
      lastActivityAt: r.last_activity_at,
    };
  }

  private async requireActiveUser(q: Queryable, id: number): Promise<void> {
    const { rows } = await q.query<{ status: string }>("select status from users where id = $1", [
      id,
    ]);
    if (!rows[0] || rows[0].status !== "active")
      throw new TaskError("invalid", "Vybraný používateľ neexistuje alebo je zablokovaný.");
  }

  private async audit(
    q: Queryable,
    actor: Access,
    action: string,
    id: number,
    details: Record<string, unknown>,
  ): Promise<void> {
    await q.query(
      "insert into audit_log (actor_id, actor_login, action, target_type, target_id, details) values ($1, $2, $3, 'task', $4, $5)",
      [actor.userId, actor.login, action, String(id), JSON.stringify(details)],
    );
  }
}
