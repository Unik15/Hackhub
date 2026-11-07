import test from "node:test";
import assert from "node:assert/strict";

import {
  OTP_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MS,
  generateOtp,
  hashOtp,
  isSixDigitOtp,
} from "../services/otpCrypto.js";
import { createOtpService } from "../services/otpServiceCore.js";

test("generateOtp always returns exactly six numeric digits", () => {
  for (let i = 0; i < 5000; i++) {
    const otp = generateOtp();
    assert.equal(otp.length, OTP_LENGTH);
    assert.match(otp, /^\d{6}$/);
    assert.equal(isSixDigitOtp(otp), true);
  }
});

test("hashOtp is deterministic, keyed, and bound to the user", () => {
  const secret = "test-secret";
  const first = hashOtp("123456", "user-1", secret);

  assert.equal(first, hashOtp("123456", "user-1", secret));
  assert.notEqual(first, hashOtp("123456", "user-2", secret));
  assert.notEqual(first, hashOtp("123456", "user-1", "different-secret"));
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("issue creates a hashed, expiring OTP and never returns the hash", async () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const captured = {};
  const repo = {
    async issueOtp(input) {
      captured.input = input;
      return { status: "issued", otp_id: "otp-1" };
    },
  };
  const service = createOtpService({ repo, now: () => now, secret: "test-secret" });

  const result = await service.issue("user-1");

  assert.equal(result.status, "issued");
  assert.equal(result.otpId, "otp-1");
  assert.equal(result.expiresAt.getTime(), now.getTime() + OTP_TTL_MS);
  assert.match(result.otp, /^\d{6}$/);
  assert.equal(captured.input.userId, "user-1");
  assert.equal(captured.input.resendAfterSeconds, OTP_RESEND_COOLDOWN_SECONDS);
  assert.equal(
    captured.input.otpHash,
    hashOtp(result.otp, "user-1", "test-secret")
  );
  assert.equal("otpHash" in result, false);
});

test("issue surfaces the database resend cooldown", async () => {
  const repo = {
    async issueOtp() {
      return { status: "cooldown", retry_after_seconds: 42 };
    },
  };
  const service = createOtpService({ repo, secret: "test-secret" });

  const result = await service.issue("user-1");

  assert.deepEqual(result, { status: "cooldown", retryAfterSeconds: 42 });
});

test("verify sends the correctly keyed hash and returns the database status", async () => {
  const repo = {
    async verifyOtp(input) {
      assert.equal(input.userId, "user-1");
      assert.equal(input.otpHash, hashOtp("654321", "user-1", "test-secret"));
      return "verified";
    },
  };
  const service = createOtpService({ repo, secret: "test-secret" });

  const result = await service.verify("user-1", "654321");
  assert.equal(result, "verified");
});

test("revoke removes an undeliverable OTP", async () => {
  const removed = [];
  const repo = {
    async removeOtp(id) {
      removed.push(id);
    },
  };
  const service = createOtpService({ repo, secret: "test-secret" });

  await service.revoke("otp-9");
  assert.deepEqual(removed, ["otp-9"]);
});
