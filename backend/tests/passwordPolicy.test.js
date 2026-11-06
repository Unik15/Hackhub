import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import {
  PASSWORD_MIN_LENGTH,
  getPasswordStrengthError,
  isStrongPassword,
} from "../utils/passwordPolicy.js";
import { getPasswordStrengthError as getFrontendPasswordStrengthError } from "../../frontend/src/utils/passwordPolicy.js";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.JWT_SECRET = "test-jwt-secret";

const { default: authRouter } = await import("../routes/auth.js");

const WEAK_PASSWORDS = [
  ["too short", "Ab1!xyz", "Password must be at least 8 characters."],
  ["digits only", "12345678", "Password must include at least one uppercase letter."],
  ["no uppercase", "abcdefg1!", "Password must include at least one uppercase letter."],
  ["no lowercase", "ABCDEFG1!", "Password must include at least one lowercase letter."],
  ["no number", "Abcdefg!", "Password must include at least one number."],
  ["no special", "Abcdefg1", "Password must include at least one special character."],
];

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

test("password policy rejects weak passwords and accepts strong ones", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8);

  for (const [label, password, expected] of WEAK_PASSWORDS) {
    const backendError = getPasswordStrengthError(password);
    const frontendError = getFrontendPasswordStrengthError(password);

    assert.equal(backendError, expected, `${label} (backend)`);
    assert.equal(frontendError, expected, `${label} (frontend)`);
    assert.equal(isStrongPassword(password), false, label);
  }

  for (const password of ["Str0ng!Pass", "Abcdefg1!", "C0mplex#Pass"]) {
    assert.equal(getPasswordStrengthError(password), null, password);
    assert.equal(getFrontendPasswordStrengthError(password), null, password);
    assert.equal(isStrongPassword(password), true, password);
  }
});

test("signup API rejects weak passwords before creating an account", async () => {
  await withServer(authRouter, async (server) => {
    for (const [index, [label, password, expected]] of WEAK_PASSWORDS.entries()) {
      const response = await postJson(server, "/api/auth/signup", {
        name: "Ada Lovelace",
        email: `weak-password-${index}@example.com`,
        password,
      });

      assert.equal(response.status, 400, label);
      assert.equal(response.data.error, expected, label);
    }
  });
});
