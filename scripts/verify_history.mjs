import fs from "fs";

const html = fs.readFileSync("public/cmms.html", "utf8");
const checks = [
  ["history page included", html.includes('id="historyPage"')],
  ["loadHistoryData defined", html.includes('function loadHistoryData')],
  ["openHistDetailModal defined", html.includes('function openHistDetailModal')],
  ["renderHistCategoryCards defined", html.includes('function renderHistCategoryCards')],
  ["renderHistTable defined", html.includes('function renderHistTable')],
  ["getWorkHistoryData in bridge", html.includes('method === "getWorkHistoryData"')],
  ["history auto-load event listener", html.includes('btn-nav-history')]
];

checks.forEach(([name, passed]) => {
  console.log(`${name}: ${passed ? "PASS" : "FAIL"}`);
});
