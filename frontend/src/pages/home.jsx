import React, { Suspense, lazy, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import Seo from "@/components/Seo";

const SubmitModal = lazy(() => import("@/modals/SubmitModal"));

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export default function Home() {
  const [submitMounted, setSubmitMounted] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const openSubmit = () => {
    setSubmitMounted(true);
    setSubmitOpen(true);
  };

  return (
    <section className="container flex flex-col items-center py-24 text-center sm:py-32">
      <Seo path="/" />

      <motion.div variants={container} initial="hidden" animate="show" className="max-w-2xl">
        <motion.h1 variants={item} className="font-heading text-6xl leading-[0.95] text-foreground sm:text-7xl">
          Discover. Build.
          <br />
          <span className="relative inline-block">
            <span className="relative z-10">Compete.</span>
            <span aria-hidden="true" className="absolute inset-x-0 bottom-1.5 h-4 -rotate-1 bg-primary/60 sm:h-5" />
          </span>
        </motion.h1>
        <motion.p variants={item} className="mt-5 font-body text-base text-muted-foreground sm:text-lg">
          Find hackathons tailored to your skills and join the best builders.
        </motion.p>
        <motion.div variants={item} className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link to="/explore">
            <Button size="lg">
              Explore Hackathons <ArrowRight size={17} />
            </Button>
          </Link>
          <Button variant="outline" size="lg" onClick={openSubmit}>
            <UploadCloud size={16} /> Submit Hackathon
          </Button>
        </motion.div>
      </motion.div>

      {submitMounted && (
        <Suspense fallback={null}>
          <SubmitModal open={submitOpen} onClose={() => setSubmitOpen(false)} />
        </Suspense>
      )}
    </section>
  );
}
