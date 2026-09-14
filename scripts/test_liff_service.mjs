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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testServiceActions() {
  console.log("=== 1. Testing getMachines ===");
  // Test parents
  const { data: vAssets } = await supabase
    .from("v_parent_assets")
    .select("asset_code, asset_name, department, location, category, machine_group, ranking, image_url")
    .order("asset_code");

  const parentAssets = (vAssets || []).map((m) => ({
    assetCode: m.asset_code,
    machineName: m.asset_name,
    department: m.department || "",
    location: m.location || ""
  }));

  // Test components
  const { data: rawComps } = await supabase
    .from("master_machine")
    .select("asset_code, description, part_group")
    .not("part_group", "is", null)
    .order("asset_code");

  const components = (rawComps || []).map((c) => {
    const lastHyphen = c.asset_code.lastIndexOf("-");
    const parentCode = lastHyphen > 0 ? c.asset_code.substring(0, lastHyphen) : "";
    return {
      compCode: c.asset_code,
      compName: c.description || c.part_group || c.asset_code,
      assetCode: parentCode
    };
  });

  console.log(`Parent Assets found: ${parentAssets.length}`);
  console.log(`Components found: ${components.length}`);
  console.log("Sample Parent Asset:", parentAssets[0]);
  console.log("Sample Component:", components[0]);

  // Test finding component for parent
  const firstParent = parentAssets[0].assetCode;
  const matchedComps = components.filter((c) => c.assetCode === firstParent);
  console.log(`Components matching ${firstParent}:`, matchedComps);
}

testServiceActions();
