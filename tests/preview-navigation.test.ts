import { test } from "node:test";
import assert from "node:assert/strict";
import { previewKind } from "../src/lib/learning/preview";
import { canReturnFromPassword } from "../src/lib/auth/password-navigation";
test("inline preview permits only validated raster image/PDF MIME types", () => {
  for (const mime of ["image/jpeg", "image/png", "image/webp"])
    assert.equal(previewKind(mime), "image");
  assert.equal(previewKind("application/pdf"), "pdf");
  for (const mime of [
    undefined,
    "text/html",
    "image/svg+xml",
    "application/msword",
    "application/octet-stream",
  ])
    assert.equal(previewKind(mime), null);
});
test("password return button requires explicit workspace origin and a fully activated account", () => {
  const profile = {
    must_change_password: false,
    email_verified_at: new Date().toISOString(),
  };
  assert.equal(canReturnFromPassword(profile, "ruang-belajar"), true);
  for (const from of [
    undefined,
    "https://evil.test",
    "//evil.test",
    ["ruang-belajar"],
  ])
    assert.equal(canReturnFromPassword(profile, from), false);
  assert.equal(
    canReturnFromPassword(
      { ...profile, must_change_password: true },
      "ruang-belajar",
    ),
    false,
  );
  assert.equal(
    canReturnFromPassword(
      { ...profile, email_verified_at: null },
      "ruang-belajar",
    ),
    false,
  );
});
