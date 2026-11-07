import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import {
  PASSWORD_RESET_TTL_MINUTES,
  PASSWORD_RESET_TTL_MS,
  generatePasswordResetToken,
  hashPasswordResetToken,
  isPasswordResetToken,
} from "../services/passwordResetCrypto.js";
import { createPasswordResetService } from "../services/passwordResetServiceCore.js";
import { passwordsMatch } from "../../frontend/src/utils/passwordReset.js";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.PASSWORD_RESET_TOKEN_SECRET = "test-password-reset-secret";
process.env.CLIENT_URL = "https://app.hackhub.test";

const { GENERIC_RESET_REQUEST_MESSAGE, createPasswordResetRouter } = await import(
  "../routes/passwordReset.js"
);
const { hashPassword, comparePassword } = await import("../repositories/userRepo.js");

function createMemoryRepo() {
  const users = new Map();
  const tokens = [];
  const clock = { now: new Date("2026-11-04T10:00:00.000Z") };

  function userTokens(userId) {
    return tokens.filter((token) => token.userId === userId);
  }

  return {
    users,
    tokens,
    clock,
    addUser(user) {
      users.set(user.id, user);
      return user;
    },
    async issueResetToken({ userId, tokenHash, expiresAt, resendAfterSeconds }) {
      if (!users.has(userId)) return { status: "user_not_found" };

      let lastCreatedAt = null;
      for (const token of userTokens(userId)) {
        if (!lastCreatedAt || token.createdAt > lastCreatedAt) {
          lastCreatedAt = token.createdAt;
        }
      }

      if (
        lastCreatedAt &&
        lastCreatedAt.getTime() + resendAfterSeconds * 1000 > clock.now.getTime()
      ) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(
            (lastCreatedAt.getTime() + resendAfterSeconds * 1000 - clock.now.getTime()) / 1000
          )
        );
        return { status: "cooldown", retry_after_seconds: retryAfterSeconds };
      }

      for (const token of userTokens(userId)) {
        if (!token.usedAt) token.usedAt = new Date(clock.now);
      }

      const record = {
        id: `token-${tokens.length + 1}`,
        userId,
        tokenHash,
        expiresAt,
        usedAt: null,
        createdAt: new Date(clock.now),
      };
      tokens.push(record);

      return { status: "issued", token_id: record.id, expires_at: expiresAt };
    },
    async consumeResetToken({ tokenHash, passwordHash }) {
      const record = tokens.find((token) => token.tokenHash === tokenHash);
      if (!record) return "invalid";
      if (record.usedAt) return "used";
      if (record.expiresAt.getTime() <= clock.now.getTime()) return "expired";

      const user = users.get(record.userId);
      if (!user) return "user_not_found";

      user.password = passwordHash;

      for (const token of userTokens(record.userId)) {
        if (!token.usedAt) token.usedAt = new Date(clock.now);
      }

      return "reset";
    },
    async removeResetToken(tokenId) {
      const index = tokens.findIndex((token) => token.id === tokenId);
      if (index >= 0) tokens.splice(index, 1);
    },
  };
}

async function createContext({ emailVerified = true } = {}) {
  const repo = createMemoryRepo();
  const oldPasswordHash = await hashPassword("old-password");
  const user = repo.addUser({
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: oldPasswordHash,
    emailVerified,
  });
  const emails = [];
  const service = createPasswordResetService({
    repo,
    sendEmail: async (email) => {
      emails.push(email);
    },
    now: () => repo.clock.now,
    secret: "test-secret",
    baseUrl: "https://app.hackhub.test/",
  });

  return { repo, user, emails, service };
}

function routeUsers(repo) {
  return {
    async findByEmail(email) {
      return (
        [...repo.users.values()].find((user) => user.email === email.toLowerCase()) || null
      );
    },
    hashPassword,
  };
}

function tokenFromEmail(email) {
  return new URL(email.resetUrl).searchParams.get("token");
}

async function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", router);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    return await fn(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postJson(server, path, body) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

test("password reset tokens are random, URL-safe, and hashed with a keyed secret", () => {
  const seen = new Set();

  for (let i = 0; i < 200; i++) {
    const token = generatePasswordResetToken();
    assert.equal(isPasswordResetToken(token), true);
    assert.equal(token.length, 43);
    assert.equal(seen.has(token), false);
    seen.add(token);
    assert.match(hashPasswordResetToken(token, "test-secret"), /^[a-f0-9]{64}$/);
  }

  assert.notEqual(
    hashPasswordResetToken("same-token", "secret-a"),
    hashPasswordResetToken("same-token", "secret-b")
  );
});

test("requestReset stores only a hash and emails a trusted reset URL", async () => {
  const { repo, user, emails, service } = await createContext();

  const result = await service.requestReset(user);

  assert.equal(result.status, "sent");
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, user.email);
  assert.equal(emails[0].expiresInMinutes, PASSWORD_RESET_TTL_MINUTES);

  const url = new URL(emails[0].resetUrl);
  const token = url.searchParams.get("token");

  assert.equal(url.origin, "https://app.hackhub.test");
  assert.equal(url.pathname, "/reset-password");
  assert.equal(isPasswordResetToken(token), true);

  assert.equal(repo.tokens.length, 1);
  assert.equal(repo.tokens[0].tokenHash, hashPasswordResetToken(token, "test-secret"));
  assert.notEqual(repo.tokens[0].tokenHash, token);
  assert.equal(repo.tokens[0].expiresAt.getTime(), repo.clock.now.getTime() + PASSWORD_RESET_TTL_MS);
});

test("requestReset enforces a cooldown instead of issuing unlimited tokens", async () => {
  const { repo, user, emails, service } = await createContext();

  assert.equal((await service.requestReset(user)).status, "sent");
  const second = await service.requestReset(user);

  assert.equal(second.status, "cooldown");
  assert.ok(second.retryAfterSeconds > 0);
  assert.equal(emails.length, 1);
  assert.equal(repo.tokens.length, 1);
});

test("requestReset revokes the token when email delivery fails", async () => {
  const repo = createMemoryRepo();
  const oldPasswordHash = await hashPassword("old-password");
  const user = repo.addUser({
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: oldPasswordHash,
    emailVerified: true,
  });
  const service = createPasswordResetService({
    repo,
    sendEmail: async () => {
      throw new Error("smtp down");
    },
    now: () => repo.clock.now,
    secret: "test-secret",
    baseUrl: "https://app.hackhub.test",
  });

  await assert.rejects(() => service.requestReset(user), /smtp down/);
  assert.equal(repo.tokens.length, 0);
});

test("a correct token resets the password exactly once", async () => {
  const { repo, user, emails, service } = await createContext();

  await service.requestReset(user);
  const token = tokenFromEmail(emails[0]);
  const newPasswordHash = await hashPassword("New-Password1!");

  assert.equal(await service.resetPassword({ token, passwordHash: newPasswordHash }), "reset");

  const updated = repo.users.get(user.id);
  assert.equal(await comparePassword({ password: updated.password }, "New-Password1!"), true);
  assert.equal(await comparePassword({ password: updated.password }, "old-password"), false);
  assert.ok(repo.tokens[0].usedAt);

  assert.equal(await service.resetPassword({ token, passwordHash: newPasswordHash }), "used");
});

test("invalid and expired reset tokens are rejected", async () => {
  const { repo, user, emails, service } = await createContext();
  const newPasswordHash = await hashPassword("New-Password1!");

  assert.equal(
    await service.resetPassword({ token: "x".repeat(43), passwordHash: newPasswordHash }),
    "invalid"
  );

  await service.requestReset(user);
  const token = tokenFromEmail(emails[0]);
  repo.clock.now = new Date(repo.clock.now.getTime() + PASSWORD_RESET_TTL_MS + 1000);

  assert.equal(await service.resetPassword({ token, passwordHash: newPasswordHash }), "expired");
});

test("password reset does not mark an unverified email as verified", async () => {
  const { repo, user, emails, service } = await createContext({ emailVerified: false });

  assert.equal(user.emailVerified, false);
  await service.requestReset(user);
  const token = tokenFromEmail(emails[0]);

  assert.equal(
    await service.resetPassword({ token, passwordHash: await hashPassword("New-Password1!") }),
    "reset"
  );
  assert.equal(repo.users.get(user.id).emailVerified, false);
});

test("frontend password confirmation rejects mismatched passwords", () => {
  assert.equal(passwordsMatch("New-Password1!", "New-Password1!"), true);
  assert.equal(passwordsMatch("New-Password1!", "different-password"), false);
  assert.equal(passwordsMatch("", ""), false);
});

test("forgot-password returns the same generic response for existing and missing accounts", async () => {
  const repo = createMemoryRepo();
  repo.addUser({
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "unused",
    emailVerified: true,
  });
  const calls = [];
  const service = {
    async requestReset(user) {
      calls.push(user.id);
      return { status: "cooldown", retryAfterSeconds: 42 };
    },
  };
  const router = createPasswordResetRouter({
    users: routeUsers(repo),
    service,
    isConfigured: () => true,
  });

  await withServer(router, async (server) => {
    const existing = await postJson(server, "/api/auth/forgot-password", {
      email: "ada@example.com",
    });
    const missing = await postJson(server, "/api/auth/forgot-password", {
      email: "nobody@example.com",
    });

    assert.equal(existing.status, 200);
    assert.equal(missing.status, 200);
    assert.deepEqual(existing.data, missing.data);
    assert.deepEqual(existing.data, { message: GENERIC_RESET_REQUEST_MESSAGE });
    assert.equal("retryAfterSeconds" in existing.data, false);
    assert.deepEqual(calls, ["user-1"]);
  });
});

test("forgot-password still returns the generic response when email delivery fails", async () => {
  const repo = createMemoryRepo();
  repo.addUser({
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "unused",
    emailVerified: true,
  });
  const router = createPasswordResetRouter({
    users: routeUsers(repo),
    service: {
      async requestReset() {
        throw new Error("smtp down");
      },
    },
    isConfigured: () => true,
  });

  await withServer(router, async (server) => {
    const response = await postJson(server, "/api/auth/forgot-password", {
      email: "ada@example.com",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { message: GENERIC_RESET_REQUEST_MESSAGE });
  });
});

test("reset-password endpoint resets the password and rejects reused links", async () => {
  const { repo, user, emails, service } = await createContext();
  const router = createPasswordResetRouter({
    users: routeUsers(repo),
    service,
    isConfigured: () => true,
  });

  await service.requestReset(user);
  const token = tokenFromEmail(emails[0]);

  await withServer(router, async (server) => {
    const success = await postJson(server, "/api/auth/reset-password", {
      token,
      password: "New-Password1!",
    });

    assert.equal(success.status, 200);
    assert.match(success.data.message, /password has been reset/i);
    assert.equal(
      await comparePassword({ password: repo.users.get(user.id).password }, "New-Password1!"),
      true
    );

    const reused = await postJson(server, "/api/auth/reset-password", {
      token,
      password: "Another-Password2!",
    });

    assert.equal(reused.status, 410);
    assert.equal(reused.data.code, "RESET_TOKEN_USED");
  });
});

test("reset-password endpoint rejects weak passwords without consuming the token", async () => {
  const { repo, user, emails, service } = await createContext();
  const router = createPasswordResetRouter({
    users: routeUsers(repo),
    service,
    isConfigured: () => true,
  });

  await service.requestReset(user);
  const token = tokenFromEmail(emails[0]);

  await withServer(router, async (server) => {
    const weak = await postJson(server, "/api/auth/reset-password", {
      token,
      password: "12345678",
    });

    assert.equal(weak.status, 400);
    assert.match(weak.data.error, /uppercase/i);
    assert.equal(
      await comparePassword({ password: repo.users.get(user.id).password }, "old-password"),
      true
    );

    const strong = await postJson(server, "/api/auth/reset-password", {
      token,
      password: "New-Password1!",
    });

    assert.equal(strong.status, 200);
  });
});

test("reset-password endpoint reports invalid and expired links without internal details", async () => {
  const { repo, user, emails, service } = await createContext();
  const router = createPasswordResetRouter({
    users: routeUsers(repo),
    service,
    isConfigured: () => true,
  });

  await service.requestReset(user);
  const expiredToken = tokenFromEmail(emails[0]);
  repo.clock.now = new Date(repo.clock.now.getTime() + PASSWORD_RESET_TTL_MS + 1000);

  await withServer(router, async (server) => {
    const invalid = await postJson(server, "/api/auth/reset-password", {
      token: "x".repeat(43),
      password: "New-Password1!",
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.code, "RESET_TOKEN_INVALID");
    assert.equal("stack" in invalid.data, false);

    const expired = await postJson(server, "/api/auth/reset-password", {
      token: expiredToken,
      password: "New-Password1!",
    });
    assert.equal(expired.status, 410);
    assert.equal(expired.data.code, "RESET_TOKEN_EXPIRED");
    assert.equal("stack" in expired.data, false);
  });
});

test("forgot-password rate limiter blocks repeated requests", async () => {
  const router = createPasswordResetRouter({
    users: {
      async findByEmail() {
        return {
          id: "user-1",
          name: "Rate Limited",
          email: "rate-limit@example.com",
          emailVerified: true,
        };
      },
      hashPassword,
    },
    service: {
      async requestReset() {
        return { status: "sent" };
      },
    },
    isConfigured: () => true,
  });

  await withServer(router, async (server) => {
    const statuses = [];

    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await postJson(server, "/api/auth/forgot-password", {
        email: "rate-limit@example.com",
      });
      statuses.push(response.status);
    }

    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);

    const blocked = await postJson(server, "/api/auth/forgot-password", {
      email: "rate-limit@example.com",
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.data.code, "PASSWORD_RESET_RATE_LIMITED");
  });
});
