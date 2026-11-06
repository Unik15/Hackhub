import { adminClient } from "../config/supabase.js";

export async function issueResetToken({ userId, tokenHash, expiresAt, resendAfterSeconds }) {
  const { data, error } = await adminClient.rpc("issue_password_reset_token", {
    p_user_id: userId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt.toISOString(),
    p_resend_after_seconds: resendAfterSeconds,
  });

  if (error) throw error;
  return data;
}

export async function consumeResetToken({ tokenHash, passwordHash }) {
  const { data, error } = await adminClient.rpc("consume_password_reset_token", {
    p_token_hash: tokenHash,
    p_password_hash: passwordHash,
  });

  if (error) throw error;
  return data;
}

export async function removeResetToken(tokenId) {
  const { error } = await adminClient
    .from("password_reset_tokens")
    .delete()
    .eq("id", tokenId);

  if (error) throw error;
}

export async function cleanupOldResetTokens() {
  const { data, error } = await adminClient.rpc("cleanup_password_reset_tokens");
  if (error) throw error;
  return data;
}
