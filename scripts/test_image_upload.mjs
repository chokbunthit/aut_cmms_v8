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

async function runStorageTest() {
  console.log("Testing Supabase Storage Bucket 'cmms-images'...");

  // 1. Create a tiny 1x1 red PNG base64
  const redDotPngBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const parts = redDotPngBase64.split(";base64,");
  const contentType = parts[0].replace("data:", "");
  const binaryString = Buffer.from(parts[1], "base64");
  const bytes = new Uint8Array(binaryString);

  const testFilePath = `tests/test_${Date.now()}.png`;

  console.log(`Uploading test file: ${testFilePath} (${bytes.length} bytes)...`);
  const { data, error } = await supabase.storage
    .from("cmms-images")
    .upload(testFilePath, bytes, {
      contentType: contentType,
      upsert: true
    });

  if (error) {
    console.warn("Storage upload result: ERROR ->", error.message);
  } else {
    console.log("Storage upload result: SUCCESS ->", data);
    const { data: publicData } = supabase.storage
      .from("cmms-images")
      .getPublicUrl(testFilePath);
    console.log("Public URL:", publicData?.publicUrl);
  }

  // 2. Clean up test file
  if (!error) {
    console.log("Cleaning up test file...");
    const { error: delErr } = await supabase.storage
      .from("cmms-images")
      .remove([testFilePath]);
    if (delErr) {
      console.warn("Cleanup warning:", delErr.message);
    } else {
      console.log("Test file cleaned up successfully.");
    }
  }
}

runStorageTest();
