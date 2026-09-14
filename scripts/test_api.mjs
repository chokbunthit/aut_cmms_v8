import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Read .env.local from aut_cmms_v8
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

console.log("Connecting to Supabase at:", supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log("\n--- TEST 1: Check master_machine ---");
  const { data: machines, error: mErr } = await supabase
    .from("master_machine")
    .select("asset_code, asset_name, department, location")
    .limit(5);

  if (mErr) {
    console.error("master_machine error:", mErr.message);
  } else {
    console.log("Success! master_machine count:", machines?.length);
    console.log("Sample machines:", machines);
  }

  console.log("\n--- TEST 2: Check lookup_departments & lookup_locations ---");
  const { data: depts, error: dErr } = await supabase.from("lookup_departments").select("*").limit(3);
  console.log("lookup_departments:", dErr ? dErr.message : depts);

  const { data: locs, error: lErr } = await supabase.from("lookup_locations").select("*").limit(3);
  console.log("lookup_locations:", lErr ? lErr.message : locs);

  console.log("\n--- TEST 3: Check users table ---");
  const { data: users, error: uErr } = await supabase.from("users").select("id, line_user_id, name").limit(3);
  console.log("users:", uErr ? uErr.message : users);

  console.log("\n--- TEST 4: Check requests table ---");
  const { data: requests, error: rErr } = await supabase.from("requests").select("id, request_code, status").limit(3);
  console.log("requests:", rErr ? rErr.message : requests);

  console.log("\n--- TEST 5: Test RPC get_next_doc_number ---");
  try {
    const { data: docNum, error: rpcErr } = await supabase.rpc("get_next_doc_number", { p_doc_type: "CM" });
    if (rpcErr) {
      console.warn("RPC get_next_doc_number message:", rpcErr.message);
    } else {
      console.log("RPC get_next_doc_number generated:", docNum);
    }
  } catch (e) {
    console.warn("RPC error:", e.message);
  }
}

runTests();
