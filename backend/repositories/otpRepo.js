import { adminClient } from "../config/supabase.js";

export async function issueOtp({ userId, otpHash, expiresAt, resendAfterSeconds }) {
  const { data, error } = await adminClient.rpc("issue_email_verification_otp", {
    p_user_id: userId,
    p_otp_hash: otpHash,
    p_expires_at: expiresAt.toISOString(),
    p_resend_after_seconds: resendAfterSeconds,
  });

  if (error) throw error;
  return data;
}

export async function verifyOtp({ userId, otpHash }) {
  const { data, error } = await adminClient.rpc("verify_email_otp", {
    p_user_id: userId,
    p_otp_hash: otpHash,
  });

  if (error) throw error;
  return data;
}

export async function removeOtp(otpId) {
  const { error } = await adminClient
    .from("email_verification_otps")
    .delete()
    .eq("id", otpId);

  if (error) throw error;
}

export async function cleanupOldOtps() {
  const { data, error } = await adminClient.rpc("cleanup_email_verification_otps");
  if (error) throw error;
  return data;
}
