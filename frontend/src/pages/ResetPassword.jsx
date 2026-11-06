import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { Field, authInputClass, AuthSubmitButton } from "@/components/auth/AuthFormControls";
import { Button } from "@/components/ui/button";
import { resetPasswordRequest } from "@/services/auth";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errors";
import { passwordsMatch } from "@/utils/passwordReset";
import { PASSWORD_REQUIREMENTS, getPasswordStrengthError } from "@/utils/passwordPolicy";
import Seo from "@/components/Seo";

const resetPasswordSchema = z
  .object({
    password: z.string().superRefine((value, ctx) => {
      const message = getPasswordStrengthError(value);
      if (message) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      }
    }),
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => passwordsMatch(data.password, data.confirmPassword), {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

const TOKEN_ERROR_CODES = new Set([
  "RESET_TOKEN_INVALID",
  "RESET_TOKEN_EXPIRED",
  "RESET_TOKEN_USED",
]);

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const navigate = useNavigate();
  const submittingRef = useRef(false);
  const redirectTimerRef = useRef(null);

  const [formError, setFormError] = useState("");
  const [fatalError, setFatalError] = useState("");
  const [success, setSuccess] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const onSubmit = async ({ password }) => {
    if (submittingRef.current || !token || success) return;
    submittingRef.current = true;
    setFormError("");
    setFatalError("");

    try {
      const data = await resetPasswordRequest({ token, password });
      const message =
        data?.message || "Your password has been reset. You can now log in with your new password.";

      setSuccess(message);
      toast({ title: "Password reset", description: "Log in with your new password." });
      redirectTimerRef.current = setTimeout(() => {
        navigate("/login", { replace: true, state: { reset: true } });
      }, 1600);
    } catch (err) {
      const apiError = err?.response?.data;

      if (TOKEN_ERROR_CODES.has(apiError?.code)) {
        setFatalError(
          getErrorMessage(err, "This password reset link is invalid or has expired.")
        );
        return;
      }

      setFormError(getErrorMessage(err, "We couldn't reset your password. Please try again."));
    } finally {
      submittingRef.current = false;
    }
  };

  const linkProblem =
    fatalError ||
    (!token ? "This password reset link is missing or invalid. Request a new link to continue." : "");

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle={PASSWORD_REQUIREMENTS}
      footer={
        <>
          Remembered your password?{" "}
          <Link to="/login" className="font-medium hover:underline" style={{ color: "#F2A93B" }}>
            Back to Login
          </Link>
        </>
      }
    >
      <Seo title="Reset password" noindex referrerPolicy="no-referrer" />

      {success ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-300"
        >
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-emerald-200">{success}</p>
            <p className="mt-1 text-emerald-300/80">Redirecting you to login…</p>
          </div>
        </div>
      ) : linkProblem ? (
        <div className="space-y-5">
          <div
            role="alert"
            className="flex items-start gap-3 rounded border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-xs text-red-400"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p>{linkProblem}</p>
          </div>

          <Link to="/forgot-password">
            <Button className="w-full">Request a new link</Button>
          </Link>

          <div className="text-center">
            <Link
              to="/login"
              className="text-xs font-medium transition-colors hover:underline"
              style={{ color: "#F2A93B" }}
            >
              Back to Login
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Field label="New Password" error={errors.password?.message}>
            <input
              type="password"
              autoComplete="new-password"
              {...register("password")}
              placeholder="••••••••"
              disabled={isSubmitting}
              className={authInputClass(errors.password)}
            />
          </Field>

          <Field label="Confirm New Password" error={errors.confirmPassword?.message}>
            <input
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
              placeholder="••••••••"
              disabled={isSubmitting}
              className={authInputClass(errors.confirmPassword)}
            />
          </Field>

          {formError && (
            <p
              role="alert"
              className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400"
            >
              {formError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Resetting password…
              </>
            ) : (
              "Reset Password"
            )}
          </Button>

          <div className="text-center">
            <Link
              to="/login"
              className="text-xs font-medium transition-colors hover:underline"
              style={{ color: "#F2A93B" }}
            >
              Back to Login
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
