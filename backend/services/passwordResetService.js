import * as passwordResetRepo from "../repositories/passwordResetRepo.js";
import { sendPasswordResetEmail } from "./notificationService.js";
import { createPasswordResetService } from "./passwordResetServiceCore.js";

export {
  PASSWORD_RESET_RESEND_COOLDOWN_SECONDS,
  PASSWORD_RESET_TTL_MS,
  PASSWORD_RESET_TTL_MINUTES,
  generatePasswordResetToken,
  hashPasswordResetToken,
  isPasswordResetToken,
  resolvePasswordResetSecret,
} from "./passwordResetCrypto.js";
export { createPasswordResetService };

export const passwordResetService = createPasswordResetService({
  repo: passwordResetRepo,
  sendEmail: sendPasswordResetEmail,
});
