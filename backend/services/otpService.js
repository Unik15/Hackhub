import * as otpRepo from "../repositories/otpRepo.js";
import { createOtpService } from "./otpServiceCore.js";

export {
  OTP_LENGTH,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  generateOtp,
  isSixDigitOtp,
  resolveOtpSecret,
  hashOtp,
} from "./otpCrypto.js";
export { createOtpService };

export const otpService = createOtpService({ repo: otpRepo });
