import compatApp from "firebase/compat/app";
import { supabase } from "../config/index.js";

export const SERVER_TIMESTAMP = compatApp.database.ServerValue.TIMESTAMP;
export const SUPABASE_BUCKET = "lesimagesprofiles";

/**
 * Normalize a phone number for consistent lookup and safe Firebase RTDB keys.
 * Strips whitespace, formatting punctuation, and RTDB-forbidden characters.
 */
export function normalizePhone(phone) {
  return String(phone || "")
    .trim()
    .replace(/[\s().-]+/g, "")
    .replace(/[.$#\[\]/]/g, "");
}

/**
 * Sanitize a filename before using it in a Supabase Storage object path.
 */
export function sanitizeStorageFileName(fileName) {
  const cleaned = String(fileName || "file")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned || "file";
}

/**
 * Compute deterministic 1-to-1 room ID matching existing database convention.
 */
export function buildRoomId(uid1, uid2) {
  return uid1 > uid2 ? uid1 + uid2 : uid2 + uid1;
}

/**
 * Upload a local React Native URI (image or document) to Supabase Storage.
 * Returns { publicUrl, storagePath } or throws on failure.
 */
export async function uploadMediaToSupabase({ uri, storagePath, contentType }) {
  if (!uri) throw new Error("Missing file URI.");
  if (!storagePath) throw new Error("Missing storage path.");

  const response = await fetch(uri);
  let arrayBuffer;
  if (typeof response.arrayBuffer === "function") {
    arrayBuffer = await response.arrayBuffer();
  } else {
    const blob = await response.blob();
    arrayBuffer = await new Response(blob).arrayBuffer();
  }

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error("Selected file is empty or unreadable.");
  }

  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: contentType || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(storagePath);

  if (!data?.publicUrl) {
    throw new Error("Could not retrieve public URL from Supabase.");
  }

  return { publicUrl: data.publicUrl, storagePath };
}

/**
 * Best-effort deletion of a file from Supabase Storage.
 */
export async function removeMediaFromSupabase(storagePath) {
  if (!storagePath) return;
  try {
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove([storagePath]);
    if (error) {
      console.warn("Supabase remove warning:", error.message);
    }
  } catch (err) {
    console.warn("Supabase remove failed:", err?.message || err);
  }
}

/**
 * Register onDisconnect handlers and mark user online in both Acounts and PublicProfiles.
 * Lazily backfills PublicProfiles / PhoneLookup for pre-existing accounts when needed.
 */
export async function syncOnlinePresence(database, uid) {
  if (!uid) return;

  const accountRef = database.ref("Acounts").child(uid);
  const publicRef = database.ref("PublicProfiles").child(uid);

  const accountSnap = await accountRef.once("value");
  if (!accountSnap.exists()) return;

  const accountData = accountSnap.val() || {};

  await accountRef.update({ online: true });
  accountRef.child("online").onDisconnect().set(false);
  accountRef.child("lastSeen").onDisconnect().set(SERVER_TIMESTAMP);

  const publicSnap = await publicRef.once("value");
  if (publicSnap.exists()) {
    await publicRef.update({ online: true });
  } else if (accountData.FullName && accountData.Pseudo) {
    const initialPublic = {
      Id: uid,
      FullName: accountData.FullName,
      Pseudo: accountData.Pseudo,
      online: true,
      lastSeen: SERVER_TIMESTAMP,
    };
    if (accountData.ProfileImage) {
      initialPublic.ProfileImage = accountData.ProfileImage;
    }
    await publicRef.set(initialPublic);
  }

  publicRef.child("online").onDisconnect().set(false);
  publicRef.child("lastSeen").onDisconnect().set(SERVER_TIMESTAMP);

  const cleanNum = normalizePhone(accountData.Numero);
  if (cleanNum && accountData.FullName && accountData.Pseudo) {
    const phoneRef = database.ref("PhoneLookup").child(cleanNum);
    const phoneSnap = await phoneRef.once("value");
    if (!phoneSnap.exists()) {
      await phoneRef.set({
        uid,
        FullName: accountData.FullName,
        Pseudo: accountData.Pseudo,
      });
    }
  }
}

/**
 * Mark user offline in Acounts and PublicProfiles before sign-out.
 */
export async function setOfflinePresence(database, uid) {
  if (!uid) return;
  const offlinePayload = {
    online: false,
    lastSeen: SERVER_TIMESTAMP,
  };
  await database.ref("Acounts").child(uid).update(offlinePayload);
  const publicSnap = await database.ref("PublicProfiles").child(uid).once("value");
  if (publicSnap.exists()) {
    await database.ref("PublicProfiles").child(uid).update(offlinePayload);
  }
}
