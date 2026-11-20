const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLegacyPublicProfile } = require("../lib/profile-directory");

const uid = "11111111-1111-4111-8111-111111111111";

test("legacy Public profiles are restored when the consent field did not exist yet", () => {
  const result = buildLegacyPublicProfile({
    profileVisibility: "public",
    profileData: { displayName: "Old Builder", username: "old_builder", profileVisibility: "public", skills: ["JavaScript"] },
    email: "private@example.com",
    phone: "+1 555 0100"
  }, uid);
  assert.equal(result.uid, uid);
  assert.equal(result.profileVisibility, "public");
  assert.deepEqual(result.skills, ["JavaScript"]);
  assert.equal("email" in result, false);
  assert.equal("phone" in result, false);
});

test("the Public profile choice is the single directory opt-in even if a legacy consent field is empty", () => {
  const result = buildLegacyPublicProfile({
    profileVisibility: "public",
    profileData: { displayName: "New Builder", username: "new_builder", profileVisibility: "public", profileConsentAt: null }
  }, uid);
  assert.equal(result?.profileVisibility, "public");
  assert.ok(result?.profileConsentAt);
});

test("profiles without an explicit Public or Private visibility choice are not backfilled", () => {
  assert.equal(buildLegacyPublicProfile({
    profileData: { displayName: "Unknown Visibility", username: "unknown_builder" }
  }, uid), null);
});

test("private and followers-only profiles are never backfilled", () => {
  for (const visibility of ["private", "followers"]) {
    assert.equal(buildLegacyPublicProfile({
      profileVisibility: visibility,
      profileData: { displayName: "Builder", username: "builder_01", profileVisibility: visibility }
    }, uid), null);
  }
});

test("invalid identity and malformed URLs are not exposed", () => {
  const result = buildLegacyPublicProfile({
    profileVisibility: "public",
    profileData: { displayName: "Builder", username: "bad username", profileVisibility: "public" }
  }, uid);
  assert.equal(result, null);
});

test("legacy public visibility is normalized across older capitalization and labels", () => {
  const result = buildLegacyPublicProfile({
    visibility: "Public — searchable in the Builders directory",
    profileData: { displayName: "Legacy Member", username: "legacy_member", profileVisibility: "PUBLIC" }
  }, uid);
  assert.equal(result?.profileVisibility, "public");
});
