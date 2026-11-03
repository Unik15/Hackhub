import React, { useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import AuthLayout from "@/components/auth/AuthLayout";
import { Field, authInputClass, AuthSubmitButton } from "@/components/auth/AuthFormControls";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errors";
import { rememberPendingEmail } from "@/utils/verification";
import Seo from "@/components/Seo";

const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120, "That name is too long."),
    email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
    college: z.string().trim().min(1, "College / organization is required.").max(150, "That's too long."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const submittingRef = useRef(false);
  const [formError, setFormError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: location.state?.email || "",
      password: "",
      confirmPassword: "",
      college: "",
    },
  });

  const onSubmit = async ({ confirmPassword, ...payload }) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFormError("");
    try {
      const result = await signup(payload);
      const email = result?.user?.email || payload.email;
      const resendAfterSeconds = result?.verification?.resendAfterSeconds ?? 60;

      rememberPendingEmail(email);
      toast({
        title: "Verification code sent",
        description: "Enter the 6-digit code from your email to activate your account.",
      });
      navigate("/verify-email", {
        replace: true,
        state: { email, resendAfterSeconds },
      });
    } catch (err) {
      const apiError = err?.response?.data;

      if (
        apiError?.code === "ACCOUNT_PENDING_VERIFICATION" ||
        apiError?.code === "OTP_RESEND_COOLDOWN"
      ) {
        const email = apiError.email || payload.email;
        const resendAfterSeconds =
          apiError.retryAfterSeconds ?? apiError.verification?.resendAfterSeconds ?? 60;

        rememberPendingEmail(email);
        toast({
          title: "Email already pending verification",
          description:
            apiError.code === "OTP_RESEND_COOLDOWN"
              ? `Please wait ${resendAfterSeconds}s before requesting another code.`
              : "Enter the code we sent, or request a new one below.",
        });
        navigate("/verify-email", {
          replace: true,
          state: { email, resendAfterSeconds },
        });
        return;
      }

      const message = getErrorMessage(err, "Couldn't create your account.");
      setFormError(message);
      toast({ variant: "destructive", title: "Couldn't sign up", description: message });
    } finally {
      submittingRef.current = false;
    }
  };

  const busy = isSubmitting;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join thousands of builders on HackHub."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium hover:underline" style={{ color: "#F2A93B" }}>
            Log in
          </Link>
        </>
      }
    >
      <Seo title="Sign up" noindex />

      {location.state?.reason === "no-account" && (
        <p role="status" className="mb-5 rounded border border-[#F2A93B]/40 bg-[#F2A93B]/10 px-3 py-2 text-xs text-white/80">
          No account exists for <strong>{location.state.email}</strong>. Create one below, then log in.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Full name" error={errors.name?.message}>
          <input
            autoComplete="name"
            {...register("name")}
            placeholder="Ada Lovelace"
            disabled={busy}
            className={authInputClass(errors.name)}
          />
        </Field>

        <Field label="Email" error={errors.email?.message}>
          <input
            type="email"
            autoComplete="email"
            {...register("email")}
            placeholder="ada@college.edu"
            disabled={busy}
            className={authInputClass(errors.email)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Password" error={errors.password?.message}>
            <input
              type="password"
              autoComplete="new-password"
              {...register("password")}
              placeholder="••••••••"
              disabled={busy}
              className={authInputClass(errors.password)}
            />
          </Field>

          <Field label="Confirm password" error={errors.confirmPassword?.message}>
            <input
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
              placeholder="••••••••"
              disabled={busy}
              className={authInputClass(errors.confirmPassword)}
            />
          </Field>
        </div>

        <Field label="College / organization" error={errors.college?.message}>
          <input
            autoComplete="organization"
            {...register("college")}
            placeholder="IIT Prayagraj"
            disabled={busy}
            className={authInputClass(errors.college)}
          />
        </Field>

        {formError && (
          <p role="alert" className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {formError}
          </p>
        )}

        <AuthSubmitButton busy={busy} label="Create account" busyLabel="Creating account…" />
      </form>
    </AuthLayout>
  );
}
