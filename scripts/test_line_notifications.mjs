import fs from "fs";
import path from "path";

// Read .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
let env = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...vals] = trimmed.split("=");
      env[key.trim()] = vals.join("=").trim();
    }
  });
}

const LINE_TOKEN =
  env.LINE_CHANNEL_ACCESS_TOKEN ||
  "1cvFA6ogFVFX5SKVCRsJKevlZegxrYqsy7GkY5ZD5bncdzWz0MEq8widpr0cE7Owx/qRLPeJC5linglwDOC/tgMXZJEzCEXTakXKTIUK47uRinsD7gY0jgr4MWrEl4u/zWM1ewWMA1DLvKswi1EOhQdB04t89/1O/w1cDnyilFU=";

const TARGET_ID =
  env.LINE_NOTIFY_TARGET_ID || "Cb1a0babfd04db6bef83c0370260ea110";

async function pushMessage(messageObj) {
  const url = "https://api.line.me/v2/bot/message/push";
  const payload = {
    to: TARGET_ID,
    messages: [messageObj],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  return { status: res.status, ok: res.ok, body };
}

async function testAllLineNotifications() {
  console.log("==========================================");
  console.log("LINE Notification Verification - AUT CMMS v8");
  console.log("Target ID:", TARGET_ID);
  console.log("==========================================");

  // 1. Test New Repair Request
  console.log("\n1. Testing New Repair Request Flex...");
  const newRequestFlex = {
    type: "flex",
    altText: "🔧 รายการแจ้งซ่อมใหม่: REQ-TEST-001",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0e7490",
        paddingAll: "15px",
        contents: [
          {
            type: "text",
            text: "🔧 รายการแจ้งซ่อมใหม่ (ทดสอบระบบ)",
            weight: "bold",
            color: "#ffffff",
            size: "md",
          },
          {
            type: "text",
            text: "เลขที่: REQ-TEST-001",
            color: "#e0f2fe",
            size: "xs",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "15px",
        contents: [
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "เครื่องจักร", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: "CNC Milling Machine (CNC-01)", size: "xs", color: "#0f172a", weight: "bold", flex: 7, wrap: true },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ความผิดปกติ", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: "Spindle มีเสียงดังผิดปกติและสะบัด", size: "xs", color: "#dc2626", weight: "bold", flex: 7, wrap: true },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ความเร่งด่วน", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: "Urgent (ด่วน)", size: "xs", color: "#dc2626", weight: "bold", flex: 7 },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ผู้แจ้งซ่อม", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: "ฝ่ายผลิต CNC", size: "xs", color: "#0f172a", flex: 7 },
            ],
          },
        ],
      },
    },
  };

  const res1 = await pushMessage(newRequestFlex);
  console.log("Result 1:", res1.status, res1.ok ? "SUCCESS" : res1.body);

  // 2. Test Work Order Assigned (Supervisor update)
  console.log("\n2. Testing Work Order Assigned Flex...");
  const assignFlex = {
    type: "flex",
    altText: "📋 มอบหมายงาน: WO-TEST-001",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1e40af",
        paddingAll: "15px",
        contents: [
          {
            type: "text",
            text: "📋 มอบหมายงานซ่อม (WO Assigned)",
            weight: "bold",
            color: "#ffffff",
            size: "md",
          },
          {
            type: "text",
            text: "ใบสั่งงาน: WO-TEST-001",
            color: "#dbeafe",
            size: "xs",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "15px",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#eff6ff",
            paddingAll: "10px",
            cornerRadius: "8px",
            contents: [
              {
                type: "text",
                text: "👷 ช่างผู้รับผิดชอบ: สมชาย ช่างกล, สมศักดิ์ ไฟฟ้า",
                size: "sm",
                weight: "bold",
                color: "#1d4ed8",
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "เครื่องจักร", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: "CNC Milling Machine (CNC-01)", size: "xs", color: "#0f172a", weight: "bold", flex: 7, wrap: true },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "กำหนดเสร็จ", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: new Date().toISOString().split("T")[0], size: "xs", color: "#dc2626", weight: "bold", flex: 7 },
            ],
          },
        ],
      },
    },
  };

  const res2 = await pushMessage(assignFlex);
  console.log("Result 2:", res2.status, res2.ok ? "SUCCESS" : res2.body);

  // 3. Test Tech Completed
  console.log("\n3. Testing Tech Completed Flex...");
  const techCompleteFlex = {
    type: "flex",
    altText: "🛠️ ช่างซ่อมเสร็จสิ้น: WO-TEST-001",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#d97706",
        paddingAll: "15px",
        contents: [
          {
            type: "text",
            text: "🛠️ ช่างซ่อมเสร็จสิ้น (รอหัวหน้าอนุมัติ)",
            weight: "bold",
            color: "#ffffff",
            size: "md",
          },
          {
            type: "text",
            text: "ใบสั่งงาน: WO-TEST-001",
            color: "#fef3c7",
            size: "xs",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        spacing: "sm",
        contents: [
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "เครื่องจักร", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: "CNC Milling Machine (CNC-01)", size: "xs", color: "#0f172a", weight: "bold", flex: 7 },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "สาเหตุเสีย", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: "ลูกปืน Spindle แตกเสียหาย", size: "xs", color: "#b91c1c", weight: "bold", flex: 7 },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "การแก้ไข", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: "เปลี่ยนชุดลูกปืนตลับคู่และอัดจาระบีทดสอบรอบหมุน", size: "xs", color: "#047857", weight: "bold", flex: 7, wrap: true },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ช่างผู้ปฏิบัติ", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: "สมชาย ช่างกล", size: "xs", color: "#0f172a", weight: "bold", flex: 7 },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#f8fafc",
            paddingAll: "10px",
            cornerRadius: "8px",
            contents: [
              {
                type: "text",
                text: "🔔 แจ้งเตือนหัวหน้าช่าง: กรุณาเข้าตรวจสอบและกด Approve งานซ่อม",
                size: "xxs",
                color: "#475569",
                wrap: true,
              },
            ],
          },
        ],
      },
    },
  };

  const res3 = await pushMessage(techCompleteFlex);
  console.log("Result 3:", res3.status, res3.ok ? "SUCCESS" : res3.body);

  // 4. Test Lead Approved
  console.log("\n4. Testing Lead Approved Flex...");
  const leadApproveFlex = {
    type: "flex",
    altText: "✅ อนุมัติงานซ่อมแล้ว: REQ-TEST-001",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#4f46e5",
        paddingAll: "15px",
        contents: [
          {
            type: "text",
            text: "✅ งานซ่อมได้รับการอนุมัติ (รอตรวจรับงาน)",
            weight: "bold",
            color: "#ffffff",
            size: "md",
          },
          {
            type: "text",
            text: "รหัสคำขอ: REQ-TEST-001",
            color: "#e0e7ff",
            size: "xs",
            margin: "xs",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        spacing: "sm",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#eef2ff",
            paddingAll: "10px",
            cornerRadius: "8px",
            contents: [
              {
                type: "text",
                text: "👤 เรียนคุณ: ฝ่ายผลิต CNC",
                size: "sm",
                weight: "bold",
                color: "#4338ca",
              },
              {
                type: "text",
                text: "งานแจ้งซ่อมของท่านได้รับการตรวจสอบและอนุมัติจากหัวหน้าช่างแล้ว",
                size: "xxs",
                color: "#6366f1",
                margin: "xs",
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "เครื่องจักร", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: "CNC Milling Machine (CNC-01)", size: "xs", color: "#0f172a", weight: "bold", flex: 7 },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ผู้อนุมัติ", size: "xs", color: "#64748b", flex: 3 },
              { type: "text", text: "หัวหน้าช่างซ่อมบำรุง", size: "xs", color: "#4338ca", weight: "bold", flex: 7 },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#f8fafc",
            paddingAll: "10px",
            cornerRadius: "8px",
            contents: [
              {
                type: "text",
                text: "📱 กรุณาเข้าสู่ระบบ LINE LIFF (เมนูติดตามสถานะ) เพื่อตรวจรับงานและประเมินความพึงพอใจ",
                size: "xxs",
                color: "#475569",
                wrap: true,
              },
            ],
          },
        ],
      },
    },
  };

  const res4 = await pushMessage(leadApproveFlex);
  console.log("Result 4:", res4.status, res4.ok ? "SUCCESS" : res4.body);

  console.log("\n==========================================");
  console.log("Summary: All 4 LINE Flex Messages verified!");
  console.log("==========================================");
}

testAllLineNotifications().catch(console.error);
