import React, { useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
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

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [redirecting, setRedirecting] = useState(false);
  const submittingRef = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await login(values);
      toast({ title: "Welcome back 👋", description: "Redirecting you now…" });
      setRedirecting(true);
      const dest = location.state?.from?.pathname || "/dashboard";
      setTimeout(() => navigate(dest, { replace: true }), 1000);
    } catch (err) {
      // Backend contract: { success: false, message: "Invalid credentials" }
      // getErrorMessage() already surfaces error.response.data.message.
      toast({ variant: "destructive", title: "Couldn't log in", description: getErrorMessage(err, "Invalid credentials") });
    } finally {
      submittingRef.current = false;
    }
  };

  const busy = isSubmitting || redirecting;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to keep building."
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/signup" className="font-medium hover:underline" style={{ color: "#F2A93B" }}>
            Sign up
          </Link>
        </>
      }
    >
      <Seo title="Log in" noindex />

      <GoogleAuthButton />
      <Divider />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Email" error={errors.email?.message}>
          <input
            type="email"
            autoComplete="email"
            {...register("email")}
            placeholder="you@college.edu"
            disabled={busy}
            className={authInputClass(errors.email)}
          />
        </Field>

        <Field label="Password" error={errors.password?.message}>
          <input
            type="password"
            autoComplete="current-password"
            {...register("password")}
            placeholder="••••••••"
            disabled={busy}
            className={authInputClass(errors.password)}
          />
        </Field>

        <AuthSubmitButton busy={busy} label="Log in" busyLabel="Logging in…" />
      </form>
    </AuthLayout>
  );
}
