const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Test } = require("@nestjs/testing");
const {
  AuthenticationController,
} = require("../dist/modules/authentication/authentication.controller");
const {
  AuthenticationService,
} = require("../dist/modules/authentication/authentication.service");
const {
  KeycloakVerifierService,
} = require("../dist/modules/authentication/keycloak-verifier.service");
const {
  JwtAuthGuard,
} = require("../dist/modules/authentication/jwt-auth.guard");
const {
  AdminAuthGuard,
} = require("../dist/modules/authentication/admin-auth.guard");
const {
  ProductSurfacesController,
} = require("../dist/modules/product-surfaces/product-surfaces.controller");
const {
  ProductSurfacesService,
} = require("../dist/modules/product-surfaces/product-surfaces.service");

test("REST authentication and profile inputs reject unknown fields and preserve valid values", async () => {
  let loginArguments, profileValue, settingsValue;
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthenticationController, ProductSurfacesController],
    providers: [
      {
        provide: AuthenticationService,
        useValue: {
          validateUser: async (...args) => {
            loginArguments = args;
            return {};
          },
          login: async () => ({ access_token: "ok" }),
          exchangeKeycloakToken: async () => ({}),
          verifySession: async () => ({}),
        },
      },
      {
        provide: KeycloakVerifierService,
        useValue: {
          updateSettings: async (value) => {
            settingsValue = value;
            return value;
          },
        },
      },
      {
        provide: ProductSurfacesService,
        useValue: {
          updateProfile: async (_owner, body) => {
            profileValue = body;
            return body;
          },
        },
      },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context) => {
        context.switchToHttp().getRequest().user = {
          userId: "u",
          isAdmin: true,
        };
        return true;
      },
    })
    .overrideGuard(AdminAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  try {
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const post = (path, body, method = "POST") =>
      fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal(
      (
        await post("/auth/login", {
          username: "user",
          password: " pass\nword ",
          admin: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("/auth/login", {
          username: "user",
          password: " pass\nword ",
        })
      ).status,
      201,
    );
    assert.deepEqual(loginArguments, ["user", " pass\nword "]);
    assert.equal(
      (await post("/auth/login", { username: 123, password: "x" })).status,
      400,
    );
    assert.equal(
      (
        await post("/auth/login", {
          username: "x".repeat(1025),
          password: "valid",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("/auth/login", {
          username: "user",
          password: "x".repeat(1025),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("/auth/login", {
          username: "user",
          password: " ".repeat(1024),
        })
      ).status,
      201,
    );
    assert.equal(loginArguments[1], " ".repeat(1024));
    assert.equal(
      (await post("/auth/oidc/exchange", { accessToken: "x".repeat(32769) }))
        .status,
      400,
    );
    assert.equal(
      (await post("/auth/verify", { token: "x".repeat(32769) })).status,
      400,
    );
    assert.equal(
      (await post("/auth/oidc/exchange", { accessToken: 1 })).status,
      400,
    );
    assert.equal((await post("/auth/verify", { token: [] })).status, 400);
    assert.equal(
      (
        await post(
          "/auth/oidc/settings",
          { enabled: false, unknown: true },
          "PATCH",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          "/auth/oidc/settings",
          {
            enabled: false,
            keycloakUrl: "",
            realm: "",
            clientId: "",
            issuerUrl: "",
            requiredGroup: "",
          },
          "PATCH",
        )
      ).status,
      200,
    );
    assert.equal(settingsValue.enabled, false);
    assert.equal(
      (await post("/profile", { fullName: "山田", isAdmin: true }, "PATCH"))
        .status,
      400,
    );
    assert.equal(
      (await post("/profile", { fullName: "山田", email: null }, "PATCH"))
        .status,
      200,
    );
    assert.equal(profileValue.fullName, "山田");
  } finally {
    await app.close();
  }
});

test("profile validation rejects invalid email and oversized names while accepting CJK names", async () => {
  const service = new ProductSurfacesService({
    user: { update: async ({ data }) => data },
  });
  await assert.rejects(
    service.updateProfile("u", { email: "invalid" }),
    (error) => error.status === 400,
  );
  await assert.rejects(
    service.updateProfile("u", { fullName: "x".repeat(121) }),
    (error) => error.status === 400,
  );
  await assert.rejects(
    service.updateProfile("u", { fullName: "山田", unexpected: true }),
    (error) => error.status === 400,
  );
  assert.deepEqual(
    await service.updateProfile("u", { fullName: "山田 太郎" }),
    {
      fullName: "山田 太郎",
      isAdmin: false,
      identityProviders: [],
      hasLocalPassword: false,
    },
  );
});
