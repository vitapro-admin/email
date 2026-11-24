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
  // Reference tables give ids their readable names (status, category, priority of an event).
  ...[
    ["ref:eventStatuses", "eventStatuses"],
    ["ref:eventCategories", "eventCategories"],
    ["ref:priorities", "priorities"],
  ].map(([entity, tableName]): EntitySpec => ({
    entity: entity as string,
    endpoint: "referenceData",
    key: "referenceData",
    idField: "id",
    request: { filter: { tableName } },
  })),
];
