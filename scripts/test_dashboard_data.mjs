import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    const [key, ...vals] = trimmed.split("=");
    env[key.trim()] = vals.join("=").trim();
  }
});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function calcWorkingDaysClient(startDate, endDate, holidaySet) {
  if (!startDate || !endDate) return 1;
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 1;
  const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const target = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  if (cur > target) return 1;
  let count = 0;
  while (cur <= target) {
    const day = cur.getDay(); // 0 = Sun, 6 = Sat
    const ymd = cur.toISOString().split("T")[0];
    if (day !== 0 && day !== 6 && (!holidaySet || !holidaySet.has(ymd))) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, count);
}

async function getHolidaysSetFromSb() {
  try {
    const { data } = await sb.from("holidays").select("holiday_date");
    return new Set((data || []).map(function(h) { return h.holiday_date; }).filter(Boolean));
  } catch (_) {
    return new Set();
  }
}

async function testBridgeCalls() {
  // Test getMTBFData
  const holidaySet = await getHolidaysSetFromSb();
  let mmQuery = sb.from("master_machine").select("*");
  const { data: mmList } = await mmQuery;
  const parentMachines = (mmList || []).filter(function(m) {
    return m.asset_code && !m.parent_code && m.asset_code.split("-").length <= 2;
  });
  let woQuery = sb.from("work_orders").select("*");
  const { data: woList } = await woQuery;

  const failureCount = {};
  (woList || []).forEach(function(wo) {
    const type = String(wo.workorder_type || "").toUpperCase();
    if (type.includes("PM") || type.includes("PREVENT")) return;
    const rawAsset = String(wo.asset_code || "").trim();
    if (!rawAsset || rawAsset === "-") return;
    let parentAsset = rawAsset;
    const segs = rawAsset.split("-");
    if (segs.length >= 3) parentAsset = segs[0] + "-" + segs[1];
    failureCount[rawAsset] = (failureCount[rawAsset] || 0) + 1;
    if (parentAsset !== rawAsset) failureCount[parentAsset] = (failureCount[parentAsset] || 0) + 1;
  });

  console.log("failureCount keys:", Object.keys(failureCount));

  const now = new Date();
  const mtbfItems = parentMachines.map(function(m) {
    let setupDateObj = m.setup_date ? new Date(m.setup_date) : (m.created_at ? new Date(m.created_at) : new Date(now.getFullYear(), 0, 1));
    const workingDays = calcWorkingDaysClient(setupDateObj, now, holidaySet);
    const machineHours = Number(m.machine_hours) > 0 ? Number(m.machine_hours) : 8;
    const operatingHours = workingDays * machineHours;
    const failures = failureCount[m.asset_code] || 0;
    const mtbf = failures > 0 ? Math.round(workingDays / failures) : workingDays;
    const mtbfHours = failures > 0 ? Math.round(operatingHours / failures) : operatingHours;
    return {
      asset_code: m.asset_code,
      asset_name: m.asset_name || m.asset_code,
      failures: failures,
      mtbf: mtbf
    };
  });

  console.log("mtbfItems count:", mtbfItems.length);
  const itemsWithFailures = mtbfItems.filter(i => i.failures > 0);
  console.log("mtbfItems with failures:", itemsWithFailures);

  // Check Downtime items
  const downtimeMap = {};
  (woList || []).forEach(function(wo) {
    const rawAsset = String(wo.asset_code || "").trim();
    if (!rawAsset || rawAsset === "-") return;
    let parentAsset = rawAsset;
    const segs = rawAsset.split("-");
    if (segs.length >= 3) parentAsset = segs[0] + "-" + segs[1];
    const dt = Number(wo.total_down_time || 0);
    if (dt > 0) {
      downtimeMap[parentAsset] = (downtimeMap[parentAsset] || 0) + dt;
    }
  });
  console.log("downtimeMap:", downtimeMap);
}

testBridgeCalls();
