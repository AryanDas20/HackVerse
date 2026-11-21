const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLegacyPublicProfile } = require("../lib/profile-directory");

const uid = "11111111-1111-4111-8111-111111111111";

test("Public profiles are restored based on the Public visibility choice", () => {
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

test("a Public profile is restored even if it contains an old empty consent field", () => {
  const result = buildLegacyPublicProfile({
    profileVisibility: "public",
    profileData: { displayName: "New Builder", username: "new_builder", profileVisibility: "public", profileConsentAt: null }
  }, uid);
  assert.equal(result?.profileVisibility, "public");
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
