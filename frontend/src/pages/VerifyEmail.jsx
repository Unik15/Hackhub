import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2, MailCheck, RotateCcw, ShieldCheck } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { resendEmailOtp, verifyEmailOtp } from "@/services/auth";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errors";
import {
  clearPendingEmail,
  readPendingEmail,
  rememberPendingEmail,
} from "@/utils/verification";
import Seo from "@/components/Seo";

const OTP_LENGTH = 6;
const DEFAULT_RESEND_SECONDS = 60;

function initialCooldown(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_RESEND_SECONDS;
}

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const email = location.state?.email || user?.email || readPendingEmail();

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(""));
  const [cooldown, setCooldown] = useState(() =>
    initialCooldown(location.state?.resendAfterSeconds)
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [success, setSuccess] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const inputsRef = useRef([]);
  const verifyingRef = useRef(false);
  const resendingRef = useRef(false);
  const redirectTimerRef = useRef(null);

  const otp = digits.join("");
  const isComplete = otp.length === OTP_LENGTH;

  useEffect(() => {
    if (email) rememberPendingEmail(email);
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const focusDigit = (index) => {
    const input = inputsRef.current[index];
    if (input) {
      input.focus();
      input.select();
    }
  };

  const distributeDigits = (raw) => {
    const next = Array(OTP_LENGTH).fill("");
    raw
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH)
      .split("")
      .forEach((digit, index) => {
        next[index] = digit;
      });
    setDigits(next);
    const lastFilled = Math.min(raw.replace(/\D/g, "").length, OTP_LENGTH) - 1;
    if (lastFilled >= 0) focusDigit(lastFilled);
  };

  const handleChange = (index, value) => {
    const raw = value.replace(/\D/g, "");

    if (raw.length > 1) {
      distributeDigits(raw);
      setError("");
      return;
    }

    const next = [...digits];
    next[index] = raw;
    setDigits(next);
    setError("");
    setNotice("");

    if (raw && index < OTP_LENGTH - 1) {
      focusDigit(index + 1);
    }
  };

  const handleKeyDown = (index, event) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      focusDigit(index - 1);
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusDigit(index - 1);
    } else if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      event.preventDefault();
      focusDigit(index + 1);
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text") || "";
    distributeDigits(pasted);
    setError("");
    setNotice("");
  };

  const goToLogin = () => {
    navigate("/login", {
      replace: true,
      state: { email, verified: true },
    });
  };

  const handleVerified = (data) => {
    setSuccess(data?.message || "Email verified successfully.");
    setError("");
    clearPendingEmail();
    toast({
      title: "Email verified",
      description: "You can now log in and submit hackathons.",
    });
    redirectTimerRef.current = setTimeout(goToLogin, 1600);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (verifyingRef.current || success) return;

    if (!isComplete) {
      setError("Enter all six digits from the verification email.");
      return;
    }

    if (!email) {
      setError("We couldn't find the email address for this verification. Please sign up again.");
      return;
    }

    verifyingRef.current = true;
    setVerifying(true);
    setError("");
    setNotice("");

    try {
      const data = await verifyEmailOtp({ email, otp });
      handleVerified(data);
    } catch (err) {
      const apiError = err?.response?.data;

      if (apiError?.code === "EMAIL_ALREADY_VERIFIED") {
        handleVerified({ message: "Your email is already verified." });
        return;
      }

      setError(
        getErrorMessage(
          err,
          apiError?.code === "OTP_EXPIRED"
            ? "Your OTP has expired. Please request a new code."
            : "We couldn't verify that code. Please try again."
        )
      );

      setDigits(Array(OTP_LENGTH).fill(""));
      focusDigit(0);
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email || cooldown > 0 || resendingRef.current || verifying || success) return;

    resendingRef.current = true;
    setResending(true);
    setError("");
    setNotice("");

    try {
      const data = await resendEmailOtp({ email });
      const seconds = Number(data?.verification?.resendAfterSeconds);
      setCooldown(Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RESEND_SECONDS);
      setDigits(Array(OTP_LENGTH).fill(""));
      setNotice(data?.message || "A new verification code has been sent.");
      toast({ title: "New code sent", description: "Check your inbox for the new 6-digit code." });
      focusDigit(0);
    } catch (err) {
      const retryAfter = Number(err?.response?.data?.retryAfterSeconds);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        setCooldown(retryAfter);
      }
      setError(getErrorMessage(err, "We couldn't resend the verification code."));
    } finally {
      resendingRef.current = false;
      setResending(false);
    }
  };

  return (
    <AuthLayout
      title="Verify Your Email"
      subtitle="We've sent a 6-digit verification code to your email address."
      footer={
        <>
          Wrong email?{" "}
          <Link to="/signup" className="font-medium hover:underline" style={{ color: "#F2A93B" }}>
            Back to sign up
          </Link>
        </>
      }
    >
      <Seo title="Verify email" noindex />

      {!email ? (
        <div className="space-y-4">
          <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            We couldn't find a pending signup email. Please create your account again.
          </p>
          <Link to="/signup">
            <Button className="w-full">Back to sign up</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-start gap-3 rounded border border-white/10 bg-white/[0.03] px-3.5 py-3">
            <MailCheck size={18} className="mt-0.5 shrink-0" style={{ color: "#F2A93B" }} />
            <div>
              <p className="text-xs text-white/60">Code sent to</p>
              <p className="break-all text-sm font-medium text-white">{email}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label className="mb-2 block text-xs font-medium text-white/60">
                Enter your 6-digit code
              </label>
              <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      inputsRef.current[index] = element;
                    }}
                    value={digit}
                    onChange={(event) => handleChange(index, event.target.value)}
                    onKeyDown={(event) => handleKeyDown(index, event)}
                    onPaste={handlePaste}
                    onFocus={(event) => event.target.select()}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    aria-label={`Verification code digit ${index + 1}`}
                    disabled={verifying || Boolean(success)}
                    className={`h-14 w-full min-w-0 rounded border bg-white/[0.03] text-center font-mono text-2xl text-white outline-none transition-colors placeholder:text-white/20 disabled:opacity-60 ${
                      error
                        ? "border-red-500/60"
                        : "border-white/10 focus:border-[#F2A93B] focus:ring-2 focus:ring-[#F2A93B]/20"
                    }`}
                  />
                ))}
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}

            {notice && !error && (
              <p role="status" className="rounded border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-3 py-2 text-xs text-white/80">
                {notice}
              </p>
            )}

            {success && (
              <p role="status" className="flex items-center gap-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                <ShieldCheck size={15} /> {success} Redirecting to login…
              </p>
            )}

            <Button type="submit" disabled={!isComplete || verifying || Boolean(success)} className="w-full">
              {verifying ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Verifying…
                </>
              ) : (
                "Verify Email"
              )}
            </Button>
          </form>

          <div className="mt-5 flex flex-col items-center gap-2 text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || resending || verifying || Boolean(success)}
              className="inline-flex items-center gap-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:text-white/30 enabled:text-[#F2A93B] enabled:hover:underline"
            >
              {resending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              {resending
                ? "Sending new code…"
                : cooldown > 0
                ? `Resend code in ${cooldown}s`
                : "Resend OTP"}
            </button>
            <p className="text-[11px] leading-relaxed text-white/40">
              The code expires after 10 minutes. Never share it with anyone.
            </p>
          </div>
        </>
      )}
    </AuthLayout>
  );
}
