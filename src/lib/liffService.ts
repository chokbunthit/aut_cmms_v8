import { SupabaseClient } from "@supabase/supabase-js";

export interface LiffRequestPayload {
  action: string;
  [key: string]: any;
}

export class LiffService {
  private supabase: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Router กลางสำหรับประมวลผลคำขอตาม action
   */
  async handleAction(action: string, payload: any = {}): Promise<any> {
    switch (action) {
      case "getMachines":
        return await this.getMachines();

      case "createRepairRequest":
        return await this.createRepairRequest(payload);

      case "getTickets":
        return await this.getTickets(payload.userId, payload.status);

      case "getTicketDetail":
        return await this.getTicketDetail(payload.ticketNo || payload.requestCode);

      case "getDashboardStats":
        return await this.getDashboardStats(payload.userId);

      case "getUserProfile":
        return await this.getUserProfile(payload.userId, payload);

      case "updateUserProfile":
        return await this.updateUserProfile(payload.userId, payload);

      case "verifyLiffToken":
        return await this.verifyLiffToken(payload.idToken);

      case "checkUserLogin":
        return await this.checkUserLogin(payload.username, payload.password);

      case "getMyWorkData":
        return await this.getMyWorkData(payload.userName || payload.userId);

      case "getWODrawerData":
        return await this.getWODrawerData(payload.woNo);

      case "saveSubTask":
        return await this.saveSubTask(payload);

      case "closeWorkOrder":
        return await this.closeWorkOrder(payload);

      case "checkManagerRole":
        return await this.checkManagerRole(payload.userId);

      case "getPendingRequests":
        return await this.getPendingRequests();

      case "getAssignees":
      case "getAssigneeMasterData":
        return await this.getAssignees();

      case "assignPendingTask":
        return await this.assignPendingTask(payload);

      case "approveWorkOrder":
        return await this.approveWorkOrder(payload);

      case "acceptRequest":
        return await this.acceptRequest(payload);

      case "updateTicketLifecycle":
        return await this.updateTicketLifecycle(payload.ticketId || payload.requestCode, payload.action, payload);

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }

  /**
   * 1. ดึงข้อมูลเครื่องจักร, ชิ้นส่วน (Components), แผนก และสถานที่
   */
  async getMachines() {
    // 1. ดึง Assets หลักจาก v_parent_assets
    let parentAssets: any[] = [];
    const { data: vAssets, error: vErr } = await this.supabase
      .from("v_parent_assets")
      .select("asset_code, asset_name, department, location, category, machine_group, ranking, image_url")
      .order("asset_code");

    if (!vErr && vAssets && vAssets.length > 0) {
      parentAssets = vAssets.map((m) => ({
        assetCode: m.asset_code,
        asset_code: m.asset_code,
        machineName: m.asset_name,
        asset_name: m.asset_name,
        department: m.department || "",
        location: m.location || "",
        category: m.category || "",
        machine_group: m.machine_group || "",
        ranking: m.ranking || "",
        image_url: m.image_url || ""
      }));
    } else {
      // Fallback ไปที่ master_machine
      const { data: mData } = await this.supabase
        .from("master_machine")
        .select("asset_code, asset_name, department, location, category, machine_group, ranking, image_url")
        .is("part_group", null)
        .order("asset_code");

      parentAssets = (mData || []).map((m) => ({
        assetCode: m.asset_code,
        asset_code: m.asset_code,
        machineName: m.asset_name,
        asset_name: m.asset_name,
        department: m.department || "",
        location: m.location || "",
        category: m.category || "",
        machine_group: m.machine_group || "",
        ranking: m.ranking || "",
        image_url: m.image_url || ""
      }));
    }

    // 2. ดึง Components ย่อย (รายการที่มี part_group)
    const { data: rawComps } = await this.supabase
      .from("master_machine")
      .select("asset_code, description, part_group")
      .not("part_group", "is", null)
      .order("asset_code");

    const components = (rawComps || []).map((c) => {
      const lastHyphen = c.asset_code.lastIndexOf("-");
      const parentCode = lastHyphen > 0 ? c.asset_code.substring(0, lastHyphen) : "";
      return {
        compCode: c.asset_code,
        component_code: c.asset_code,
        compName: c.description || c.part_group || c.asset_code,
        component_name: c.description || c.part_group || c.asset_code,
        assetCode: parentCode,
        parent_asset_code: parentCode
      };
    });

    // 3. ดึงแผนก (Departments)
    const { data: depts } = await this.supabase
      .from("lookup_departments")
      .select("code, name")
      .order("code");

    const formattedDepts = (depts && depts.length > 0)
      ? depts.map((d) => ({ Dept: d.code, deptCode: d.code, Name: d.name, deptName: d.name }))
      : Array.from(new Set(parentAssets.map((a) => a.department).filter(Boolean))).map((d) => ({
          Dept: d,
          deptCode: d,
          Name: d,
          deptName: d
        }));

    // 4. ดึงสถานที่ (Locations)
    const { data: locs } = await this.supabase
      .from("lookup_locations")
      .select("code, name")
      .order("code");

    const formattedLocs = (locs && locs.length > 0)
      ? locs.map((l) => ({ Location: l.name || l.code, Description: l.name, name: l.name }))
      : Array.from(new Set(parentAssets.map((a) => a.location).filter(Boolean))).map((l) => ({
          Location: l,
          Description: l,
          name: l
        }));

    return {
      status: "success",
      data: {
        assets: parentAssets,
        components: components,
        departments: formattedDepts,
        locations: formattedLocs
      }
    };
  }

  /**
   * 2. แจ้งซ่อมใหม่ (Create Repair Request)
   */
  async createRepairRequest(payload: any) {
    const {
      userId,
      displayName,
      assetCode,
      componentCode,
      reqType = "CM",
      priority = "Normal",
      symptom,
      image
    } = payload;

    if (!assetCode) {
      throw new Error("กรุณาระบุรหัสเครื่องจักร (assetCode)");
    }
    if (!symptom) {
      throw new Error("กรุณาระบุอาการเสีย/ปัญหา (symptom)");
    }

    // 1. สร้างเลขที่เอกสาร (เรียก get_next_doc_number หรือ fallback sequence)
    let ticketNo = "";
    try {
      const { data: docNum, error: rpcErr } = await this.supabase.rpc(
        "get_next_doc_number",
        { p_doc_type: reqType || "CM" }
      );
      if (!rpcErr && docNum) {
        ticketNo = docNum;
      }
    } catch (e) {
      console.warn("RPC get_next_doc_number failed, using fallback:", e);
    }

    if (!ticketNo) {
      const yy = new Date().getFullYear().toString().slice(-2);
      const rand = Math.floor(1000 + Math.random() * 9000);
      ticketNo = `${reqType || "CM"}${yy}-${rand}`;
    }

    // 2. จัดการอัปโหลดรูปภาพถ้ามี
    let imageUrl = "";
    if (image && typeof image === "string" && image.startsWith("data:image")) {
      imageUrl = await this.uploadBase64Image(image, `requests/${ticketNo}_${Date.now()}.jpg`);
    } else if (image && typeof image === "string") {
      imageUrl = image;
    }

    // 3. ตรวจสอบหรือ Auto-register ผู้ใช้งานก่อน
    if (userId) {
      await this.ensureUserExists(userId, displayName, payload.pictureUrl);
    }

    // 4. บันทึกข้อมูลลงตาราง requests
    const insertData = {
      request_code: ticketNo,
      request_date: new Date().toISOString().split("T")[0],
      request_type: reqType,
      asset_code: assetCode,
      component_code: componentCode || null,
      issue_description: symptom,
      priority: priority || "Normal",
      issue_image: imageUrl || null,
      reporter_by: userId || null,
      status: "Pending"
    };

    const { data, error } = await this.supabase
      .from("requests")
      .insert([insertData])
      .select()
      .single();

    if (error) {
      throw new Error(`บันทึกข้อมูลแจ้งซ่อมล้มเหลว: ${error.message}`);
    }

    return {
      status: "success",
      ticketNo: ticketNo,
      message: `ส่งข้อมูลแจ้งซ่อมเรียบร้อยแล้ว เลขที่แจ้งซ่อมคือ ${ticketNo}`,
      data: data
    };
  }

  /**
   * 3. ดึงรายการใบแจ้งซ่อม (Tickets)
   */
  async getTickets(userId: string = "", status: string = "") {
    let query = this.supabase
      .from("requests")
      .select(`
        id,
        request_code,
        request_date,
        request_type,
        asset_code,
        component_code,
        issue_description,
        priority,
        issue_image,
        reporter_by,
        status,
        reject_reason,
        workorder_code,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (userId) {
      query = query.eq("reporter_by", userId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: tickets, error } = await query;
    if (error) {
      throw new Error(`ดึงข้อมูลแจ้งซ่อมล้มเหลว: ${error.message}`);
    }

    // ดึงชื่อเครื่องจักรเสริมเพื่อความสมบูรณ์
    const assetCodes = Array.from(new Set((tickets || []).map((t) => t.asset_code).filter(Boolean)));
    const assetMap = new Map<string, any>();
    if (assetCodes.length > 0) {
      const { data: machines } = await this.supabase
        .from("master_machine")
        .select("asset_code, asset_name, department, location")
        .in("asset_code", assetCodes);
      (machines || []).forEach((m) => assetMap.set(m.asset_code, m));
    }

    // จัด Format ข้อมูลให้ตรงกับที่ tracking.html และ dashboard คาดหวัง
    const formatted = (tickets || []).map((t) => {
      const machine = assetMap.get(t.asset_code) || {};
      return {
        id: t.request_code,
        ticketNo: t.request_code,
        requestCode: t.request_code,
        date: t.request_date,
        requestDate: t.request_date,
        reqType: t.request_type,
        assetCode: t.asset_code,
        machineName: machine.asset_name || t.asset_code,
        componentCode: t.component_code || "",
        department: machine.department || "",
        location: machine.location || "",
        symptom: t.issue_description,
        description: t.issue_description,
        priority: t.priority,
        status: t.status,
        requestStatus: t.status,
        workorderStatus: t.workorder_code ? "Assigned" : "Pending",
        workorderCode: t.workorder_code || "",
        rejectReason: t.reject_reason || "",
        image: t.issue_image || "",
        createdAt: t.created_at
      };
    });

    return {
      status: "success",
      data: formatted
    };
  }

  /**
   * 4. ดึงรายละเอียดใบแจ้งซ่อมเดี่ยว (Ticket Detail)
   */
  async getTicketDetail(ticketNo: string) {
    if (!ticketNo) {
      throw new Error("Ticket No is required");
    }

    const { data: ticket, error } = await this.supabase
      .from("requests")
      .select("*")
      .eq("request_code", ticketNo)
      .maybeSingle();

    if (error || !ticket) {
      throw new Error(`ไม่พบข้อมูลใบแจ้งซ่อม ${ticketNo}`);
    }

    let machineInfo: any = {};
    if (ticket.asset_code) {
      const { data: m } = await this.supabase
        .from("master_machine")
        .select("asset_code, asset_name, department, location")
        .eq("asset_code", ticket.asset_code)
        .maybeSingle();
      if (m) machineInfo = m;
    }

    return {
      status: "success",
      data: {
        ticketNo: ticket.request_code,
        requestCode: ticket.request_code,
        date: ticket.request_date,
        reqType: ticket.request_type,
        assetCode: ticket.asset_code,
        machineName: machineInfo.asset_name || ticket.asset_code,
        componentCode: ticket.component_code || "",
        department: machineInfo.department || "",
        location: machineInfo.location || "",
        symptom: ticket.issue_description,
        priority: ticket.priority,
        status: ticket.status,
        image: ticket.issue_image || "",
        reporter: ticket.reporter_by || "",
        workorderCode: ticket.workorder_code || "",
        rejectReason: ticket.reject_reason || "",
        createdAt: ticket.created_at
      }
    };
  }

  /**
   * 5. ดึงข้อมูลสถิติภาพรวมสำหรับ Dashboard (Stats)
   */
  async getDashboardStats(userId: string = "") {
    let query = this.supabase.from("requests").select("status");
    if (userId) {
      query = query.eq("reporter_by", userId);
    }

    const { data, error } = await query;
    if (error) {
      return {
        status: "success",
        data: { total: 0, pending: 0, inProgress: 0, waitingParts: 0, completed: 0 }
      };
    }

    let total = data.length;
    let pending = 0;
    let inProgress = 0;
    let waitingParts = 0;
    let completed = 0;

    data.forEach((row) => {
      const s = (row.status || "").toLowerCase();
      if (s.includes("prog") || s.includes("approval") || s.includes("accept")) {
        inProgress++;
      } else if (s.includes("wait") || s.includes("part")) {
        waitingParts++;
      } else if (s.includes("comp") || s.includes("close")) {
        completed++;
      } else {
        pending++;
      }
    });

    return {
      status: "success",
      data: {
        total,
        pending,
        inProgress,
        waitingParts,
        completed
      }
    };
  }

  /**
   * 6. ดึงข้อมูล Profile ผู้ใช้งาน พร้อม Auto-register หากยังไม่มี
   */
  async getUserProfile(userId: string, profileData: any = {}) {
    if (!userId) {
      return { status: "error", message: "User ID is required" };
    }

    const { data: existingUser, error } = await this.supabase
      .from("users")
      .select("*")
      .eq("line_user_id", userId)
      .maybeSingle();

    if (existingUser) {
      return {
        status: "success",
        data: {
          id: existingUser.id,
          userId: existingUser.line_user_id,
          name: existingUser.name,
          display_name: existingUser.display_name || existingUser.name,
          displayName: existingUser.display_name || existingUser.name,
          pictureUrl: existingUser.picture_url,
          deptCode: existingUser.dept_code || "",
          dept_code: existingUser.dept_code || "",
          empCode: existingUser.emp_code || "",
          emp_code: existingUser.emp_code || "",
          username: existingUser.username || "",
          status: existingUser.status || "Active",
          accessRights: existingUser.role || "user",
          access_rights: existingUser.role || "user"
        },
        isNewUser: false,
        needsProfileUpdate: !existingUser.dept_code
      };
    }

    // หากยังไม่มี -> Auto Register บัญชีใหม่
    const newUser = {
      line_user_id: userId,
      name: profileData.name || profileData.displayName || "ผู้ใช้งาน LINE",
      display_name: profileData.displayName || profileData.name || "ผู้ใช้งาน LINE",
      picture_url: profileData.pictureUrl || null,
      dept_code: profileData.deptCode || "",
      emp_code: profileData.empCode || "",
      role: "user",
      status: "Active"
    };

    const { data: inserted, error: insertErr } = await this.supabase
      .from("users")
      .insert([newUser])
      .select()
      .single();

    if (insertErr) {
      console.warn("Auto-register user error:", insertErr);
    }

    return {
      status: "success",
      data: {
        userId: userId,
        name: newUser.name,
        displayName: newUser.display_name,
        pictureUrl: newUser.picture_url,
        deptCode: newUser.dept_code,
        empCode: newUser.emp_code,
        status: "Active",
        accessRights: "user"
      },
      isNewUser: true,
      needsProfileUpdate: true
    };
  }

  /**
   * 7. บันทึกข้อมูล Profile
   */
  async updateUserProfile(userId: string, payload: any) {
    if (!userId) {
      throw new Error("User ID is required");
    }

    const updateFields: any = {
      updated_at: new Date().toISOString()
    };

    if (payload.name) updateFields.name = payload.name;
    if (payload.displayName) updateFields.display_name = payload.displayName;
    if (payload.deptCode) updateFields.dept_code = payload.deptCode;
    if (payload.empCode) updateFields.emp_code = payload.empCode;
    if (payload.pictureUrl) updateFields.picture_url = payload.pictureUrl;
    if (payload.email) updateFields.email = payload.email;

    const { data, error } = await this.supabase
      .from("users")
      .update(updateFields)
      .eq("line_user_id", userId)
      .select()
      .maybeSingle();

    if (error) {
      throw new Error(`อัปเดตโปรไฟล์ล้มเหลว: ${error.message}`);
    }

    return {
      status: "success",
      message: "บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว",
      data: data
    };
  }

  /**
   * 8. ตรวจสอบ Verify LINE Token
   */
  async verifyLiffToken(idToken: string) {
    if (!idToken) {
      return { status: "error", message: "Missing idToken" };
    }

    try {
      const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          id_token: idToken,
          client_id: "2011076529-EKhCiseU" // LINE LIFF ID หรือ Channel ID
        })
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        return { status: "error", message: json.error_description || "Invalid Token" };
      }

      return { status: "success", data: json };
    } catch (e: any) {
      return { status: "error", message: e.message };
    }
  }

  /**
   * 9. ตรวจสอบการ Login สำหรับช่างหรือผู้ดูแล (Username / Password)
   */
  async checkUserLogin(username: string, password: string) {
    if (!username || !password) {
      return { status: "error", message: "กรุณาระบุ Username และ Password" };
    }

    const { data: user, error } = await this.supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .maybeSingle();

    if (error || !user) {
      return { status: "error", message: "ไม่พบชื่อผู้ใช้งานนี้ในระบบ" };
    }

    // ตรวจสอบรหัสผ่าน (รองรับทั้ง Plaintext ในช่วงเริ่มต้น หรือ SHA-256)
    let isMatch = false;
    if (user.password_hash) {
      const hashed = await this.sha256(password);
      isMatch = user.password_hash === hashed || user.password_hash === password;
    } else {
      isMatch = true; // default fallback if no password_hash set
    }

    if (!isMatch) {
      return { status: "error", message: "รหัสผ่านไม่ถูกต้อง" };
    }

    return {
      status: "success",
      data: {
        userId: user.line_user_id,
        name: user.name,
        displayName: user.display_name,
        role: user.role,
        accessRights: user.role,
        deptCode: user.dept_code,
        empCode: user.emp_code
      }
    };
  }

  /**
   * 10. ดึงรายการงานที่ได้รับมอบหมายของช่าง (Technician My Work)
   */
  async getMyWorkData(userName: string = "") {
    let query = this.supabase
      .from("work_orders")
      .select(`
        id,
        workorder_code,
        workorder_type,
        request_code,
        asset_code,
        component_code,
        description,
        priority,
        status,
        scheduled_start_date,
        due_date,
        actual_start_at,
        actual_finish_at,
        created_at
      `)
      .order("created_at", { ascending: false });

    const { data: orders, error } = await query;
    if (error) {
      console.warn("getMyWorkData error:", error);
      return { status: "success", data: [] };
    }

    // ดึงข้อมูลเครื่องจักรเสริม
    const assetCodes = Array.from(new Set((orders || []).map((o) => o.asset_code).filter(Boolean)));
    const assetMap = new Map<string, any>();
    if (assetCodes.length > 0) {
      const { data: machines } = await this.supabase
        .from("master_machine")
        .select("asset_code, asset_name, department, location")
        .in("asset_code", assetCodes);
      (machines || []).forEach((m) => assetMap.set(m.asset_code, m));
    }

    const formatted = (orders || []).map((o) => {
      const machine = assetMap.get(o.asset_code) || {};
      return {
        id: o.workorder_code,
        reqNo: o.request_code || "-",
        woNo: o.workorder_code,
        woType: o.workorder_type,
        assignedDate: o.scheduled_start_date || o.created_at?.split("T")[0] || "",
        dueDate: o.due_date || "",
        workType: o.workorder_type === "PM" ? "บำรุงรักษาเชิงป้องกัน (PM)" : "งานซ่อมแก้ไข (CM)",
        priority: o.priority,
        status: o.status,
        asset_code: o.asset_code,
        asset_name: machine.asset_name || o.asset_code,
        equipment: o.component_code || "-",
        equipment_code: o.component_code || "-",
        task_no: "TASK-01",
        pm_type: o.workorder_type === "PM" ? "Scheduled" : "-",
        location: machine.location || "-",
        department_name: machine.department || "-"
      };
    });

    return {
      status: "success",
      data: formatted
    };
  }

  /**
   * 11. ดึงรายละเอียดใบงานสำหรับ Drawer / Detail View (PM / CM / BM)
   */
  async getWODrawerData(woNo: string) {
    if (!woNo) throw new Error("woNo is required");

    const { data: wo, error } = await this.supabase
      .from("work_orders")
      .select("*")
      .eq("workorder_code", woNo)
      .maybeSingle();

    if (error || !wo) {
      throw new Error(`ไม่พบใบงาน ${woNo}`);
    }

    // ดึงเครื่องจักร
    let machine: any = {};
    if (wo.asset_code) {
      const { data: m } = await this.supabase
        .from("master_machine")
        .select("*")
        .eq("asset_code", wo.asset_code)
        .maybeSingle();
      if (m) machine = m;
    }

    // ดึง subtasks จาก work_order_details
    const { data: details } = await this.supabase
      .from("work_order_details")
      .select("*")
      .eq("workorder_code", woNo)
      .order("task_no");

    const tasks = (details && details.length > 0)
      ? details.map((d) => ({
          taskId: d.id,
          task_no: d.task_no,
          taskName: d.task_name,
          status: d.status,
          remarks: d.completion_remarks || "",
          photoEvidence: d.photo_evidence || ""
        }))
      : [
          {
            taskId: "T-01",
            task_no: "TASK-01",
            taskName: wo.description || "ตรวจสอบและดำเนินการแก้ไข",
            status: wo.status,
            remarks: "",
            photoEvidence: ""
          }
        ];

    return {
      status: "success",
      wo: {
        woNo: wo.workorder_code,
        woType: wo.workorder_type,
        reqNo: wo.request_code || "-",
        status: wo.status,
        priority: wo.priority,
        assetCode: wo.asset_code,
        assetName: machine.asset_name || wo.asset_code,
        location: machine.location || "-",
        department: machine.department || "-",
        description: wo.description,
        dueDate: wo.due_date || "",
        createdDate: wo.created_at?.split("T")[0] || ""
      },
      tasks: tasks,
      parts: []
    };
  }

  /**
   * 12. บันทึกผล SubTask
   */
  async saveSubTask(payload: any) {
    const { taskId, task_no, woNo, status = "Completed", remarks = "", photo } = payload;
    let photoUrl = "";
    if (photo && photo.startsWith("data:image")) {
      photoUrl = await this.uploadBase64Image(photo, `subtasks/${woNo}_${task_no || taskId}_${Date.now()}.jpg`);
    }

    if (taskId && taskId.length === 36) {
      await this.supabase
        .from("work_order_details")
        .update({
          status: status,
          completion_remarks: remarks,
          photo_evidence: photoUrl || undefined
        })
        .eq("id", taskId);
    }

    return {
      status: "success",
      message: "บันทึก Task ย่อยสำเร็จ",
      taskId: taskId || task_no,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * 13. ปิดใบงานทั้งใบ (Close Work Order)
   */
  async closeWorkOrder(payload: any) {
    const { woNo, remarks = "", photoAfter = "" } = payload;
    if (!woNo) throw new Error("woNo is required");

    let afterUrl = "";
    if (photoAfter && photoAfter.startsWith("data:image")) {
      afterUrl = await this.uploadBase64Image(photoAfter, `wo_close/${woNo}_${Date.now()}.jpg`);
    }

    const { error } = await this.supabase
      .from("work_orders")
      .update({
        status: "Completed",
        actual_finish_at: new Date().toISOString(),
        photo_after: afterUrl || undefined
      })
      .eq("workorder_code", woNo);

    if (error) {
      throw new Error(`ปิดใบงานไม่สำเร็จ: ${error.message}`);
    }

    return {
      status: "success",
      message: "ปิดใบงานเรียบร้อยแล้ว",
      woNo: woNo,
      closedAt: new Date().toISOString()
    };
  }

  /**
   * 14. ดึงขั้นตอนการปฏิบัติงาน Task List สำหรับงาน PM (PM Steps)
   */
  async getTaskListData(taskNo: string, pmType: string = "") {
    if (!taskNo) {
      return { status: "success", groupName: "", pmType: pmType, steps: [] };
    }

    const { data: steps, error } = await this.supabase
      .from("master_task_steps")
      .select("*")
      .order("step_number");

    if (error || !steps || steps.length === 0) {
      return {
        status: "success",
        groupName: taskNo,
        pmType: pmType,
        steps: [
          { step: 1, desc: "ตรวจสอบความเรียบร้อยทั่วไปของชิ้นส่วน", standard: "ไม่มีรอยแตกหรือชำรุด" },
          { step: 2, desc: "ทำความสะอาดและตรวจสอบจุดยึด", standard: "ขันแน่นตามสเปก สะอาด" },
          { step: 3, desc: "ทดสอบการทำงานเบื้องต้น", standard: "ทำงานปกติ ไม่มีเสียงดังผิดปกติ" }
        ]
      };
    }

    return {
      status: "success",
      groupName: taskNo,
      pmType: pmType,
      steps: steps.map((s) => ({
        step: s.step_number,
        desc: s.step_description,
        standard: s.standard || ""
      }))
    };
  }

  /**
   * 15. ตรวจสอบสิทธิ์ Manager
   */
  async checkManagerRole(userId: string) {
    if (!userId) return { success: false, isManager: false, message: "User ID is required" };
    const { data: user } = await this.supabase
      .from("users")
      .select("role")
      .eq("line_user_id", userId)
      .maybeSingle();

    const role = (user?.role || "").toLowerCase();
    const isManager = ["manager", "supervisor", "lead", "admin"].includes(role);
    return {
      success: true,
      isManager,
      role: role || "user"
    };
  }

  /**
   * 16. ดึงรายการงานค้าง (Pending Requests & Pending Approvals)
   */
  async getPendingRequests() {
    // 1. งานค้างที่รอจ่ายงาน (Pending)
    const { data: pending } = await this.supabase
      .from("requests")
      .select("*")
      .in("status", ["Pending", "In Progress", "Waiting Parts"])
      .is("workorder_code", null)
      .order("created_at", { ascending: false });

    // ดึงข้อมูลชื่อเครื่องจักรเสริม
    const assetCodes = Array.from(new Set((pending || []).map((p) => p.asset_code).filter(Boolean)));
    const assetMap = new Map<string, any>();
    if (assetCodes.length > 0) {
      const { data: machines } = await this.supabase
        .from("master_machine")
        .select("asset_code, asset_name, department, location")
        .in("asset_code", assetCodes);
      (machines || []).forEach((m) => assetMap.set(m.asset_code, m));
    }

    const pendingRequests = (pending || []).map((p) => {
      const machine = assetMap.get(p.asset_code) || {};
      return {
        id: p.request_code,
        request_code: p.request_code,
        request_date: p.request_date,
        request_type: p.request_type,
        asset_code: p.asset_code,
        machine_name: machine.asset_name || p.asset_code,
        component_code: p.component_code || "",
        component_description: p.component_code || "",
        issue_desc: p.issue_description,
        issue_description: p.issue_description,
        priority: p.priority,
        status: p.status,
        issue_image: p.issue_image || "",
        reporter_name: p.reporter_by || "ผู้แจ้ง",
        reporter_by: p.reporter_by || "",
        created_at: p.created_at
      };
    });

    // 2. งานที่รอหัวหน้าอนุมัติ (Pending Approval)
    const { data: approvals } = await this.supabase
      .from("work_orders")
      .select("*")
      .eq("status", "Pending Approval")
      .order("created_at", { ascending: false });

    const pendingApprovals = (approvals || []).map((wo) => ({
      id: wo.workorder_code,
      wo_no: wo.workorder_code,
      wo_code: wo.workorder_code,
      wo_type: wo.workorder_type,
      request_code: wo.request_code || "-",
      asset_code: wo.asset_code,
      description: wo.description,
      priority: wo.priority,
      status: wo.status,
      photo_before: wo.photo_before || "",
      photo_after: wo.photo_after || ""
    }));

    return {
      success: true,
      count: pendingRequests.length,
      data: pendingRequests,
      pendingRequests: pendingRequests,
      pendingApprovals: pendingApprovals
    };
  }

  /**
   * 17. ดึงรายชื่อช่างและผู้รับเหมา (Assignees)
   */
  async getAssignees() {
    const { data: techs } = await this.supabase
      .from("technicians")
      .select("*")
      .eq("is_active", true);

    const { data: vens } = await this.supabase
      .from("vendors")
      .select("*")
      .eq("is_active", true);

    const formattedTechs = (techs || []).map((t) => ({
      id: t.id,
      user_id: t.user_id,
      name: t.name,
      skill: t.skill || "",
      level: t.level || "",
      activeTasks: 0
    }));

    const formattedVens = (vens || []).map((v) => ({
      id: v.id,
      vendor_id: v.vendor_id,
      name: v.company_name,
      contact: v.contact_person || "",
      service_type: v.service_type || ""
    }));

    return {
      success: true,
      data: {
        technicians: formattedTechs,
        vendors: formattedVens
      }
    };
  }

  /**
   * 18. มอบหมายงานและสร้าง Work Order (Assign Pending Task)
   */
  async assignPendingTask(payload: any) {
    const {
      requestCode,
      assignees = [],
      assigneeType = "technician",
      dueDays = 1,
      workorderType = "CM",
      assignedBy = "Manager"
    } = payload;

    if (!requestCode) {
      return { success: false, message: "requestCode is required" };
    }

    // 1. สร้างเลข Work Order
    let woCode = "";
    try {
      const { data: docNum } = await this.supabase.rpc("get_next_doc_number", {
        p_doc_type: workorderType || "WO"
      });
      if (docNum) woCode = docNum;
    } catch (e) {
      console.warn("RPC get_next_doc_number error:", e);
    }

    if (!woCode) {
      const yy = new Date().getFullYear().toString().slice(-2);
      const rand = Math.floor(1000 + Math.random() * 9000);
      woCode = `WO${yy}-${rand}`;
    }

    // 2. ดึงข้อมูล Request ต้นทาง
    const { data: reqData } = await this.supabase
      .from("requests")
      .select("*")
      .eq("request_code", requestCode)
      .maybeSingle();

    // 3. คำนวณวัน Due Date
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Number(dueDays));
    const dueDateStr = dueDate.toISOString().split("T")[0];

    // 4. บันทึก Work Order
    const { error: woErr } = await this.supabase.from("work_orders").insert([
      {
        workorder_code: woCode,
        workorder_type: workorderType,
        request_code: requestCode,
        asset_code: reqData?.asset_code || null,
        component_code: reqData?.component_code || null,
        description: reqData?.issue_description || "ซ่อมตามใบแจ้ง",
        priority: reqData?.priority || "Normal",
        status: "In Progress",
        scheduled_start_date: new Date().toISOString().split("T")[0],
        due_date: dueDateStr
      }
    ]);

    if (woErr) {
      return { success: false, message: `สร้าง Work Order ไม่สำเร็จ: ${woErr.message}` };
    }

    // 5. บันทึก Assignees
    if (Array.isArray(assignees) && assignees.length > 0) {
      const assigneeRows = assignees.map((name) => ({
        workorder_code: woCode,
        technician_name: name,
        status: "In Progress"
      }));
      await this.supabase.from("wo_assignees").insert(assigneeRows);
    }

    // 6. อัปเดตสถานะ Request
    await this.supabase
      .from("requests")
      .update({
        status: "In Progress",
        workorder_code: woCode,
        updated_at: new Date().toISOString(),
        updated_by: assignedBy
      })
      .eq("request_code", requestCode);

    return {
      success: true,
      woCode: woCode,
      message: `ออกใบสั่งงาน ${woCode} สำเร็จ`
    };
  }

  /**
   * 19. หัวหน้าช่างกด Approve งาน
   */
  async approveWorkOrder(payload: any) {
    const { woNo, approvedBy = "", notes = "" } = payload;
    if (!woNo) throw new Error("woNo is required");

    // อัปเดต Work Order
    await this.supabase
      .from("work_orders")
      .update({
        status: "Approved",
        updated_at: new Date().toISOString()
      })
      .eq("workorder_code", woNo);

    // อัปเดต Request ที่ผูกกันให้อยู่ในสถานะ 'Pending Acceptance' (รอผู้แจ้งรับงาน)
    await this.supabase
      .from("requests")
      .update({
        status: "Pending Acceptance",
        updated_at: new Date().toISOString()
      })
      .eq("workorder_code", woNo);

    return {
      status: "success",
      success: true,
      message: `อนุมัติใบงาน ${woNo} เรียบร้อยแล้ว`
    };
  }

  /**
   * 20. ผู้แจ้งกดรับงานและให้คะแนนความพึงพอใจ
   */
  async acceptRequest(payload: any) {
    const { requestCode, score = 5, feedback = "", acceptedBy = "" } = payload;
    if (!requestCode) throw new Error("requestCode is required");

    // ปิด Request
    await this.supabase
      .from("requests")
      .update({
        status: "Closed",
        accepted_at: new Date().toISOString(),
        satisfaction_score: Number(score),
        satisfaction_feedback: feedback || null,
        updated_at: new Date().toISOString(),
        updated_by: acceptedBy
      })
      .eq("request_code", requestCode);

    return {
      status: "success",
      success: true,
      message: `บันทึกการรับงาน ${requestCode} เรียบร้อยแล้ว`
    };
  }

  /**
   * 21. ปรับสถานะวงจรชีวิตงาน (Update Ticket Lifecycle)
   */
  async updateTicketLifecycle(ticketId: string, action: string, payload: any = {}) {
    if (!ticketId) throw new Error("ticketId is required");

    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (payload.status) updateData.status = payload.status;
    if (payload.rejectReason) updateData.reject_reason = payload.rejectReason;

    await this.supabase
      .from("requests")
      .update(updateData)
      .eq("request_code", ticketId);

    return {
      success: true,
      status: "success",
      message: `อัปเดตสถานะงาน ${ticketId} เป็น ${action} สำเร็จ`
    };
  }

  /* ==========================================================================
     HELPERS & UTILITIES
     ========================================================================== */

  private async ensureUserExists(userId: string, displayName?: string, pictureUrl?: string) {
    try {
      const { data: existing } = await this.supabase
        .from("users")
        .select("id")
        .eq("line_user_id", userId)
        .maybeSingle();

      if (!existing) {
        await this.supabase.from("users").insert([
          {
            line_user_id: userId,
            name: displayName || "ผู้ใช้งาน LINE",
            display_name: displayName || "ผู้ใช้งาน LINE",
            picture_url: pictureUrl || null,
            role: "user",
            status: "Active"
          }
        ]);
      }
    } catch (e) {
      console.warn("ensureUserExists error:", e);
    }
  }

  private async uploadBase64Image(dataUrl: string, filePath: string): Promise<string> {
    try {
      const parts = dataUrl.split(";base64,");
      const contentType = parts[0].replace("data:", "") || "image/jpeg";
      const base64Data = parts[1];

      // Convert Base64 to Uint8Array
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { data, error } = await this.supabase.storage
        .from("cmms-images")
        .upload(filePath, bytes, {
          contentType: contentType,
          upsert: true
        });

      if (error) {
        console.warn("Supabase storage upload error:", error.message);
        return dataUrl;
      }

      const { data: publicData } = this.supabase.storage
        .from("cmms-images")
        .getPublicUrl(filePath);

      return publicData?.publicUrl || dataUrl;
    } catch (err) {
      console.warn("Failed to process base64 image:", err);
      return dataUrl;
    }
  }

  private async sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}
