import { getSupabase } from "../../src/lib/supabase";
import { LiffService } from "../../src/lib/liffService";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function onRequestPost(context: any) {
  try {
    const env = context.env || {};
    const supabaseUrl =
      env.NEXT_PUBLIC_SUPABASE_URL ||
      env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabase = getSupabase(supabaseUrl, supabaseKey);
    const service = new LiffService(supabase);

    let body: any = {};
    try {
      const text = await context.request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch (parseErr) {
      console.warn("Failed to parse request JSON:", parseErr);
      body = {};
    }

    const action = body.action || "";
    if (!action) {
      return new Response(
        JSON.stringify({ status: "error", message: "Action parameter is required" }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    const result = await service.handleAction(action, body);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Pages Function POST /api/liff error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: err?.message || "Internal Server Error" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
}

export async function onRequestGet(context: any) {
  try {
    const env = context.env || {};
    const supabaseUrl =
      env.NEXT_PUBLIC_SUPABASE_URL ||
      env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabase = getSupabase(supabaseUrl, supabaseKey);
    const service = new LiffService(supabase);

    const url = new URL(context.request.url);
    const action = url.searchParams.get("action") || "";

    if (!action) {
      return new Response(
        JSON.stringify({ status: "error", message: "Action parameter is required" }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    const payload: Record<string, any> = {};
    url.searchParams.forEach((val, key) => {
      if (key !== "action") payload[key] = val;
    });

    const result = await service.handleAction(action, payload);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Pages Function GET /api/liff error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: err?.message || "Internal Server Error" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
}
