import { getSupabase } from "../../src/lib/supabase";
import { LiffService } from "../../src/lib/liffService";

const DEFAULT_SUPABASE_URL = "https://pfcacqxonodjrnvreixq.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmY2FjcXhvbm9kanJudnJlaXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwODc4MzQsImV4cCI6MjEwNDY2MzgzNH0.S0IPEpwTbe9p5HH9Vzp6BeNiQADvjRjt4Nt8up_IkMM";

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
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      DEFAULT_SUPABASE_URL;
    const supabaseKey =
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      DEFAULT_SUPABASE_ANON_KEY;

    const supabase = getSupabase(supabaseUrl, supabaseKey);
    const lineToken =
      env.LINE_CHANNEL_ACCESS_TOKEN ||
      env.LINE_ACCESS_TOKEN ||
      process.env.LINE_CHANNEL_ACCESS_TOKEN ||
      process.env.LINE_ACCESS_TOKEN;
    const lineTargetId =
      env.LINE_NOTIFY_TARGET_ID ||
      env.USER_ID ||
      process.env.LINE_NOTIFY_TARGET_ID ||
      process.env.USER_ID;

    const service = new LiffService(supabase, lineToken, lineTargetId);

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

    const url = new URL(context.request.url);
    let action = body.action || "";

    // Subpath fallback
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
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      DEFAULT_SUPABASE_URL;
    const supabaseKey =
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      DEFAULT_SUPABASE_ANON_KEY;

    const supabase = getSupabase(supabaseUrl, supabaseKey);
    const lineToken =
      env.LINE_CHANNEL_ACCESS_TOKEN ||
      env.LINE_ACCESS_TOKEN ||
      process.env.LINE_CHANNEL_ACCESS_TOKEN ||
      process.env.LINE_ACCESS_TOKEN;
    const lineTargetId =
      env.LINE_NOTIFY_TARGET_ID ||
      env.USER_ID ||
      process.env.LINE_NOTIFY_TARGET_ID ||
      process.env.USER_ID;

    const service = new LiffService(supabase, lineToken, lineTargetId);

    const url = new URL(context.request.url);
    let action = url.searchParams.get("action") || "";

    // Subpath fallback
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
