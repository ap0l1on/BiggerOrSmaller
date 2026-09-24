// Verifies the contrast ratios of the Bigger or Smaller dark palette.
// Fails (exit 1) when any text pair is under 4.5:1 or any UI pair under 3:1.

function hex(h) {
  h = h.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lum([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a, b) {
  const la = lum(hex(a));
  const lb = lum(hex(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const checks = [
  // [fg, bg, min, label]
  ["#F2F4F8", "#0B0E14", 4.5, "text on bg"],
  ["#F2F4F8", "#131823", 4.5, "text on panel"],
  ["#8A93A6", "#0B0E14", 4.5, "muted on bg"],
  ["#8A93A6", "#131823", 4.5, "muted on panel"],
  ["#22C55E", "#131823", 4.5, "up (bigger) on panel"],
  ["#22C55E", "#0B0E14", 4.5, "up (bigger) on bg"],
  ["#EF4444", "#131823", 4.5, "down (smaller) on panel"],
  ["#EF4444", "#0B0E14", 4.5, "down (smaller) on bg"],
  ["#FACC15", "#0B0E14", 4.5, "gold on bg"],
  ["#FACC15", "#131823", 4.5, "gold on panel"],
  ["#0B0E14", "#FACC15", 4.5, "dark on gold (share button)"],
  ["#052E14", "#22C55E", 4.5, "dark on up fill (pressed)"],
  ["#2A0707", "#EF4444", 4.5, "dark on down fill (pressed)"],
];

let fail = 0;
for (const [fg, bg, min, label] of checks) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${r.toFixed(2)}:1 (min ${min}:1)`);
  if (!ok) fail++;
}
if (fail > 0) {
  console.error(`${fail} contrast check(s) failed`);
  process.exit(1);
} else {
  console.log("All contrast checks passed.");
}
