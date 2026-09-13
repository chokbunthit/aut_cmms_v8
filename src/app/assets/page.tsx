"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

interface Asset {
  id: string;
  asset_code: string;
  asset_name: string;
  category: string;
  machine_group: string;
  location: string;
  department: string;
  status: string;
  ranking: string;
  image_url: string;
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAssets() {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("v_parent_assets")
          .select("*")
          .order("asset_code")
          .limit(100);

        if (error) {
          setError(error.message);
        } else {
          setAssets(data as Asset[]);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load assets");
      } finally {
        setLoading(false);
      }
    }

    loadAssets();
  }, []);

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Asset List</h1>
          <p className="text-gray-500 mt-1">ทดสอบเชื่อมต่อ Supabase PostgreSQL</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center p-12 bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">กำลังโหลดข้อมูล assets จาก Supabase...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 font-medium">Error: {error}</p>
            <p className="text-red-500 text-sm mt-1">
              ตรวจสอบ .env.local ว่าใส่ SUPABASE_URL และ ANON_KEY ถูกต้อง
            </p>
          </div>
        )}

        {assets && assets.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-700">ไม่พบข้อมูล — ยังไม่ได้ import ข้อมูลลง master_machine</p>
          </div>
        )}

        {assets && assets.length > 0 && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-6">
              <p className="text-green-700 text-sm">
                เชื่อมต่อสำเร็จ — พบ {assets.length} assets
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition"
                >
                  {asset.image_url && (
                    <img
                      src={asset.image_url}
                      alt={asset.asset_name}
                      className="w-full h-40 object-cover"
                    />
                  )}
                  {!asset.image_url && (
                    <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-gray-400">
                      No Image
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded">
                        {asset.asset_code}
                      </span>
                      <StatusBadge status={asset.status} />
                    </div>
                    <h3 className="font-semibold text-gray-900 truncate">
                      {asset.asset_name}
                    </h3>
                    <div className="text-sm text-gray-500 space-y-1">
                      <p>📍 {asset.location || "-"}</p>
                      <p>🏭 {asset.department || "-"}</p>
                      <p>⚙️ {asset.machine_group || "-"}</p>
                    </div>
                    {asset.ranking && (
                      <div className="flex items-center gap-1 mt-2">
                        <span className="text-xs text-gray-400">Ranking:</span>
                        <RankingBadge ranking={asset.ranking} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Active: "bg-green-100 text-green-700",
    Inactive: "bg-gray-100 text-gray-500",
    PM: "bg-yellow-100 text-yellow-700",
    Repair: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`text-xs px-2 py-1 rounded-full font-medium ${colors[status] || "bg-gray-100 text-gray-500"}`}
    >
      {status}
    </span>
  );
}

function RankingBadge({ ranking }: { ranking: string }) {
  const colors: Record<string, string> = {
    A: "bg-red-100 text-red-700",
    B: "bg-orange-100 text-orange-700",
    C: "bg-blue-100 text-blue-700",
    D: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded font-bold ${colors[ranking] || "bg-gray-100 text-gray-500"}`}
    >
      {ranking}
    </span>
  );
}
