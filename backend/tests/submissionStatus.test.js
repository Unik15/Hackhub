import test from "node:test";
import assert from "node:assert/strict";

import { deriveStatus } from "../utils/hackathonStatus.js";

// Fixed clock: 2026-11-08T12:00:00Z.
const NOW = Date.parse("2026-11-08T12:00:00.000Z");

test("deriveStatus: start in the future is upcoming", () => {
  assert.equal(
    deriveStatus("2026-12-01T00:00:00.000Z", "2026-12-03T00:00:00.000Z", NOW),
    "upcoming"
  );
});

test("deriveStatus: now between start and end is active", () => {
  assert.equal(
    deriveStatus("2026-11-07T00:00:00.000Z", "2026-11-10T00:00:00.000Z", NOW),
    "active"
  );
});

test("deriveStatus: end in the past is expired", () => {
  assert.equal(
    deriveStatus("2026-10-01T00:00:00.000Z", "2026-10-03T00:00:00.000Z", NOW),
    "expired"
  );
});

test("deriveStatus: end exactly now is not expired yet", () => {
  assert.equal(
    deriveStatus("2026-11-01T00:00:00.000Z", "2026-11-08T12:00:00.000Z", NOW),
    "active"
  );
});

test("deriveStatus: start exactly now is active, not upcoming", () => {
  assert.equal(
    deriveStatus("2026-11-08T12:00:00.000Z", "2026-11-09T00:00:00.000Z", NOW),
    "active"
  );
});

test("deriveStatus: missing dates default to upcoming", () => {
  assert.equal(deriveStatus(null, null, NOW), "upcoming");
  assert.equal(deriveStatus(undefined, undefined, NOW), "upcoming");
});

test("deriveStatus: malformed dates default to upcoming", () => {
  assert.equal(deriveStatus("not-a-date", "also-not-a-date", NOW), "upcoming");
});

test("deriveStatus: only a past start date is expired", () => {
  assert.equal(deriveStatus("2026-10-01T00:00:00.000Z", null, NOW), "expired");
});

test("deriveStatus: only a future start date is upcoming", () => {
  assert.equal(deriveStatus("2026-12-01T00:00:00.000Z", null, NOW), "upcoming");
});
