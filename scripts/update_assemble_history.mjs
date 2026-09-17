import fs from "fs";
import path from "path";

const scriptPath = path.resolve("scripts/assemble_v6_page.mjs");
let code = fs.readFileSync(scriptPath, "utf8");

// 1. Add Event Listener for btn-nav-history in directInitScript
const oldNavBlock = `        // เพิ่ม Event ให้เมนู Technician Workload Dashboard โหลดข้อมูลอัตโนมัติ
        const techNavBtn = document.getElementById("btn-nav-technician");
        if (techNavBtn) {
          techNavBtn.addEventListener("click", function() {
            setTimeout(function() {
              if (typeof loadWorkloadDashboard === "function") {
                loadWorkloadDashboard();
              }
            }, 100);
          });
        }`;

const newNavBlock = `        // เพิ่ม Event ให้เมนู Technician Workload Dashboard โหลดข้อมูลอัตโนมัติ
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
        }`;

code = code.replace(oldNavBlock, newNavBlock);

// 2. Replace method 6 (getWorkHistoryData)
const oldHistoryRegex = /\/\/ 6\. ดึงข้อมูลประวัติการซ่อม \(History\)[\s\S]*?\/\/ 7\. ดึงรายละเอียด Work Order สำหรับ Drawer/;

const newHistoryBlock = `// 6. ดึงข้อมูลประวัติการซ่อม (History)
        if (method === "getWorkHistoryData") {
          try {
            const filters = args[0] || {};
            const filterStart = filters.startDate ? new Date(filters.startDate + "T00:00:00").getTime() : 0;
            const filterEnd = filters.endDate ? new Date(filters.endDate + "T23:59:59").getTime() : 0;
            const filterAsset = filters.asset_code ? String(filters.asset_code).trim().toLowerCase() : "";
            const filterComp = filters.component_code ? String(filters.component_code).trim().toLowerCase() : "";
            const filterType = filters.type ? String(filters.type).trim().toUpperCase() : "ALL";
            const filterCat = filters.category ? String(filters.category).trim().toLowerCase() : "";

            const [mmRes, woRes, reqRes, detailRes, expRes] = await Promise.all([
              sb.from("master_machine").select("*"),
              sb.from("work_orders").select("*"),
              sb.from("requests").select("*"),
              sb.from("work_order_details").select("*"),
              sb.from("work_order_expenses").select("*")
            ]);

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
                reporter_by: reqInfo.reporter_by || reqInfo.reporter_name || "-",
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

        // 7. ดึงรายละเอียด Work Order สำหรับ Drawer`;

code = code.replace(oldHistoryRegex, newHistoryBlock);

fs.writeFileSync(scriptPath, code, "utf8");
console.log("Successfully updated getWorkHistoryData in scripts/assemble_v6_page.mjs");
