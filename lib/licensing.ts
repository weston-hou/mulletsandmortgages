// Single source of truth for where BrokerBoyko LLC is licensed.
// Update this list (only) when licensing changes — footers, letters,
// metadata, and agent prompts all read from it.

export const LICENSED_STATES = [
  "Arizona",
  "California",
  "Texas",
  "Idaho",
  "Pennsylvania",
  "Ohio",
  "Florida",
] as const;

export const LICENSED_STATE_ABBRS = ["AZ", "CA", "TX", "ID", "PA", "OH", "FL"] as const;

/** "Arizona, California, Texas, Idaho, Pennsylvania, Ohio, and Florida" */
export const LICENSED_STATES_SENTENCE = `${LICENSED_STATES.slice(0, -1).join(", ")}, and ${
  LICENSED_STATES[LICENSED_STATES.length - 1]
}`;

/** "AZ, CA, TX, ID, PA, OH & FL" */
export const LICENSED_STATE_ABBRS_SHORT = `${LICENSED_STATE_ABBRS.slice(0, -1).join(", ")} & ${
  LICENSED_STATE_ABBRS[LICENSED_STATE_ABBRS.length - 1]
}`;
