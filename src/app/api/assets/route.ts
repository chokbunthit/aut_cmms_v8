import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-static";

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("v_parent_assets")
      .select("*")
      .order("asset_code")
      .limit(100);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data?.length ?? 0, data });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to fetch assets" },
      { status: 500 }
    );
  }
}
