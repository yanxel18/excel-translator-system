const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ProductSurfacesService,
} = require("../dist/modules/product-surfaces/product-surfaces.service");

const userId = "c2ad72da-3f2a-4b82-9e7e-5b63dbd6c211";

test("profile exposes identity method metadata but never credential hashes", async () => {
  const service = new ProductSurfacesService({
    user: {
      findUnique: async () => ({
        id: userId,
        username: "alice",
        email: "alice@example.com",
        fullName: "Alice",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        passwordHash: "secret-hash",
        identities: [{ provider: "KEYCLOAK" }],
      }),
    },
  });
  const profile = await service.getProfile(userId, false);
  assert.deepEqual(profile.identityProviders, ["KEYCLOAK", "LOCAL"]);
  assert.equal(profile.hasLocalPassword, true);
  assert.equal(profile.passwordHash, undefined);
  assert.equal(profile.isAdmin, false);
});

test("OIDC-only profile does not advertise local password management", async () => {
  const service = new ProductSurfacesService({
    user: {
      findUnique: async () => ({
        id: userId,
        username: "alice",
        email: null,
        fullName: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        passwordHash: null,
        identities: [{ provider: "KEYCLOAK" }],
      }),
    },
  });
  const profile = await service.getProfile(userId);
  assert.deepEqual(profile.identityProviders, ["KEYCLOAK"]);
  assert.equal(profile.hasLocalPassword, false);
  assert.equal(profile.passwordHash, undefined);
});
