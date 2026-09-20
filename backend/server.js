import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { connectDB } from "./config/supabase.js";
import { generalLimiter } from "./middleware/rateLimit.js";
import { startScheduler } from "./scheduler/cron.js";
import { closeSharedBrowser } from "./utils/browserPool.js";

import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import hackathonRoutes from "./routes/hackathons.js";
import recommendationRoutes from "./routes/recommendations.js";
import opsRoutes from "./routes/ops.js";
import analyticsRoutes from "./routes/analytics.js";
import actionsRoutes from "./routes/actions.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(generalLimiter);

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/hackathons", hackathonRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/ops", opsRoutes);
app.use("/api/analytics", analyticsRoutes); 
app.use("/api/actions", actionsRoutes); 

// Central error handler — keeps stack traces out of client responses in prod
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`[server] HackHub API running on port ${PORT}`);
    startScheduler();
  });

  // Resource optimization / clean shutdown: platforms like Render/Railway
  // send SIGTERM on redeploy or scale-down. Without this, an in-progress
  // crawl's shared Puppeteer browser would just get killed along with the
  // process instead of shutting down cleanly, and in-flight HTTP requests
  // would be cut off mid-response instead of finishing.
  const shutdown = (signal) => {
    console.log(`[server] Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await closeSharedBrowser().catch(() => {});
      console.log("[server] Shutdown complete");
      process.exit(0);
    });

    // Don't hang forever if something doesn't close cleanly
    setTimeout(() => {
      console.warn("[server] Forced shutdown after timeout");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
