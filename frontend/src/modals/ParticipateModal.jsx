import React, { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Rocket } from "lucide-react";
import BaseModal from "@/modals/BaseModal";
import { Button } from "@/components/ui/button";
import { postParticipant } from "@/services/participants";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errors";

const participateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120, "That name is too long."),
  email: z.string().trim().min(1, "Email is required.").max(180).email("Enter a valid email address."),
  college: z.string().trim().min(1, "College / organization is required.").max(150, "That's too long."),
});

export default function ParticipateModal({ open, onClose, hackathonId, hackathonTitle }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(participateSchema),
    defaultValues: { name: "", email: "", college: "" },
  });

  // Belt-and-suspenders guard against double-submits (e.g. a fast double
  // click before isSubmitting has re-rendered the disabled button).
  const submittingRef = useRef(false);

  // Reset the form each time the modal closes so it opens fresh next time.
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const onSubmit = async (values) => {
    if (submittingRef.current) return;
    if (!hackathonId) {
      toast({ variant: "destructive", title: "Something's missing", description: "No hackathon reference found. Please reopen this from the hackathon page." });
      return;
    }
    submittingRef.current = true;
    try {
      await postParticipant({ hackathonId, ...values });
      toast({
        title: "You're in 🚀",
        description: "Organizer will contact you soon.",
      });
      onClose();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't register",
        description: getErrorMessage(err),
      });
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <BaseModal open={open} onClose={onClose}>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <Rocket size={18} className="text-primary-foreground" />
        </div>
        <div>
          <h3 className="font-heading text-lg text-foreground">Participate</h3>
          <p className="font-body text-xs text-muted-foreground">{hackathonTitle}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Full name" error={errors.name?.message}>
          <input
            {...register("name")}
            placeholder="Ada Lovelace"
            disabled={isSubmitting}
            className={inputClass(errors.name)}
          />
        </Field>

        <Field label="Email" error={errors.email?.message}>
          <input
            type="email"
            {...register("email")}
            placeholder="ada@college.edu"
            disabled={isSubmitting}
            className={inputClass(errors.email)}
          />
        </Field>

        <Field label="College / organization" error={errors.college?.message}>
          <input
            {...register("college")}
            placeholder="IIT Prayagraj"
            disabled={isSubmitting}
            className={inputClass(errors.college)}
          />
        </Field>

        <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
          {isSubmitting ? "Submitting…" : "Confirm participation"}
        </Button>
      </form>
    </BaseModal>
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
