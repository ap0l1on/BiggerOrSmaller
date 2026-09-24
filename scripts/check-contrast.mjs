// Verifies the contrast ratios claimed in the design table.
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
  ["#111827", "#F6F7FB", 4.5, "text on bg"],
  ["#111827", "#FFFFFF", 4.5, "text on surface"],
  ["#5B6475", "#F6F7FB", 4.5, "muted on bg"],
  ["#5B6475", "#FFFFFF", 4.5, "muted on surface"],
  ["#FFFFFF", "#4338CA", 4.5, "white on accent (primary buttons)"],
  ["#4338CA", "#FFFFFF", 4.5, "accent links on white"],
  ["#15803D", "#FFFFFF", 4.5, "up on white"],
  ["#15803D", "#F6F7FB", 4.5, "up on bg"],
  ["#B91C1C", "#FFFFFF", 4.5, "down on white"],
  ["#B91C1C", "#F6F7FB", 4.5, "down on bg"],
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
