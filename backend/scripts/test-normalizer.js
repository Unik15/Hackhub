import { addResult, resetNormalizerSeen } from "../utils/normalizer.js";

resetNormalizerSeen();

const raw = {
  title: "Test Hackathon X",
  url: "https://reskilll.com/hack/123?utm_source=ga",
  platform: "reskilll",
  isOnline: false,
  locationCity: "New Delhi",
  startDate: "13 Aug 2026",
  deadlineText: "20 Aug 2026",
  _meta: {
    confidence: 80,
  },
};

const item = addResult(raw, {
  minConfidence: 40,
});

console.log("\nNormalized result:\n");
console.dir(item, { depth: null });