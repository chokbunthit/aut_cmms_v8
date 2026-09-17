import { SupabaseClient } from "@supabase/supabase-js";
import { LineService } from "./lineService";

export interface LiffRequestPayload {
  action: string;
  [key: string]: any;
}

export class LiffService {
  private supabase: SupabaseClient;
  public lineService: LineService;

  constructor(
    supabaseClient: SupabaseClient,
    lineToken?: string,
    lineTargetId?: string
  ) {
    this.supabase = supabaseClient;
    this.lineService = new LineService(lineToken, lineTargetId, supabaseClient);
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

      case "getLookupDowntimeCodes":
      case "getDowntimeCodes":
        return await this.getLookupDowntimeCodes();

      case "getTopDowntimeWorkOrders":
        return await this.getTopDowntimeWorkOrders(payload);

      case "getDowntimeData":
        return await this.getDowntimeData(payload);

      case "getDowntimeCodeData":
        return await this.getDowntimeCodeData(payload);

      case "getMaintenanceCalendarData":
        return await this.getMaintenanceCalendarData(payload?.year || payload);

      case "checkManagerRole":
        return await this.checkManagerRole(payload.userId);

      case "getPendingRequests":
        return await this.getPendingRequests();

      case "getAssignees":
      case "getAssigneeMasterData":
        return await this.getAssignees();

      case "assignPendingTask":
      case "generateBulkWorkOrder":
        return await this.generateBulkWorkOrder(payload);

      case "updateRequestDetails":
        return await this.updateRequestDetails(payload);

      case "rejectRequest":
        return await this.rejectRequest(payload);

      case "addNewRequestCore":
        return await this.addNewRequestCore(payload);

      case "approveWorkOrder":
        return await this.approveWorkOrder(payload);

      case "acceptRequest":
        return await this.acceptRequest(payload);

      case "notifyNewRequest":
        return await this.lineService.sendNewRequestNotification(payload);

      case "notifyAssign":
      case "notifyAssignWork":
        return await this.lineService.sendAssignWorkNotification(payload);

      case "notifyTechComplete":
        return await this.lineService.sendTechCompletedNotification(payload);

      case "notifyLeadApprove":
        return await this.lineService.sendLeadApprovedNotification(payload);

      case "notifyPMClosed":
        return await this.lineService.sendPMClosedNotification(payload);

      case "notifyUserAccepted":
        return await this.lineService.sendUserAcceptedNotification(payload);

      case "uploadImage":
      case "uploadBase64Image":
        return await this.handleUploadImageAction(payload);

      case "getMTBFData":
        return await this.getMTBFData(payload);

      case "getDepartments":
      case "loadMasterDataFromSheet": {
        const [deptRes, locRes, catRes, grpRes] = await Promise.all([
          this.supabase.from("lookup_departments").select("*"),
          this.supabase.from("lookup_locations").select("*"),
          this.supabase.from("lookup_categories").select("*").eq("is_active", true).order("code"),
          this.supabase.from("lookup_machine_groups").select("*").eq("is_active", true).order("code")
        ]);

        const depts = (deptRes.data || []).map((d: any) => ({
          ...d,
          Dept: d.dept_code || d.code || d.name,
          Name: d.dept_name || d.name || d.code
        }));
        const locs = locRes.data || [];
        const categories = (catRes.data || []).map((c: any) => ({
          ...c,
          category_id: c.code,
          category_name: c.name,
          code: c.code,
          name: c.name
        }));
        const machineGroups = (grpRes.data || []).map((g: any) => ({
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

      case "checkAndSyncEquipmentCache":
      case "getCachedEquipmentData":
        return await this.getMachines();

      case "saveEquipmentToProperties":
        return { status: "success", success: true, message: "OK" };

      default:
        console.warn(`Fallback for unhandled action: ${action}`);
        return { status: "success", success: true, data: [], message: `Action ${action} handled by fallback` };
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

    let finalAssetCode = String(assetCode || "").trim();
    let finalComponentCode = componentCode && String(componentCode).trim() !== "-" ? String(componentCode).trim() : null;

    // ตรวจสอบความถูกต้อง: หาก finalAssetCode เป็นรหัสชิ้นส่วน (Component) ให้แยก Parent Asset และ Component
    try {
      const { data: compCheck } = await this.supabase
        .from("master_machine")
        .select("asset_code, part_group")
        .eq("asset_code", finalAssetCode)
        .not("part_group", "is", null)
        .maybeSingle();

      if (compCheck) {
        if (!finalComponentCode) {
          finalComponentCode = finalAssetCode;
        }
        const lastHyphen = finalAssetCode.lastIndexOf("-");
        if (lastHyphen > 0) {
          finalAssetCode = finalAssetCode.substring(0, lastHyphen);
        }
      }
    } catch (e) {
      console.warn("Component check error in createRepairRequest:", e);
    }

    // 1. สร้างเลขที่เอกสาร (เรียก get_next_doc_number หรือ fallback sequence)
    const yy = new Date().getFullYear().toString().slice(-2);
    const docPrefix = `${reqType || "CM"}${yy}-`;
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

    // ตรวจสอบว่า ticketNo ซ้ำกับที่มีอยู่แล้วในฐานข้อมูลหรือไม่
    let isDuplicate = false;
    if (ticketNo) {
      const { data: existingTicket } = await this.supabase
        .from("requests")
        .select("request_code")
        .eq("request_code", ticketNo)
        .maybeSingle();
      if (existingTicket) {
        isDuplicate = true;
      }
    }

    // หากไม่มี ticketNo หรือพบว่า ticketNo ซ้ำ ให้ค้นหาเลขล่าสุดจากตาราง requests แล้วรันต่อ
    if (!ticketNo || isDuplicate) {
      const { data: latestReqs } = await this.supabase
        .from("requests")
        .select("request_code")
        .ilike("request_code", `${docPrefix}%`)
        .order("request_code", { ascending: false })
        .limit(20);

      let maxSeq = 0;
      if (latestReqs && latestReqs.length > 0) {
        for (const req of latestReqs) {
          const match = req.request_code.match(/-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxSeq) maxSeq = num;
          }
        }
      }
      ticketNo = `${docPrefix}${String(maxSeq + 1).padStart(4, "0")}`;
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

    // 4. บันทึกข้อมูลลงตาราง requests (พร้อมระบบตรวจจับและ Retry หากชนรหัสซ้ำ)
    let data: any = null;
    let saved = false;
    let attempts = 0;
    let lastError: any = null;
    let finalInsertData: any = null;

    while (!saved && attempts < 3) {
      attempts++;
      finalInsertData = {
        request_code: ticketNo,
        request_date: new Date().toISOString().split("T")[0],
        request_type: reqType,
        asset_code: finalAssetCode,
        component_code: finalComponentCode || null,
        issue_description: symptom,
        priority: priority || "Normal",
        issue_image: imageUrl || null,
        reporter_by: userId || null,
        status: "Pending"
      };

      const res = await this.supabase
        .from("requests")
        .insert([finalInsertData])
        .select()
        .single();

      if (res.error) {
        lastError = res.error;
        if (
          res.error.code === "23505" ||
          res.error.message.includes("unique constraint") ||
          res.error.message.includes("duplicate key")
        ) {
          console.warn(`Ticket code collision detected for ${ticketNo}, retrying with next sequence...`);
          const { data: latestReqs } = await this.supabase
            .from("requests")
            .select("request_code")
            .ilike("request_code", `${docPrefix}%`)
            .order("request_code", { ascending: false })
            .limit(20);

          let maxSeq = 0;
          if (latestReqs && latestReqs.length > 0) {
            for (const req of latestReqs) {
              const match = req.request_code.match(/-(\d+)$/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxSeq) maxSeq = num;
              }
            }
          }
          ticketNo = `${docPrefix}${String(maxSeq + 1).padStart(4, "0")}`;
          continue;
        }
        throw new Error(`บันทึกข้อมูลแจ้งซ่อมล้มเหลว: ${res.error.message}`);
      }

      saved = true;
      data = res.data;
    }

    if (!saved) {
      throw new Error(`บันทึกข้อมูลแจ้งซ่อมล้มเหลว: ${lastError?.message || "ไม่สามารถสร้างเลขที่เอกสารที่ไม่ซ้ำกันได้"}`);
    }

    // ส่งการแจ้งเตือน LINE: รายการแจ้งซ่อมใหม่
    try {
      await this.lineService.sendNewRequestNotification({
        requestCode: ticketNo,
        requestDate: finalInsertData?.request_date || new Date().toISOString().split("T")[0],
        assetCode: finalAssetCode,
        componentCode: finalComponentCode,
        issueDescription: symptom,
        priority: priority || "Normal",
        imageUrl: imageUrl,
        reporter: displayName || userId,
        reporter_by: userId
      });
    } catch (lineErr) {
      console.warn("LINE notification error in createRepairRequest:", lineErr);
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
  private async sha256(str: string): Promise<string> {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    return str;
  }

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
    let isManager = false;
    let targetUserId = String(userName || "").trim();
    let targetUserName = "";
    let targetDisplayName = "";

    // ตรวจสอบสิทธิ์ผู้ใช้หากส่ง userId หรือ username เข้ามา
    if (targetUserId && targetUserId !== "all") {
      const { data: u } = await this.supabase
        .from("users")
        .select('id, name, display_name, role, line_user_id, "access rights"')
        .or(`line_user_id.eq.${targetUserId},name.eq.${targetUserId},display_name.eq.${targetUserId}`)
        .maybeSingle();

      if (u) {
        targetUserId = u.line_user_id || u.id;
        targetUserName = u.name || "";
        targetDisplayName = u.display_name || "";
        const role = String(u.role || u["access rights"] || "").toLowerCase();
        if (role.includes("manager") || role.includes("admin") || role.includes("supervisor") || role.includes("หัวหน้า")) {
          isManager = true;
        }
      }
    } else {
      isManager = true;
    }

    // 1. ดึงข้อมูล work_orders ทั้งหมดตามสคีมาจริงใน Supabase
    const { data: orders, error } = await this.supabase
      .from("work_orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("getMyWorkData error:", error);
      return { status: "success", data: [] };
    }

    // 2. ดึงข้อมูล requests ที่เกี่ยวข้องเพื่อดึง issue_description, priority, component_code
    const reqCodes = Array.from(new Set((orders || []).map((o) => o.request_code).filter(Boolean)));
    const reqMap = new Map<string, any>();
    if (reqCodes.length > 0) {
      const { data: reqs } = await this.supabase
        .from("requests")
        .select("request_code, issue_description, priority, component_code, reporter_by")
        .in("request_code", reqCodes);
      (reqs || []).forEach((r) => reqMap.set(r.request_code, r));
    }

    // 3. ดึงข้อมูลเครื่องจักรเสริม
    const assetCodes = Array.from(new Set((orders || []).map((o) => o.asset_code).filter(Boolean)));
    const assetMap = new Map<string, any>();
    if (assetCodes.length > 0) {
      const { data: machines } = await this.supabase
        .from("master_machine")
        .select("asset_code, asset_name, department, location")
        .in("asset_code", assetCodes);
      (machines || []).forEach((m) => assetMap.set(m.asset_code, m));
    }

    // 4. ดึงข้อมูล wo_assignees เพื่อตรวจสอบการมอบหมายช่าง
    const woCodes = (orders || []).map((o) => o.workorder_code).filter(Boolean);
    const { data: assignees } = await this.supabase
      .from("wo_assignees")
      .select("*")
      .in("workorder_code", woCodes);

    const assigneesByWo = new Map<string, any[]>();
    (assignees || []).forEach((a) => {
      const list = assigneesByWo.get(a.workorder_code) || [];
      list.push(a);
      assigneesByWo.set(a.workorder_code, list);
    });

    // 5. กรองงานตามช่าง (หากไม่ใช่ Manager หรือ "all")
    let filteredOrders = orders || [];
    if (!isManager && targetUserId && targetUserId !== "all") {
      filteredOrders = filteredOrders.filter((o) => {
        const assName = String(o.assignee || "").trim();
        const assIds = String(o.assignee_ids || "").trim();
        if (targetUserId && assIds.includes(targetUserId)) return true;
        if (targetUserName && assName.includes(targetUserName)) return true;
        if (targetDisplayName && assName.includes(targetDisplayName)) return true;
        if (userName && (assName.includes(userName) || assIds.includes(userName))) return true;

        const woAss = assigneesByWo.get(o.workorder_code) || [];
        return woAss.some((a) => {
          const n = String(a.assignee_name || "").trim();
          return (
            (targetUserName && n.includes(targetUserName)) ||
            (targetDisplayName && n.includes(targetDisplayName)) ||
            (userName && n.includes(userName))
          );
        });
      });
    }

    const formatted = filteredOrders.map((o) => {
      const machine = assetMap.get(o.asset_code) || {};
      const req = reqMap.get(o.request_code) || {};
      return {
        id: o.workorder_code,
        reqNo: o.request_code || "-",
        woNo: o.workorder_code,
        woType: o.workorder_type || "CM",
        assignedDate: o.workorder_date || o.start_date || o.created_at?.split("T")[0] || "",
        dueDate: o.due_date || "",
        workType: (o.workorder_type || "").toUpperCase().includes("PM") ? "บำรุงรักษาเชิงป้องกัน (PM)" : "งานซ่อมแก้ไข (CM)",
        priority: req.priority || "Normal",
        status: o.status || "In Progress",
        asset_code: o.asset_code || "-",
        asset_name: machine.asset_name || o.asset_code || "-",
        equipment: req.component_code || "-",
        equipment_code: req.component_code || "-",
        task_no: "TASK-01",
        pm_type: (o.workorder_type || "").toUpperCase().includes("PM") ? "Scheduled" : "-",
        location: machine.location || "-",
        department_name: machine.department || "-",
        description: req.issue_description || "-",
        assignee: o.assignee || "-",
        assignee_ids: o.assignee_ids || ""
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

    // ดึงข้อมูล Request ต้นทาง
    let req: any = {};
    if (wo.request_code) {
      const { data: r } = await this.supabase
        .from("requests")
        .select("*")
        .eq("request_code", wo.request_code)
        .maybeSingle();
      if (r) req = r;
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
            taskName: req.issue_description || "ตรวจสอบและดำเนินการแก้ไข",
            status: wo.status,
            remarks: "",
            photoEvidence: ""
          }
        ];

    const firstDetail = (details && details.length > 0) ? details[0] : {};
    const closingForm = {
      rootCause: firstDetail.root_cause || req.issue_description || "",
      actionTaken: firstDetail.action_taken || firstDetail.completion_remarks || "",
      workTimeMinutes: Number(firstDetail.working_time || wo.total_working_time || 30),
      downtimeMinutes: Number(firstDetail.down_time || wo.total_down_time || 0),
      downtimeCode: firstDetail.downtime_code || wo.downtime_code || "",
      spareParts: "",
      photoBefore: firstDetail.image_before || wo.image_before || "",
      photoAfter: firstDetail.image_result || firstDetail.photo_evidence || wo.image_result || wo.photo_after || "",
      requestCreatedAt: req.created_at || wo.created_at || "",
      requestDate: req.request_date || "",
      startDate: firstDetail.start_date || wo.start_date || "",
      endDate: firstDetail.end_date || wo.end_date || wo.tech_completed_at || ""
    };

    return {
      status: "success",
      wo: {
        woNo: wo.workorder_code,
        woType: wo.workorder_type || "CM",
        reqNo: wo.request_code || "-",
        status: wo.status,
        priority: req.priority || "Normal",
        assetCode: wo.asset_code || "-",
        assetName: machine.asset_name || wo.asset_code || "-",
        location: machine.location || "-",
        department: machine.department || "-",
        description: req.issue_description || "-",
        dueDate: wo.due_date || "",
        createdDate: wo.created_at?.split("T")[0] || ""
      },
      request: req,
      components: (details && details.length > 0) ? details : tasks,
      tasks: tasks,
      closingForm: closingForm,
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
   * 13. ปิดใบงานทั้งใบ (Close Work Order) บันทึกลง work_orders และ work_order_details (Supabase)
   */
  async closeWorkOrder(payload: any) {
    const {
      woNo,
      remarks = "",
      photoAfter = "",
      photoBefore = "",
      rootCause = "",
      actionTaken = "",
      workTimeMinutes = 0,
      downtimeMinutes = 0,
      downtimeCode = "",
      spareParts = "",
      endDate = "",
      repairDate = "",
      repairTime = ""
    } = payload;
    if (!woNo) throw new Error("woNo is required");

    let finalEndDate = endDate;
    if (!finalEndDate && repairDate && repairTime) {
      finalEndDate = `${repairDate}T${repairTime}:00`;
    }
    if (!finalEndDate) {
      finalEndDate = new Date().toISOString();
    }

    let afterUrl = "";
    if (photoAfter && photoAfter.startsWith("data:image")) {
      afterUrl = await this.uploadBase64Image(photoAfter, `wo_close/${woNo}_after_${Date.now()}.jpg`);
    }

    let beforeUrl = "";
    if (photoBefore && photoBefore.startsWith("data:image")) {
      beforeUrl = await this.uploadBase64Image(photoBefore, `wo_close/${woNo}_before_${Date.now()}.jpg`);
    }

    // 1. อัปเดต work_orders
    const woUpdateData: any = {
      status: "Pending Approval",
      end_date: finalEndDate,
      tech_completed_at: finalEndDate,
      image_result: afterUrl || undefined,
      image_before: beforeUrl || undefined,
      root_cause: rootCause || undefined,
      action_taken: actionTaken || remarks || undefined,
      total_working_time: Number(workTimeMinutes) || undefined,
      total_down_time: Number(downtimeMinutes) || undefined
    };
    Object.keys(woUpdateData).forEach((k) => woUpdateData[k] === undefined && delete woUpdateData[k]);

    const { error: woErr } = await this.supabase
      .from("work_orders")
      .update(woUpdateData)
      .eq("workorder_code", woNo);

    if (woErr) {
      console.warn("Update work_orders warning:", woErr.message);
    }

    // 2. อัปเดต work_order_details (บันทึก downtime_code, root_cause, action_taken, down_time, working_time, end_date)
    // หมายเหตุ: คอลัมน์ downtime_code ใน work_order_details เก็บเป็นตัวอักษรของรหัส เช่น 'M', 'E', 'O', 'U' (varchar(1))
    const cleanDowntimeCode = (downtimeCode && String(downtimeCode).trim().length > 0)
      ? String(downtimeCode).trim().substring(0, 1)
      : undefined;

    const detailUpdateData: any = {
      status: "Pending Approval",
      root_cause: rootCause || undefined,
      action_taken: actionTaken || remarks || undefined,
      working_time: Number(workTimeMinutes) || undefined,
      down_time: Number(downtimeMinutes) || undefined,
      downtime_code: cleanDowntimeCode,
      end_date: finalEndDate,
      image_result: afterUrl || undefined,
      image_before: beforeUrl || undefined
    };
    Object.keys(detailUpdateData).forEach((k) => detailUpdateData[k] === undefined && delete detailUpdateData[k]);

    try {
      const { error: detailErr } = await this.supabase
        .from("work_order_details")
        .update(detailUpdateData)
        .eq("workorder_code", woNo);

      if (detailErr) {
        console.warn("Update work_order_details failed, trying workorder_details:", detailErr.message);
        await this.supabase
          .from("workorder_details")
          .update(detailUpdateData)
          .eq("workorder_code", woNo);
      }
    } catch (detailCatchErr) {
      console.warn("Exception updating work_order_details:", detailCatchErr);
    }

    // ส่งการแจ้งเตือน LINE: ช่างซ่อมเสร็จสิ้น (Pending Approval - รอหัวหน้าอนุมัติ)
    try {
      await this.lineService.sendTechCompletedNotification({
        woCode: woNo,
        rootCause: rootCause,
        actionTaken: actionTaken || remarks,
        workingTime: Number(workTimeMinutes || 0),
        downTime: Number(downtimeMinutes || 0),
        downtimeCode: downtimeCode,
        imageUrl: afterUrl,
        technician: payload.technician || payload.closedBy || payload.userName || "Technician",
        completedAt: new Date().toLocaleString("th-TH")
      });
    } catch (lineErr) {
      console.warn("LINE notification error in closeWorkOrder:", lineErr);
    }

    return {
      status: "success",
      message: "บันทึกผลการปฏิบัติงานเรียบร้อยแล้ว (รอหัวหน้าช่างอนุมัติ)",
      woNo: woNo,
      downtimeCode: downtimeCode,
      closedAt: new Date().toISOString()
    };
  }

  /**
   * ดึงรายการรหัสหยุดทำงาน (Lookup Downtime Codes) จากตาราง lookup_downtime_code ใน Supabase
   */
  async getLookupDowntimeCodes() {
    try {
      let { data, error } = await this.supabase
        .from("lookup_downtime_code")
        .select("*");

      if (error) {
        console.warn("lookup_downtime_code fetch warning:", error.message);
        const fallbackRes = await this.supabase.from("lookup_downtime_codes").select("*");
        if (!fallbackRes.error && fallbackRes.data) {
          data = fallbackRes.data;
        } else {
          return { status: "success", data: [] };
        }
      }

      const list = (data || [])
        .map((row: any) => {
          const code = String(row.downtime_code || row.code || row.id || "").trim();
          const name = String(row.downtime_name || row.name || row.description || row.desc || "").trim();
          const category = String(row.category || row.type || row.group || "").trim();
          return {
            code: code,
            name: name,
            category: category,
            label: name && name !== code ? `${code} - ${name}` : code
          };
        })
        .filter((item: any) => item.code);

      return {
        status: "success",
        data: list
      };
    } catch (err: any) {
      console.error("getLookupDowntimeCodes error:", err);
      return { status: "error", message: err.message, data: [] };
    }
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
    const cleanId = String(userId).trim();
    const { data: user } = await this.supabase
      .from("users")
      .select('id, line_user_id, name, display_name, dept_code, picture_url, role, "access rights"')
      .or(`line_user_id.eq.${cleanId},line_user_id.ilike.%${cleanId}%,username.eq.${cleanId},name.eq.${cleanId},display_name.eq.${cleanId}`)
      .maybeSingle();

    const role = (user?.role || "").toLowerCase();
    const accessRights = (user?.["access rights"] || "").toLowerCase();
    const isManager =
      ["manager", "supervisor", "lead", "admin"].includes(role) ||
      ["manager", "supervisor", "lead", "admin"].includes(accessRights) ||
      role.includes("ผู้จัดการ") ||
      role.includes("หัวหน้า") ||
      accessRights.includes("admin") ||
      accessRights.includes("manager");

    return {
      success: true,
      isManager,
      role: user?.role || user?.["access rights"] || "user",
      user: user
        ? {
            userId: user.line_user_id?.trim() || cleanId,
            userName: user.name || user.display_name || cleanId,
            displayName: user.display_name || user.name || cleanId,
            deptCode: user.dept_code || "",
            pictureUrl: user.picture_url || "",
            role: user.role || user["access rights"] || "user",
            accessRights: user["access rights"] || user.role || "user"
          }
        : null
    };
  }

  /**
   * 16. ดึงรายการงานค้าง (Pending Requests & Pending Approvals)
   */
  async getPendingRequests() {
    // 1. งานค้างที่รอจ่ายงาน (Pending)
        const { data: pending, error: pErr } = await this.supabase
      .from("requests")
      .select("*")
      .in("status", ["Pending", "In Progress"])
      .is("workorder_code", null)
      .order("created_at", { ascending: false });

    if (pErr) {
      console.error("getPendingRequests fetch error:", pErr);
    }

    // ดึงข้อมูลเครื่องจักรประกอบ
    const assetCodes = Array.from(new Set((pending || []).map((p) => p.asset_code).filter(Boolean)));
    const assetMap = new Map<string, any>();
    if (assetCodes.length > 0) {
      const { data: machines } = await this.supabase
        .from("master_machine")
        .select("asset_code, asset_name, department, location")
        .in("asset_code", assetCodes);
      (machines || []).forEach((m) => assetMap.set(m.asset_code, m));
    }

    // ดึงข้อมูลผู้แจ้งซ่อม (Reporter Names)
    const reporterIds = Array.from(new Set((pending || []).map((p) => p.reporter_by).filter(Boolean)));
    const reporterMap = new Map<string, string>();
    if (reporterIds.length > 0) {
      const { data: users } = await this.supabase
        .from("users")
        .select("id, line_user_id, name, display_name");
      (users || []).forEach((u) => {
        const name = u.display_name || u.name || "";
        if (u.id) reporterMap.set(u.id, name);
        if (u.line_user_id) reporterMap.set(u.line_user_id.trim(), name);
      });
    }

    const pendingRequests = (pending || []).map((p) => {
      const machine = assetMap.get(p.asset_code) || {};
      const reporterDisplay = (p.reporter_by && reporterMap.get(p.reporter_by.trim())) || p.reporter_by || "ผู้แจ้ง";
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
        reporter_name: reporterDisplay,
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
      pendingApprovals: pendingApprovals,
      pendingApprovalCount: pendingApprovals.length
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

    const { data: activeWos } = await this.supabase
      .from("wo_assignees")
      .select("assignee_name")
      .eq("status", "In Progress");

    const counts: Record<string, number> = {};
    (activeWos || []).forEach((w: any) => {
      if (w.assignee_name) counts[w.assignee_name] = (counts[w.assignee_name] || 0) + 1;
    });

    const formattedTechs = (techs || []).map((t) => ({
      id: t.id,
      user_id: t.user_id || t.id,
      name: t.name,
      skill: t.skill || "",
      level: t.level || "",
      activeTasks: counts[t.name] || 0,
      pending_count: counts[t.name] || 0
    }));

    const formattedVens = (vens || []).map((v) => ({
      id: v.id,
      vendor_id: v.vendor_id || v.id,
      name: v.company_name,
      contact: v.contact_person || "",
      service_type: v.service_type || "",
      activeTasks: 0,
      pending_count: 0
    }));

    return {
      success: true,
      data: {
        technicians: formattedTechs,
        vendors: formattedVens
      },
      technicians: formattedTechs,
      vendors: formattedVens
    };
  }

  /**
   * 18. ออกใบสั่งงาน (Generate Bulk / Single Work Order)
   */
  async generateBulkWorkOrder(payload: any) {
    const requestCodes =
      payload.requestCodes ||
      payload.request_codes ||
      payload.requestCode ||
      payload.codes ||
      [];
    const assignees = payload.assignees || [];
    const dueDays = Number(payload.dueDays ?? 1);
    const assigneeType = payload.assigneeType || "INTERNAL";
    const assigneeIds = payload.assigneeIds || [];
    const selectedWoType = payload.selectedWoType || payload.workorderType || "CM";
    const assignedBy = payload.assignedBy || "Administrator";

    const reqCodes = (Array.isArray(requestCodes) ? requestCodes : [requestCodes])
      .map((r) => (typeof r === "object" ? r.request_code : r))
      .filter(Boolean);

    if (reqCodes.length === 0) {
      return { success: false, message: "ไม่มีรายการคำขอที่เลือก" };
    }

    const now = new Date();
    const yy = now.getFullYear().toString().slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `WO${yy}${mm}`;

    const { data: latestWos } = await this.supabase
      .from("work_orders")
      .select("workorder_code")
      .ilike("workorder_code", `${prefix}-%`)
      .order("workorder_code", { ascending: false })
      .limit(1);

    let nextSeq = 1;
    if (latestWos && latestWos.length > 0) {
      const match = latestWos[0].workorder_code.match(/-(\d+)$/);
      if (match) nextSeq = parseInt(match[1], 10) + 1;
    }
    const nextWoCode = `${prefix}-${String(nextSeq).padStart(4, "0")}`;

    const todayStr = now.toISOString().split("T")[0];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);
    const dueDateStr = dueDate.toISOString().split("T")[0];

    const { data: reqList } = await this.supabase
      .from("requests")
      .select("*")
      .in("request_code", reqCodes);

    const reqMap = new Map<string, any>();
    (reqList || []).forEach((r) => reqMap.set(r.request_code, r));
    const firstReq = reqList && reqList.length > 0 ? reqList[0] : null;
    const mainAssetCode = firstReq?.asset_code || null;

    const assigneeList = Array.isArray(assignees) ? assignees : (assignees ? [assignees] : []);
    const assigneesString = assigneeList.map((a) => (typeof a === "object" ? a.name : String(a))).join(", ");
    const assigneeIdList = Array.isArray(assigneeIds) ? assigneeIds : (assigneeIds ? [assigneeIds] : []);
    const assigneeIdsString = assigneeIdList.join(", ");

    // 1. work_orders
    const { error: woErr } = await this.supabase.from("work_orders").insert([
      {
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
      }
    ]);

    if (woErr) {
      return { success: false, message: `สร้าง Work Order ไม่สำเร็จ: ${woErr.message}` };
    }

    // 2. work_order_details
    const detailRows = reqCodes.map((rc, idx) => {
      const r = reqMap.get(rc) || {};
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
      await this.supabase.from("work_order_details").insert(detailRows);
    }

    // 3. wo_assignees
    if (assigneeList.length > 0) {
      const assRows = assigneeList.map((a) => ({
        workorder_code: nextWoCode,
        assignee_name: typeof a === "object" ? a.name : String(a).trim(),
        status: "In Progress"
      }));
      await this.supabase.from("wo_assignees").insert(assRows);
    }

    // 4. Update requests status
    await this.supabase
      .from("requests")
      .update({
        status: "In Progress",
        workorder_code: nextWoCode,
        updated_at: new Date().toISOString(),
        updated_by: assignedBy
      })
      .in("request_code", reqCodes);

    // 5. Update master_machine status
    if (mainAssetCode) {
      await this.supabase.from("master_machine").update({ status: "Repair" }).eq("asset_code", mainAssetCode);
    }

    // ส่งการแจ้งเตือน LINE: มอบหมายงานแล้ว (Work Order Assigned)
    try {
      await this.lineService.sendAssignWorkNotification({
        woCode: nextWoCode,
        requestCode: firstReq?.request_code || reqCodes[0],
        assetCode: mainAssetCode,
        assignees: assigneesString,
        dueDate: dueDateStr,
        workorderType: selectedWoType,
        issueDescription: firstReq?.issue_description || "",
        assignedBy: assignedBy
      });
    } catch (lineErr) {
      console.warn("LINE notification error in generateBulkWorkOrder:", lineErr);
    }

    return {
      success: true,
      woCode: nextWoCode,
      message: `ออกใบสั่งงาน ${nextWoCode} สำเร็จ`
    };
  }

  async assignPendingTask(payload: any) {
    return await this.generateBulkWorkOrder(payload);
  }

  /**
   * บันทึกการแก้ไข Request
   */
  async updateRequestDetails(payload: any) {
    const requestCode = payload.requestCode || payload.request_code;
    const assetCode = payload.assetCode || payload.asset_code;
    const compCode = payload.componentCode || payload.component_code || payload.compCode;
    const updatedBy = payload.updatedBy || payload.updated_by || "Administrator";

    const { error } = await this.supabase
      .from("requests")
      .update({
        asset_code: assetCode,
        component_code: compCode === "-" ? null : compCode,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy
      })
      .eq("request_code", requestCode);

    return { success: !error, message: error ? error.message : "บันทึกการแก้ไขสำเร็จ" };
  }

  /**
   * ปฏิเสธ Request
   */
  async rejectRequest(payload: any) {
    const requestCode = payload.requestCode || payload.request_code;
    const reason = payload.reason || payload.reject_reason || "-";
    const updatedBy = payload.updatedBy || payload.updated_by || "Administrator";

    const { error } = await this.supabase
      .from("requests")
      .update({
        status: "Rejected",
        reject_reason: reason,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy
      })
      .eq("request_code", requestCode);

    return { success: !error, message: error ? error.message : "ปฏิเสธคำขอสำเร็จ" };
  }

  /**
   * สร้างคำขอแจ้งซ่อมตรง (Direct Repair Request)
   */
  async addNewRequestCore(payload: any) {
    const formData = payload.formData || payload;
    const now = new Date();
    const yy = now.getFullYear().toString().slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `REQ${yy}${mm}`;

    const { data: latestReqs } = await this.supabase
      .from("requests")
      .select("request_code")
      .ilike("request_code", `${prefix}-%`)
      .order("request_code", { ascending: false })
      .limit(1);

    let nextSeq = 1;
    if (latestReqs && latestReqs.length > 0) {
      const match = latestReqs[0].request_code.match(/-(\d+)$/);
      if (match) nextSeq = parseInt(match[1], 10) + 1;
    }
    const nextReqCode = `${prefix}-${String(nextSeq).padStart(4, "0")}`;

    const rawAsset = String(formData.asset_code || "").trim();
    let rawComp = formData.component_code && String(formData.component_code).trim() !== "-" ? String(formData.component_code).trim() : null;
    let finalAsset = rawAsset;

    try {
      const { data: compCheck } = await this.supabase
        .from("master_machine")
        .select("asset_code, part_group")
        .eq("asset_code", rawAsset)
        .not("part_group", "is", null)
        .maybeSingle();

      if (compCheck) {
        if (!rawComp) rawComp = rawAsset;
        const lastHyphen = rawAsset.lastIndexOf("-");
        if (lastHyphen > 0) finalAsset = rawAsset.substring(0, lastHyphen);
      }
    } catch (e) {
      console.warn("Component check error in addNewRequestCore:", e);
    }

    const insertData = {
      request_code: nextReqCode,
      request_date: now.toISOString().split("T")[0],
      request_type: formData.request_type || "CM",
      asset_code: finalAsset || null,
      component_code: rawComp,
      issue_description: formData.issue_description || "",
      priority: formData.priority || "Normal",
      reporter_by: formData.reporter_by || "Administrator",
      status: "Pending"
    };

    const { error } = await this.supabase.from("requests").insert([insertData]);

    if (error) {
      return { success: false, message: error.message };
    }

    // ส่งการแจ้งเตือน LINE: แจ้งซ่อมใหม่ (จาก Web/Core)
    try {
      await this.lineService.sendNewRequestNotification({
        requestCode: nextReqCode,
        requestDate: insertData.request_date,
        assetCode: insertData.asset_code,
        componentCode: insertData.component_code,
        issueDescription: insertData.issue_description,
        priority: insertData.priority,
        reporter: insertData.reporter_by
      });
    } catch (lineErr) {
      console.warn("LINE notification error in addNewRequestCore:", lineErr);
    }

    return {
      success: true,
      requestCode: nextReqCode,
      message: "บันทึกสำเร็จ"
    };
  }

  /**
   * 19. หัวหน้าช่างกด Approve งาน
   */
  async approveWorkOrder(payload: any) {
    const { woNo, approvedBy = "", notes = "" } = payload;
    if (!woNo) throw new Error("woNo is required");

    const isPM = String(woNo).toUpperCase().startsWith("WO-PM") || String(woNo).toUpperCase().includes("PM");

    if (isPM) {
      // งาน PM: หลังหัวหน้า approve ปิดงานได้เลยทันที (Closed)
      await this.supabase
        .from("work_orders")
        .update({
          status: "Closed",
          closed_at: new Date().toISOString(),
          approved_at: new Date().toISOString(),
          approved_by: approvedBy || "หัวหน้าช่าง",
          updated_at: new Date().toISOString()
        })
        .eq("workorder_code", woNo);

      await this.supabase
        .from("requests")
        .update({
          status: "Closed",
          updated_at: new Date().toISOString()
        })
        .eq("workorder_code", woNo);

      // ส่งการแจ้งเตือน LINE: ปิดงาน PM เสร็จสมบูรณ์
      try {
        await this.lineService.sendPMClosedNotification({
          woCode: woNo,
          leadApprovedBy: approvedBy || "หัวหน้าช่าง",
          leadApprovedAt: new Date().toLocaleString("th-TH"),
          approvalNotes: notes
        });
      } catch (lineErr) {
        console.warn("LINE notification error in approveWorkOrder PM:", lineErr);
      }

      return {
        status: "success",
        success: true,
        isPM: true,
        message: `อนุมัติและปิดงาน PM ${woNo} เรียบร้อยแล้ว`
      };
    } else {
      // งานแจ้งซ่อม (CM/BM): หลังหัวหน้า approve ส่งต่อให้ผู้แจ้งตรวจรับงาน (Pending Acceptance)
      await this.supabase
        .from("work_orders")
        .update({
          status: "Pending Acceptance",
          approved_at: new Date().toISOString(),
          approved_by: approvedBy || "หัวหน้าช่าง",
          updated_at: new Date().toISOString()
        })
        .eq("workorder_code", woNo);

      await this.supabase
        .from("requests")
        .update({
          status: "Pending Acceptance",
          updated_at: new Date().toISOString()
        })
        .eq("workorder_code", woNo);

      // ส่งการแจ้งเตือน LINE: หัวหน้าอนุมัติงานแล้ว รอผู้แจ้งตรวจรับ
      try {
        await this.lineService.sendLeadApprovedNotification({
          woCode: woNo,
          leadApprovedBy: approvedBy || "หัวหน้าช่าง",
          leadApprovedAt: new Date().toLocaleString("th-TH"),
          approvalNotes: notes
        });
      } catch (lineErr) {
        console.warn("LINE notification error in approveWorkOrder CM/BM:", lineErr);
      }

      return {
        status: "success",
        success: true,
        isPM: false,
        message: `อนุมัติใบงาน ${woNo} เรียบร้อยแล้ว (ส่งแจ้งเตือนให้ผู้แจ้งตรวจรับงาน)`
      };
    }
  }

  /**
   * 20. ผู้แจ้งกดรับงานและให้คะแนนความพึงพอใจ
   */
  async acceptRequest(payload: any) {
    const { requestCode, score = 5, feedback = "", acceptedBy = "" } = payload;
    if (!requestCode) throw new Error("requestCode is required");

    // 1. ปิด Request
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

    // 2. ปิด Work Order ที่ผูกกับ Request นี้ด้วย
    await this.supabase
      .from("work_orders")
      .update({
        status: "Closed",
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("request_code", requestCode);

    // ส่งการแจ้งเตือน LINE: ตรวจรับงานและปิดงานสมบูรณ์
    try {
      await this.lineService.sendUserAcceptedNotification({
        requestCode: requestCode,
        score: score,
        feedback: feedback,
        acceptedBy: acceptedBy
      });
    } catch (lineErr) {
      console.warn("LINE notification error in acceptRequest:", lineErr);
    }

    return {
      status: "success",
      success: true,
      message: `บันทึกการรับงานและปิดงาน ${requestCode} เรียบร้อยแล้ว`
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

  /**
   * Action สำหรับอัปโหลดรูปภาพไปยัง Supabase File Storage (cmms-images)
   */
  async handleUploadImageAction(payload: any) {
    const dataUrl = payload.image || payload.base64 || payload.dataUrl;
    if (!dataUrl) {
      return { status: "error", message: "Missing image data", publicUrl: "" };
    }

    const folder = payload.folder || "uploads";
    const filename = payload.filename || `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const filePath = `${folder}/${filename}`;

    const publicUrl = await this.uploadBase64Image(dataUrl, filePath);
    const isStorageUrl = typeof publicUrl === "string" && publicUrl.startsWith("http");

    return {
      status: "success",
      success: true,
      publicUrl: publicUrl,
      path: filePath,
      isStorageUrl: isStorageUrl,
      message: isStorageUrl ? "อัปโหลดภาพขึ้น Supabase Storage สำเร็จ" : "บันทึกภาพแบบ Base64 สำเร็จ"
    };
  }

  /**
   * Helper ดึงรายการวันหยุดจากตาราง holidays
   */
  private async getHolidaySet(): Promise<Set<string>> {
    try {
      const { data } = await this.supabase.from("holidays").select("holiday_date");
      return new Set((data || []).map((h: any) => h.holiday_date).filter(Boolean));
    } catch (e) {
      console.warn("Failed to fetch holidays:", e);
      return new Set();
    }
  }

  /**
   * Helper คำนวณจำนวนวันทำการ (จันทร์-ศุกร์ ไม่รวมเสาร์-อาทิตย์ และวันหยุดในเทเบิล holidays)
   */
  private calculateWorkingDays(startDate: Date, endDate: Date, holidaySet: Set<string>): number {
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

  /**
   * Helper จัดรูปแบบวันที่ dd/MM/yyyy
   */
  private formatDisplayDate(date: Date | string | null): string {
    if (!date) return "-";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "-";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * คำนวณข้อมูล MTBF (Mean Time Between Failures) สำหรับ Dashboard Chart
   */
  async getMTBFData(filters: any = {}) {
    try {
      const holidaySet = await this.getHolidaySet();

      // 1. ดึงรายการเครื่องจักรหลัก (Parent Machines)
      let mmQuery = this.supabase.from("master_machine").select("*");
      if (filters.category) {
        mmQuery = mmQuery.ilike("category", `%${filters.category}%`);
      }
      if (filters.group) {
        mmQuery = mmQuery.ilike("machine_group", `%${filters.group}%`);
      }
      const { data: mmList, error: mmErr } = await mmQuery;
      if (mmErr) throw mmErr;

      const parentMachines = (mmList || []).filter((m: any) => {
        if (!m.asset_code) return false;
        if (m.parent_code) return false;
        const parts = m.asset_code.split("-");
        return parts.length <= 2;
      });

      // 2. ดึงรายการ Work Orders และ Requests
      let woQuery = this.supabase.from("work_orders").select("*");
      if (filters.startDate) {
        woQuery = woQuery.gte("workorder_date", filters.startDate);
      }
      if (filters.endDate) {
        woQuery = woQuery.lte("workorder_date", filters.endDate);
      }
      const { data: woList } = await woQuery;

      let reqQuery = this.supabase.from("requests").select("asset_code, component_code, request_type, request_date, status");
      if (filters.startDate) {
        reqQuery = reqQuery.gte("request_date", filters.startDate);
      }
      if (filters.endDate) {
        reqQuery = reqQuery.lte("request_date", filters.endDate);
      }
      const { data: reqList } = await reqQuery;

      // 3. รวมจำนวนการเสีย (Failures) แม็พชิ้นส่วนย่อยเข้าสู่เครื่องจักรหลัก
      const failureCount: Record<string, number> = {};

      (woList || []).forEach((wo: any) => {
        const type = String(wo.workorder_type || "").toUpperCase();
        if (type.includes("PM") || type.includes("PREVENT")) return;

        const rawAsset = String(wo.asset_code || "").trim();
        if (!rawAsset || rawAsset === "-") return;

        let parentAsset = rawAsset;
        const segs = rawAsset.split("-");
        if (segs.length >= 3) {
          parentAsset = `${segs[0]}-${segs[1]}`;
        }

        failureCount[rawAsset] = (failureCount[rawAsset] || 0) + 1;
        if (parentAsset !== rawAsset) {
          failureCount[parentAsset] = (failureCount[parentAsset] || 0) + 1;
        }
      });

      (reqList || []).forEach((r: any) => {
        const type = String(r.request_type || "").toUpperCase();
        if (type.includes("PM")) return;
        const rawAsset = String(r.asset_code || "").trim();
        if (!rawAsset || rawAsset === "-") return;

        let parentAsset = rawAsset;
        const segs = rawAsset.split("-");
        if (segs.length >= 3) {
          parentAsset = `${segs[0]}-${segs[1]}`;
        }

        if (!failureCount[parentAsset]) {
          failureCount[parentAsset] = 1;
        }
      });

      const now = filters.endDate ? new Date(filters.endDate) : new Date();

      // 4. คำนวณค่า MTBF สำหรับแต่ละเครื่องจักร
      const items = parentMachines.map((m: any) => {
        let setupDateObj: Date;
        if (m.setup_date) {
          setupDateObj = new Date(m.setup_date);
        } else if (m.created_at) {
          setupDateObj = new Date(m.created_at);
        } else {
          setupDateObj = new Date(now.getFullYear(), 0, 1);
        }

        const workingDays = this.calculateWorkingDays(setupDateObj, now, holidaySet);
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
          install_date: this.formatDisplayDate(setupDateObj),
          days_since_install: workingDays,
          machine_hours: machineHours,
          operating_hours: operatingHours,
          failures: failures,
          mtbf: mtbf,
          mtbf_hours: mtbfHours
        };
      });

      // จัดเรียง: เครื่องที่เคยเสีย หรือ MTBF ต่ำขึ้นก่อนเพื่อการเฝ้าระวัง
      items.sort((a: any, b: any) => {
        if (a.failures > 0 && b.failures === 0) return -1;
        if (a.failures === 0 && b.failures > 0) return 1;
        return a.mtbf - b.mtbf;
      });

      return {
        status: "success",
        success: true,
        items: items
      };
    } catch (err: any) {
      console.error("getMTBFData error:", err);
      return { status: "error", message: err.message, items: [] };
    }
  }

  /**
   * คำนวณข้อมูล Downtime % สำหรับ Dashboard Chart
   */
  async getDowntimeData(filters: any = {}) {
    try {
      const holidaySet = await this.getHolidaySet();

      let mmQuery = this.supabase.from("master_machine").select("*");
      if (filters.category) {
        mmQuery = mmQuery.ilike("category", `%${filters.category}%`);
      }
      if (filters.group) {
        mmQuery = mmQuery.ilike("machine_group", `%${filters.group}%`);
      }
      const { data: mmList, error: mmErr } = await mmQuery;
      if (mmErr) throw mmErr;

      const parentMachines = (mmList || []).filter((m: any) => {
        if (!m.asset_code) return false;
        if (m.parent_code) return false;
        const parts = m.asset_code.split("-");
        return parts.length <= 2;
      });

      let woQuery = this.supabase.from("work_orders").select("*");
      if (filters.startDate) {
        woQuery = woQuery.gte("workorder_date", filters.startDate);
      }
      if (filters.endDate) {
        woQuery = woQuery.lte("workorder_date", filters.endDate);
      }
      const { data: woList } = await woQuery;

      const { data: detailList } = await this.supabase.from("work_order_details").select("asset_code, down_time");

      // รวมชั่วโมงหยุดเครื่อง (Downtime)
      const downtimeMap: Record<string, number> = {};

      (woList || []).forEach((wo: any) => {
        const rawAsset = String(wo.asset_code || "").trim();
        if (!rawAsset || rawAsset === "-") return;

        let parentAsset = rawAsset;
        const segs = rawAsset.split("-");
        if (segs.length >= 3) {
          parentAsset = `${segs[0]}-${segs[1]}`;
        }

        const dt = Number(wo.total_down_time || 0);
        if (dt > 0) {
          downtimeMap[rawAsset] = (downtimeMap[rawAsset] || 0) + dt;
          if (parentAsset !== rawAsset) {
            downtimeMap[parentAsset] = (downtimeMap[parentAsset] || 0) + dt;
          }
        }
      });

      (detailList || []).forEach((d: any) => {
        const rawAsset = String(d.asset_code || "").trim();
        if (!rawAsset || rawAsset === "-") return;

        let parentAsset = rawAsset;
        const segs = rawAsset.split("-");
        if (segs.length >= 3) {
          parentAsset = `${segs[0]}-${segs[1]}`;
        }

        const dt = Number(d.down_time || 0);
        if (dt > 0 && !downtimeMap[parentAsset]) {
          downtimeMap[parentAsset] = (downtimeMap[parentAsset] || 0) + dt;
        }
      });

      const now = filters.endDate ? new Date(filters.endDate) : new Date();

      const items = parentMachines.map((m: any) => {
        let setupDateObj: Date;
        if (m.setup_date) {
          setupDateObj = new Date(m.setup_date);
        } else if (m.created_at) {
          setupDateObj = new Date(m.created_at);
        } else {
          setupDateObj = new Date(now.getFullYear(), 0, 1);
        }

        const workingDays = this.calculateWorkingDays(setupDateObj, now, holidaySet);
        const machineHours = Number(m.machine_hours) > 0 ? Number(m.machine_hours) : 8;
        const totalAvailableHours = workingDays * machineHours;
        const totalDownHours = downtimeMap[m.asset_code] || 0;
        const downtimePct = totalAvailableHours > 0 ? Math.round((totalDownHours / totalAvailableHours) * 10000) / 100 : 0;

        return {
          asset_code: m.asset_code,
          asset_name: m.asset_name || m.asset_code,
          category: m.category || "",
          machine_group: m.machine_group || "",
          setup_date: this.formatDisplayDate(setupDateObj),
          days_since_setup: workingDays,
          machine_hours: machineHours,
          total_available_hours: totalAvailableHours,
          total_down_hours: Math.round(totalDownHours * 10) / 10,
          downtime_pct: downtimePct
        };
      });

      // เรียงลำดับ: เครื่องที่มี Downtime % สูงสุดขึ้นก่อน
      items.sort((a: any, b: any) => b.downtime_pct - a.downtime_pct);

      return {
        status: "success",
        success: true,
        items: items
      };
    } catch (err: any) {
      console.error("getDowntimeData error:", err);
      return { status: "error", message: err.message, items: [] };
    }
  }

  /**
   * ดึงข้อมูล 10 อันดับใบสั่งงานที่เครื่องหยุดทำงานนานที่สุด (Top 10 Downtime Work Orders)
   */
  async getTopDowntimeWorkOrders(payload: any = {}) {
    const limit = Number(payload.limit || 10);

    // 1. ดึงจาก View v_downtime_details โดยตรงเพื่อรองรับตัวกรอง Category, Group, Type, Date
    try {
      let query = this.supabase
        .from("v_downtime_details")
        .select("*")
        .gt("down_time_minutes", 0);

      if (payload.category && payload.category !== "All") query = query.ilike("category", `%${payload.category}%`);
      if (payload.group && payload.group !== "All") query = query.ilike("machine_group", `%${payload.group}%`);
      if (payload.type && payload.type !== "All") query = query.eq("workorder_type", payload.type);
      if (payload.startDate) query = query.gte("workorder_date", payload.startDate);
      if (payload.endDate) query = query.lte("workorder_date", payload.endDate);

      const { data: detailData, error: detailErr } = await query
        .order("down_time_minutes", { ascending: false })
        .limit(limit);

      if (!detailErr && detailData && detailData.length > 0) {
        const totalSum = detailData.reduce((acc: number, cur: any) => acc + Number(cur.down_time_minutes || 0), 0);
        const formatted = detailData.map((d: any, idx: number) => ({
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

        return {
          status: "success",
          success: true,
          items: formatted,
          total: formatted.length,
          source: "v_downtime_details"
        };
      }
    } catch (e) {
      console.warn("Query v_downtime_details error, trying fallback:", e);
    }

    // 2. Fallback Query โดยตรงจาก work_orders, work_order_details, master_machine, lookup_downtime_code
    try {
      const { data: woList, error: woErr } = await this.supabase
        .from("work_orders")
        .select("*")
        .order("total_down_time", { ascending: false })
        .limit(30);

      const { data: wodList } = await this.supabase
        .from("work_order_details")
        .select("*")
        .not("down_time", "is", null)
        .order("down_time", { ascending: false })
        .limit(50);

      const { data: mmList } = await this.supabase
        .from("master_machine")
        .select("asset_code, asset_name, department, location");

      const { data: dtCodes } = await this.supabase
        .from("lookup_downtime_code")
        .select("code, name");

      const mmMap = new Map<string, any>();
      (mmList || []).forEach((m: any) => mmMap.set(m.asset_code, m));

      const dtMap = new Map<string, string>();
      (dtCodes || []).forEach((c: any) => dtMap.set(c.code, c.name));

      const dtCategoryMap: Record<string, string> = {
        M: "กลไก (Mechanical)",
        E: "ไฟฟ้า (Electrical)",
        O: "ผู้ปฏิบัติงาน (Operational)",
        U: "ปัจจัยภายนอก (Uncontrollable)"
      };

      const woMap = new Map<string, any>();

      (woList || []).forEach((wo: any) => {
        const dt = Number(wo.total_down_time || 0);
        if (dt > 0) {
          const m = mmMap.get(wo.asset_code) || {};
          woMap.set(wo.workorder_code, {
            workorder_code: wo.workorder_code,
            workorder_type: wo.workorder_type || "BM",
            request_code: wo.request_code || "-",
            asset_code: wo.asset_code || "-",
            asset_name: m.asset_name || wo.asset_code || "เครื่องจักรทั่วไป",
            department: m.department || "-",
            location: m.location || "-",
            down_time_minutes: dt,
            down_time_hours: Math.round((dt / 60) * 100) / 100,
            working_time_minutes: Number(wo.total_working_time || 0),
            downtime_code: "-",
            downtime_name: "-",
            downtime_category_label: "-",
            root_cause: wo.root_cause || "-",
            action_taken: wo.action_taken || "-",
            status: wo.status || "Completed",
            assignee: wo.assignee || "-",
            workorder_date: wo.workorder_date || "-",
            end_date: wo.end_date || wo.tech_completed_at || "-"
          });
        }
      });

      (wodList || []).forEach((wod: any) => {
        const dt = Number(wod.down_time || 0);
        if (dt > 0) {
          const m = mmMap.get(wod.asset_code) || {};
          const existing = woMap.get(wod.workorder_code);
          const dtCode = wod.downtime_code || "";
          const dtName = dtMap.get(dtCode) || dtCode || "-";
          const dtLabel = dtCategoryMap[dtCode] || dtName;

          if (existing) {
            if (dt > existing.down_time_minutes) {
              existing.down_time_minutes = dt;
              existing.down_time_hours = Math.round((dt / 60) * 100) / 100;
            }
            if (dtCode) {
              existing.downtime_code = dtCode;
              existing.downtime_name = dtName;
              existing.downtime_category_label = dtLabel;
            }
            if (wod.root_cause && existing.root_cause === "-") existing.root_cause = wod.root_cause;
            if (wod.action_taken && existing.action_taken === "-") existing.action_taken = wod.action_taken;
          } else {
            woMap.set(wod.workorder_code, {
              workorder_code: wod.workorder_code,
              workorder_type: "BM",
              request_code: wod.request_code || "-",
              asset_code: wod.asset_code || "-",
              asset_name: m.asset_name || wod.asset_code || "เครื่องจักรทั่วไป",
              department: m.department || "-",
              location: m.location || "-",
              down_time_minutes: dt,
              down_time_hours: Math.round((dt / 60) * 100) / 100,
              working_time_minutes: Number(wod.working_time || 0),
              downtime_code: dtCode || "-",
              downtime_name: dtName,
              downtime_category_label: dtLabel,
              root_cause: wod.root_cause || "-",
              action_taken: wod.action_taken || "-",
              status: wod.status || "Completed",
              assignee: wod.assignee || "-",
              workorder_date: "-",
              end_date: wod.end_date || "-"
            });
          }
        }
      });

      let items = Array.from(woMap.values());
      items.sort((a, b) => b.down_time_minutes - a.down_time_minutes);
      items = items.slice(0, limit);

      const totalDtSum = items.reduce((sum, it) => sum + it.down_time_minutes, 0);
      items.forEach((it, idx) => {
        it.rank = idx + 1;
        it.pct_of_total_downtime = totalDtSum > 0 ? Math.round((it.down_time_minutes / totalDtSum) * 1000) / 10 : 0;
      });

      return {
        status: "success",
        success: true,
        items: items,
        total: items.length,
        source: "fallback_aggregation"
      };
    } catch (err: any) {
      console.error("getTopDowntimeWorkOrders error:", err);
      return { status: "error", message: err.message, items: [] };
    }
  }

  /**
   * ดึงข้อมูล Downtime แยกตามรหัสสาเหตุ (Downtime Code: M, E, O, U)
   */
  async getDowntimeCodeData(payload: any = {}) {
    try {
      let query = this.supabase
        .from("v_downtime_details")
        .select("downtime_code, downtime_name, down_time_minutes, down_time_hours, category, machine_group, workorder_type, workorder_date")
        .gt("down_time_minutes", 0);

      if (payload.category && payload.category !== "All") query = query.ilike("category", `%${payload.category}%`);
      if (payload.group && payload.group !== "All") query = query.ilike("machine_group", `%${payload.group}%`);
      if (payload.type && payload.type !== "All") query = query.eq("workorder_type", payload.type);
      if (payload.startDate) query = query.gte("workorder_date", payload.startDate);
      if (payload.endDate) query = query.lte("workorder_date", payload.endDate);

      const { data, error } = await query;
      if (error) throw error;

      const codeStats: Record<string, any> = {
        M: { code: "M", name: "Mechanical (กลไก/เครื่องกล)", minutes: 0, hours: 0, count: 0, pct: 0, color: "#2563eb" },
        E: { code: "E", name: "Electrical (ระบบไฟฟ้า)", minutes: 0, hours: 0, count: 0, pct: 0, color: "#f59e0b" },
        O: { code: "O", name: "Operational (การใช้งาน)", minutes: 0, hours: 0, count: 0, pct: 0, color: "#8b5cf6" },
        U: { code: "U", name: "Uncontrollable (ภายนอก)", minutes: 0, hours: 0, count: 0, pct: 0, color: "#ef4444" }
      };

      let totalMinutes = 0;
      (data || []).forEach((r: any) => {
        const code = String(r.downtime_code || "").trim().toUpperCase();
        const mins = Number(r.down_time_minutes || 0);
        totalMinutes += mins;
        if (codeStats[code]) {
          codeStats[code].minutes += mins;
          codeStats[code].count++;
        } else if (code) {
          codeStats[code] = { code, name: r.downtime_name || code, minutes: mins, hours: 0, count: 1, pct: 0, color: "#64748b" };
        }
      });

      const items = Object.values(codeStats).map((c: any) => {
        c.hours = Math.round((c.minutes / 60) * 10) / 10;
        c.pct = totalMinutes > 0 ? Math.round((c.minutes / totalMinutes) * 1000) / 10 : 0;
        return c;
      });

      return {
        status: "success",
        success: true,
        totalMinutes,
        totalHours: Math.round((totalMinutes / 60) * 10) / 10,
        items
      };
    } catch (err: any) {
      console.error("getDowntimeCodeData error:", err);
      return { status: "error", message: err.message, items: [], totalMinutes: 0, totalHours: 0 };
    }
  }

  /**
   * ดึงข้อมูลปฏิทินงานบำรุงรักษาและการวิเคราะห์แนวโน้มรายเดือน (Maintenance Calendar & Monthly Trend)
   */
  async getMaintenanceCalendarData(yearArg: any = new Date().getFullYear()) {
    const year = parseInt(String(yearArg), 10) || new Date().getFullYear();
    const startYear = `${year}-01-01`;
    const endYear = `${year}-12-31`;

    try {
      const [woRes, reqRes, mmRes] = await Promise.all([
        this.supabase
          .from("work_orders")
          .select("workorder_code, request_code, workorder_type, asset_code, workorder_date, created_at, status")
          .gte("workorder_date", startYear)
          .lte("workorder_date", endYear),
        this.supabase
          .from("requests")
          .select("request_code, asset_code, request_type, request_date, created_at, status")
          .gte("request_date", startYear)
          .lte("request_date", endYear),
        this.supabase.from("master_machine").select("asset_code, asset_name")
      ]);

      const mmMap: Record<string, string> = {};
      (mmRes.data || []).forEach((m: any) => {
        if (m.asset_code) mmMap[m.asset_code.trim()] = m.asset_name || m.asset_code;
      });

      const events: any[] = [];
      const handledWos = new Set<string>();

      (woRes.data || []).forEach((w: any) => {
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

      (reqRes.data || []).forEach((r: any) => {
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
        events
      };
    } catch (err: any) {
      console.error("getMaintenanceCalendarData error:", err);
      return { status: "error", message: err.message, events: [] };
    }
  }
}

