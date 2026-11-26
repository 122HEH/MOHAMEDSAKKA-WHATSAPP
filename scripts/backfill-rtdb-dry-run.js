/**
 * CONTROLLED LOCAL BACKFILL SCRIPT (DRY-RUN BY DEFAULT)
 *
 * Purpose:
 *   Reads an exported Firebase RTDB JSON snapshot (or dry-runs against an Admin export)
 *   to compute missing entries for:
 *     - PublicProfiles/{uid}
 *     - PhoneLookup/{normalizedNumero}
 *     - UserGroups/{uid}/{groupId}
 *     - Discussions/{roomID}/members/{uid}
 *
 * IMPORTANT:
 *   - NEVER run this script against production without explicit authorization and backup.
 *   - By default, this script operates ONLY on a local JSON export file and outputs a preview JSON.
 *
 * Usage (offline dry-run on an exported JSON file):
 *   node scripts/backfill-rtdb-dry-run.js <path-to-rtdb-export.json> [output-plan.json]
 */

import fs from "node:fs";
import path from "node:path";

function normalizePhone(phone) {
  return String(phone || "")
    .trim()
    .replace(/[\s().-]+/g, "")
    .replace(/[.$#\[\]/]/g, "");
}

export function buildBackfillPlan(snapshot = {}) {
  const accounts = snapshot.Acounts || {};
  const existingPublic = snapshot.PublicProfiles || {};
  const existingPhoneLookup = snapshot.PhoneLookup || {};
  const existingUserGroups = snapshot.UserGroups || {};
  const groups = snapshot.Groups || {};
  const discussions = snapshot.Discussions || {};

  const updates = {};
  const warnings = [];

  // 1. PublicProfiles & PhoneLookup from Acounts
  for (const [uid, acc] of Object.entries(accounts)) {
    if (!acc || typeof acc !== "object") continue;

    if (!existingPublic[uid] && acc.FullName && acc.Pseudo) {
      updates[`PublicProfiles/${uid}`] = {
        Id: uid,
        FullName: String(acc.FullName),
        Pseudo: String(acc.Pseudo),
        ...(acc.ProfileImage ? { ProfileImage: String(acc.ProfileImage) } : {}),
        online: Boolean(acc.online),
        lastSeen: typeof acc.lastSeen === "number" ? acc.lastSeen : Date.now(),
      };
    }

    const cleanNum = normalizePhone(acc.Numero);
    if (cleanNum && acc.FullName && acc.Pseudo) {
      if (!existingPhoneLookup[cleanNum]) {
        updates[`PhoneLookup/${cleanNum}`] = {
          uid,
          FullName: String(acc.FullName),
          Pseudo: String(acc.Pseudo),
        };
      } else if (existingPhoneLookup[cleanNum].uid !== uid) {
        warnings.push(`Duplicate phone number ${cleanNum} skipped for uid=${uid}`);
      }
    }
  }

  // 2. UserGroups from Groups/*/members
  for (const [groupId, grp] of Object.entries(groups)) {
    if (!grp?.members || typeof grp.members !== "object") continue;
    for (const [uid, isMember] of Object.entries(grp.members)) {
      if (isMember === true && !existingUserGroups[uid]?.[groupId]) {
        updates[`UserGroups/${uid}/${groupId}`] = true;
      }
    }
  }

  // 3. Discussions/*/members from 56-char roomID (28 + 28)
  for (const [roomID, room] of Object.entries(discussions)) {
    if (!room || typeof room !== "object" || room.members) continue;
    if (roomID.length === 56) {
      const uid1 = roomID.slice(0, 28);
      const uid2 = roomID.slice(28, 56);
      if (accounts[uid1] && accounts[uid2]) {
        updates[`Discussions/${roomID}/members`] = {
          [uid1]: true,
          [uid2]: true,
        };
      } else {
        warnings.push(`Could not infer existing accounts for roomID=${roomID}`);
      }
    } else {
      warnings.push(`Non-56-char roomID skipped: ${roomID}`);
    }
  }

  return { updates, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  const inputFile = process.argv[2];
  const outputFile = process.argv[3];
  if (!inputFile) {
    console.log("Dry-run usage: node scripts/backfill-rtdb-dry-run.js <rtdb-export.json> [out.json]");
    process.exit(0);
  }
  const raw = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  const plan = buildBackfillPlan(raw);
  console.log(`Planned ${Object.keys(plan.updates).length} RTDB updates, ${plan.warnings.length} warnings.`);
  if (outputFile) {
    fs.writeFileSync(outputFile, JSON.stringify(plan, null, 2), "utf8");
  }
}
