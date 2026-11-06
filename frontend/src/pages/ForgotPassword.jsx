import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MailCheck } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { Field, authInputClass, AuthSubmitButton } from "@/components/auth/AuthFormControls";
import { Button } from "@/components/ui/button";
import { forgotPasswordRequest } from "@/services/auth";
import { getErrorMessage } from "@/utils/errors";
import Seo from "@/components/Seo";

const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
});

export default function ForgotPassword() {
  const submittingRef = useRef(false);
  const [formError, setFormError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async ({ email }) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFormError("");

    try {
      const data = await forgotPasswordRequest({ email });
      setSubmittedEmail(email);
      setConfirmation(
        data?.message ||
          "If an account exists for that email, we've sent password reset instructions."
      );
    } catch (err) {
      setFormError(getErrorMessage(err, "We couldn't send the reset email. Please try again."));
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter the email address associated with your HackHub account. We'll send you instructions to reset your password."
      footer={
        <>
          Remembered your password?{" "}
          <Link to="/login" className="font-medium hover:underline" style={{ color: "#F2A93B" }}>
            Back to Login
          </Link>
        </>
      }
    >
      <Seo title="Forgot password" noindex />

      {confirmation ? (
        <div className="space-y-5">
          <div
            role="status"
            className="flex items-start gap-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-300"
          >
            <MailCheck size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-emerald-200">{confirmation}</p>
              <p className="mt-1 break-all text-emerald-300/80">{submittedEmail}</p>
              <p className="mt-2 text-emerald-300/80">
                Check your inbox and spam folder. The link expires in 30 minutes and can only be
                used once.
              </p>
            </div>
          </div>

          <Link to="/login">
            <Button className="w-full">Back to Login</Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Field label="Email address" error={errors.email?.message}>
            <input
              type="email"
              autoComplete="email"
              {...register("email")}
              placeholder="you@college.edu"
              disabled={isSubmitting}
              className={authInputClass(errors.email)}
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

          <AuthSubmitButton busy={isSubmitting} label="Send Reset Link" busyLabel="Sending…" />

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
