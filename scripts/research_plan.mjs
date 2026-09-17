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

async function checkDowntimeCodes() {
  const { data: codes } = await sb.from("lookup_downtime_code").select("*");
  console.log("lookup_downtime_code:", codes);

  const { data: details } = await sb.from("work_order_details").select("downtime_code, down_time, workorder_code");
  console.log("work_order_details downtime entries:", details);
}

checkDowntimeCodes();
