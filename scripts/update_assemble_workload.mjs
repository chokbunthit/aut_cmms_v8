import fs from "fs";
import path from "path";

const scriptPath = path.resolve("scripts/assemble_v6_page.mjs");
let code = fs.readFileSync(scriptPath, "utf8");

// 1. Remove workorder_js from skipped list
code = code.replace(
  `      "my_work_js",
      "workorder_js",
      "spareparts_modal",`,
  `      "my_work_js",
      "spareparts_modal",`
);

// 2. Add event listener for Technician Dashboard button in directInitScript
const oldInitTarget = `        // เปิดหน้า Dashboard ทันที
        const dashBtn = document.getElementById("btn-nav-dashboard");
        if (typeof showPage === "function") {
          showPage('dashboard', dashBtn);
        }`;

const newInitTarget = `        // เปิดหน้า Dashboard ทันที
        const dashBtn = document.getElementById("btn-nav-dashboard");
        if (typeof showPage === "function") {
          showPage('dashboard', dashBtn);
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
        }`;

code = code.replace(oldInitTarget, newInitTarget);

// 3. Replace method 4 (getWorkloadDashboardData) and method 7 (getWODrawerData)
const oldWorkloadAndDrawerRegex = /\/\/ 4\. ดึงข้อมูลภาระงานช่าง \(Workload Dashboard\)[\s\S]*?\/\/ 8\. ดึงข้อมูล Master Data สำหรับ Dropdown/;

const newWorkloadAndDrawer = `// 4. ดึงข้อมูลภาระงานช่าง (Workload Dashboard)
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
          const { data: closedReqs } = await sb.from("requests").select("*").order("created_at", { ascending: false });
          return {
            success: true,
            items: closedReqs || [],
            categories: ["FA", "CNC", "CONV", "HYD"],
            last_sync: new Date().toLocaleTimeString("th-TH")
          };
        }

        // 7. ดึงรายละเอียด Work Order สำหรับ Drawer
        if (method === "getWODrawerData") {
          const woNo = args[0];
          const { data: wo } = await sb.from("work_orders").select("*").eq("workorder_code", woNo).maybeSingle();
          const { data: details } = await sb.from("work_order_details").select("*").eq("workorder_code", woNo);
          const { data: req } = await sb.from("requests").select("*").eq("request_code", wo?.request_code || "").maybeSingle();
          const { data: asset } = await sb.from("master_machine").select("*").eq("asset_code", wo?.asset_code || "").maybeSingle();
          const { data: rawAssignees } = await sb.from("wo_assignees").select("*").eq("workorder_code", woNo);

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
              reporter_name: req?.reporter_by || req?.reporter_name || "System",
              requesterName: req?.reporter_by || req?.reporter_name || "System",
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

        // 8. ดึงข้อมูล Master Data สำหรับ Dropdown`;

code = code.replace(oldWorkloadAndDrawerRegex, newWorkloadAndDrawer);

// 4. Update method 9 (add getTechnicianList alias)
code = code.replace(
  'if (method === "getAssigneeMasterData" || method === "getAssignees") {',
  'if (method === "getAssigneeMasterData" || method === "getAssignees" || method === "getTechnicianList") {'
);

// 5. Add updateWOAssignees, updateWODrawerData, getTaskListData, saveComponentTaskResult handlers
const addHandlers = `
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
          if (closing.status === "Completed" || closing.status === "Closed") {
            updateObj.tech_completed_at = new Date().toISOString();
            if (closing.status === "Closed") updateObj.closed_at = new Date().toISOString();
          }

          const { error: wErr } = await sb.from("work_orders").update(updateObj).eq("workorder_code", woNo);

          // อัปเดต work_order_details ตัวแรกด้วย
          if (closing.status || closing.actionTaken) {
            await sb.from("work_order_details").update({
              status: closing.status || "Completed",
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
        }`;

code = code.replace(
  `return {
            success: true,
            woCode: nextWoCode,
            message: "ออกใบสั่งงานสำเร็จ"
          };
        }`,
  `return {
            success: true,
            woCode: nextWoCode,
            message: "ออกใบสั่งงานสำเร็จ"
          };
        }
${addHandlers}`
);

fs.writeFileSync(scriptPath, code, "utf8");
console.log("Successfully updated scripts/assemble_v6_page.mjs");
