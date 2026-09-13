import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-blue-600">AUT CMMS v8</h1>
        <p className="text-gray-600">Smart Maintenance Service</p>
        <p className="text-sm text-gray-400">Cloudflare + Supabase + Next.js</p>
        <Link
          href="/assets"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
        >
          ทดสอบเชื่อมต่อ Database →
        </Link>
      </div>
    </main>
  );
}
