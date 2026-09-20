import { parseDateStringToISO } from "./utils/parseDate.js";

const inputs = [
  "2026-08-13",
  "2026-08-13T10:20:30+05:30",
  "13/08/2026",
  "08/13/2026",
  "13-08-26",
  "13 Aug 2026",
  "Aug 13, 2026 12:30",
  "August 2026",
  "2026"
];

for (const s of inputs) {
  console.log(s, "=>", parseDateStringToISO(s, { dayFirst: true }));
}
console.log("US style (dayFirst:false):", parseDateStringToISO("08/13/2026", { dayFirst: false }));
