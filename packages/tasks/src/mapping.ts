/**
 * The ONLY place that knows the field names of CRM events. The names below come from the fake
 * server built from the Actiwhere guide. When real samples arrive, adjust this file only.
 */
export const EVENT_FIELDS = {
  title: "subject",
  status: "statusId",
  category: "categoryId",
  priority: "priorityId",
  customer: "customerId",
} as const;

export const CUSTOMER_NAME_FIELD = "name";
export const REFERENCE_NAME_FIELD = "name";
export const REFERENCE_ID_FIELD = "id";

/** Mirror entity names of the reference tables that give ids their readable names. */
export const REFERENCE_ENTITIES = {
  status: "ref:eventStatuses",
  category: "ref:eventCategories",
  priority: "ref:priorities",
} as const;

type Obj = Record<string, unknown>;

export interface EventFields {
  title: string;
  statusId: string | null;
  categoryId: string | null;
  priorityId: string | null;
  customerId: string | null;
}

const text = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "number" ? String(value) : null;

export function mapEvent(data: Obj): EventFields {
  return {
    title: text(data[EVENT_FIELDS.title])?.trim() || "(bez predmetu)",
    statusId: text(data[EVENT_FIELDS.status]),
    categoryId: text(data[EVENT_FIELDS.category]),
    priorityId: text(data[EVENT_FIELDS.priority]),
    customerId: text(data[EVENT_FIELDS.customer]),
  };
}

export const referenceName = (row: Obj | undefined): string | null =>
  row ? text(row[REFERENCE_NAME_FIELD]) : null;
