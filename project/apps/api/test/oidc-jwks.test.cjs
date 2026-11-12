const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { generateKeyPairSync } = require("node:crypto");
const jwt = require("jsonwebtoken");
const {
  KeycloakVerifierService,
} = require("../dist/modules/authentication/keycloak-verifier.service");

test("verifies a signed OIDC token against the configured JWKS endpoint", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const key = {
    ...publicKey.export({ format: "jwk" }),
    kid: "test-key",
    use: "sig",
    alg: "RS256",
  };
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ keys: [key] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const issuerUrl = `http://127.0.0.1:${server.address().port}/realms/test`;
    const settings = {
      enabled: true,
      issuerUrl,
      clientId: "test-client",
      requiredGroup: "/members",
    };
    const verifier = new KeycloakVerifierService({
      oidcSettings: { findUnique: async () => settings },
    });
    const makeToken = (claims) =>
      jwt.sign(
        {
          sub: "provider-user",
          azp: "test-client",
          groups: ["/members"],
          ...claims,
        },
        privateKey,
        {
          algorithm: "RS256",
          keyid: "test-key",
          issuer: issuerUrl,
          expiresIn: 60,
        },
      );
    assert.equal((await verifier.verify(makeToken({}))).sub, "provider-user");
    await assert.rejects(verifier.verify(makeToken({ azp: "other-client" })));
    await assert.rejects(verifier.verify(makeToken({ groups: ["/other"] })));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
