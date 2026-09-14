import { getSupabase } from "./lib/supabase";
import { LiffService } from "./lib/liffService";

const DEFAULT_SUPABASE_URL = "https://pfcacqxonodjrnvreixq.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmY2FjcXhvbm9kanJudnJlaXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwODc4MzQsImV4cCI6MjEwNDY2MzgzNH0.S0IPEpwTbe9p5HH9Vzp6BeNiQADvjRjt4Nt8up_IkMM";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);

    // รองรับ Request มาที่ /api/liff หรือ /api/liff/<action>
    if (url.pathname === "/api/liff" || url.pathname.startsWith("/api/liff/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      try {
        const supabaseUrl =
          env?.NEXT_PUBLIC_SUPABASE_URL ||
          env?.SUPABASE_URL ||
          process.env.NEXT_PUBLIC_SUPABASE_URL ||
          DEFAULT_SUPABASE_URL;
        const supabaseKey =
          env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          env?.SUPABASE_ANON_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          DEFAULT_SUPABASE_ANON_KEY;

        const supabase = getSupabase(supabaseUrl, supabaseKey);
        const service = new LiffService(supabase);

        let action = "";
        let payload: Record<string, any> = {};

        if (request.method === "POST") {
          try {
            const text = await request.text();
            if (text) payload = JSON.parse(text);
          } catch {
            payload = {};
          }
          action = payload.action || "";
        } else {
          action = url.searchParams.get("action") || "";
          url.searchParams.forEach((val, key) => {
            if (key !== "action") payload[key] = val;
          });
        }

        // รองรับการเรียกแบบ Subpath เช่น /api/liff/getMachines
        const pathRemainder = url.pathname.replace(/^\/api\/liff\/?/, "");
        const pathAction = pathRemainder ? pathRemainder.split("/")[0] : "";
        if (!action && pathAction) {
          action = pathAction;
        }

        if (!action) {
          return new Response(
            JSON.stringify({ status: "error", message: "Action parameter is required" }),
            {
              status: 400,
              headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            }
          );
        }

        const result = await service.handleAction(action, payload);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        console.error("Worker /api/liff error:", err);
        return new Response(
          JSON.stringify({ status: "error", message: err?.message || "Internal Server Error" }),
          {
            status: 500,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          }
        );
      }
    }

    // หากไม่ใช่ /api/liff ให้ดึงไฟล์ Static Asset จาก ./out
    if (env?.ASSETS && typeof env.ASSETS.fetch === "function") {
      return await env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};
