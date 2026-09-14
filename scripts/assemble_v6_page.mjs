import fs from "fs";
import path from "path";

const V6_DIR = "e:\\aut_cmms_v6";
const V8_DIR = "e:\\Documents\\GitHub\\aut_cmms_v8";

function readFileSafe(filename) {
  const filePath = path.join(V6_DIR, filename.endsWith(".html") ? filename : `${filename}.html`);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8");
  }
  console.warn(`File not found: ${filePath}`);
  return "";
}

function assemble() {
  console.log("Reading index.html from aut_cmms_v6...");
  let indexHtml = fs.readFileSync(path.join(V6_DIR, "index.html"), "utf-8");

  // 1. Replace <?!= include('...'); ?> with file contents
  const includeRegex = /<\?!\s*=\s*include\(\s*['"]([^'"]+)['"]\s*\);?\s*\?>/gis;

  indexHtml = indexHtml.replace(includeRegex, (match, fileName) => {
    // กรองข้ามหน้าหรือสคริปต์ที่ไม่ได้อยู่ใน 6 เมนูที่กำหนด
    const skipped = [
      "master_tasks_css",
      "my_work_css",
      "spareparts_css",
      "workorder_css",
      "master_tasks",
      "pending_tasks",
      "pm_management",
      "spareparts",
      "my_work",
      "workorder",
      "master_tasks_js",
      "pending_tasks_js",
      "spareparts_js",
      "my_work_js",
      "workorder_js",
      "spareparts_modal",
      "spare_requisition_modal"
    ];

    if (skipped.includes(fileName)) {
      return `<!-- Skipped ${fileName} (Not in reduced menu) -->`;
    }

    const content = readFileSafe(fileName);
    return `<!-- START: ${fileName} -->\n${content}\n<!-- END: ${fileName} -->`;
  });

  // 2. Replace GAS template variables <?= ... ?>
  indexHtml = indexHtml.replace(/<\?=\s*typeof\s+userId[^?]+\?>/gi, '"U-ADMIN"');
  indexHtml = indexHtml.replace(/<\?=\s*typeof\s+userName[^?]+\?>/gi, '"CMMS Admin"');
  indexHtml = indexHtml.replace(/<\?=\s*typeof\s+deptCode[^?]+\?>/gi, '"MT"');
  indexHtml = indexHtml.replace(/<\?=\s*typeof\s+pictureUrl[^?]+\?>/gi, '""');

  // 3. ปรับแต่ง Sidebar Menu ให้เหลือแค่ 6 เมนูที่ผู้ใช้ระบุ:
  // 1. Dashboard
  // 2. Asset
  // 3. Requests
  // 4. Technician Dashboard
  // 5. PM Due Dashboard
  // 6. ประวัติการซ่อม/PM
  const reducedSidebarMenu = `
        <nav class="sidebar-menu p-4 flex flex-col gap-1 pb-12">
          <!-- 1. Dashboard -->
          <a id="btn-nav-dashboard"
            class="sidebar-item active flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-all cursor-pointer"
            onclick="showPage('dashboard', this)">
            <i class="fa-solid fa-house text-lg w-5 text-center text-blue-600"></i>
            <span class="text-sm">Dashboard</span>
          </a>

          <!-- 2. Asset -->
          <a class="sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-all cursor-pointer"
            onclick="showPage('asset', this)">
            <i class="fa-solid fa-screwdriver-wrench text-lg w-5 text-center"></i>
            <span class="text-sm">Asset</span>
          </a>

          <!-- 3. Requests -->
          <a class="sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-all cursor-pointer"
            onclick="showPage('requests', this)">
            <i class="fa-solid fa-file-invoice text-lg w-5 text-center"></i>
            <span class="text-sm">Requests</span>
          </a>

          <!-- 4. Technician Dashboard -->
          <a class="sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-all cursor-pointer"
            onclick="showPage('workload_dashboard', this)">
            <i class="fa-solid fa-users-gear text-lg w-5 text-center"></i>
            <span class="text-sm">Technician Dashboard</span>
          </a>

          <!-- 5. PM Due Dashboard -->
          <a class="sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-all cursor-pointer"
            onclick="showPage('pm-due', this)">
            <i class="fa-solid fa-calendar-check text-lg w-5 text-center"></i>
            <span class="text-sm">PM Due Dashboard</span>
          </a>

          <!-- 6. ประวัติการซ่อม/PM -->
          <a id="btn-nav-history" class="sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-all cursor-pointer"
            onclick="showPage('history', this)">
            <i class="fa-solid fa-clock-rotate-left text-lg w-5 text-center"></i>
            <span class="text-sm">ประวัติการซ่อม/PM</span>
          </a>
        </nav>
  `;

  // แทนที่ <nav class="sidebar-menu ...">...</nav>
  indexHtml = indexHtml.replace(/<nav class="sidebar-menu[\s\S]*?<\/nav>/i, reducedSidebarMenu.trim());

  // 4. Inject Supabase CDN and google.script.run Bridge ใน <head>
  const bridgeScript = `
  <!-- Supabase JS Client & google.script.run Bridge -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
    (function() {
      const SUPABASE_URL = "https://pfcacqxonodjrnvreixq.supabase.co";
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmY2FjcXhvbm9kanJudnJlaXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwODc4MzQsImV4cCI6MjEwNDY2MzgzNH0.S0IPEpwTbe9p5HH9Vzp6BeNiQADvjRjt4Nt8up_IkMM";
      
      const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.cmmsSupabase = sb;

      // สร้าง Proxy จำลอง google.script.run เพื่อเชื่อมโยงไปยัง Supabase และ API
      function createRunner(onSuccess, onFailure) {
        return new Proxy({}, {
          get(target, prop) {
            if (prop === "withSuccessHandler") {
              return function(cb) { return createRunner(cb, onFailure); };
            }
            if (prop === "withFailureHandler") {
              return function(cb) { return createRunner(onSuccess, cb); };
            }
            return async function(...args) {
              try {
                const res = await handleServerBridge(prop, args);
                if (typeof onSuccess === "function") onSuccess(res);
                return res;
              } catch (err) {
                console.error("Server bridge error [" + prop + "]:", err);
                if (typeof onFailure === "function") onFailure(err);
                else throw err;
              }
            };
          }
        });
      }

      window.google = window.google || {};
      window.google.script = window.google.script || {};
      window.google.script.run = createRunner(null, null);

      async function handleServerBridge(method, args) {
        console.log("Bridge Call:", method, args);

        // 1. ดึงข้อมูลเครื่องจักรและชิ้นส่วน (Asset)
        if (method === "getCachedEquipmentData" || method === "refreshAssetData") {
          const { data, error } = await sb.from("master_machine").select("*").order("asset_code");
          if (error) throw error;
          return {
            last_updated: new Date().toISOString().split("T")[0],
            data: data || []
          };
        }

        // 2. ดึงข้อมูลสถิติภาพรวมสำหรับ Dashboard
        if (method === "getMaintenanceDashboard") {
          const { count: totalAssets } = await sb.from("v_parent_assets").select("*", { count: "exact", head: true });
          const { count: totalMachines } = await sb.from("master_machine").select("*", { count: "exact", head: true });
          const { data: requests } = await sb.from("requests").select("*").order("created_at", { ascending: false });
          const { data: workOrders } = await sb.from("work_orders").select("*").order("created_at", { ascending: false });

          const totalComps = Math.max(0, (totalMachines || 0) - (totalAssets || 0));
          const reqList = requests || [];
          const woList = workOrders || [];

          return {
            totalAssets: totalAssets || 0,
            totalComponents: totalComps,
            totalExpenses: 0,
            repairCount: reqList.length,
            pmBacklog: woList.filter(w => (w.workorder_type === "PM" && w.status !== "Completed")),
            breakdownBacklog: reqList.filter(r => ["High", "Urgent", "Critical"].includes(r.priority) && r.status !== "Closed"),
            expensesList: [],
            repairList: reqList
          };
        }

        // 3. ดึงและรวมข้อมูล Requests
        if (method === "mergeRequestData") {
          const { data: reqs, error } = await sb.from("requests").select("*").order("created_at", { ascending: false });
          if (error) throw error;

          const assetCodes = Array.from(new Set((reqs || []).map(r => r.asset_code).filter(Boolean)));
          const machineMap = {};
          if (assetCodes.length > 0) {
            const { data: machines } = await sb.from("master_machine").select("asset_code, asset_name, department, location").in("asset_code", assetCodes);
            (machines || []).forEach(m => machineMap[m.asset_code] = m);
          }

          return (reqs || []).map(r => {
            const m = machineMap[r.asset_code] || {};
            return {
              ...r,
              machine_name: m.asset_name || r.asset_code,
              department: m.department || "",
              location: m.location || ""
            };
          });
        }

        // 4. ดึงข้อมูลภาระงานช่าง (Workload Dashboard)
        if (method === "getWorkloadDashboardData") {
          const { data: techs } = await sb.from("technicians").select("*").eq("is_active", true);
          const { data: wos } = await sb.from("work_orders").select("*").order("created_at", { ascending: false });
          return {
            technicians: techs || [],
            workOrders: wos || []
          };
        }

        // 5. ดึงข้อมูลแผนและรอบ PM (PM Due Dashboard)
        if (method === "getPMDueDashboardData") {
          const { data: pms } = await sb.from("work_orders").select("*").eq("workorder_type", "PM");
          const { data: machines } = await sb.from("v_parent_assets").select("*");
          return {
            pmList: pms || [],
            machines: machines || []
          };
        }

        // 6. ดึงข้อมูลประวัติการซ่อม (History)
        if (method === "getWorkHistoryData") {
          const { data: closedReqs } = await sb.from("requests").select("*").order("created_at", { ascending: false });
          return {
            success: true,
            items: closedReqs || [],
            categories: ["FA", "CNC", "CONV", "HYD"],
            last_sync: new Date().toLocaleTimeString("th-TH")
          };
        }

        // 7. ดึงรายละเอียดใบงาน Work Order สำหรับ Drawer
        if (method === "getWODrawerData") {
          const woNo = args[0];
          const { data: wo } = await sb.from("work_orders").select("*").eq("workorder_code", woNo).maybeSingle();
          const { data: details } = await sb.from("work_order_details").select("*").eq("workorder_code", woNo);
          return {
            wo: wo || {},
            tasks: details || [],
            components: []
          };
        }

        // 8. Fallback ทั่วไป: ส่งต่อให้ /api/liff
        try {
          const res = await fetch("/api/liff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: method, payload: args[0] || {} })
          });
          const json = await res.json();
          return (json && json.data) ? json.data : json;
        } catch (fErr) {
          console.warn("API fallback error:", fErr);
          return { success: true };
        }
      }
    })();
  </script>
  `;

  indexHtml = indexHtml.replace("</head>", `${bridgeScript}\n</head>`);

  // บันทึกลง public/cmms.html และ out/cmms.html
  const publicOutPath = path.join(V8_DIR, "public", "cmms.html");
  fs.writeFileSync(publicOutPath, indexHtml, "utf-8");
  console.log(`Saved: ${publicOutPath}`);

  // หากมีโฟลเดอร์ out ให้เซฟลง out/cmms.html และ out/index.html ด้วย
  const outDir = path.join(V8_DIR, "out");
  if (fs.existsSync(outDir)) {
    fs.writeFileSync(path.join(outDir, "cmms.html"), indexHtml, "utf-8");
    fs.writeFileSync(path.join(outDir, "index.html"), indexHtml, "utf-8");
    console.log(`Saved: ${path.join(outDir, "index.html")}`);
  }

  console.log("Assembly completed successfully!");
}

assemble();
