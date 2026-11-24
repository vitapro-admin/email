import { recordCrmRequest } from "@aquapro/db";
import type { Db } from "@aquapro/db";
import type { RequestLogEntry } from "@aquapro/crm-connector";

/** Connector hook that stores every CRM call (no secrets, no content) in the database. */
export function requestLogger(db: Db): (entry: RequestLogEntry) => void {
  return (entry) => {
    void recordCrmRequest(db, entry).catch(() => undefined); // logging must never break a call
  };
}
