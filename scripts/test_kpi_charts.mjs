import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Read .env.local
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

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

class DummyWS {}
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { transport: DummyWS }
});

function formatDate(date) {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function getWorkingDays(startDate, endDate, holidaySet) {
  if (!startDate || !endDate) return 0;
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;

  const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const target = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  if (cur > target) return 0;

  let count = 0;
  while (cur <= target) {
    const day = cur.getDay(); // 0=Sun, 6=Sat
    const ymd = cur.toISOString().split("T")[0];
    if (day !== 0 && day !== 6 && (!holidaySet || !holidaySet.has(ymd))) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

async function fetchKpiData(filters = {}) {
  // 1. Fetch holidays
  const { data: holidaysData } = await supabase.from("holidays").select("holiday_date");
  const holidaySet = new Set((holidaysData || []).map((h) => h.holiday_date).filter(Boolean));
  console.log(`Loaded ${holidaySet.size} holidays from table 'holidays'.`);

  // 2. Fetch master_machine
  let mmQuery = supabase.from("master_machine").select("*");
  if (filters.category) {
    mmQuery = mmQuery.ilike("category", `%${filters.category}%`);
  }
  if (filters.group) {
    mmQuery = mmQuery.ilike("machine_group", `%${filters.group}%`);
  }
  const { data: mmList, error: mmErr } = await mmQuery;
  if (mmErr) throw mmErr;

  // Filter only parent machines (not sub-components)
  const parentMachines = (mmList || []).filter((m) => {
    if (!m.asset_code) return false;
    if (m.parent_code) return false;
    const parts = m.asset_code.split("-");
    return parts.length <= 2;
  });

  console.log(`Total machines: ${mmList?.length}, Parent machines: ${parentMachines.length}`);

  // 3. Fetch work_orders & details
  let woQuery = supabase.from("work_orders").select("*");
  if (filters.startDate) {
    woQuery = woQuery.gte("workorder_date", filters.startDate);
  }
  if (filters.endDate) {
    woQuery = woQuery.lte("workorder_date", filters.endDate);
  }
  const { data: woList, error: woErr } = await woQuery;
  if (woErr) throw woErr;

  // Fetch requests for additional failure tracking
  let reqQuery = supabase.from("requests").select("asset_code, component_code, request_type, request_date, status");
  const { data: reqList } = await reqQuery;

  // 4. Map failures and downtime to parent assets
  const failureCount = {};
  const downtimeMap = {};

  // Process work_orders
  (woList || []).forEach((wo) => {
    const type = String(wo.workorder_type || "").toUpperCase();
    if (type.includes("PM") || type.includes("PREVENT")) return;

    const rawAsset = String(wo.asset_code || "").trim();
    if (!rawAsset || rawAsset === "-") return;

    let parentAsset = rawAsset;
    const segs = rawAsset.split("-");
    if (segs.length >= 3) {
      parentAsset = `${segs[0]}-${segs[1]}`;
    }

    failureCount[rawAsset] = (failureCount[rawAsset] || 0) + 1;
    if (parentAsset !== rawAsset) {
      failureCount[parentAsset] = (failureCount[parentAsset] || 0) + 1;
    }

    // Downtime in hours
    const dt = Number(wo.total_down_time || 0);
    if (dt > 0) {
      downtimeMap[rawAsset] = (downtimeMap[rawAsset] || 0) + dt;
      if (parentAsset !== rawAsset) {
        downtimeMap[parentAsset] = (downtimeMap[parentAsset] || 0) + dt;
      }
    }
  });

  // Process requests
  (reqList || []).forEach((r) => {
    const type = String(r.request_type || "").toUpperCase();
    if (type.includes("PM")) return;
    const rawAsset = String(r.asset_code || "").trim();
    if (!rawAsset || rawAsset === "-") return;

    let parentAsset = rawAsset;
    const segs = rawAsset.split("-");
    if (segs.length >= 3) {
      parentAsset = `${segs[0]}-${segs[1]}`;
    }

    // If no work_orders counted for this yet or supplement count
    if (!failureCount[parentAsset]) {
      failureCount[parentAsset] = 1;
    }
  });

  const now = filters.endDate ? new Date(filters.endDate) : new Date();

  // 5. Calculate MTBF Items
  const mtbfItems = parentMachines.map((m) => {
    let setupDateObj = null;
    if (m.setup_date) {
      setupDateObj = new Date(m.setup_date);
    } else if (m.created_at) {
      setupDateObj = new Date(m.created_at);
    } else {
      // Default to 180 days ago
      setupDateObj = new Date(Date.now() - 180 * 86400000);
    }

    const workingDays = Math.max(1, getWorkingDays(setupDateObj, now, holidaySet));
    const machineHours = Number(m.machine_hours) > 0 ? Number(m.machine_hours) : 8;
    const operatingHours = workingDays * machineHours;

    const failures = failureCount[m.asset_code] || 0;
    const mtbf = failures > 0 ? Math.round(workingDays / failures) : workingDays;
    const mtbfHours = failures > 0 ? Math.round(operatingHours / failures) : operatingHours;

    return {
      asset_code: m.asset_code,
      asset_name: m.asset_name || m.asset_code,
      category: m.category || "",
      machine_group: m.machine_group || "",
      install_date: formatDate(setupDateObj),
      days_since_install: workingDays,
      machine_hours: machineHours,
      operating_hours: operatingHours,
      failures: failures,
      mtbf: mtbf,
      mtbf_hours: mtbfHours
    };
  });

  // Sort MTBF: machines with failures first, then sort by MTBF
  mtbfItems.sort((a, b) => {
    if (a.failures > 0 && b.failures === 0) return -1;
    if (a.failures === 0 && b.failures > 0) return 1;
    return a.mtbf - b.mtbf;
  });

  // 6. Calculate Downtime Items
  const downtimeItems = parentMachines.map((m) => {
    let setupDateObj = null;
    if (m.setup_date) {
      setupDateObj = new Date(m.setup_date);
    } else if (m.created_at) {
      setupDateObj = new Date(m.created_at);
    } else {
      setupDateObj = new Date(Date.now() - 180 * 86400000);
    }

    const workingDays = Math.max(1, getWorkingDays(setupDateObj, now, holidaySet));
    const machineHours = Number(m.machine_hours) > 0 ? Number(m.machine_hours) : 8;
    const totalAvailableHours = workingDays * machineHours;
    const totalDownHours = downtimeMap[m.asset_code] || 0;
    const downtimePct = totalAvailableHours > 0 ? Math.round((totalDownHours / totalAvailableHours) * 10000) / 100 : 0;

    return {
      asset_code: m.asset_code,
      asset_name: m.asset_name || m.asset_code,
      category: m.category || "",
      machine_group: m.machine_group || "",
      setup_date: formatDate(setupDateObj),
      days_since_setup: workingDays,
      machine_hours: machineHours,
      total_available_hours: totalAvailableHours,
      total_down_hours: Math.round(totalDownHours * 10) / 10,
      downtime_pct: downtimePct
    };
  });

  // Sort Downtime: highest downtime % first
  downtimeItems.sort((a, b) => b.downtime_pct - a.downtime_pct);

  return { mtbfItems, downtimeItems };
}

async function run() {
  console.log("=== Testing MTBF and Downtime Calculations ===");
  const { mtbfItems, downtimeItems } = await fetchKpiData();

  console.log(`\nMTBF Items count: ${mtbfItems.length}`);
  console.log("Top 5 MTBF Items (Machines needing attention / lowest MTBF or failures):");
  console.table(
    mtbfItems.slice(0, 5).map((i) => ({
      code: i.asset_code,
      name: i.asset_name.slice(0, 25),
      workingDays: i.days_since_install,
      failures: i.failures,
      mtbfDays: i.mtbf,
      mtbfHours: i.mtbf_hours
    }))
  );

  console.log(`\nDowntime Items count: ${downtimeItems.length}`);
  console.log("Top 5 Downtime Items:");
  console.table(
    downtimeItems.slice(0, 5).map((i) => ({
      code: i.asset_code,
      name: i.asset_name.slice(0, 25),
      workingDays: i.days_since_setup,
      availHours: i.total_available_hours,
      downHours: i.total_down_hours,
      downPct: `${i.downtime_pct}%`
    }))
  );

  // Compute averages
  const validMtbf = mtbfItems.filter((i) => i.mtbf >= 0);
  const avgMtbf = validMtbf.length > 0 ? Math.round(validMtbf.reduce((s, i) => s + i.mtbf, 0) / validMtbf.length) : 0;
  const avgDownPct =
    downtimeItems.length > 0
      ? Math.round((downtimeItems.reduce((s, i) => s + i.downtime_pct, 0) / downtimeItems.length) * 100) / 100
      : 0;

  console.log(`\nOverall Average MTBF: ${avgMtbf} days`);
  console.log(`Overall Average Downtime %: ${avgDownPct}%`);
}

run();
