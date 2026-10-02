import React, { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import AuthLayout from "@/components/auth/AuthLayout";
import GoogleAuthButton from "@/components/auth/GoogleAuthButton";
import { Field, authInputClass, AuthSubmitButton, Divider } from "@/components/auth/AuthFormControls";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errors";
import Seo from "@/components/Seo";

const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120, "That name is too long."),
    email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
    password: z.string().min(6, "Password must be at least 6 characters."),
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
  const [redirecting, setRedirecting] = useState(false);
  const submittingRef = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", college: "" },
  });

  const onSubmit = async ({ confirmPassword, ...payload }) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await signup(payload);
      toast({ title: "Account created 🎉", description: "Redirecting you now…" });
      setRedirecting(true);
      setTimeout(() => navigate("/dashboard", { replace: true }), 1000);
    } catch (err) {
      toast({ variant: "destructive", title: "Couldn't sign up", description: getErrorMessage(err) });
    } finally {
      submittingRef.current = false;
    }
  };

  const busy = isSubmitting || redirecting;

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

      <GoogleAuthButton />
      <Divider />

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

        <AuthSubmitButton busy={busy} label="Create account" busyLabel="Creating account…" />
      </form>
    </AuthLayout>
  );
}
