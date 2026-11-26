import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";

const PROJECT_ID = "sakkamohamedwhatsapp-test";
const RULES_PATH = path.resolve(process.cwd(), "database.rules.json");

const UID_A = "A".repeat(28);
const UID_B = "B".repeat(28);
const UID_C = "C".repeat(28);
const ROOM_AB = UID_B + UID_A; // UID_B > UID_A => currentid > secondid ? currentid + secondid : secondid + currentid
const ROOM_SELF_A = UID_A + UID_A;
const GROUP_AB = "group_ab_001";
const GROUP_PRIVATE_A = "group_a_only_002";

let testEnv;

function dbAs(uid) {
  return uid
    ? testEnv.authenticatedContext(uid).database()
    : testEnv.unauthenticatedContext().database();
}

test.before(async () => {
  const rules = fs.readFileSync(RULES_PATH, "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules,
    },
  });
});

test.after(async () => {
  if (testEnv) await testEnv.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.database();
    await adminDb.ref("Acounts").set({
      [UID_A]: {
        Id: UID_A,
        FullName: "Alice",
        Pseudo: "alice",
        Numero: "11111111",
        Email: "alice@example.com",
        online: true,
        lastSeen: 1000,
      },
      [UID_B]: {
        Id: UID_B,
        FullName: "Bob",
        Pseudo: "bob",
        Numero: "22222222",
        Email: "bob@example.com",
        online: false,
        lastSeen: 2000,
      },
      [UID_C]: {
        Id: UID_C,
        FullName: "Charlie",
        Pseudo: "charlie",
        Numero: "33333333",
        Email: "charlie@example.com",
        online: false,
        lastSeen: 3000,
      },
    });
    await adminDb.ref("PublicProfiles").set({
      [UID_A]: { Id: UID_A, FullName: "Alice", Pseudo: "alice", online: true, lastSeen: 1000 },
      [UID_B]: { Id: UID_B, FullName: "Bob", Pseudo: "bob", online: false, lastSeen: 2000 },
      [UID_C]: { Id: UID_C, FullName: "Charlie", Pseudo: "charlie", online: false, lastSeen: 3000 },
    });
    await adminDb.ref("PhoneLookup").set({
      "11111111": { uid: UID_A, FullName: "Alice", Pseudo: "alice" },
      "22222222": { uid: UID_B, FullName: "Bob", Pseudo: "bob" },
    });
  });
});

test("Acounts: denies global read, denies cross-user read/write, allows owner CRUD and blocks $other", async () => {
  await assertFails(dbAs(null).ref("Acounts").once("value"));
  await assertFails(dbAs(UID_C).ref("Acounts").once("value"));
  await assertFails(dbAs(UID_C).ref(`Acounts/${UID_A}`).once("value"));
  await assertFails(dbAs(UID_B).ref(`Acounts/${UID_A}`).update({ FullName: "Hacked" }));

  const snapA = await assertSucceeds(dbAs(UID_A).ref(`Acounts/${UID_A}`).once("value"));
  assert.equal(snapA.val().Email, "alice@example.com");

  await assertSucceeds(
    dbAs(UID_A).ref(`Acounts/${UID_A}`).update({
      FullName: "Alice Updated",
      ProfileImage: "https://example.com/a.jpg",
      ImageFileName: "a.jpg",
    })
  );
  await assertSucceeds(
    dbAs(UID_A).ref(`Acounts/${UID_A}`).update({ ProfileImage: null, ImageFileName: null })
  );
  await assertFails(dbAs(UID_A).ref(`Acounts/${UID_A}`).update({ isAdmin: true }));
  await assertSucceeds(dbAs(UID_A).ref(`Acounts/${UID_A}`).remove());
});

test("PublicProfiles: authenticated directory read allowed, PII and $other blocked, owner-only write", async () => {
  await assertFails(dbAs(null).ref("PublicProfiles").once("value"));
  const listSnap = await assertSucceeds(dbAs(UID_C).ref("PublicProfiles").once("value"));
  assert.equal(listSnap.hasChild(UID_A), true);

  await assertFails(dbAs(UID_C).ref(`PublicProfiles/${UID_A}`).update({ FullName: "Hacked" }));
  await assertFails(dbAs(UID_A).ref(`PublicProfiles/${UID_A}`).update({ Email: "leak@example.com" }));
  await assertFails(dbAs(UID_A).ref(`PublicProfiles/${UID_A}`).update({ Numero: "11111111" }));
  await assertFails(dbAs(UID_A).ref(`PublicProfiles/${UID_A}`).update({ extraField: "bad" }));
  await assertSucceeds(dbAs(UID_A).ref(`PublicProfiles/${UID_A}`).update({ online: false, lastSeen: 5000 }));
});

test("PhoneLookup: denies global listing, allows exact lookup, blocks overwriting another user's number", async () => {
  await assertFails(dbAs(UID_C).ref("PhoneLookup").once("value"));
  const snap = await assertSucceeds(dbAs(UID_C).ref("PhoneLookup/11111111").once("value"));
  assert.equal(snap.val().uid, UID_A);

  await assertFails(
    dbAs(UID_C).ref("PhoneLookup/11111111").set({ uid: UID_C, FullName: "Charlie", Pseudo: "charlie" })
  );
  await assertFails(dbAs(UID_C).ref("PhoneLookup/11111111").remove());
  await assertFails(
    dbAs(UID_A).ref("PhoneLookup/99999999").set({
      uid: UID_A,
      FullName: "Alice",
      Pseudo: "alice",
      Email: "alice@example.com",
    })
  );

  await assertSucceeds(
    dbAs(UID_A).ref("PhoneLookup/99999999").set({ uid: UID_A, FullName: "Alice", Pseudo: "alice" })
  );
  await assertSucceeds(dbAs(UID_A).ref("PhoneLookup/11111111").remove());
});

test("MyContacts: owner read/write, safe cross-add only when discussion exists", async () => {
  await assertFails(dbAs(UID_C).ref("MyContacts").once("value"));
  await assertFails(dbAs(UID_C).ref(`MyContacts/${UID_A}`).once("value"));
  await assertFails(dbAs(UID_C).ref(`MyContacts/${UID_A}/${UID_B}`).set(true));
  // Cross-add without discussion fails
  await assertFails(dbAs(UID_C).ref(`MyContacts/${UID_A}/${UID_C}`).set(true));

  // Owner adds and removes contact
  await assertSucceeds(dbAs(UID_A).ref(`MyContacts/${UID_A}/${UID_B}`).set(true));
  await assertSucceeds(dbAs(UID_A).ref(`MyContacts/${UID_A}`).once("value"));
  await assertSucceeds(dbAs(UID_A).ref(`MyContacts/${UID_A}/${UID_B}`).remove());

  // Create roomAB then test cross-add by A into B's contacts
  await assertSucceeds(
    dbAs(UID_A).ref(`Discussions/${ROOM_AB}`).set({
      members: { [UID_A]: true, [UID_B]: true },
      currentIDisTyping: false,
    })
  );
  await assertSucceeds(dbAs(UID_A).ref(`MyContacts/${UID_B}/${UID_A}`).set(true));
  await assertFails(dbAs(UID_A).ref(`MyContacts/${UID_B}/${UID_A}`).set(false));
  await assertFails(dbAs(UID_A).ref(`MyContacts/${UID_B}/${UID_A}`).remove());
  await assertFails(dbAs(UID_A).ref(`MyContacts/${UID_B}/${UID_C}`).set(true));
});

test("Discussions: blocks non-members, validates roomID format, enforces typing, messages, read receipts, and immutability", async () => {
  await assertFails(dbAs(UID_C).ref("Discussions").once("value"));
  await assertFails(dbAs(UID_C).ref(`Discussions/${ROOM_AB}`).once("value"));

  // A and B can read non-existent roomAB before initialization
  await assertSucceeds(dbAs(UID_A).ref(`Discussions/${ROOM_AB}`).once("value"));
  await assertSucceeds(dbAs(UID_B).ref(`Discussions/${ROOM_AB}`).once("value"));

  // C cannot forge malformed or mismatched roomIDs
  await assertFails(
    dbAs(UID_C).ref(`Discussions/${UID_C}BAD${UID_A}`).set({
      members: { [UID_C]: true, [UID_A]: true },
    })
  );
  await assertFails(
    dbAs(UID_C).ref(`Discussions/${ROOM_AB}`).set({
      members: { [UID_A]: true, [UID_B]: true, [UID_C]: true },
    })
  );
  // A cannot initialize roomAB with only 1 member
  await assertFails(
    dbAs(UID_A).ref(`Discussions/${ROOM_AB}`).set({
      members: { [UID_A]: true },
      currentIDisTyping: false,
    })
  );

  // Valid room initialization by A
  await assertSucceeds(
    dbAs(UID_A).ref(`Discussions/${ROOM_AB}`).set({
      members: { [UID_A]: true, [UID_B]: true },
      currentIDisTyping: false,
    })
  );
  // Self-chat initialization by A
  await assertSucceeds(
    dbAs(UID_A).ref(`Discussions/${ROOM_SELF_A}`).set({
      members: { [UID_A]: true },
      secondIDisTyping: false,
    })
  );

  // C still blocked after creation
  await assertFails(dbAs(UID_C).ref(`Discussions/${ROOM_AB}`).once("value"));
  await assertFails(dbAs(UID_A).ref(`Discussions/${ROOM_AB}`).remove());

  // Typing indicators: A (< B) controls currentIDisTyping; B controls secondIDisTyping; deletions blocked
  await assertSucceeds(dbAs(UID_A).ref(`Discussions/${ROOM_AB}/currentIDisTyping`).set(true));
  await assertFails(dbAs(UID_A).ref(`Discussions/${ROOM_AB}/secondIDisTyping`).set(true));
  await assertFails(dbAs(UID_A).ref(`Discussions/${ROOM_AB}/currentIDisTyping`).remove());
  await assertSucceeds(dbAs(UID_B).ref(`Discussions/${ROOM_AB}/secondIDisTyping`).set(true));
  await assertFails(dbAs(UID_B).ref(`Discussions/${ROOM_AB}/currentIDisTyping`).set(false));

  // BackgroundImage: string allowed, delete blocked
  await assertSucceeds(
    dbAs(UID_A).ref(`Discussions/${ROOM_AB}/BackgroundImage`).set("https://example.com/bg.jpg")
  );
  await assertFails(dbAs(UID_A).ref(`Discussions/${ROOM_AB}/BackgroundImage`).remove());

  // All 4 message types succeed
  await assertSucceeds(
    dbAs(UID_A).ref(`Discussions/${ROOM_AB}/msg1`).set({
      _id: "msg1",
      createdAt: 1001,
      user: { _id: UID_A },
      Sender: UID_A,
      Receiver: UID_B,
      isSeen: false,
      text: "Hello B",
    })
  );
  await assertSucceeds(
    dbAs(UID_A).ref(`Discussions/${ROOM_AB}/msg2`).set({
      _id: "msg2",
      createdAt: 1002,
      user: { _id: UID_A },
      Sender: UID_A,
      Receiver: UID_B,
      isSeen: false,
      text: " Image",
      image: "https://example.com/img.jpg",
    })
  );
  await assertSucceeds(
    dbAs(UID_A).ref(`Discussions/${ROOM_AB}/msg3`).set({
      _id: "msg3",
      createdAt: 1003,
      user: { _id: UID_A },
      Sender: UID_A,
      Receiver: UID_B,
      isSeen: false,
      text: " Location",
      location: { latitude: 36.8, longitude: 10.1 },
    })
  );
  await assertSucceeds(
    dbAs(UID_A).ref(`Discussions/${ROOM_AB}/msg4`).set({
      _id: "msg4",
      createdAt: 1004,
      user: { _id: UID_A },
      Sender: UID_A,
      Receiver: UID_B,
      isSeen: false,
      text: "File: doc.pdf",
      file: { url: "https://example.com/doc.pdf", name: "doc.pdf" },
    })
  );

  // Impersonation, unknown keys, modification, and deletion blocked
  await assertFails(
    dbAs(UID_B).ref(`Discussions/${ROOM_AB}/msgFake`).set({
      _id: "msgFake",
      createdAt: 1005,
      user: { _id: UID_A },
      Sender: UID_A,
      Receiver: UID_B,
      isSeen: false,
      text: "Spoofed",
    })
  );
  await assertFails(
    dbAs(UID_A).ref(`Discussions/${ROOM_AB}/msgExtra`).set({
      _id: "msgExtra",
      createdAt: 1006,
      user: { _id: UID_A },
      Sender: UID_A,
      Receiver: UID_B,
      isSeen: false,
      text: "Extra",
      hack: true,
    })
  );
  await assertFails(dbAs(UID_B).ref(`Discussions/${ROOM_AB}/msg1`).update({ text: "Tampered" }));
  await assertFails(dbAs(UID_A).ref(`Discussions/${ROOM_AB}/msg1`).remove());

  // Read receipt: A cannot mark own sent msg1 seen; B can mark seen once, cannot overwrite seenAt
  await assertFails(
    dbAs(UID_A).ref(`Discussions/${ROOM_AB}/msg1`).update({
      isSeen: true,
      seenBy: UID_A,
      seenAt: 2000,
    })
  );
  await assertSucceeds(
    dbAs(UID_B).ref(`Discussions/${ROOM_AB}/msg1`).update({
      isSeen: true,
      seenBy: UID_B,
      seenAt: 2001,
    })
  );
  await assertFails(dbAs(UID_B).ref(`Discussions/${ROOM_AB}/msg1/seenAt`).set(9999));
});

test("Groups, UserGroups, and GroupDiscussion: enforces membership, UserGroups sync, all message formats, and blocks spoofing/deletes", async () => {
  await assertFails(dbAs(UID_C).ref("Groups").once("value"));
  await assertFails(dbAs(UID_C).ref("GroupDiscussion").once("value"));

  // Invalid group creations rejected
  await assertFails(
    dbAs(UID_A).ref(`Groups/${GROUP_AB}`).set({
      name: "Bad",
      createdBy: UID_B,
      createdAt: 1000,
      members: { [UID_A]: true, [UID_B]: true },
    })
  );
  await assertFails(
    dbAs(UID_A).ref(`Groups/${GROUP_AB}`).set({
      name: "BadUnknown",
      createdBy: UID_A,
      createdAt: 1000,
      members: { [UID_A]: true },
      extraKey: "nope",
    })
  );

  // Valid group creation + UserGroups index
  await assertSucceeds(
    dbAs(UID_A).ref(`Groups/${GROUP_AB}`).set({
      name: "Team",
      createdBy: UID_A,
      createdAt: 1000,
      members: { [UID_A]: true, [UID_B]: true },
      lastMessage: "Group created",
      lastMessageTime: 1000,
    })
  );
  await assertSucceeds(
    dbAs(UID_A).ref().update({
      [`UserGroups/${UID_A}/${GROUP_AB}`]: true,
      [`UserGroups/${UID_B}/${GROUP_AB}`]: true,
    })
  );

  // Create another group where C is NOT a member
  await assertSucceeds(
    dbAs(UID_A).ref(`Groups/${GROUP_PRIVATE_A}`).set({
      name: "Private A",
      createdBy: UID_A,
      createdAt: 1001,
      members: { [UID_A]: true },
      lastMessage: "Group created",
      lastMessageTime: 1001,
    })
  );

  // C cannot read grpAB, cannot add self, cannot inject UserGroups
  await assertFails(dbAs(UID_C).ref(`Groups/${GROUP_AB}`).once("value"));
  await assertFails(dbAs(UID_C).ref(`Groups/${GROUP_AB}/members/${UID_C}`).set(true));
  await assertFails(dbAs(UID_C).ref(`UserGroups/${UID_A}`).once("value"));
  await assertFails(dbAs(UID_B).ref(`UserGroups/${UID_B}/${GROUP_PRIVATE_A}`).set(true));
  await assertFails(dbAs(UID_C).ref(`GroupDiscussion/${GROUP_AB}`).once("value"));

  // B can read grpAB, update lastMessage & BackgroundImage, cannot delete group/fields or kick A
  await assertSucceeds(dbAs(UID_B).ref(`Groups/${GROUP_AB}`).once("value"));
  await assertSucceeds(
    dbAs(UID_B).ref(`Groups/${GROUP_AB}`).update({ lastMessage: "Hi", lastMessageTime: 1002 })
  );
  await assertSucceeds(
    dbAs(UID_B).ref(`Groups/${GROUP_AB}/BackgroundImage`).set("https://example.com/grp-bg.jpg")
  );
  await assertFails(dbAs(UID_B).ref(`Groups/${GROUP_AB}`).remove());
  await assertFails(dbAs(UID_B).ref(`Groups/${GROUP_AB}/lastMessage`).remove());
  await assertFails(dbAs(UID_B).ref(`Groups/${GROUP_AB}/members/${UID_A}`).remove());

  // B adds C to grpAB and UserGroups
  await assertSucceeds(dbAs(UID_B).ref(`Groups/${GROUP_AB}/members/${UID_C}`).set(true));
  await assertSucceeds(dbAs(UID_B).ref(`UserGroups/${UID_C}/${GROUP_AB}`).set(true));

  // GroupDiscussion: all 4 message types + attributed system message
  await assertSucceeds(
    dbAs(UID_A).ref(`GroupDiscussion/${GROUP_AB}/gmsg1`).set({
      _id: "gmsg1",
      createdAt: 2000,
      senderId: UID_A,
      senderName: "Alice",
      type: "text",
      text: "Welcome",
    })
  );
  await assertSucceeds(
    dbAs(UID_B).ref(`GroupDiscussion/${GROUP_AB}/gmsg2`).set({
      _id: "gmsg2",
      createdAt: 2001,
      senderId: UID_B,
      senderName: "System",
      isSystem: true,
      type: "text",
      text: "Added a new member!",
    })
  );
  await assertSucceeds(
    dbAs(UID_B).ref(`GroupDiscussion/${GROUP_AB}/gmsg3`).set({
      _id: "gmsg3",
      createdAt: 2002,
      senderId: UID_B,
      senderName: "Bob",
      type: "file",
      text: "FILE sent",
      file: { url: "https://example.com/a.pdf", name: "a.pdf" },
    })
  );
  await assertSucceeds(
    dbAs(UID_B).ref(`GroupDiscussion/${GROUP_AB}/gmsg4`).set({
      _id: "gmsg4",
      createdAt: 2003,
      senderId: UID_B,
      senderName: "Bob",
      type: "location",
      text: "LOCATION sent",
      location: { latitude: 36.8, longitude: 10.1 },
    })
  );

  // Spoofed SYSTEM, spoofed senderId, extra field, edit, and delete blocked
  await assertFails(
    dbAs(UID_B).ref(`GroupDiscussion/${GROUP_AB}/gmsgSpoofSys`).set({
      _id: "gmsgSpoofSys",
      createdAt: 2004,
      senderId: "SYSTEM",
      senderName: "System",
      type: "text",
      text: "Added a new member!",
    })
  );
  await assertFails(
    dbAs(UID_B).ref(`GroupDiscussion/${GROUP_AB}/gmsgSpoofA`).set({
      _id: "gmsgSpoofA",
      createdAt: 2005,
      senderId: UID_A,
      senderName: "Alice",
      type: "text",
      text: "Fake",
    })
  );
  await assertFails(
    dbAs(UID_B).ref(`GroupDiscussion/${GROUP_AB}/gmsgExtra`).set({
      _id: "gmsgExtra",
      createdAt: 2006,
      senderId: UID_B,
      senderName: "Bob",
      type: "text",
      text: "Hi",
      unknownProp: 1,
    })
  );
  await assertFails(
    dbAs(UID_B).ref(`GroupDiscussion/${GROUP_AB}/gmsg1`).update({ text: "Edited" })
  );
  await assertFails(dbAs(UID_A).ref(`GroupDiscussion/${GROUP_AB}/gmsg1`).remove());
});
