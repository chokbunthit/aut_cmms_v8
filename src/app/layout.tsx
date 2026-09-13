import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AUT CMMS v8",
  description: "Smart Maintenance Service - Cloudflare + Supabase",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
