import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  UploadCloud,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogIn,
  MailCheck,
} from "lucide-react";
import BaseModal from "@/modals/BaseModal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { submitHackathon } from "@/services/hackathons";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errors";

const HTTP_URL_REGEX = /^https?:\/\//i;

const submitSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(120, "Keep the title under 120 characters."),
    url: z
      .string()
      .trim()
      .min(1, "URL is required.")
      .max(300)
      .url("Enter a valid URL, including https://")
      .refine((v) => HTTP_URL_REGEX.test(v), "URL must start with http:// or https://"),
    location: z.string().trim().min(1, "Location is required.").max(120, "Keep the location under 120 characters."),
    startDate: z.string().min(1, "Start date is required."),
    endDate: z.string().min(1, "End date is required."),
    organizerEmail: z
      .string()
      .trim()
      .min(1, "Organizer email is required.")
      .max(180)
      .email("Enter a valid email address."),
  })
  .refine((data) => !data.startDate || !data.endDate || new Date(data.endDate) >= new Date(data.startDate), {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  })
  .refine((data) => !data.startDate || !Number.isNaN(new Date(data.startDate).getTime()), {
    message: "Enter a valid start date.",
    path: ["startDate"],
  })
  .refine((data) => !data.endDate || !Number.isNaN(new Date(data.endDate).getTime()), {
    message: "Enter a valid end date.",
    path: ["endDate"],
  });

const steps = [
  { id: "basics", title: "Basics", fields: ["title", "url"] },
  { id: "details", title: "Details", fields: ["location", "startDate", "endDate"] },
  { id: "organizer", title: "Organizer", fields: ["organizerEmail"] },
];

export default function SubmitModal({ open, onClose }) {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const isLastStep = step === steps.length - 1;
  const needsVerification = Boolean(user) && user.emailVerified !== true;

  // Belt-and-suspenders guard against double-submits (e.g. a fast double
  // click, or Enter fired right as isSubmitting flips but hasn't re-rendered).
  const submittingRef = useRef(false);

  const {
    register,
    handleSubmit,
    trigger,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(submitSchema),
    defaultValues: {
      title: "",
      url: "",
      location: "",
      startDate: "",
      endDate: "",
      organizerEmail: user?.email || "",
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      title: "",
      url: "",
      location: "",
      startDate: "",
      endDate: "",
      organizerEmail: user?.email || "",
    });
    setStep(0);
  }, [open, user?.email, reset]);

  const goNext = async () => {
    const valid = await trigger(steps[step].fields);
    if (valid) setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      reset();
      setStep(0);
    }, 250);
  };

  // Enter key advances a step instead of submitting early.
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !isLastStep) {
      e.preventDefault();
      goNext();
    }
  };

  const onSubmit = async (values) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submitHackathon(values);
      toast({ title: "Hackathon submitted", description: "It'll go live once reviewed." });
      handleClose();
    } catch (err) {
      if (
        err?.response?.status === 403 &&
        err.response.data?.code === "EMAIL_NOT_VERIFIED"
      ) {
        toast({
          variant: "destructive",
          title: "Verify your email first",
          description: "Email verification is required before submitting a hackathon.",
        });
        await refresh?.();
        return;
      }

      toast({
        variant: "destructive",
        title: "Couldn't submit hackathon",
        description: getErrorMessage(err),
      });
    } finally {
      submittingRef.current = false;
    }
  };

  const goToLogin = () => {
    handleClose();
    navigate("/login");
  };

  const goToVerification = () => {
    handleClose();
    navigate("/verify-email", { state: { email: user?.email } });
  };

  return (
    <BaseModal open={open} onClose={handleClose}>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Checking your session…
        </div>
      ) : !user ? (
        <SubmissionGate
          icon={LogIn}
          title="Log in to submit"
          description="You need a HackHub account with a verified email before submitting a hackathon."
          actionLabel="Log in"
          onAction={goToLogin}
        />
      ) : needsVerification ? (
        <SubmissionGate
          icon={MailCheck}
          title="Verify your email first"
          description={`Confirm ${user.email} before submitting a hackathon. This keeps organizer listings tied to a real, verified account.`}
          actionLabel="Verify email"
          onAction={goToVerification}
        />
      ) : (
        <>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <UploadCloud size={18} className="text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-heading text-lg text-foreground">Submit a hackathon</h3>
                <p className="font-body text-xs text-muted-foreground">Step {step + 1} of {steps.length} — {steps[step].title}</p>
              </div>
            </div>

            {/* Progress indicator */}
            <div className="mb-6 flex items-center gap-2">
              {steps.map((s, i) => (
                <div key={s.id} className="flex flex-1 items-center gap-2">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-ui font-semibold ${
                      i < step
                        ? "bg-primary text-primary-foreground"
                        : i === step
                        ? "border-2 border-primary text-primary"
                        : "border border-border text-muted-foreground"
                    }`}
                  >
                    {i < step ? <Check size={12} /> : i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`h-px flex-1 ${i < step ? "bg-primary" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} onKeyDown={handleKeyDown} noValidate className="space-y-4">
              {step === 0 && (
                <>
                  <Field label="Hackathon title" error={errors.title?.message}>
                    <input
                      {...register("title")}
                      placeholder="AI Genesis Hackathon"
                      disabled={isSubmitting}
                      className={inputClass(errors.title)}
                    />
                  </Field>
                  <Field label="Event URL" error={errors.url?.message}>
                    <input
                      {...register("url")}
                      placeholder="https://your-hackathon.com"
                      disabled={isSubmitting}
                      className={inputClass(errors.url)}
                    />
                  </Field>
                </>
              )}

              {step === 1 && (
                <>
                  <Field label="Location" error={errors.location?.message}>
                    <input
                      {...register("location")}
                      placeholder="Remote, or City, Country"
                      disabled={isSubmitting}
                      className={inputClass(errors.location)}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Start date" error={errors.startDate?.message}>
                      <input
                        type="date"
                        {...register("startDate")}
                        disabled={isSubmitting}
                        className={inputClass(errors.startDate)}
                      />
                    </Field>
                    <Field label="End date" error={errors.endDate?.message}>
                      <input
                        type="date"
                        {...register("endDate")}
                        disabled={isSubmitting}
                        className={inputClass(errors.endDate)}
                      />
                    </Field>
                  </div>
                </>
              )}

              {step === 2 && (
                <Field label="Organizer email" error={errors.organizerEmail?.message}>
                  <input
                    type="email"
                    {...register("organizerEmail")}
                    readOnly
                    className={`${inputClass(errors.organizerEmail)} cursor-not-allowed opacity-70`}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Submissions are tied to your verified account email.
                  </p>
                </Field>
              )}

              <div className="flex items-center gap-2 pt-2">
                {step > 0 && (
                  <Button type="button" variant="outline" onClick={goBack} disabled={isSubmitting} className="flex-1">
                    <ChevronLeft size={15} /> Back
                  </Button>
                )}
                {!isLastStep ? (
                  <Button type="button" onClick={goNext} className="flex-1">
                    Next <ChevronRight size={15} />
                  </Button>
                ) : (
                  <Button type="submit" disabled={isSubmitting} className="flex-1">
                    {isSubmitting ? "Submitting…" : "Submit hackathon"}
                  </Button>
                )}
              </div>
            </form>
        </>
      )}
    </BaseModal>
  );
}

function SubmissionGate({ icon: Icon, title, description, actionLabel, onAction }) {
  return (
    <div className="py-4 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15">
        <Icon size={22} className="text-primary" />
      </div>
      <h3 className="font-heading text-lg text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Button type="button" onClick={onAction} className="mt-5 w-full">
        {actionLabel}
      </Button>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-ui font-medium text-muted-foreground">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function inputClass(hasError) {
  return `w-full rounded-md border bg-background px-3.5 py-2.5 text-sm font-body text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 disabled:opacity-50 ${
    hasError ? "border-destructive" : "border-border focus:border-primary"
  }`;
}
