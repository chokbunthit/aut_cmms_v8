import fs from "fs";

const html = fs.readFileSync("public/cmms.html", "utf8");
const checks = [
  ["workload_dashboard included", html.includes('id="workload_dashboard"')],
  ["loadWorkloadDashboard defined", html.includes('function loadWorkloadDashboard')],
  ["openWODrawer defined", html.includes('function openWODrawer')],
  ["closeWODrawer defined", html.includes('function closeWODrawer')],
  ["getWorkloadDashboardData in bridge", html.includes('method === "getWorkloadDashboardData"')],
  ["getWODrawerData in bridge", html.includes('method === "getWODrawerData"')],
  ["updateWODrawerData in bridge", html.includes('method === "updateWODrawerData"')],
  ["updateWOAssignees in bridge", html.includes('method === "updateWOAssignees"')],
  ["getTechnicianList in bridge", html.includes('method === "getTechnicianList"')]
];

checks.forEach(([name, passed]) => {
  console.log(`${name}: ${passed ? "PASS" : "FAIL"}`);
});
