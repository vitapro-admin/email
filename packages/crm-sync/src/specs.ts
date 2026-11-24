import type { EntitySpec } from "./sync.js";

/**
 * What is synced by default. Only entities whose identifying field is stated in the Actiwhere
 * guide: customers (`customerId` filter) and events (`eventId` filter). Orders, documents and the
 * rest are added after real samples confirm their fields.
 */
export const DEFAULT_SPECS: EntitySpec[] = [
  {
    entity: "customers",
    endpoint: "customers",
    key: "customers",
    idField: "customerId",
    request: {
      options: {
        includeAddressDetails: true,
        includeContactDetails: true,
        includeContractDetails: true,
      },
    },
  },
  { entity: "events", endpoint: "events", key: "events", idField: "eventId" },
];
