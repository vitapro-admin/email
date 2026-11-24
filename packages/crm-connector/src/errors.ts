/** Error reported by Actiwhere (HTTP error or an `error` object in the answer). */
export class ActiwhereError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ActiwhereError";
  }
}

/** A write was refused by OUR safety rules before anything was sent to the CRM. */
export class CrmWriteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrmWriteBlockedError";
  }
}

export interface EntryError {
  requestId: number | undefined;
  errorCode: string | undefined;
  details: { field: string; description: string }[];
}

/** The call was understood but at least one entry failed (HTTP 200 does not mean success). */
export class ActiwhereWriteError extends Error {
  constructor(readonly entries: EntryError[]) {
    super(
      `Actiwhere odmietol zápis: ${entries
        .map(
          (e) =>
            `záznam ${e.requestId ?? "?"}: ${e.details.map((d) => `${d.field} ${d.description}`).join(", ") || e.errorCode || "chyba"}`,
        )
        .join("; ")}`,
    );
    this.name = "ActiwhereWriteError";
  }
}
