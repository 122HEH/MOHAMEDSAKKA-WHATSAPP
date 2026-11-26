import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhone,
  sanitizeStorageFileName,
  buildRoomId,
} from "../utils/appHelpers.js";
import { buildBackfillPlan } from "../scripts/backfill-rtdb-dry-run.js";

test("normalizePhone removes spaces, formatting punctuation, and RTDB-invalid key chars", () => {
  assert.equal(normalizePhone(" +216 12-345.678 "), "+21612345678");
  assert.equal(normalizePhone("(55) 123-456#1$2[3]/4"), "551234561234");
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone(null), "");
});

test("sanitizeStorageFileName normalizes unsafe filename characters", () => {
  assert.equal(sanitizeStorageFileName("rapport final #1 (2026).pdf"), "rapport_final__1__2026_.pdf");
  assert.equal(sanitizeStorageFileName("   "), "file");
  assert.equal(sanitizeStorageFileName("photo_01.jpg"), "photo_01.jpg");
});

test("buildRoomId returns deterministic room ID matching currentid > secondid ordering", () => {
  const uidA = "A".repeat(28);
  const uidB = "B".repeat(28);
  assert.equal(buildRoomId(uidA, uidB), uidB + uidA);
  assert.equal(buildRoomId(uidB, uidA), uidB + uidA);
  assert.equal(buildRoomId(uidA, uidA), uidA + uidA);
});

test("buildBackfillPlan computes PublicProfiles, PhoneLookup, UserGroups, and Discussions members without mutating input", () => {
  const uidA = "A".repeat(28);
  const uidB = "B".repeat(28);
  const plan = buildBackfillPlan({
    Acounts: {
      [uidA]: { FullName: "Alice", Pseudo: "alice", Numero: "+216 11-22-33", online: true, lastSeen: 123 },
      [uidB]: { FullName: "Bob", Pseudo: "bob", Numero: "" },
    },
    Groups: {
      g1: { name: "G", members: { [uidA]: true, [uidB]: true } },
    },
    Discussions: {
      [uidB + uidA]: { msg1: { text: "hi" } },
    },
  });
  assert.equal(plan.warnings.length, 0);
  assert.equal(plan.updates[`PublicProfiles/${uidA}`].FullName, "Alice");
  assert.equal(plan.updates["PhoneLookup/+216112233"].uid, uidA);
  assert.equal(plan.updates[`UserGroups/${uidA}/g1`], true);
  assert.equal(plan.updates[`UserGroups/${uidB}/g1`], true);
  assert.deepEqual(plan.updates[`Discussions/${uidB + uidA}/members`], { [uidA]: true, [uidB]: true });
});
