# AUT CMMS v8

Smart Maintenance Service — Next.js + Supabase + Cloudflare Pages

## เริ่มต้นใช้งาน

```bash
# 1. ติดตั้ง dependencies
npm install

# 2. คัดลอกไฟล์ environment
cp .env.local.example .env.local

# 3. แก้ .env.local ใส่ค่า Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# 4. รัน dev server
npm run dev
```

เปิด http://localhost:3000/assets เพื่อทดสอบ

## Deploy ไป Cloudflare (Static Export)

```bash
# Build (ส่งออกไฟล์ static ไปที่ ./out)
npm run build

# ทดสอบรัน local preview ด้วย Wrangler
npm run preview

# Deploy ไปยัง Cloudflare Workers Static Assets
npm run deploy

# หรือหากต้องการ Deploy ผ่าน Cloudflare Pages
npm run pages:deploy
```

## Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   ├── globals.css         # Tailwind CSS
│   ├── assets/page.tsx     # Test page - Asset list
│   └── api/assets/route.ts # API endpoint
├── lib/
│   └── supabase.ts         # Supabase client
└── components/             # Reusable components
```
