import fs from "fs";
import path from "path";

const V6_DIR = "e:\\aut_cmms_v6";
const V8_DIR = "e:\\Documents\\GitHub\\aut_cmms_v8";

const WORKER_SCRIPT_TEXT = `
self.onmessage = async function (e) {
  const { id, file, maxWidth = 1280, maxHeight = 1280, maxSizeBytes = 512000, initialQuality = 0.82 } = e.data;
  try {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (bitmapErr) {
      throw new Error("ไม่สามารถอ่านข้อมูลภาพได้: " + (bitmapErr.message || bitmapErr));
    }

    let origWidth = bitmap.width;
    let origHeight = bitmap.height;
    let targetWidth = origWidth;
    let targetHeight = origHeight;

    if (targetWidth > maxWidth || targetHeight > maxHeight) {
      if (targetWidth > targetHeight) {
        targetHeight = Math.round((targetHeight * maxWidth) / targetWidth);
        targetWidth = maxWidth;
      } else {
        targetWidth = Math.round((targetWidth * maxHeight) / targetHeight);
        targetHeight = maxHeight;
      }
    }

    let canvas = new OffscreenCanvas(targetWidth, targetHeight);
    let ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    let quality = initialQuality;
    let blob = await canvas.convertToBlob({ type: "image/jpeg", quality: quality });

    while (blob.size > maxSizeBytes && quality > 0.35) {
      quality = Math.max(0.35, Math.round((quality - 0.08) * 100) / 100);
      blob = await canvas.convertToBlob({ type: "image/jpeg", quality: quality });
    }

    if (blob.size > maxSizeBytes) {
      targetWidth = Math.round(targetWidth * 0.85);
      targetHeight = Math.round(targetHeight * 0.85);
      canvas = new OffscreenCanvas(targetWidth, targetHeight);
      ctx = canvas.getContext("2d", { alpha: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
    }

    let dataUrl = "";
    if (typeof FileReaderSync !== "undefined") {
      const reader = new FileReaderSync();
      dataUrl = reader.readAsDataURL(blob);
    } else {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      dataUrl = "data:image/jpeg;base64," + btoa(binary);
    }

    if (bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }

    self.postMessage({
      id: id,
      success: true,
      dataUrl: dataUrl,
      size: blob.size,
      width: targetWidth,
      height: targetHeight,
      originalSize: file.size
    });
  } catch (err) {
    self.postMessage({
      id: id,
      success: false,
      error: err.message || String(err)
    });
  }
};
`;

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

  // 1. ตัดส่วนของ LINE LIFF ออกทั้งหมด
  // 1.1 ตัด LINE LIFF SDK
  indexHtml = indexHtml.replace(/<!--\s*LINE LIFF SDK\s*-->\s*<script[^>]*liff[^>]*><\/script>/gi, "<!-- LINE LIFF Removed -->");
  indexHtml = indexHtml.replace(/<script[^>]*static\.line-scdn\.net\/liff[^>]*><\/script>/gi, "");

  // 1.2 ตัดหน้า registerPage และ login-section ออก ให้เข้าสู่ main-section ทันที
  indexHtml = indexHtml.replace(/<!--\s*Register\s*-->[\s\S]*?<div id="main-section">/i, '<div id="main-section">');

  // 2. แทนที่แท็ก include <?!= include('...'); ?> ด้วยเนื้อหาไฟล์จริง
  const includeRegex = /<\?!\s*=\s*include\(\s*['"]([^'"]+)['"]\s*\);?\s*\?>/gis;

  indexHtml = indexHtml.replace(includeRegex, (match, fileName) => {
    // กรองข้ามหน้าหรือสคริปต์ที่ไม่ได้อยู่ใน 6 เมนูที่กำหนด หรือที่เกี่ยวกับ LIFF/Login/Spare parts
    const skipped = [
      "login_js",
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
      "spareparts_modal",
      "spare_requisition_modal"
    ];

    if (skipped.includes(fileName)) {
      return `<!-- Skipped ${fileName} -->`;
    }

    const content = readFileSafe(fileName);
    return `<!-- START: ${fileName} -->\n${content}\n<!-- END: ${fileName} -->`;
  });

  // 3. ปรับแต่ง Sidebar Menu ให้เหลือแค่ 6 เมนูที่กำหนด:
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
            <span class="text-sm font-semibold">Dashboard</span>
          </a>

          <!-- 2. Asset -->
          <a id="btn-nav-asset" class="sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-all cursor-pointer"
            onclick="showPage('asset', this)">
            <i class="fa-solid fa-screwdriver-wrench text-lg w-5 text-center"></i>
            <span class="text-sm">Asset</span>
          </a>

          <!-- 3. Requests -->
          <a id="btn-nav-requests" class="sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-all cursor-pointer"
            onclick="showPage('requests', this)">
            <i class="fa-solid fa-file-invoice text-lg w-5 text-center"></i>
            <span class="text-sm">Requests</span>
          </a>

          <!-- 4. Technician Dashboard -->
          <a id="btn-nav-technician" class="sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-all cursor-pointer"
            onclick="showPage('workload_dashboard', this)">
            <i class="fa-solid fa-users-gear text-lg w-5 text-center"></i>
            <span class="text-sm">Technician Dashboard</span>
          </a>

          <!-- 5. PM Due Dashboard -->
          <a id="btn-nav-pmdue" class="sidebar-item flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-all cursor-pointer"
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

          <!-- Placeholders เพื่อความเข้ากันได้กับโค้ด JavaScript เดิม -->
          <div id="master-dropdown" class="hidden" style="display:none;"></div>
          <i id="master-chevron" class="hidden" style="display:none;"></i>
        </nav>
  `;

  indexHtml = indexHtml.replace(/<nav class="sidebar-menu[\s\S]*?<\/nav>/i, reducedSidebarMenu.trim());

  // 4. แก้ไขบั๊ก showPage ใน main_js ให้ตรวจสอบ null ของ dropdown และ chevron
  indexHtml = indexHtml.replace(/dropdown\.classList\.add\("hidden"\);/g, 'if (dropdown) dropdown.classList.add("hidden");');
  indexHtml = indexHtml.replace(/chevron\.style\.transform\s*=\s*"rotate\(-90deg\)";/g, 'if (chevron) chevron.style.transform = "rotate(-90deg)";');

  // 5. แทนที่ฟังก์ชัน checkUser ให้เปิดหน้า Dashboard โดยตรง ไม่ต้องผ่าน LINE Auth หรือ Login
  const directInitScript = `
  <script>
    window.onload = function() {
      initAppDirect();
    };

    function initAppDirect() {
      try {
        sessionStorage.setItem("isLoggedIn", "true");
        sessionStorage.setItem("userId", "ADMIN-01");
        sessionStorage.setItem("userName", "Administrator");
        sessionStorage.setItem("deptCode", "MT");
        sessionStorage.setItem("userLevel", "Admin");

        const userDisplay = document.getElementById('user-display');
        if (userDisplay) userDisplay.innerText = "Administrator";

        const userLevel = document.getElementById('user-level');
        if (userLevel) userLevel.innerText = "Admin";

        const profileImg = document.getElementById('profileImage');
        if (profileImg) {
          profileImg.src = "https://ui-avatars.com/api/?name=Admin&background=2563eb&color=fff";
          profileImg.classList.remove('hidden');
        }
        const faImg = document.getElementById('faprofileImage');
        if (faImg) faImg.classList.add('hidden');

        // เปิดหน้า Dashboard ทันที
        const dashBtn = document.getElementById("btn-nav-dashboard");
        if (typeof showPage === "function") {
          showPage('dashboard', dashBtn);
        }
        if (typeof initDashboardFilters === "function") {
          initDashboardFilters();
        }

        if (dashBtn) {
          dashBtn.addEventListener("click", function() {
            setTimeout(function() {
              if (typeof initDashboardFilters === "function") {
                initDashboardFilters();
              }
            }, 100);
          });
        }

        // เพิ่ม Event ให้เมนู Technician Workload Dashboard โหลดข้อมูลอัตโนมัติ
        const techNavBtn = document.getElementById("btn-nav-technician");
        if (techNavBtn) {
          techNavBtn.addEventListener("click", function() {
            setTimeout(function() {
              if (typeof loadWorkloadDashboard === "function") {
                loadWorkloadDashboard();
              }
            }, 100);
          });
        }

        // เพิ่ม Event ให้เมนู History ประวัติการซ่อม/PM โหลดข้อมูลอัตโนมัติ
        const histNavBtn = document.getElementById("btn-nav-history");
        if (histNavBtn) {
          histNavBtn.addEventListener("click", function() {
            setTimeout(function() {
              if (typeof loadHistoryData === "function") {
                loadHistoryData();
              }
            }, 100);
          });
        }
      } catch (err) {
        console.warn("initAppDirect error:", err);
      }
    }
  </script>
  `;

  // ล้างแท็ก script เก่าของ checkUser
  indexHtml = indexHtml.replace(/<script>\s*window\.onload\s*=\s*function\(\)\s*\{[\s\S]*?function checkUser\(\)\{[\s\S]*?<\/script>/i, directInitScript);

  // 6. ล้างแท็ก template GAS ทั้งหมดที่อาจหลงเหลือ <?= ... ?> เพื่อป้องกัน %3C 404 error
  indexHtml = indexHtml.replace(/<\?[\s\S]*?\?>/g, "");

  // 7. ฝัง Supabase Client และ google.script.run Client Bridge ที่สมบูรณ์
  const bridgeScript = `
  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <script>
    window.dashCharts = window.dashCharts || {};
    window.DASH_COLORS = ["#0e7490", "#059669", "#d97706", "#dc2626", "#8b5cf6", "#ec4899", "#3b82f6", "#64748b", "#f59e0b", "#10b981", "#6366f1"];
    window.monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    var dashCharts = window.dashCharts;
    var DASH_COLORS = window.DASH_COLORS;
    var monthNames = window.monthNames;
  </script>
  <!-- Supabase JS Client & google.script.run Client Bridge -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
    (function() {
      const SUPABASE_URL = "https://pfcacqxonodjrnvreixq.supabase.co";
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmY2FjcXhvbm9kanJudnJlaXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwODc4MzQsImV4cCI6MjEwNDY2MzgzNH0.S0IPEpwTbe9p5HH9Vzp6BeNiQADvjRjt4Nt8up_IkMM";
      
      const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.cmmsSupabase = sb;

      // =========================================================================
      // Web Worker Image Compressor (<= 1280px, <= 500 KB) - ไม่บล็อก UI Thread
      // =========================================================================
      const WORKER_SCRIPT = ${JSON.stringify(WORKER_SCRIPT_TEXT)};

      let workerInstance = null;
      let activeCallbacks = new Map();
      let reqIdCounter = 1;

      function getWorker() {
        if (workerInstance) return workerInstance;
        if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
        try {
          const blob = new Blob([WORKER_SCRIPT], { type: "application/javascript" });
          const worker = new Worker(URL.createObjectURL(blob));
          worker.onmessage = function (e) {
            const { id, success, dataUrl, error, ...meta } = e.data;
            const cb = activeCallbacks.get(id);
            if (cb) {
              activeCallbacks.delete(id);
              if (success) cb.resolve({ dataUrl, ...meta });
              else cb.reject(new Error(error));
            }
          };
          workerInstance = worker;
          return workerInstance;
        } catch (e) {
          return null;
        }
      }

      function compressFallback(file, options) {
        return new Promise((resolve, reject) => {
          if (!file) return resolve({ dataUrl: "", size: 0 });
          const maxWidth = options.maxWidth || 1280;
          const maxHeight = options.maxHeight || 1280;
          const maxSizeBytes = options.maxSizeBytes || 512000;
          let quality = options.initialQuality || 0.82;

          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
              let targetWidth = img.width;
              let targetHeight = img.height;
              if (targetWidth > maxWidth || targetHeight > maxHeight) {
                if (targetWidth > targetHeight) {
                  targetHeight = Math.round((targetHeight * maxWidth) / targetWidth);
                  targetWidth = maxWidth;
                } else {
                  targetWidth = Math.round((targetWidth * maxHeight) / targetHeight);
                  targetHeight = maxHeight;
                }
              }
              const canvas = document.createElement("canvas");
              canvas.width = targetWidth;
              canvas.height = targetHeight;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

              let dataUrl = canvas.toDataURL("image/jpeg", quality);
              let approxBytes = (dataUrl.length * 3) / 4;
              while (approxBytes > maxSizeBytes && quality > 0.35) {
                quality = Math.max(0.35, Math.round((quality - 0.08) * 100) / 100);
                dataUrl = canvas.toDataURL("image/jpeg", quality);
                approxBytes = (dataUrl.length * 3) / 4;
              }
              resolve({ dataUrl, size: Math.round(approxBytes), width: targetWidth, height: targetHeight });
            };
            img.onerror = reject;
          };
          reader.onerror = reject;
        });
      }

      window.CmmsImageCompressor = {
        compress: function (file, options) {
          if (!file) return Promise.resolve({ dataUrl: "", size: 0, width: 0, height: 0 });
          const opts = { maxWidth: 1280, maxHeight: 1280, maxSizeBytes: 512000, initialQuality: 0.82, ...(options || {}) };
          const worker = getWorker();
          if (!worker) return compressFallback(file, opts);

          return new Promise((resolve, reject) => {
            const id = reqIdCounter++;
            activeCallbacks.set(id, { resolve, reject });
            try {
              worker.postMessage({ id, file, ...opts });
            } catch (err) {
              activeCallbacks.delete(id);
              compressFallback(file, opts).then(resolve).catch(reject);
            }
          });
        }
      };

      // Helper function สำหรับหน้าเว็บ CMMS: ย่อรูปด้วย Web Worker อัตโนมัติ (<= 1280px, <= 500 KB)
      window.convertFileToBase64 = async function (file) {
        if (!file) return null;
        try {
          const res = await window.CmmsImageCompressor.compress(file);
          const dataUrl = res.dataUrl || "";
          const pureBase64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
          return {
            bytes: pureBase64,
            dataUrl: dataUrl,
            mimeType: "image/jpeg",
            name: file.name,
            size: res.size,
            width: res.width,
            height: res.height,
            toString: function () { return dataUrl; }
          };
        } catch (err) {
          console.warn("Worker compress error, fallback to FileReader:", err);
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
              const res = reader.result;
              const pure = res.includes(",") ? res.split(",")[1] : res;
              resolve({
                bytes: pure,
                dataUrl: res,
                mimeType: file.type,
                name: file.name,
                toString: function () { return res; }
              });
            };
            reader.onerror = reject;
          });
        }
      };

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
                const res = await executeServerBridge(prop, args);
                if (typeof onSuccess === "function") onSuccess(res);
                return res;
              } catch (err) {
                console.error("Server bridge error [" + prop + "]:", err);
                if (typeof onFailure === "function") onFailure(err);
              }
            };
          }
        });
      }

      window.google = window.google || {};
      window.google.script = window.google.script || {};
      window.google.script.run = createRunner(null, null);

      function resolveUserName(u) {
        if (!u) return "";
        if (u.username && /^(นาย|นาง|นางสาว)/.test(u.username.trim())) return u.username.trim();
        if (u.display_name && /^(นาย|นาง|นางสาว)/.test(u.display_name.trim())) return u.display_name.trim();
        return u.display_name || u.name || u.username || "";
      }

      async function executeServerBridge(method, args) {
        console.log("⚡ Bridge Call:", method, args);

        // 1. ดึงข้อมูลเครื่องจักรและชิ้นส่วน (Asset)
        if (method === "getCachedEquipmentData" || method === "refreshAssetData" || method === "checkAndSyncEquipmentCache") {
          const { data, error } = await sb.from("master_machine").select("*").order("asset_code");
          if (error) console.warn("master_machine query:", error.message);
          return {
            last_updated: new Date().toISOString().split("T")[0],
            data: data || []
          };
        }

        // 2. ดึงข้อมูลภาพรวม Dashboard
        if (method === "getMaintenanceDashboard") {
          const filters = args[0] || {};
          const { count: totalAssets } = await sb.from("v_parent_assets").select("*", { count: "exact", head: true });
          const { count: totalMachines } = await sb.from("master_machine").select("*", { count: "exact", head: true });

          let reqQuery = sb.from("requests").select("*").order("created_at", { ascending: false });
          let woQuery = sb.from("work_orders").select("*").order("created_at", { ascending: false });

          if (filters.startDate) {
            reqQuery = reqQuery.gte("request_date", filters.startDate);
            woQuery = woQuery.gte("workorder_date", filters.startDate);
          }
          if (filters.endDate) {
            reqQuery = reqQuery.lte("request_date", filters.endDate);
            woQuery = woQuery.lte("workorder_date", filters.endDate);
          }

          const [{ data: requests }, { data: workOrders }, { data: users }] = await Promise.all([
            reqQuery,
            woQuery,
            sb.from("users").select("id, line_user_id, name, display_name, username")
          ]);

          const reqList = requests || [];
          const woList = workOrders || [];
          const userList = users || [];

          // Map users for fast lookup of reporter and assignee names
          const userMap = {};
          userList.forEach(u => {
            const name = resolveUserName(u);
            if (u.line_user_id) userMap[String(u.line_user_id).trim()] = name;
            if (u.id) userMap[String(u.id).trim()] = name;
            if (u.username) userMap[String(u.username).trim()] = name;
          });

          // Collect all asset and component codes needed
          const neededAssetCodes = new Set();
          reqList.forEach(r => {
            if (r.asset_code) neededAssetCodes.add(r.asset_code.trim());
            if (r.component_code) neededAssetCodes.add(r.component_code.trim());
          });
          woList.forEach(w => {
            if (w.asset_code) neededAssetCodes.add(w.asset_code.trim());
          });

          const machineMap = {};
          const assetCodeArr = Array.from(neededAssetCodes).filter(Boolean);
          if (assetCodeArr.length > 0) {
            const { data: machines } = await sb
              .from("master_machine")
              .select("asset_code, asset_name, category, department, location, description, machine_group, brand, model, specification, assignee")
              .in("asset_code", assetCodeArr);
            (machines || []).forEach(m => {
              if (m.asset_code) machineMap[m.asset_code.trim()] = m;
            });
          }

          // Work order lookup maps
          const woByReq = {};
          const woByCode = {};
          woList.forEach(w => {
            if (w.request_code) woByReq[w.request_code.trim()] = w;
            if (w.workorder_code) woByCode[w.workorder_code.trim()] = w;
          });

          // Helper to format date
          const fmtDate = (d) => {
            if (!d) return "-";
            if (typeof d === "string" && d.includes("T")) return d.split("T")[0];
            return String(d);
          };

          // Build enriched repair list from requests
          const handledWoCodes = new Set();
          const repairItems = [];

          reqList.forEach(r => {
            const reqCode = (r.request_code || "").trim();
            const woCode = (r.workorder_code || "").trim();
            const wo = (woCode && woByCode[woCode]) || (reqCode && woByReq[reqCode]) || {};
            if (wo.workorder_code) handledWoCodes.add(wo.workorder_code);

            const m = machineMap[(r.asset_code || "").trim()] || {};
            const comp = machineMap[(r.component_code || "").trim()] || {};

            const item = {
              id: r.id,
              wo_code: r.workorder_code || wo.workorder_code || "-",
              req_code: r.request_code || "-",
              request_type: r.request_type || wo.workorder_type || "BM",
              asset_code: r.asset_code || wo.asset_code || "-",
              asset_name: m.asset_name || r.asset_code || "-",
              machine_group: m.machine_group || "-",
              brand: m.brand || comp.brand || "-",
              model: m.model || comp.model || "-",
              component_code: r.component_code || "-",
              component_name: comp.description || comp.asset_name || (r.component_code ? r.component_code : "-"),
              equipment: comp.description || m.asset_name || m.machine_group || "-",
              location: m.location || comp.location || "-",
              department: m.department || comp.department || "-",
              issue_description: r.issue_description || "-",
              task: r.issue_description || "-",
              reporter_by: userMap[r.reporter_by] || r.reporter_by || "-",
              assignee: wo.assignee || m.assignee || "-",
              status: wo.status || r.status || "Pending",
              req_status: r.status || "Pending",
              wo_status: wo.status || null,
              priority: r.priority || "Normal",
              created_date: fmtDate(r.request_date || r.created_at),
              due_date: fmtDate(wo.due_date),
              start_date: fmtDate(wo.start_date),
              end_date: fmtDate(wo.end_date || wo.closed_at || wo.tech_completed_at),
              action_taken: wo.action_taken || "-",
              root_cause: wo.root_cause || "-",
              total_down_time: wo.total_down_time || "-",
              total_working_time: wo.total_working_time || "-",
              issue_image: r.issue_image || null,
              image_before: wo.image_before || null,
              image_result: wo.image_result || null
            };
            repairItems.push(item);
          });

          // Also include standalone repair work orders (BM/CM/Repair) not originating from a request
          woList.forEach(w => {
            if (handledWoCodes.has(w.workorder_code)) return;
            const wType = (w.workorder_type || "").toUpperCase();
            if (wType === "BM" || wType === "CM" || wType === "REPAIR") {
              const m = machineMap[(w.asset_code || "").trim()] || {};
              repairItems.push({
                id: w.id,
                wo_code: w.workorder_code || "-",
                req_code: w.request_code || "-",
                request_type: w.workorder_type || "CM",
                asset_code: w.asset_code || "-",
                asset_name: m.asset_name || w.asset_code || "-",
                machine_group: m.machine_group || "-",
                brand: m.brand || "-",
                model: m.model || "-",
                component_code: "-",
                component_name: "-",
                equipment: m.asset_name || "-",
                location: m.location || "-",
                department: m.department || "-",
                issue_description: w.action_taken || w.approval_notes || "งานซ่อมบำรุงตามใบสั่งงาน",
                task: w.action_taken || "-",
                reporter_by: "-",
                assignee: w.assignee || m.assignee || "-",
                status: w.status || "Pending",
                req_status: null,
                wo_status: w.status || "Pending",
                priority: "Normal",
                created_date: fmtDate(w.workorder_date || w.created_at),
                due_date: fmtDate(w.due_date),
                start_date: fmtDate(w.start_date),
                end_date: fmtDate(w.end_date || w.closed_at),
                action_taken: w.action_taken || "-",
                root_cause: w.root_cause || "-",
                total_down_time: w.total_down_time || "-",
                total_working_time: w.total_working_time || "-",
                issue_image: null,
                image_before: w.image_before || null,
                image_result: w.image_result || null
              });
            }
          });

          // Enriched PM Backlog
          const pmBacklog = woList
            .filter(w => (w.workorder_type === "PM" && w.status !== "Completed" && w.status !== "Closed"))
            .map(w => {
              const m = machineMap[(w.asset_code || "").trim()] || {};
              return {
                ...w,
                wo_code: w.workorder_code,
                req_code: w.request_code || "-",
                asset_name: m.asset_name || w.asset_code || "-",
                equipment: m.asset_name || "-",
                location: m.location || "-",
                department: m.department || "-",
                created_date: fmtDate(w.workorder_date || w.created_at),
                due_date: fmtDate(w.due_date),
                assignee: w.assignee || m.assignee || "-"
              };
            });

          // Enriched Breakdown Backlog
          const breakdownBacklog = repairItems.filter(r => 
            (r.status === "Pending" || r.status === "In Progress" || r.status === "Waiting Parts")
          );

          const totalComps = Math.max(0, (totalMachines || 0) - (totalAssets || 0));

          return {
            totalAssets: totalAssets || 0,
            totalComponents: totalComps,
            totalExpenses: 0,
            repairCount: repairItems.length,
            pmBacklog: pmBacklog,
            breakdownBacklog: breakdownBacklog,
            expensesList: [],
            repairList: repairItems
          };
        }

        // 3. ดึงและรวมข้อมูล Requests
        if (method === "mergeRequestData") {
          const [reqRes, userRes] = await Promise.all([
            sb.from("requests").select("*").order("created_at", { ascending: false }),
            sb.from("users").select("id, line_user_id, name, display_name, username")
          ]);

          const reqs = reqRes.data || [];
          const users = userRes.data || [];

          const userMap = {};
          users.forEach(u => {
            const best = resolveUserName(u);
            if (u.id) userMap[String(u.id).trim()] = best;
            if (u.line_user_id) userMap[String(u.line_user_id).trim()] = best;
            if (u.username) userMap[String(u.username).trim()] = best;
          });

          // รวบรวมรหัสเครื่องจักรและรหัสชิ้นส่วน (Component)
          const neededCodes = new Set();
          reqs.forEach(r => {
            if (r.asset_code) neededCodes.add(String(r.asset_code).trim());
            if (r.component_code) neededCodes.add(String(r.component_code).trim());
          });

          const machineMap = {};
          const codeArr = Array.from(neededCodes).filter(Boolean);
          if (codeArr.length > 0) {
            const { data: machines } = await sb
              .from("master_machine")
              .select("asset_code, asset_name, department, location, description")
              .in("asset_code", codeArr);
            (machines || []).forEach(m => {
              if (m.asset_code) machineMap[String(m.asset_code).trim()] = m;
            });
          }

          return reqs.map(r => {
            const aCode = String(r.asset_code || "").trim();
            const cCode = String(r.component_code || "").trim();
            const m = machineMap[aCode] || {};
            const comp = machineMap[cCode] || {};

            const repKey = String(r.reporter_by || "").trim();
            const resolvedReporter = userMap[repKey] || r.reporter_name || r.reporter_by || "System";

            // แปลงวันที่ให้เป็นรูปแบบ YYYY-MM-DD
            const rawDate = r.request_date || r.created_at || "";
            const dateIso = (typeof rawDate === "string" && rawDate.includes("T"))
              ? rawDate.split("T")[0]
              : String(rawDate || "");

            return {
              ...r,
              reporter_name: resolvedReporter,
              reporter_by: resolvedReporter,
              issue_desc: r.issue_description || r.issue_desc || "-",
              machine_name: m.asset_name || r.asset_code || "-",
              component_description: comp.description || comp.asset_name || r.component_code || "-",
              department: m.department || comp.department || r.department || "",
              location: m.location || comp.location || r.location || "",
              request_date: dateIso || "-",
              request_date_iso: dateIso
            };
          });
        }

        // 4. ดึงข้อมูลภาระงานช่าง (Workload Dashboard)
        if (method === "getWorkloadDashboardData") {
          const [techRes, woRes, reqRes, mmRes, detailRes, waRes] = await Promise.all([
            sb.from("technicians").select("*").eq("is_active", true),
            sb.from("work_orders").select("*").order("created_at", { ascending: false }),
            sb.from("requests").select("request_code, priority, issue_description"),
            sb.from("master_machine").select("asset_code, asset_name, description, location, assignee"),
            sb.from("work_order_details").select("*"),
            sb.from("wo_assignees").select("*")
          ]);

          const reqMap = {};
          (reqRes.data || []).forEach(r => {
            if (r.request_code) {
              reqMap[r.request_code] = {
                priority: r.priority || "Normal",
                issue_description: r.issue_description || ""
              };
            }
          });

          const mmMap = {};
          (mmRes.data || []).forEach(m => {
            if (m.asset_code && !mmMap[m.asset_code]) {
              mmMap[m.asset_code] = {
                asset_name: m.asset_name || "",
                description: m.description || "",
                location: m.location || "",
                assignee: m.assignee || ""
              };
            }
          });

          const waMap = {};
          (waRes.data || []).forEach(w => {
            const code = String(w.workorder_code || "").trim();
            const name = String(w.assignee_name || "").trim();
            if (code && name) {
              if (!waMap[code]) waMap[code] = [];
              if (!waMap[code].includes(name)) waMap[code].push(name);
            }
          });

          const woDetailMap = {};
          (detailRes.data || []).forEach(d => {
            const woNo = String(d.workorder_code || "").trim();
            if (!woNo) return;
            if (!woDetailMap[woNo]) {
              woDetailMap[woNo] = {
                component_count: 0,
                completed_count: 0,
                task_nos: [],
                pm_types: [],
                total_working_time: 0,
                total_down_time: 0
              };
            }
            const item = woDetailMap[woNo];
            item.component_count++;
            const s = String(d.status || "").trim().toLowerCase();
            if (s === "completed" || s === "closed" || s === "approved" || s === "pending approval" || s === "done" || s.includes("เสร็จ")) {
              item.completed_count++;
            }
            if (d.task_no && !item.task_nos.includes(d.task_no)) item.task_nos.push(d.task_no);
            if (d.pm_type && !item.pm_types.includes(d.pm_type)) item.pm_types.push(d.pm_type);
            item.total_working_time += Number(d.working_time || 0);
            item.total_down_time += Number(d.down_time || 0);
          });

          const now = new Date();
          const todayStr = now.toISOString().slice(0, 10);
          const techSet = {};

          (techRes.data || []).forEach(t => {
            if (t.name && t.name.trim()) techSet[t.name.trim()] = true;
          });

          const workOrders = (woRes.data || []).map(w => {
            const woCode = String(w.workorder_code || "").trim();
            const reqCode = String(w.request_code || "").trim();
            const requestType = String(w.workorder_type || "CM").trim();
            const assetCode = String(w.asset_code || "").trim();
            const status = String(w.status || "Pending").trim();
            const createdDate = w.workorder_date || (w.created_at ? w.created_at.slice(0, 10) : "-");
            const dueDate = w.due_date || "-";
            const startedAt = w.start_date || "-";
            const completedAt = w.closed_at || w.tech_completed_at || "-";

            let rawAssignees = waMap[woCode] || [];
            if (rawAssignees.length === 0 && w.assignee) {
              rawAssignees = w.assignee.split(",").map(s => s.trim()).filter(Boolean);
            }
            const assignees = [];
            rawAssignees.forEach(name => {
              if (name && !assignees.includes(name)) {
                assignees.push(name);
                techSet[name] = true;
              }
            });

            const reqInfo = reqMap[reqCode] || {};
            const mmInfo = mmMap[assetCode] || {};
            const detailInfo = woDetailMap[woCode] || {};

            const isDone = (status === "Completed" || status === "Closed" || status === "Approved" || status === "Done");
            let isOverdue = false;
            if (dueDate && dueDate !== "-" && !isDone) {
              isOverdue = dueDate < todayStr;
            }

            const taskNoStr = (detailInfo.task_nos || []).join(", ");
            const pmTypeStr = (detailInfo.pm_types || []).join(", ");

            return {
              wo: woCode,
              reqNo: reqCode,
              assetName: mmInfo.asset_name || assetCode || "-",
              assetCode: assetCode,
              assetDescription: mmInfo.description || "",
              assignees: assignees.length > 0 ? assignees : ["-"],
              assigneeStr: assignees.length > 0 ? assignees.join(", ") : "-",
              technician: assignees.length > 0 ? assignees[0] : "-",
              priority: reqInfo.priority || "Normal",
              status: status,
              requestType: requestType,
              task: reqInfo.issue_description || pmTypeStr || "",
              taskNo: taskNoStr,
              pmType: pmTypeStr,
              componentCount: detailInfo.component_count || w.total_components || 0,
              completedCount: detailInfo.completed_count || w.completed_components || 0,
              totalWorkingTime: detailInfo.total_working_time || Number(w.total_working_time || 0),
              totalDownTime: detailInfo.total_down_time || Number(w.total_down_time || 0),
              location: mmInfo.location || "-",
              startDate: startedAt,
              dueDate: dueDate,
              createdDate: createdDate,
              completedAt: completedAt,
              overdue: isOverdue
            };
          });

          const technicians = Object.keys(techSet).sort();

          return {
            technicians: technicians,
            workOrders: workOrders
          };
        }

        // 5. ดึงข้อมูลแผน PM (PM Due Dashboard)
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
          try {
            const filters = args[0] || {};
            const filterStart = filters.startDate ? new Date(filters.startDate + "T00:00:00").getTime() : 0;
            const filterEnd = filters.endDate ? new Date(filters.endDate + "T23:59:59").getTime() : 0;
            const filterAsset = filters.asset_code ? String(filters.asset_code).trim().toLowerCase() : "";
            const filterComp = filters.component_code ? String(filters.component_code).trim().toLowerCase() : "";
            const filterType = filters.type ? String(filters.type).trim().toUpperCase() : "ALL";
            const filterCat = filters.category ? String(filters.category).trim().toLowerCase() : "";

            const [mmRes, woRes, reqRes, detailRes, expRes, userRes] = await Promise.all([
              sb.from("master_machine").select("*"),
              sb.from("work_orders").select("*"),
              sb.from("requests").select("*"),
              sb.from("work_order_details").select("*"),
              sb.from("work_order_expenses").select("*"),
              sb.from("users").select("id, line_user_id, name, display_name, username")
            ]);

            const userMap = {};
            (userRes.data || []).forEach(u => {
              const best = resolveUserName(u);
              if (u.id) userMap[String(u.id).trim()] = best;
              if (u.line_user_id) userMap[String(u.line_user_id).trim()] = best;
              if (u.username) userMap[String(u.username).trim()] = best;
            });

            const mmCompMap = {};
            const mmAssetMap = {};
            const categorySet = {};

            (mmRes.data || []).forEach(m => {
              const catName = String(m.category || "").trim();
              const grpName = String(m.machine_group || "").trim();
              const aCode = String(m.asset_code || "").trim();
              const aName = String(m.asset_name || "").trim();
              const cCode = String(m.asset_code || "").trim();
              const cName = String(m.description || "").trim();
              const loc = String(m.location || "").trim();
              const dept = String(m.department || "").trim();

              if (catName) categorySet[catName] = true;

              if (cCode) {
                mmCompMap[cCode] = {
                  component_name: cName,
                  asset_code: m.parent_code || aCode,
                  asset_name: aName,
                  category: catName || "General",
                  group: grpName,
                  location: loc,
                  department: dept
                };
              }
              if (aCode && !mmAssetMap[aCode]) {
                mmAssetMap[aCode] = {
                  asset_name: aName,
                  category: catName || "General",
                  group: grpName,
                  location: loc,
                  department: dept
                };
              }
            });

            const expMap = {};
            (expRes.data || []).forEach(rowE => {
              const eWo = String(rowE.workorder_code || "").trim();
              if (!eWo) return;
              const amt = Number(rowE.amount || 0);
              if (!expMap[eWo]) expMap[eWo] = { total: 0, items: [] };
              expMap[eWo].total += amt;
              expMap[eWo].items.push({
                expense_type: String(rowE.expense_type || ""),
                description: String(rowE.description || ""),
                amount: amt,
                date: rowE.created_at ? rowE.created_at.slice(0, 10) : ""
              });
            });

            const reqMap = {};
            (reqRes.data || []).forEach(r => {
              const code = String(r.request_code || "").trim();
              if (code) reqMap[code] = r;
            });

            const woMap = {};
            (woRes.data || []).forEach(w => {
              const code = String(w.workorder_code || "").trim();
              if (code) woMap[code] = w;
            });

            const items = [];
            (detailRes.data || []).forEach(rowD => {
              const woCode = String(rowD.workorder_code || "").trim();
              const compCode = String(rowD.component_code || "").trim();
              const assetCode = String(rowD.asset_code || "").trim();
              const reqCode = String(rowD.request_code || "").trim();

              if (!woCode && !compCode) return;

              const woInfo = woMap[woCode] || {};
              const reqInfo = reqMap[reqCode] || reqMap[woInfo.request_code] || {};
              const compInfo = mmCompMap[compCode] || {};
              const assetInfo = mmAssetMap[assetCode] || mmAssetMap[woInfo.asset_code] || mmAssetMap[compInfo.asset_code] || {};

              const resolvedAssetCode = assetCode || woInfo.asset_code || compInfo.asset_code || "-";
              const resolvedAssetName = compInfo.asset_name || assetInfo.asset_name || resolvedAssetCode;
              const resolvedCompName = compInfo.component_name || "-";
              const resolvedCategory = compInfo.category || assetInfo.category || "General";
              const resolvedGroup = compInfo.group || assetInfo.group || "-";

              const rawDate = rowD.end_date || rowD.start_date || woInfo.workorder_date || woInfo.due_date || woInfo.created_at || "";
              const dateObj = rawDate ? new Date(rawDate) : null;
              const dateValid = dateObj && !isNaN(dateObj.getTime());
              const dateRaw = dateValid ? dateObj.getTime() : 0;

              const rawType = (woInfo.workorder_type || rowD.pm_type || reqInfo.request_type || "CM").trim();
              const isPM = String(rawType).toUpperCase().indexOf("PM") !== -1;
              const normalizedType = isPM ? "PM" : "CM";

              const status = String(rowD.status || woInfo.status || "Completed").trim();
              const assignee = String(rowD.assignee || woInfo.assignee || "").trim();

              // Filters checking
              if (filterStart && dateRaw && dateRaw < filterStart) return;
              if (filterEnd && dateRaw && dateRaw > filterEnd) return;
              if (filterAsset && resolvedAssetCode.toLowerCase().indexOf(filterAsset) === -1 && resolvedAssetName.toLowerCase().indexOf(filterAsset) === -1) return;
              if (filterComp && compCode.toLowerCase().indexOf(filterComp) === -1 && resolvedCompName.toLowerCase().indexOf(filterComp) === -1) return;
              if (filterType && filterType !== "ALL") {
                if (filterType === "PM" && normalizedType !== "PM") return;
                if (filterType === "CM" && normalizedType !== "CM") return;
              }
              if (filterCat && resolvedCategory.toLowerCase().indexOf(filterCat) === -1) return;

              const expInfo = expMap[woCode] || { total: 0, items: [] };

              items.push({
                wo_code: woCode || "-",
                req_code: reqCode || woInfo.request_code || "-",
                component_code: compCode || "-",
                component_name: resolvedCompName,
                asset_code: resolvedAssetCode,
                asset_name: resolvedAssetName,
                category: resolvedCategory,
                group: resolvedGroup,
                location: compInfo.location || assetInfo.location || "-",
                department: compInfo.department || assetInfo.department || "-",
                workorder_type: normalizedType,
                workorder_type_raw: rawType,
                pm_type: String(rowD.pm_type || "").trim(),
                task_no: String(rowD.task_no || "").trim(),
                status: status,
                date_iso: dateValid ? dateObj.toISOString().slice(0, 10) : "",
                date_thai: dateValid ? dateObj.toLocaleDateString("th-TH") : "-",
                date_raw: dateRaw,
                root_cause: String(rowD.root_cause || reqInfo.issue_description || "-").trim(),
                action_taken: String(rowD.action_taken || "-").trim(),
                measured_value: String(rowD.measured_value || "-").trim(),
                start_date: rowD.start_date || "-",
                end_date: rowD.end_date || "-",
                working_time: Number(rowD.working_time || 0),
                down_time: Number(rowD.down_time || 0),
                assignee: assignee || "-",
                image_before: String(rowD.image_before || "").trim(),
                image_result: String(rowD.image_result || "").trim(),
                reporter_by: userMap[String(reqInfo.reporter_by || "").trim()] || reqInfo.reporter_by || reqInfo.reporter_name || "-",
                priority: reqInfo.priority || "Normal",
                expense: expInfo.total || 0,
                expenses_breakdown: expInfo.items || []
              });
            });

            // Sort by latest date first
            items.sort((a, b) => (b.date_raw || 0) - (a.date_raw || 0));

            const categoriesList = Object.keys(categorySet).sort();

            return {
              success: true,
              items: items,
              categories: categoriesList,
              last_sync: new Date().toLocaleTimeString("th-TH")
            };
          } catch (err) {
            console.error("getWorkHistoryData error:", err);
            return {
              success: false,
              error: err.toString(),
              items: [],
              categories: [],
              last_sync: ""
            };
          }
        }

        // 7. ดึงรายละเอียด Work Order สำหรับ Drawer
        if (method === "getWODrawerData") {
          const woNo = args[0];
          const [woRes, detailsRes, rawAssigneesRes, userRes] = await Promise.all([
            sb.from("work_orders").select("*").eq("workorder_code", woNo).maybeSingle(),
            sb.from("work_order_details").select("*").eq("workorder_code", woNo),
            sb.from("wo_assignees").select("*").eq("workorder_code", woNo),
            sb.from("users").select("id, line_user_id, name, display_name, username")
          ]);
          const wo = woRes.data;
          const details = detailsRes.data;
          const rawAssignees = rawAssigneesRes.data;

          const userMap = {};
          (userRes.data || []).forEach(u => {
            const best = resolveUserName(u);
            if (u.id) userMap[String(u.id).trim()] = best;
            if (u.line_user_id) userMap[String(u.line_user_id).trim()] = best;
            if (u.username) userMap[String(u.username).trim()] = best;
          });

          const { data: req } = await sb.from("requests").select("*").eq("request_code", wo?.request_code || "").maybeSingle();
          const { data: asset } = await sb.from("master_machine").select("*").eq("asset_code", wo?.asset_code || "").maybeSingle();

          const repKey = String(req?.reporter_by || "").trim();
          const resolvedDrawerReporter = userMap[repKey] || req?.reporter_name || req?.reporter_by || "System";

          let assignees = (rawAssignees || []).map(a => ({ name: a.assignee_name, user_id: a.user_id || "" }));
          if (assignees.length === 0 && wo?.assignee) {
            assignees = wo.assignee.split(",").map(s => s.trim()).filter(Boolean).map(n => ({ name: n, user_id: "" }));
          }

          const components = (details || []).map((c, idx) => ({
            task_no: c.task_no || ("TASK-" + (idx + 1)),
            taskNo: c.task_no || ("TASK-" + (idx + 1)),
            pm_type: c.pm_type || "",
            pmType: c.pm_type || "",
            pm_sequence_no: c.pm_sequence_no || "",
            equipment_code: c.component_code || c.equipment_code || "",
            component_code: c.component_code || c.equipment_code || "",
            equipment_name: c.component_name || c.equipment_name || "อุปกรณ์ย่อย",
            equipment: c.component_name || c.equipment_name || "อุปกรณ์ย่อย",
            checkItem: c.check_item || c.root_cause || c.action_taken || "ตรวจเช็คและบำรุงรักษาตามรอบ",
            standardValue: c.standard_value || "ปกติ (Normal)",
            measuredValue: c.measured_value || "",
            measured_value: c.measured_value || "",
            rootCause: c.root_cause || "",
            root_cause: c.root_cause || "",
            actionTaken: c.action_taken || "",
            action_taken: c.action_taken || "",
            status: c.status || "Pending",
            startDate: c.start_date || "",
            start_date: c.start_date || "",
            endDate: c.end_date || "",
            end_date: c.end_date || "",
            workingTime: c.working_time || "",
            working_time: c.working_time || "",
            downTime: c.down_time || "",
            down_time: c.down_time || "",
            photoBefore: c.image_before || "",
            image_before: c.image_before || "",
            photoAfter: c.image_result || "",
            image_result: c.image_result || ""
          }));

          const formatted = {
            status: "success",
            woCode: woNo,
            wo: {
              woNo: wo?.workorder_code || woNo,
              wo_code: wo?.workorder_code || woNo,
              reqNo: wo?.request_code || req?.request_code || "-",
              request_code: wo?.request_code || req?.request_code || "-",
              woType: wo?.workorder_type || "CM",
              request_type: wo?.workorder_type || "CM",
              workType: (wo?.workorder_type || "").toUpperCase().includes("PM") ? "Preventive Maintenance" : "Corrective Maintenance",
              priority: req?.priority || "Normal",
              status: wo?.status || "Pending",
              assignee_type: wo?.assignee_type || "INTERNAL",
              assignedTo: wo?.assignee || (assignees.length > 0 ? assignees[0].name : "-"),
              assignee: wo?.assignee || (assignees.length > 0 ? assignees[0].name : "-"),
              createdDate: wo?.workorder_date || (wo?.created_at ? wo.created_at.slice(0, 10) : ""),
              dueDate: wo?.due_date || "",
              due_date: wo?.due_date || "",
              started_at: wo?.start_date || "",
              completed_at: wo?.closed_at || wo?.tech_completed_at || ""
            },
            request: {
              reqNo: req?.request_code || "-",
              request_code: req?.request_code || "-",
              reporter_name: resolvedDrawerReporter,
              requesterName: resolvedDrawerReporter,
              department: req?.department || asset?.department || "-",
              issue_description: req?.issue_description || "-",
              symptom: req?.issue_description || "-",
              issue_image: req?.image_before || req?.issue_image || null,
              priority: req?.priority || "Normal",
              status: req?.status || "In Progress",
              request_type: req?.request_type || wo?.workorder_type || "CM",
              request_date: req?.request_date || (req?.created_at ? req.created_at.slice(0, 10) : "")
            },
            assetInfo: {
              assetCode: wo?.asset_code || asset?.asset_code || "-",
              asset_code: wo?.asset_code || asset?.asset_code || "-",
              assetName: asset?.asset_name || asset?.description || wo?.asset_code || "-",
              asset_name: asset?.asset_name || asset?.description || wo?.asset_code || "-",
              location: asset?.location || "-",
              department: asset?.department || "-",
              brand: asset?.brand || "",
              model: asset?.model || ""
            },
            components: components,
            assignees: assignees,
            expenses: [],
            totalExpenses: 0
          };

          return formatted;
        }

        // 8. ดึงข้อมูล Master Data สำหรับ Dropdown (Departments, Locations, Categories, Machine Groups)
        if (method === "loadMasterDataFromSheet" || method === "getDepartments") {
          const [deptRes, locRes, catRes, grpRes] = await Promise.all([
            sb.from("lookup_departments").select("*"),
            sb.from("lookup_locations").select("*"),
            sb.from("lookup_categories").select("*").eq("is_active", true).order("code"),
            sb.from("lookup_machine_groups").select("*").eq("is_active", true).order("code")
          ]);

          const depts = (deptRes.data || []).map(d => ({
            ...d,
            Dept: d.dept_code || d.code || d.name,
            Name: d.dept_name || d.name || d.code
          }));
          const locs = locRes.data || [];
          const categories = (catRes.data || []).map(c => ({
            ...c,
            category_id: c.code,
            category_name: c.name,
            code: c.code,
            name: c.name
          }));
          const machineGroups = (grpRes.data || []).map(g => ({
            ...g,
            group_id: g.code,
            group_name: g.name,
            code: g.code,
            name: g.name
          }));

          return {
            status: "success",
            departments: depts,
            locations: locs,
            categories: categories,
            machineGroups: machineGroups,
            data: {
              departments: depts,
              locations: locs,
              categories: categories,
              machineGroups: machineGroups
            }
          };
        }

        if (method === "getComponentGroups") {
          const { data } = await sb.from("master_machine").select("part_group").not("part_group", "is", null);
          const groups = Array.from(new Set((data || []).map(d => d.part_group).filter(Boolean)));
          return groups;
        }

        if (method === "saveEquipmentToProperties") {
          return { success: true, message: "OK" };
        }

        // 9. ดึงรายชื่อช่าง/ผู้รับเหมา สำหรับ Modal มอบหมายงาน (Assign Modal)
        if (method === "getAssigneeMasterData" || method === "getAssignees" || method === "getTechnicianList") {
          const { data: techs } = await sb.from("technicians").select("*").eq("is_active", true);
          const { data: activeWos } = await sb.from("wo_assignees").select("assignee_name").eq("status", "In Progress");
          const counts = {};
          (activeWos || []).forEach(w => {
            if (w.assignee_name) counts[w.assignee_name] = (counts[w.assignee_name] || 0) + 1;
          });
          const { data: vens } = await sb.from("vendors").select("*");

          const formattedTechs = (techs || []).map(t => ({
            id: t.id,
            user_id: t.user_id || t.id,
            name: t.name,
            pending_count: counts[t.name] || 0
          }));
          const formattedVens = (vens || []).map(v => ({
            id: v.id,
            user_id: v.vendor_id || v.id,
            name: v.company_name,
            pending_count: 0
          }));

          return {
            technicians: formattedTechs,
            vendors: formattedVens,
            data: {
              technicians: formattedTechs,
              vendors: formattedVens
            }
          };
        }

        // 10. ออกใบสั่งงาน (Generate Work Order / Bulk Work Order)
        if (method === "generateBulkWorkOrder" || method === "assignPendingTask") {
          const requestCodes = args[0] || [];
          const assignees = args[1] || [];
          const dueDays = parseInt(args[2]) || 1;
          const assigneeType = args[3] || "INTERNAL";
          const assigneeIds = args[4] || [];
          const selectedWoType = args[5] || "CM";

          const reqCodes = (Array.isArray(requestCodes) ? requestCodes : [requestCodes])
            .map(r => typeof r === "object" ? r.request_code : r)
            .filter(Boolean);

          if (reqCodes.length === 0) {
            return { success: false, message: "ไม่มีรายการคำขอที่เลือก" };
          }

          const now = new Date();
          const yy = now.getFullYear().toString().slice(-2);
          const mm = String(now.getMonth() + 1).padStart(2, "0");
          const prefix = "WO" + yy + mm;

          const { data: latestWos } = await sb.from("work_orders")
            .select("workorder_code")
            .ilike("workorder_code", prefix + "-%")
            .order("workorder_code", { ascending: false })
            .limit(1);

          let nextSeq = 1;
          if (latestWos && latestWos.length > 0) {
            const match = latestWos[0].workorder_code.match(/-(\\d+)$/);
            if (match) nextSeq = parseInt(match[1], 10) + 1;
          }
          const nextWoCode = prefix + "-" + String(nextSeq).padStart(4, "0");

          const todayStr = now.toISOString().split("T")[0];
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + dueDays);
          const dueDateStr = dueDate.toISOString().split("T")[0];

          const { data: reqList } = await sb.from("requests").select("*").in("request_code", reqCodes);
          const reqMap = {};
          (reqList || []).forEach(r => reqMap[r.request_code] = r);
          const firstReq = (reqList && reqList.length > 0) ? reqList[0] : null;
          const mainAssetCode = firstReq?.asset_code || null;

          const assigneeList = Array.isArray(assignees) ? assignees : (assignees ? [assignees] : []);
          const assigneesString = assigneeList.map(a => typeof a === "object" ? a.name : String(a)).join(", ");
          const assigneeIdList = Array.isArray(assigneeIds) ? assigneeIds : (assigneeIds ? [assigneeIds] : []);
          const assigneeIdsString = assigneeIdList.join(", ");

          // 1. work_orders
          const { error: woErr } = await sb.from("work_orders").insert({
            workorder_code: nextWoCode,
            workorder_type: selectedWoType,
            request_code: firstReq?.request_code || reqCodes[0],
            asset_code: mainAssetCode,
            workorder_date: todayStr,
            due_date: dueDateStr,
            status: "In Progress",
            assignee: assigneesString,
            assignee_ids: assigneeIdsString,
            assignee_type: assigneeType,
            total_components: reqCodes.length,
            completed_components: 0
          });

          if (woErr) {
            console.error("work_orders insert error:", woErr);
            return { success: false, message: "ไม่สามารถบันทึกใบสั่งงาน: " + woErr.message };
          }

          // 2. work_order_details
          const detailRows = reqCodes.map((rc, idx) => {
            const r = reqMap[rc] || {};
            return {
              workorder_code: nextWoCode,
              request_code: rc,
              asset_code: r.asset_code || null,
              component_code: r.component_code || null,
              task_no: String(idx + 1),
              status: "In Progress",
              assignee: assigneesString,
              assignee_id: assigneeIdsString
            };
          });
          if (detailRows.length > 0) {
            await sb.from("work_order_details").insert(detailRows);
          }

          // 3. wo_assignees
          if (assigneeList.length > 0) {
            const assRows = assigneeList.map(a => ({
              workorder_code: nextWoCode,
              assignee_name: typeof a === "object" ? a.name : String(a).trim(),
              status: "In Progress"
            }));
            await sb.from("wo_assignees").insert(assRows);
          }

          // 4. Update requests status
          await sb.from("requests")
            .update({
              status: "In Progress",
              workorder_code: nextWoCode,
              updated_at: new Date().toISOString(),
              updated_by: sessionStorage.getItem("userName") || "Administrator"
            })
            .in("request_code", reqCodes);

          // 5. Update master_machine status to Repair
          if (mainAssetCode) {
            await sb.from("master_machine").update({ status: "Repair" }).eq("asset_code", mainAssetCode);
          }

          // 6. ส่งการแจ้งเตือน LINE มอบหมายงาน
          try {
            fetch("/api/liff", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "notifyAssign",
                woCode: nextWoCode,
                requestCode: firstReq?.request_code || reqCodes[0],
                assetCode: mainAssetCode,
                assignees: assigneesString,
                dueDate: dueDateStr,
                workorderType: selectedWoType,
                issueDescription: firstReq?.issue_description || "",
                assignedBy: sessionStorage.getItem("userName") || "Administrator"
              })
            }).catch(function() {});
          } catch (_) {}

          return {
            success: true,
            woCode: nextWoCode,
            message: "ออกใบสั่งงานสำเร็จ"
          };
        }

        // 10.1 อัปเดตช่างผู้รับผิดชอบสำหรับ WO Drawer (updateWOAssignees)
        if (method === "updateWOAssignees") {
          const woNo = args[0];
          const names = args[1] || [];
          const ids = args[2] || [];
          const nameStr = (Array.isArray(names) ? names : [names]).join(", ");
          const idStr = (Array.isArray(ids) ? ids : [ids]).join(", ");

          const { error: woErr } = await sb.from("work_orders").update({
            assignee: nameStr,
            assignee_ids: idStr,
            updated_at: new Date().toISOString()
          }).eq("workorder_code", woNo);

          await sb.from("wo_assignees").delete().eq("workorder_code", woNo);
          const newRows = (Array.isArray(names) ? names : [names]).map(n => ({
            workorder_code: woNo,
            assignee_name: n,
            status: "In Progress"
          }));
          if (newRows.length > 0) {
            await sb.from("wo_assignees").insert(newRows);
          }

          return { success: !woErr, message: woErr ? woErr.message : "อัปเดตช่างสำเร็จ" };
        }

        // 10.2 บันทึกปิดงาน/อัปเดตข้อมูลจาก WO Drawer (updateWODrawerData)
        if (method === "updateWODrawerData") {
          const payload = args[0] || {};
          const woNo = payload.woNo;
          const closing = payload.closing || {};

          const updateObj = {
            updated_at: new Date().toISOString()
          };
          if (payload.dueDate) updateObj.due_date = payload.dueDate;
          if (closing.status) updateObj.status = closing.status;
          if (closing.rootCause) updateObj.root_cause = closing.rootCause;
          if (closing.actionTaken) updateObj.action_taken = closing.actionTaken;
          if (closing.workingTime) updateObj.total_working_time = closing.workingTime;
          if (closing.downtime) updateObj.total_down_time = closing.downtime;
          if (closing.startDate) updateObj.start_date = closing.startDate;
          if (closing.endDate) updateObj.end_date = closing.endDate;
          if (closing.status === "Pending Approval" || closing.status === "Completed" || closing.status === "Closed") {
            updateObj.tech_completed_at = new Date().toISOString();
            if (closing.status === "Closed") updateObj.closed_at = new Date().toISOString();
          }

          const { error: wErr } = await sb.from("work_orders").update(updateObj).eq("workorder_code", woNo);

          // อัปเดต work_order_details ตัวแรกด้วย
          if (closing.status || closing.actionTaken) {
            await sb.from("work_order_details").update({
              status: closing.status || "Pending Approval",
              root_cause: closing.rootCause || null,
              action_taken: closing.actionTaken || null,
              measured_value: closing.measuredValue || null,
              working_time: closing.workingTime || null,
              down_time: closing.downtime || null,
              start_date: closing.startDate || null,
              end_date: closing.endDate || null,
              updated_at: new Date().toISOString()
            }).eq("workorder_code", woNo);
          }

          // ส่งแจ้งเตือน LINE เมื่อช่างบันทึกปิดงานเสร็จสิ้น (ส่งให้หัวหน้าอนุมัติ)
          if (closing.status === "Pending Approval" || closing.status === "Completed" || closing.status === "Closed") {
            try {
              fetch("/api/liff", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "notifyTechComplete",
                  woCode: woNo,
                  rootCause: closing.rootCause || "",
                  actionTaken: closing.actionTaken || "",
                  workingTime: Number(closing.workingTime || 0),
                  downTime: Number(closing.downtime || 0),
                  technician: sessionStorage.getItem("userName") || "Technician",
                  completedAt: new Date().toLocaleString("th-TH")
                })
              }).catch(function() {});
            } catch (_) {}
          }

          return { success: !wErr, message: wErr ? wErr.message : "บันทึกสำเร็จ" };
        }

        // 10.3 บันทึกผลลัพธ์ขั้นตอนย่อยของชิ้นส่วน (saveComponentTaskResult)
        if (method === "saveComponentTaskResult") {
          const payload = args[0] || {};
          const woNo = payload.woNo;
          const compCode = payload.componentCode;

          const { error: dErr } = await sb.from("work_order_details").update({
            root_cause: payload.root_cause || null,
            action_taken: payload.action_taken || null,
            measured_value: payload.measured_value || null,
            start_date: payload.start_date || null,
            end_date: payload.end_date || null,
            working_time: payload.working_time || null,
            down_time: payload.down_time || null,
            status: "Completed",
            updated_at: new Date().toISOString()
          }).eq("workorder_code", woNo).eq("component_code", compCode);

          return { success: !dErr, message: dErr ? dErr.message : "บันทึกสำเร็จ" };
        }

        // 10.4 ดึงข้อมูลขั้นตอน Task PM (getTaskListData)
        if (method === "getTaskListData") {
          return {
            steps: [],
            success: true
          };
        }

        // 11. อัปเดตรายละเอียดคำขอแจ้งซ่อม (Update Request Details)
        if (method === "updateRequestDetails") {
          const requestCode = args[0];
          const assetCode = args[1];
          const compCode = args[2];
          const updatedBy = args[3] || sessionStorage.getItem("userName") || "Administrator";

          const { error } = await sb.from("requests").update({
            asset_code: assetCode,
            component_code: compCode === "-" ? null : compCode,
            updated_at: new Date().toISOString(),
            updated_by: updatedBy
          }).eq("request_code", requestCode);

          return { success: !error, message: error ? error.message : "บันทึกการแก้ไขสำเร็จ" };
        }

        // 12. ปฏิเสธคำขอแจ้งซ่อม (Reject Request)
        if (method === "rejectRequest") {
          const requestCode = args[0];
          const reason = args[1] || "-";
          const updatedBy = args[2] || sessionStorage.getItem("userName") || "Administrator";

          const { error } = await sb.from("requests").update({
            status: "Rejected",
            reject_reason: reason,
            updated_at: new Date().toISOString(),
            updated_by: updatedBy
          }).eq("request_code", requestCode);

          return { success: !error, message: error ? error.message : "ปฏิเสธคำขอสำเร็จ" };
        }

        // 13. สร้างคำขอแจ้งซ่อมใหม่ (Add New Request Core)
        if (method === "addNewRequestCore") {
          const formData = args[0] || {};
          const now = new Date();
          const yy = now.getFullYear().toString().slice(-2);
          const mm = String(now.getMonth() + 1).padStart(2, "0");
          const prefix = "REQ" + yy + mm;

          const { data: latestReqs } = await sb.from("requests")
            .select("request_code")
            .ilike("request_code", prefix + "-%")
            .order("request_code", { ascending: false })
            .limit(1);

          let nextSeq = 1;
          if (latestReqs && latestReqs.length > 0) {
            const match = latestReqs[0].request_code.match(/-(\\d+)$/);
            if (match) nextSeq = parseInt(match[1], 10) + 1;
          }
          const nextReqCode = prefix + "-" + String(nextSeq).padStart(4, "0");

          const { error } = await sb.from("requests").insert({
            request_code: nextReqCode,
            request_date: now.toISOString().split("T")[0],
            request_type: formData.request_type || "CM",
            asset_code: formData.asset_code || null,
            component_code: formData.component_code && formData.component_code !== "-" ? formData.component_code : null,
            issue_description: formData.issue_description || "",
            priority: formData.priority || "Normal",
            reporter_by: formData.reporter_by || sessionStorage.getItem("userName") || "Administrator",
            status: "Pending"
          });

          if (!error) {
            try {
              fetch("/api/liff", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "notifyNewRequest",
                  requestCode: nextReqCode,
                  requestDate: now.toISOString().split("T")[0],
                  assetCode: formData.asset_code || null,
                  componentCode: formData.component_code && formData.component_code !== "-" ? formData.component_code : null,
                  issueDescription: formData.issue_description || "",
                  priority: formData.priority || "Normal",
                  reporter: formData.reporter_by || sessionStorage.getItem("userName") || "Administrator"
                })
              }).catch(function() {});
            } catch (_) {}
          }

          return {
            success: !error,
            requestCode: nextReqCode,
            message: error ? error.message : "บันทึกสำเร็จ"
          };
        }

        // Helper ดึงรายการวันหยุดจากเทเบิล holidays
        async function getHolidaysSetFromSb() {
          try {
            const { data } = await sb.from("holidays").select("holiday_date");
            return new Set((data || []).map(function(h) { return h.holiday_date; }).filter(Boolean));
          } catch (_) {
            return new Set();
          }
        }

        function calcWorkingDaysClient(startDate, endDate, holidaySet) {
          if (!startDate || !endDate) return 0;
          const s = new Date(startDate);
          const e = new Date(endDate);
          if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
          const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
          const target = new Date(e.getFullYear(), e.getMonth(), e.getDate());
          if (cur > target) return 0;
          let count = 0;
          while (cur <= target) {
            const day = cur.getDay(); // 0 = Sun, 6 = Sat
            const ymd = cur.toISOString().split("T")[0];
            if (day !== 0 && day !== 6 && (!holidaySet || !holidaySet.has(ymd))) {
              count++;
            }
            cur.setDate(cur.getDate() + 1);
          }
          return Math.max(1, count);
        }

        // 14. ดึงข้อมูลรายละเอียดของ Asset สำหรับ Drawer (คำนวณ KPI จริง)
        if (method === "getAssetDrawerData") {
          const assetCode = args[0];
          const { data: machine } = await sb.from("master_machine").select("*").eq("asset_code", assetCode).maybeSingle();
          const { data: parts } = await sb.from("master_machine").select("*").ilike("asset_code", assetCode + "-%");
          const { data: reqHistory } = await sb.from("requests").select("*").eq("asset_code", assetCode).order("created_at", { ascending: false });
          const { data: woHistory } = await sb.from("work_orders").select("*").eq("asset_code", assetCode).order("created_at", { ascending: false });

          const holidaySet = await getHolidaysSetFromSb();
          const now = new Date();
          let setupDateObj = machine && machine.setup_date ? new Date(machine.setup_date) : (machine && machine.created_at ? new Date(machine.created_at) : new Date(now.getFullYear(), 0, 1));
          const workingDays = calcWorkingDaysClient(setupDateObj, now, holidaySet);
          const dailyHrs = machine && Number(machine.machine_hours) > 0 ? Number(machine.machine_hours) : 8;
          const totalAvailHrs = workingDays * dailyHrs;

          let failures = 0;
          let totalDown = 0;
          (woHistory || []).forEach(function(w) {
            const type = String(w.workorder_type || "").toUpperCase();
            if (!type.includes("PM")) failures++;
            totalDown += Number(w.total_down_time || 0);
          });
          (reqHistory || []).forEach(function(r) {
            const type = String(r.request_type || "").toUpperCase();
            if (!type.includes("PM") && failures === 0) failures++;
          });

          const mtbfDays = failures > 0 ? Math.round(workingDays / failures) : workingDays;
          const mtbfHours = failures > 0 ? Math.round(totalAvailHrs / failures) : totalAvailHrs;
          const downtimePct = totalAvailHrs > 0 ? Math.round((totalDown / totalAvailHrs) * 10000) / 100 : 0;

          return {
            asset: machine || {},
            parts: parts || [],
            maintenanceHistory: reqHistory || [],
            workOrders: woHistory || [],
            kpi: {
              totalAvailableHours: totalAvailHrs,
              workingDays: workingDays,
              machineHoursPerDay: dailyHrs,
              totalDownHours: totalDown,
              downtimePct: downtimePct,
              mtbfDays: mtbfDays,
              mtbfHours: mtbfHours,
              failures: failures,
              setupDate: setupDateObj ? setupDateObj.toISOString().split("T")[0] : "-",
              mtbf: mtbfHours + " hrs",
              mttr: "2.5 hrs",
              availability: (100 - downtimePct).toFixed(1) + "%"
            }
          };
        }

        // 15. ดึงข้อมูล MTBF Data สำหรับ Dashboard Chart
        if (method === "getMTBFData") {
          const filters = args[0] || {};
          try {
            const holidaySet = await getHolidaysSetFromSb();
            let mmQuery = sb.from("master_machine").select("*");
            if (filters.category) mmQuery = mmQuery.ilike("category", "%" + filters.category + "%");
            if (filters.group) mmQuery = mmQuery.ilike("machine_group", "%" + filters.group + "%");
            const { data: mmList } = await mmQuery;

            const parentMachines = (mmList || []).filter(function(m) {
              return m.asset_code && !m.parent_code && m.asset_code.split("-").length <= 2;
            });

            let woQuery = sb.from("work_orders").select("*");
            if (filters.startDate) woQuery = woQuery.gte("workorder_date", filters.startDate);
            if (filters.endDate) woQuery = woQuery.lte("workorder_date", filters.endDate);
            const { data: woList } = await woQuery;

            const failureCount = {};
            (woList || []).forEach(function(wo) {
              const type = String(wo.workorder_type || "").toUpperCase();
              if (type.includes("PM") || type.includes("PREVENT")) return;
              const rawAsset = String(wo.asset_code || "").trim();
              if (!rawAsset || rawAsset === "-") return;
              let parentAsset = rawAsset;
              const segs = rawAsset.split("-");
              if (segs.length >= 3) parentAsset = segs[0] + "-" + segs[1];
              failureCount[parentAsset] = (failureCount[parentAsset] || 0) + 1;
            });

            const now = filters.endDate ? new Date(filters.endDate) : new Date();
            const items = parentMachines.map(function(m) {
              let setupDateObj = m.setup_date ? new Date(m.setup_date) : (m.created_at ? new Date(m.created_at) : new Date(now.getFullYear(), 0, 1));
              const workingDays = calcWorkingDaysClient(setupDateObj, now, holidaySet);
              const machineHours = Number(m.machine_hours) > 0 ? Number(m.machine_hours) : 8;
              const operatingHours = workingDays * machineHours;
              const failures = failureCount[m.asset_code] || 0;
              const mtbf = failures > 0 ? Math.round(workingDays / failures) : workingDays;
              const mtbfHours = failures > 0 ? Math.round(operatingHours / failures) : operatingHours;
              return {
                asset_code: m.asset_code,
                asset_name: m.asset_name || m.asset_code,
                category: m.category || "",
                machine_group: m.machine_group || "",
                install_date: setupDateObj ? setupDateObj.toLocaleDateString("th-TH") : "-",
                days_since_install: workingDays,
                machine_hours: machineHours,
                operating_hours: operatingHours,
                failures: failures,
                mtbf: mtbf,
                mtbf_hours: mtbfHours
              };
            });

            items.sort(function(a, b) {
              if (a.failures > 0 && b.failures === 0) return -1;
              if (a.failures === 0 && b.failures > 0) return 1;
              return a.mtbf - b.mtbf;
            });

            return { status: "success", success: true, items: items };
          } catch (err) {
            console.error("Client bridge getMTBFData error:", err);
            return { status: "error", message: err.message, items: [] };
          }
        }

        // 16. ดึงข้อมูล Downtime Data สำหรับ Dashboard Chart
        if (method === "getDowntimeData") {
          const filters = args[0] || {};
          try {
            const holidaySet = await getHolidaysSetFromSb();
            let mmQuery = sb.from("master_machine").select("*");
            if (filters.category) mmQuery = mmQuery.ilike("category", "%" + filters.category + "%");
            if (filters.group) mmQuery = mmQuery.ilike("machine_group", "%" + filters.group + "%");
            const { data: mmList } = await mmQuery;

            const parentMachines = (mmList || []).filter(function(m) {
              return m.asset_code && !m.parent_code && m.asset_code.split("-").length <= 2;
            });

            let woQuery = sb.from("work_orders").select("*");
            if (filters.startDate) woQuery = woQuery.gte("workorder_date", filters.startDate);
            if (filters.endDate) woQuery = woQuery.lte("workorder_date", filters.endDate);
            const { data: woList } = await woQuery;

            const downtimeMap = {};
            (woList || []).forEach(function(wo) {
              const rawAsset = String(wo.asset_code || "").trim();
              if (!rawAsset || rawAsset === "-") return;
              let parentAsset = rawAsset;
              const segs = rawAsset.split("-");
              if (segs.length >= 3) parentAsset = segs[0] + "-" + segs[1];
              const dt = Number(wo.total_down_time || 0);
              if (dt > 0) {
                downtimeMap[parentAsset] = (downtimeMap[parentAsset] || 0) + dt;
              }
            });

            const now = filters.endDate ? new Date(filters.endDate) : new Date();
            const items = parentMachines.map(function(m) {
              let setupDateObj = m.setup_date ? new Date(m.setup_date) : (m.created_at ? new Date(m.created_at) : new Date(now.getFullYear(), 0, 1));
              const workingDays = calcWorkingDaysClient(setupDateObj, now, holidaySet);
              const machineHours = Number(m.machine_hours) > 0 ? Number(m.machine_hours) : 8;
              const totalAvailableHours = workingDays * machineHours;
              const totalDownHours = downtimeMap[m.asset_code] || 0;
              const downtimePct = totalAvailableHours > 0 ? Math.round((totalDownHours / totalAvailableHours) * 10000) / 100 : 0;

              return {
                asset_code: m.asset_code,
                asset_name: m.asset_name || m.asset_code,
                category: m.category || "",
                machine_group: m.machine_group || "",
                setup_date: setupDateObj ? setupDateObj.toLocaleDateString("th-TH") : "-",
                days_since_setup: workingDays,
                machine_hours: machineHours,
                total_available_hours: totalAvailableHours,
                total_down_hours: Math.round(totalDownHours * 10) / 10,
                downtime_pct: downtimePct
              };
            });

            items.sort(function(a, b) { return b.downtime_pct - a.downtime_pct; });

            return { status: "success", success: true, items: items };
          } catch (err) {
            console.error("Client bridge getDowntimeData error:", err);
            return { status: "error", message: err.message, items: [] };
          }
        }

        // 17. ดึงข้อมูล 10 อันดับใบสั่งงานที่เครื่องหยุดนานที่สุด (Top 10 Downtime Work Orders)
        if (method === "getTopDowntimeWorkOrders") {
          const payload = args[0] || {};
          const limit = Number(payload.limit || 10);
          try {
            let q = sb.from("v_downtime_details").select("*").gt("down_time_minutes", 0);
            if (payload.category && payload.category !== "All") q = q.ilike("category", "%" + payload.category + "%");
            if (payload.group && payload.group !== "All") q = q.ilike("machine_group", "%" + payload.group + "%");
            if (payload.type && payload.type !== "All") q = q.eq("workorder_type", payload.type);
            if (payload.startDate) q = q.gte("workorder_date", payload.startDate);
            if (payload.endDate) q = q.lte("workorder_date", payload.endDate);
            const { data, error } = await q.order("down_time_minutes", { ascending: false }).limit(limit);
            if (!error && data && data.length > 0) {
              const totalSum = data.reduce((acc, cur) => acc + Number(cur.down_time_minutes || 0), 0);
              const items = data.map((d, idx) => ({
                rank: idx + 1,
                workorder_code: d.workorder_code,
                workorder_type: d.workorder_type,
                request_code: d.request_code,
                asset_code: d.asset_code,
                asset_name: d.asset_name,
                department: d.department,
                location: d.location,
                down_time_minutes: Number(d.down_time_minutes || 0),
                down_time_hours: Number(d.down_time_hours || (Number(d.down_time_minutes || 0) / 60)).toFixed(1),
                working_time_minutes: Number(d.working_time_minutes || 0),
                downtime_code: d.downtime_code || "-",
                downtime_name: d.downtime_name || d.downtime_code || "-",
                downtime_category_label: d.downtime_code === "M" ? "กลไก (Mechanical)" :
                                         d.downtime_code === "E" ? "ไฟฟ้า (Electrical)" :
                                         d.downtime_code === "O" ? "ผู้ปฏิบัติงาน (Operational)" :
                                         d.downtime_code === "U" ? "ปัจจัยภายนอก (Uncontrollable)" : (d.downtime_name || "-"),
                root_cause: d.root_cause || "-",
                action_taken: d.action_taken || "-",
                status: d.status || "-",
                assignee: d.assignee || "-",
                workorder_date: d.workorder_date || "-",
                category: d.category || "-",
                machine_group: d.machine_group || "-",
                pct_of_total_downtime: totalSum > 0 ? Math.round((Number(d.down_time_minutes || 0) / totalSum) * 1000) / 10 : 0
              }));
              return { status: "success", success: true, items: items, total: items.length, source: "v_downtime_details" };
            }
            return { status: "success", success: true, items: [], total: 0 };
          } catch (e) {
            console.warn("Client bridge query v_downtime_details error:", e);
            return { status: "error", message: e.message, items: [] };
          }
        }

        // 17.1 ดึงข้อมูล Downtime แยกตามรหัสสาเหตุ (Downtime Code: M, E, O, U)
        if (method === "getDowntimeCodeData") {
          const payload = args[0] || {};
          try {
            let q = sb.from("v_downtime_details").select("downtime_code, downtime_name, down_time_minutes, down_time_hours, category, machine_group, workorder_type, workorder_date").gt("down_time_minutes", 0);
            if (payload.category && payload.category !== "All") q = q.ilike("category", "%" + payload.category + "%");
            if (payload.group && payload.group !== "All") q = q.ilike("machine_group", "%" + payload.group + "%");
            if (payload.type && payload.type !== "All") q = q.eq("workorder_type", payload.type);
            if (payload.startDate) q = q.gte("workorder_date", payload.startDate);
            if (payload.endDate) q = q.lte("workorder_date", payload.endDate);
            const { data, error } = await q;

            const codeStats = {
              M: { code: "M", name: "Mechanical (กลไก/เครื่องกล)", minutes: 0, hours: 0, count: 0, pct: 0, color: "#2563eb" },
              E: { code: "E", name: "Electrical (ระบบไฟฟ้า)", minutes: 0, hours: 0, count: 0, pct: 0, color: "#f59e0b" },
              O: { code: "O", name: "Operational (การใช้งาน)", minutes: 0, hours: 0, count: 0, pct: 0, color: "#8b5cf6" },
              U: { code: "U", name: "Uncontrollable (ภายนอก)", minutes: 0, hours: 0, count: 0, pct: 0, color: "#ef4444" }
            };

            let totalMinutes = 0;
            (data || []).forEach(r => {
              const code = String(r.downtime_code || "").trim().toUpperCase();
              const mins = Number(r.down_time_minutes || 0);
              totalMinutes += mins;
              if (codeStats[code]) {
                codeStats[code].minutes += mins;
                codeStats[code].count++;
              } else if (code) {
                codeStats[code] = { code: code, name: r.downtime_name || code, minutes: mins, hours: 0, count: 1, pct: 0, color: "#64748b" };
              }
            });

            const items = Object.values(codeStats).map(c => {
              c.hours = Math.round((c.minutes / 60) * 10) / 10;
              c.pct = totalMinutes > 0 ? Math.round((c.minutes / totalMinutes) * 1000) / 10 : 0;
              return c;
            });

            return {
              status: "success",
              success: true,
              totalMinutes: totalMinutes,
              totalHours: Math.round((totalMinutes / 60) * 10) / 10,
              items: items
            };
          } catch (e) {
            console.warn("Client bridge getDowntimeCodeData error:", e);
            return { status: "error", message: e.message, items: [], totalMinutes: 0, totalHours: 0 };
          }
        }

        // 17.2 ดึงข้อมูลปฏิทินงานบำรุงรักษาและแนวโน้มรายเดือน (Maintenance Calendar & Monthly Trend)
        if (method === "getMaintenanceCalendarData") {
          const yearArg = args[0] || new Date().getFullYear();
          const year = parseInt(String(yearArg), 10) || new Date().getFullYear();
          const startYear = year + "-01-01";
          const endYear = year + "-12-31";
          try {
            const [woRes, reqRes, mmRes] = await Promise.all([
              sb.from("work_orders")
                .select("workorder_code, request_code, workorder_type, asset_code, workorder_date, created_at, status")
                .gte("workorder_date", startYear)
                .lte("workorder_date", endYear),
              sb.from("requests")
                .select("request_code, asset_code, request_type, request_date, created_at, status")
                .gte("request_date", startYear)
                .lte("request_date", endYear),
              sb.from("master_machine").select("asset_code, asset_name")
            ]);

            const mmMap = {};
            (mmRes.data || []).forEach(m => {
              if (m.asset_code) mmMap[m.asset_code.trim()] = m.asset_name || m.asset_code;
            });

            const events = [];
            const handledWos = new Set();

            (woRes.data || []).forEach(w => {
              const code = (w.workorder_code || "").trim();
              if (code) handledWos.add(code);
              const d = w.workorder_date || (w.created_at ? w.created_at.slice(0, 10) : "");
              if (!d) return;
              events.push({
                date: d,
                requestType: w.workorder_type || "CM",
                reqNo: w.request_code || "-",
                woNo: code,
                woCode: code,
                status: w.status || "In Progress",
                assetCode: w.asset_code || "-",
                assetName: mmMap[(w.asset_code || "").trim()] || w.asset_code || "-"
              });
            });

            (reqRes.data || []).forEach(r => {
              const rCode = (r.request_code || "").trim();
              if (!rCode) return;
              const d = r.request_date || (r.created_at ? r.created_at.slice(0, 10) : "");
              if (!d) return;
              events.push({
                date: d,
                requestType: r.request_type || "CM",
                reqNo: rCode,
                woNo: rCode,
                woCode: rCode,
                status: r.status || "Pending",
                assetCode: r.asset_code || "-",
                assetName: mmMap[(r.asset_code || "").trim()] || r.asset_code || "-"
              });
            });

            return {
              status: "success",
              success: true,
              events: events
            };
          } catch (e) {
            console.warn("Client bridge getMaintenanceCalendarData error:", e);
            return { status: "error", message: e.message, events: [] };
          }
        }

        // 17.3 ดึงข้อมูลค่าใช้จ่าย Dashboard (getDashboardCostData)
        if (method === "getDashboardCostData") {
          try {
            const { data: expenses } = await sb.from("work_order_expenses").select("amount, expense_type");
            let totalWOCost = 0;
            let partsTotal = 0;
            let totalExpenses = 0;
            (expenses || []).forEach(e => {
              const amt = Number(e.amount || 0);
              totalExpenses += amt;
              const typeStr = String(e.expense_type || "").toLowerCase();
              if (typeStr.includes("part") || typeStr.includes("อะไหล่")) {
                partsTotal += amt;
              } else {
                totalWOCost += amt;
              }
            });
            return {
              status: "success",
              success: true,
              totalWOCost: totalWOCost,
              partsTotal: partsTotal,
              totalExpenses: totalExpenses
            };
          } catch (e) {
            return { status: "success", success: true, totalWOCost: 0, partsTotal: 0, totalExpenses: 0 };
          }
        }

        // 18. อัปเดตกำหนดส่ง PM Due
        if (method === "updatePMDueDate") {
          const woCode = args[0];
          const targetDateStr = args[1];
          const { error } = await sb.from("work_orders").update({
            due_date: targetDateStr,
            updated_at: new Date().toISOString()
          }).eq("workorder_code", woCode);

          return { success: !error, message: error ? error.message : "อัปเดตวันกำหนดส่งสำเร็จ" };
        }

        // 18. Fallback สำหรับคำสั่งอื่นๆ: ส่งต่อไปที่ /api/liff หากมี
        try {
          const res = await fetch("/api/liff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: method, payload: args[0] || {} })
          });
          if (!res.ok) {
            return { success: true, status: "success", data: [] };
          }
          const json = await res.json();
          return json;
        } catch (fErr) {
          return { success: true, status: "success", data: [] };
        }
      }
    })();
  </script>
  `;

  // แทนที่ Active -> In Progress และ Queue -> Pending ใน Technician Workload Dashboard
  indexHtml = indexHtml.replace(
    '<div class="wl-stat-box"><div class="wl-stat-label">Active</div><div class="wl-stat-value text-blue-600">',
    '<div class="wl-stat-box"><div class="wl-stat-label">In Progress</div><div class="wl-stat-value text-blue-600">'
  );
  indexHtml = indexHtml.replace(
    '<div class="wl-stat-box"><div class="wl-stat-label">Queue</div><div class="wl-stat-value text-orange-500">',
    '<div class="wl-stat-box"><div class="wl-stat-label">Pending</div><div class="wl-stat-value text-orange-500">'
  );

  // ปรับปรุงปุ่ม menu-toggle ให้มี id, onclick, และ title
  indexHtml = indexHtml.replace(
    /<button\s+class="menu-toggle[^"]*">/i,
    '<button id="menuToggle" class="menu-toggle text-gray-500 hover:text-gray-700 cursor-pointer p-2 rounded-lg hover:bg-gray-100 transition-colors" onclick="toggleSidebar()" title="เปิด/ปิด เมนูด้านข้าง">'
  );

  // เพิ่มฟังก์ชัน toggleSidebar
  indexHtml = indexHtml.replace(
    'function initAppDirect() {',
    `window.toggleSidebar = function() {
      var isMobile = window.innerWidth < 1200;
      var sidebar = document.getElementById("sidebar");
      if (isMobile) {
        if (sidebar) {
          sidebar.classList.toggle("translate-x-0");
        }
        var overlay = document.getElementById("sidebarOverlay");
        if (!overlay) {
          overlay = document.createElement("div");
          overlay.id = "sidebarOverlay";
          overlay.className = "fixed inset-0 bg-black/40 z-40 transition-opacity hidden";
          overlay.onclick = function() { window.toggleSidebar(); };
          document.body.appendChild(overlay);
        }
        if (sidebar && sidebar.classList.contains("translate-x-0")) {
          overlay.classList.remove("hidden");
        } else {
          overlay.classList.add("hidden");
        }
      } else {
        document.body.classList.toggle("sidebar-desktop-collapsed");
      }
    };

    function initAppDirect() {`
  );

  // ให้ showPage ปิด Sidebar บนจอมือถือ และเรียก handleFilterSearch เมื่อเข้า Dashboard
  indexHtml = indexHtml.replace(
    'function showPage(page, element) {',
    `function showPage(page, element) {
      if (window.innerWidth < 1200) {
        var sbEl = document.getElementById("sidebar");
        if (sbEl && sbEl.classList.contains("translate-x-0") && typeof window.toggleSidebar === "function") {
          window.toggleSidebar();
        }
      }`
  );

  indexHtml = indexHtml.replace(
    'if (page === "dashboard") {\n      if (typeof loadDashboardData === "function") loadDashboardData();\n    }',
    `if (page === "dashboard") {
      setTimeout(function() {
        if (typeof handleFilterSearch === "function") handleFilterSearch();
        else if (typeof loadDashboardData === "function") loadDashboardData();
      }, 50);
    }`
  );

  // เรียก handleFilterSearch ใน initAppDirect อัตโนมัติ
  indexHtml = indexHtml.replace(
    'if (typeof initDashboardFilters === "function") {\n          initDashboardFilters();\n        }',
    `if (typeof initDashboardFilters === "function") {
          initDashboardFilters();
        }
        setTimeout(function() {
          if (typeof handleFilterSearch === "function") {
            handleFilterSearch();
          }
        }, 150);`
  );

  // ปรับปรุงการแสดงผลของกราฟ MTBF, Downtime %, และ Downtime Code
  indexHtml = indexHtml.replace(
    'var dashCharts = { trend: null, status: null, top: null, mtbf: null };',
    'var dashCharts = { trend: null, status: null, top: null, mtbf: null, downtime: null, downtimeCode: null };'
  );

  // ปรับปรุง renderMTBFChart
  indexHtml = indexHtml.replace(
    'var labels = items.map(function (it) { return it.asset_name || it.asset_code; });\n    var mtbfValues = items.map(function (it) { return Math.max(0, it.mtbf); });\n    var failureValues = items.map(function (it) { return it.failures; });',
    'var displayItems = (items || []).slice(0, 15);\n    if (badge && items.length > 0) badge.textContent = "เฉลี่ย " + avg.toLocaleString("th-TH") + " วัน (Top " + displayItems.length + " เครื่อง)";\n    var labels = displayItems.map(function (it) { return it.asset_name || it.asset_code; });\n    var mtbfValues = displayItems.map(function (it) { return Math.max(0, it.mtbf); });\n    var failureValues = displayItems.map(function (it) { return it.failures; });'
  );

  // ปรับปรุง renderDowntimeChart
  indexHtml = indexHtml.replace(
    'var labels = items.map(function (it) { return it.asset_name || it.asset_code; });\n    var pctValues = items.map(function (it) { return it.downtime_pct; });\n    var hoursValues = items.map(function (it) { return it.total_down_hours; });',
    'var displayItems = (items || []).slice(0, 15);\n    if (badge && items.length > 0) badge.textContent = "เฉลี่ย " + avgPct.toFixed(1) + "% (Top " + displayItems.length + " เครื่อง)";\n    var labels = displayItems.map(function (it) { return it.asset_name || it.asset_code; });\n    var pctValues = displayItems.map(function (it) { return it.downtime_pct; });\n    var hoursValues = displayItems.map(function (it) { return it.total_down_hours; });'
  );

  // ปรับปรุง renderTopAssetChart ให้แสดงเฉพาะรายการที่มี asset_code (ตัด '-', 'ไม่มี', 'null', 'ไม่ระบุ')
  indexHtml = indexHtml.replace(
    /function renderTopAssetChart\(d\)\s*\{[\s\S]*?if \(dashCharts\.top\) dashCharts\.top\.destroy\(\);/,
    `function renderTopAssetChart(d) {
      var el = document.getElementById("dashTopAssetChart");
      if (!el || typeof Chart === "undefined") return;

      var rawList = Array.isArray(d) ? d : (d && d.repairList ? d.repairList : []);
      var counts = {};
      rawList.forEach(function (r) {
        var code = (r.asset_code || "").trim();
        if (!code || code === "-" || code.startsWith("-") || code === "ไม่มี" || code.toLowerCase() === "null" || code.toLowerCase() === "undefined" || code.toLowerCase() === "ไม่ระบุ" || code.toLowerCase() === "n/a") {
          return;
        }
        var rawName = (r.asset_name || "").trim();
        var name = (rawName && rawName !== "-" && !rawName.startsWith("-") && rawName !== "ไม่มี" && rawName !== "ไม่ระบุ") ? rawName : code;
        counts[name] = (counts[name] || 0) + 1;
      });
      var top = Object.keys(counts)
        .map(function (k) { return { name: k, n: counts[k] }; })
        .sort(function (a, b) { return b.n - a.n; })
        .slice(0, 8);

      if (dashCharts.top) dashCharts.top.destroy();`
  );

  // ปรับปรุง Downtime Section เป็น Grid 2 คอลัมน์: กราฟ Downtime % + กราฟ Downtime Code (M, E, O, U) + ตาราง 10 อันดับใบงานที่เครื่องหยุดนานที่สุด (เต็มความกว้าง)
  const downtimeSectionRegex = /<!--\s*Downtime Chart\s*-->[\s\S]*?<canvas id="dashDowntimeChart"><\/canvas>[\s\S]*?<\/div>\s*<\/div>/i;
  const newDowntimeGrid = `<!-- Downtime & Top 10 Section -->
  <div class="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-4">
    <!-- Left: Downtime % Chart -->
    <div class="dash-panel p-4 sm:p-5 xl:col-span-7 flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between gap-2 mb-1">
          <h3 class="dash-h2"><i class="fa-solid fa-chart-line mr-1" style="color:#dc2626"></i> Downtime % (แยกตามเครื่องจักร)</h3>
          <span class="dash-chip" style="background:rgba(220,38,38,.10);color:#dc2626" id="dashDowntimeBadge">-</span>
        </div>
        <p class="dash-sub">เปอร์เซ็นต์เวลาหยุดเครื่องเทียบกับเวลาเดินเครื่อง — ยิ่งน้อยยิ่งดี</p>
      </div>
      <div class="dash-chart-box mt-2" style="height:320px"><canvas id="dashDowntimeChart"></canvas></div>
    </div>

    <!-- Right: Downtime Code Chart (สัดส่วนตามสาเหตุ M, E, O, U) -->
    <div class="dash-panel p-4 sm:p-5 xl:col-span-5 flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between gap-2 mb-1">
          <h3 class="dash-h2"><i class="fa-solid fa-chart-pie mr-1" style="color:#8b5cf6"></i> Downtime Code (สัดส่วนตามสาเหตุ)</h3>
          <span class="dash-chip" style="background:rgba(139,92,246,.10);color:#8b5cf6;font-weight:700" id="dashDowntimeCodeBadge">-</span>
        </div>
        <p class="dash-sub">วิเคราะห์สาเหตุการหยุดเครื่องจักรตามรหัส M, E, O, U</p>
      </div>
      <div class="dash-chart-box mt-2" style="height:220px"><canvas id="dashDowntimeCodeChart"></canvas></div>
      <!-- Code Badges -->
      <div class="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-[11px]">
        <div class="flex items-center justify-between p-1.5 rounded-lg bg-blue-50/60 border border-blue-100/80">
          <span class="flex items-center gap-1.5 font-semibold text-blue-800"><span class="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>M (กลไก)</span>
          <span class="font-bold text-blue-900" id="dtCodeVal_M">0 ชม. (0%)</span>
        </div>
        <div class="flex items-center justify-between p-1.5 rounded-lg bg-amber-50/60 border border-amber-100/80">
          <span class="flex items-center gap-1.5 font-semibold text-amber-800"><span class="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>E (ไฟฟ้า)</span>
          <span class="font-bold text-amber-900" id="dtCodeVal_E">0 ชม. (0%)</span>
        </div>
        <div class="flex items-center justify-between p-1.5 rounded-lg bg-purple-50/60 border border-purple-100/80">
          <span class="flex items-center gap-1.5 font-semibold text-purple-800"><span class="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block"></span>O (ปฏิบัติงาน)</span>
          <span class="font-bold text-purple-900" id="dtCodeVal_O">0 ชม. (0%)</span>
        </div>
        <div class="flex items-center justify-between p-1.5 rounded-lg bg-rose-50/60 border border-rose-100/80">
          <span class="flex items-center gap-1.5 font-semibold text-rose-800"><span class="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>U (ภายนอก)</span>
          <span class="font-bold text-rose-900" id="dtCodeVal_U">0 ชม. (0%)</span>
        </div>
      </div>
    </div>

    <!-- Row 2: Top 10 Downtime Work Orders (Full Width) -->
    <div class="dash-panel p-4 sm:p-5 xl:col-span-12 flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between gap-2 mb-1">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-rose-50 text-rose-600 font-bold text-sm shadow-xs border border-rose-100">
              <i class="fa-solid fa-fire-flame-curved"></i>
            </div>
            <div>
              <h3 class="dash-h2 text-gray-800 font-bold flex items-center gap-2">
                10 อันดับใบงานที่เครื่องหยุดนานที่สุด
              </h3>
              <p class="dash-sub">Top 10 Work Orders with Longest Downtime (แสดงผลตามตัวกรองที่เลือก)</p>
            </div>
          </div>
          <span class="dash-chip" style="background:rgba(220,38,38,.10);color:#dc2626;font-weight:700" id="dashTopDowntimeBadge">-</span>
        </div>

        <!-- Table Container -->
        <div class="mt-3 overflow-x-auto max-h-[380px] overflow-y-auto border border-slate-100 rounded-xl">
          <table class="w-full text-left border-collapse text-xs">
            <thead class="sticky top-0 bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 z-10">
              <tr>
                <th class="py-2.5 px-3 text-center w-10">#</th>
                <th class="py-2.5 px-3">ใบสั่งงาน / เครื่องจักร</th>
                <th class="py-2.5 px-3">หมวดหมู่ / รหัส</th>
                <th class="py-2.5 px-3">สาเหตุ / อาการเสีย & การแก้ไข</th>
                <th class="py-2.5 px-3 text-right">เวลาหยุดเครื่อง</th>
                <th class="py-2.5 px-3 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody id="topDowntimeTableBody" class="divide-y divide-slate-100">
              <tr>
                <td colspan="6" class="py-8 text-center text-slate-400">
                  <i class="fa-solid fa-spinner fa-spin text-rose-500 mr-2"></i>กำลังโหลดข้อมูล Top 10 Downtime...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`;
  indexHtml = indexHtml.replace(downtimeSectionRegex, newDowntimeGrid);

  // ปรับปรุง loadDowntimeData, loadDowntimeCodeData, renderDowntimeCodeChart, loadTopDowntimeWorkOrders, renderTopDowntimeWorkOrders
  indexHtml = indexHtml.replace(
    /function loadDowntimeData\(filters\)\s*\{[\s\S]*?\.getDowntimeData\(filters\);\s*\}/,
    `function loadDowntimeData(filters) {
    if (!filters) filters = getActiveDashFilters();
    google.script.run
      .withSuccessHandler(function (data) { renderDowntimeChart(data.items || []); })
      .withFailureHandler(function (err) { console.error("Downtime load error:", err); })
      .getDowntimeData(filters);
    loadTopDowntimeWorkOrders(filters);
    loadDowntimeCodeData(filters);
  }

  function loadDowntimeCodeData(filters) {
    if (!filters) filters = getActiveDashFilters();
    google.script.run
      .withSuccessHandler(function (data) { renderDowntimeCodeChart(data); })
      .withFailureHandler(function (err) { console.error("Downtime code error:", err); })
      .getDowntimeCodeData(filters);
  }

  function renderDowntimeCodeChart(res) {
    var el = document.getElementById("dashDowntimeCodeChart");
    var badge = document.getElementById("dashDowntimeCodeBadge");
    if (!el || typeof Chart === "undefined") return;

    var items = (res && res.items) || [];
    var totalHrs = (res && res.totalHours) || 0;
    if (badge) badge.textContent = "รวม " + totalHrs.toFixed(1) + " ชม.";

    (items || []).forEach(function(item) {
      var valEl = document.getElementById("dtCodeVal_" + item.code);
      if (valEl) valEl.textContent = item.hours.toFixed(1) + " ชม. (" + item.pct.toFixed(0) + "%)";
    });

    var labels = items.map(function(it) { return it.name; });
    var dataValues = items.map(function(it) { return it.hours; });
    var bgColors = items.map(function(it) { return it.color; });

    window.dashCharts = window.dashCharts || {};
    var dashCharts = window.dashCharts;
    if (dashCharts.downtimeCode) dashCharts.downtimeCode.destroy();
    dashCharts.downtimeCode = new Chart(el, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: "#ffffff"
        }]
      },
      options: Object.assign({}, chartBase, {
        cutout: "60%",
        plugins: Object.assign({}, chartBase.plugins, {
          legend: { position: "bottom", labels: { font: { size: 10 }, boxWidth: 10, usePointStyle: true } },
          tooltip: Object.assign({}, chartBase.plugins.tooltip, {
            callbacks: {
              label: function(ctx) {
                var it = items[ctx.dataIndex];
                return (it ? it.name : ctx.label) + ": " + ctx.parsed + " ชม. (" + (it ? it.pct.toFixed(1) : 0) + "%)";
              }
            }
          })
        })
      })
    });
  }

  function loadTopDowntimeWorkOrders(filters) {
    if (!filters) filters = getActiveDashFilters();
    var tbody = document.getElementById("topDowntimeTableBody");
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin text-rose-500 mr-2"></i>กำลังโหลดข้อมูล Top 10 Downtime...</td></tr>';
    }
    google.script.run
      .withSuccessHandler(function (data) { renderTopDowntimeWorkOrders((data && data.items) || []); })
      .withFailureHandler(function (err) {
        console.error("Top downtime WO error:", err);
        var tbody = document.getElementById("topDowntimeTableBody");
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="6" class="py-4 text-center text-rose-500">ไม่สามารถโหลดข้อมูลได้</td></tr>';
        }
      })
      .getTopDowntimeWorkOrders(filters);
  }

  function renderTopDowntimeWorkOrders(items) {
    var tbody = document.getElementById("topDowntimeTableBody");
    var badge = document.getElementById("dashTopDowntimeBadge");
    if (badge) badge.textContent = (items ? items.length : 0) + " ใบงาน";
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-slate-400"><i class="fa-solid fa-circle-check text-emerald-500 text-lg mb-1 block"></i>ไม่มีใบงานที่มีเวลาหยุดเครื่องจักรตามเงื่อนไขที่ค้นหา</td></tr>';
      return;
    }

    var html = "";
    items.forEach(function (it, idx) {
      var rank = it.rank || (idx + 1);
      var rankBadge = '<span class="w-6 h-6 rounded-full inline-flex items-center justify-center bg-slate-100 text-slate-600 font-bold text-[11px]">' + rank + '</span>';
      if (rank === 1) {
        rankBadge = '<span class="w-6 h-6 rounded-full inline-flex items-center justify-center bg-gradient-to-tr from-amber-500 to-amber-400 text-white font-black text-[11px] shadow-sm shadow-amber-200">1</span>';
      } else if (rank === 2) {
        rankBadge = '<span class="w-6 h-6 rounded-full inline-flex items-center justify-center bg-gradient-to-tr from-slate-400 to-slate-300 text-white font-bold text-[11px] shadow-sm">2</span>';
      } else if (rank === 3) {
        rankBadge = '<span class="w-6 h-6 rounded-full inline-flex items-center justify-center bg-gradient-to-tr from-amber-700 to-amber-600 text-white font-bold text-[11px] shadow-sm">3</span>';
      }

      var dtHours = Number(it.down_time_hours || (Number(it.down_time_minutes || 0) / 60)).toFixed(1);
      var dtMins = Number(it.down_time_minutes || 0);

      var catLabel = it.downtime_category_label || it.downtime_name || it.downtime_code || "-";
      var catColor = "bg-slate-100 text-slate-700";
      if (it.downtime_code === "M") catColor = "bg-blue-50 text-blue-800 border border-blue-200";
      else if (it.downtime_code === "E") catColor = "bg-amber-50 text-amber-800 border border-amber-200";
      else if (it.downtime_code === "O") catColor = "bg-purple-50 text-purple-800 border border-purple-200";
      else if (it.downtime_code === "U") catColor = "bg-rose-50 text-rose-800 border border-rose-200";

      var statusText = it.status || "-";
      var sc = "bg-slate-100 text-slate-600";
      if (statusText === "Closed" || statusText === "Approved") sc = "bg-emerald-50 text-emerald-700 border border-emerald-200";
      else if (statusText === "In Progress") sc = "bg-blue-50 text-blue-700 border border-blue-200";
      else if (statusText === "Pending Approval") sc = "bg-amber-50 text-amber-700 border border-amber-200";
      else if (statusText === "Pending Acceptance") sc = "bg-purple-50 text-purple-700 border border-purple-200";
      else if (statusText === "Pending") sc = "bg-orange-50 text-orange-700 border border-orange-200";

      var cause = it.root_cause || "-";
      var action = it.action_taken || "";
      var woCode = it.workorder_code || "-";
      var assetName = it.asset_name || it.asset_code || "-";
      var assetCode = it.asset_code || "-";
      var loc = (it.department || it.location || "-");
      var groupName = (it.machine_group || it.category || "-");

      html += '<tr class="hover:bg-slate-50/80 transition-colors cursor-pointer group" onclick="if(typeof openWODrawer===\\'function\\'){openWODrawer(\\'' + woCode + '\\');}">' +
        '<td class="py-2.5 px-3 text-center align-top">' + rankBadge + '</td>' +
        '<td class="py-2.5 px-3 align-top">' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="font-bold text-blue-600 group-hover:text-blue-800 group-hover:underline flex items-center gap-1">' + woCode + ' <i class="fa-solid fa-arrow-up-right-from-square text-[9px] opacity-70"></i></span>' +
            '<span class="text-[10px] px-1.5 py-0.2 rounded font-semibold ' + (it.workorder_type === "BM" ? "bg-red-50 text-red-600 border border-red-200" : "bg-purple-50 text-purple-600 border border-purple-200") + '">' + (it.workorder_type || "CM") + '</span>' +
          '</div>' +
          '<div class="font-medium text-slate-800 text-xs mt-0.5 max-w-[200px] truncate" title="' + assetName + '">' + assetName + '</div>' +
          '<div class="text-[10px] text-slate-400">' + assetCode + ' &bull; ' + loc + '</div>' +
        '</td>' +
        '<td class="py-2.5 px-3 align-top max-w-[150px]">' +
          '<div class="mb-1"><span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ' + catColor + '">' + catLabel + '</span></div>' +
          '<div class="text-[11px] text-slate-500 truncate" title="' + groupName + '">' + groupName + '</div>' +
        '</td>' +
        '<td class="py-2.5 px-3 align-top max-w-[220px]">' +
          '<div class="text-slate-700 text-xs font-medium line-clamp-2" title="' + cause + '">' + cause + '</div>' +
          (action && action !== "-" ? '<div class="text-[11px] text-slate-400 line-clamp-1 mt-0.5" title="' + action + '"><span class="text-slate-500 font-semibold">แก้:</span> ' + action + '</div>' : '') +
        '</td>' +
        '<td class="py-2.5 px-3 align-top text-right whitespace-nowrap">' +
          '<div class="font-extrabold text-rose-600 text-sm">' + dtHours + ' ชม.</div>' +
          '<div class="text-[10px] text-slate-400">' + dtMins.toLocaleString() + ' นาที</div>' +
        '</td>' +
        '<td class="py-2.5 px-3 align-top text-center">' +
          '<span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ' + sc + ' whitespace-nowrap">' + statusText + '</span>' +
          '<div class="text-[10px] text-slate-500 mt-1 max-w-[90px] truncate mx-auto" title="' + (it.assignee || '-') + '">' + (it.assignee || '-') + '</div>' +
        '</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;
  }`
  );

  // กำจัด stray --> ที่ติดมาจาก index.html
  indexHtml = indexHtml.replace("</section>-->", "</section>");

  // กำหนดปุ่ม ปีนี้ ให้ active ตั้งแต่เริ่มต้นใน HTML
  indexHtml = indexHtml.replace(
    'class="dash-quick-date active px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">ทั้งหมด</button>',
    'class="dash-quick-date px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">ทั้งหมด</button>'
  );
  indexHtml = indexHtml.replace(
    'class="dash-quick-date px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">ปีนี้</button>',
    'class="dash-quick-date active px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-600 text-white hover:bg-cyan-700 transition-colors">ปีนี้</button>'
  );

  // ปรับปรุง loadCalendar ให้ดึงปีจากตัวกรองวันที่
  indexHtml = indexHtml.replace(
    'function loadCalendar() {\n    document.getElementById("calYearLabel").textContent = calYear;',
    `function loadCalendar(filters) {
    if (filters && filters.startDate) {
      var py = parseInt(filters.startDate.split("-")[0], 10);
      if (!isNaN(py) && py > 2000) calYear = py;
    }
    var cyl = document.getElementById("calYearLabel");
    if (cyl) cyl.textContent = calYear;`
  );

  // กำหนดตัวแปรสำหรับ Chart ทั้งหมดเพื่อป้องกัน ReferenceError: dashCharts is not defined
  indexHtml = indexHtml.replace(
    "var chartBase = {",
    `window.dashCharts = window.dashCharts || {};
  var dashCharts = window.dashCharts;
  window.DASH_COLORS = window.DASH_COLORS || ["#0e7490", "#059669", "#d97706", "#dc2626", "#8b5cf6", "#ec4899", "#3b82f6", "#64748b", "#f59e0b", "#10b981", "#6366f1"];
  var DASH_COLORS = window.DASH_COLORS;
  window.monthNames = window.monthNames || ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  var monthNames = window.monthNames;
  var chartBase = {`
  );

  // ป้องกัน crash ใน renderTrendChart ถ้า chartYearLabel ไม่มี
  indexHtml = indexHtml.replace(
    'document.getElementById("chartYearLabel").textContent = calYear;',
    `var cylTrend = document.getElementById("chartYearLabel");
    if (cylTrend) cylTrend.textContent = typeof calYear !== "undefined" ? calYear : new Date().getFullYear();`
  );

  // ป้องกัน crash ใน renderStatusChart ถ้า d เป็น null/undefined
  indexHtml = indexHtml.replace(
    'var all = [].concat(d.pmBacklog || [], d.breakdownBacklog || [], d.repairList || []);',
    'var all = [].concat((d && d.pmBacklog) || [], (d && d.breakdownBacklog) || [], (d && d.repairList) || []);'
  );

  // ปรับปรุงการโหลด Dropdown Category และ Group ใน Dashboard และกำหนดค่าเริ่มต้นเป็นปีปัจจุบัน
  const oldDashInitRegex = /document\.addEventListener\("DOMContentLoaded",\s*function\s*\(\)\s*\{[\s\S]*?var fieldsNeeded = \['categories', 'machineGroups'\];[\s\S]*?handleFilterSearch\(\);\s*\}\);/;
  const newDashInit = `function initDashboardFilters() {
    var fieldsNeeded = ['categories', 'machineGroups'];
    if (typeof loadMasterDropdowns === "function") {
      loadMasterDropdowns(fieldsNeeded, function (data) {
        if (data) {
          if (data.machineGroups) setupDropdownOptions('dashboardFilterGroup', data.machineGroups, 'group_id', 'group_name');
          if (data.categories) setupDropdownOptions('dashboardFilterCategory', data.categories, 'category_id', 'category_name');
        }
      });
    }

    // กำหนดค่าเริ่มต้นเป็นปีปัจจุบัน (This Year) เสมอตอนเปิดหน้าครั้งแรกตามความต้องการของผู้ใช้
    var now = new Date();
    var curYear = now.getFullYear();
    if (typeof calYear !== "undefined") {
      calYear = curYear;
    }
    var startEl = document.getElementById("startDate");
    var endEl = document.getElementById("endDate");
    if (startEl && !startEl.value) {
      startEl.value = curYear + "-01-01";
    }
    if (endEl && !endEl.value) {
      endEl.value = curYear + "-12-31";
    }

    // ไฮไลต์ปุ่ม ปีนี้ (this_year)
    document.querySelectorAll(".dash-quick-date").forEach(function(b) {
      var oc = b.getAttribute("onclick") || "";
      if (oc.indexOf("this_year") !== -1) {
        b.classList.add("active", "bg-cyan-600", "text-white");
        b.classList.remove("bg-slate-100", "text-slate-700");
      } else {
        b.classList.remove("active", "bg-cyan-600", "text-white");
        b.classList.add("bg-slate-100", "text-slate-700");
      }
    });
  }

  function runInitialDashboardLoad() {
    initDashboardFilters();
    handleFilterSearch();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runInitialDashboardLoad);
  } else {
    runInitialDashboardLoad();
  }`;
  indexHtml = indexHtml.replace(oldDashInitRegex, newDashInit);

  indexHtml = indexHtml.replace("</head>", `${bridgeScript}\n</head>`);

  // บันทึกไฟล์
  const publicOutPath = path.join(V8_DIR, "public", "cmms.html");
  fs.writeFileSync(publicOutPath, indexHtml, "utf-8");
  console.log(`Saved: ${publicOutPath}`);

  const outDir = path.join(V8_DIR, "out");
  if (fs.existsSync(outDir)) {
    fs.writeFileSync(path.join(outDir, "cmms.html"), indexHtml, "utf-8");
    fs.writeFileSync(path.join(outDir, "index.html"), indexHtml, "utf-8");
    console.log(`Saved: ${path.join(outDir, "index.html")}`);
  }

  console.log("Assembly with LIFF removal completed successfully!");
}

assemble();
