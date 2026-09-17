import { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_LINE_ACCESS_TOKEN =
  "1cvFA6ogFVFX5SKVCRsJKevlZegxrYqsy7GkY5ZD5bncdzWz0MEq8widpr0cE7Owx/qRLPeJC5linglwDOC/tgMXZJEzCEXTakXKTIUK47uRinsD7gY0jgr4MWrEl4u/zWM1ewWMA1DLvKswi1EOhQdB04t89/1O/w1cDnyilFU=";

export const DEFAULT_LINE_TARGET_ID = "Cb1a0babfd04db6bef83c0370260ea110";

export interface LineNotificationResult {
  success: boolean;
  statusCode?: number;
  errorDetail?: string;
}

export class LineService {
  private token: string;
  private targetId: string;
  private supabase?: SupabaseClient;

  constructor(
    token?: string,
    targetId?: string,
    supabaseClient?: SupabaseClient
  ) {
    this.token = token || DEFAULT_LINE_ACCESS_TOKEN;
    this.targetId = targetId || DEFAULT_LINE_TARGET_ID;
    this.supabase = supabaseClient;
  }

  /**
   * ส่ง Push Message ไปยัง LINE Messaging API
   */
  async sendPushMessage(
    targetId: string,
    messageContent: any
  ): Promise<LineNotificationResult> {
    const to = targetId || this.targetId;
    const token = this.token;

    if (!token || !to) {
      console.warn("LINE Push Notification Skipped: Missing token or targetId");
      return { success: false, errorDetail: "Missing token or targetId" };
    }

    const messageObj =
      typeof messageContent === "string"
        ? { type: "text", text: messageContent }
        : messageContent;

    const payload = {
      to: to,
      messages: [messageObj],
    };

    try {
      const response = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const statusCode = response.status;
      const responseText = await response.text();

      if (response.ok) {
        return { success: true, statusCode };
      } else {
        console.warn(`LINE API Error (${statusCode}):`, responseText);
        return {
          success: false,
          statusCode,
          errorDetail: responseText,
        };
      }
    } catch (err: any) {
      console.error("LINE Fetch Exception:", err);
      return {
        success: false,
        statusCode: 500,
        errorDetail: err?.message || String(err),
      };
    }
  }

  /**
   * 1. ส่ง LINE แจ้งเตือน: รายการแจ้งซ่อมใหม่ (New Repair Request)
   */
  async sendNewRequestNotification(data: any): Promise<LineNotificationResult> {
    try {
      const enriched = await this.enrichRequestContext(data);
      const flex = this.createNewRequestFlex(enriched);
      return await this.sendPushMessage(this.targetId, flex);
    } catch (err: any) {
      console.error("sendNewRequestNotification error:", err);
      return { success: false, errorDetail: err?.message || String(err) };
    }
  }

  /**
   * 2. ส่ง LINE แจ้งเตือน: มอบหมายงานและออกใบสั่งงาน (Work Order Assigned)
   */
  async sendAssignWorkNotification(data: any): Promise<LineNotificationResult> {
    try {
      const enriched = await this.enrichWorkOrderContext(data);
      const flex = this.createAssignWorkFlex(enriched);
      return await this.sendPushMessage(this.targetId, flex);
    } catch (err: any) {
      console.error("sendAssignWorkNotification error:", err);
      return { success: false, errorDetail: err?.message || String(err) };
    }
  }

  /**
   * 3. ส่ง LINE แจ้งเตือน: ช่างซ่อมเสร็จสิ้น (Pending Approval / รอหัวหน้าอนุมัติ)
   */
  async sendTechCompletedNotification(data: any): Promise<LineNotificationResult> {
    try {
      const enriched = await this.enrichWorkOrderContext(data);
      const flex = this.createTechCompletedFlex(enriched);
      return await this.sendPushMessage(this.targetId, flex);
    } catch (err: any) {
      console.error("sendTechCompletedNotification error:", err);
      return { success: false, errorDetail: err?.message || String(err) };
    }
  }

  /**
   * 4. ส่ง LINE แจ้งเตือน: หัวหน้าอนุมัติงาน CM/BM (Pending Acceptance / รอผู้แจ้งตรวจรับ)
   */
  async sendLeadApprovedNotification(data: any): Promise<LineNotificationResult> {
    try {
      const enriched = await this.enrichWorkOrderContext(data);
      const flex = this.createLeadApprovedFlex(enriched);
      return await this.sendPushMessage(this.targetId, flex);
    } catch (err: any) {
      console.error("sendLeadApprovedNotification error:", err);
      return { success: false, errorDetail: err?.message || String(err) };
    }
  }

  /**
   * 5. ส่ง LINE แจ้งเตือน: ปิดงาน PM เสร็จสมบูรณ์ (PM Closed)
   */
  async sendPMClosedNotification(data: any): Promise<LineNotificationResult> {
    try {
      const enriched = await this.enrichWorkOrderContext(data);
      const flex = this.createPMClosedFlex(enriched);
      return await this.sendPushMessage(this.targetId, flex);
    } catch (err: any) {
      console.error("sendPMClosedNotification error:", err);
      return { success: false, errorDetail: err?.message || String(err) };
    }
  }

  /**
   * 6. ส่ง LINE แจ้งเตือน: ผู้แจ้งตรวจรับงานและให้คะแนนความพึงพอใจ (User Accepted & Rated)
   */
  async sendUserAcceptedNotification(data: any): Promise<LineNotificationResult> {
    try {
      const enriched = await this.enrichRequestContext(data);
      const flex = this.createUserAcceptedFlex(enriched);
      return await this.sendPushMessage(this.targetId, flex);
    } catch (err: any) {
      console.error("sendUserAcceptedNotification error:", err);
      return { success: false, errorDetail: err?.message || String(err) };
    }
  }

  /* ==========================================================================
     FLEX MESSAGE TEMPLATES (อิงความสวยงามตาม aut_cmms_v5 และปรับแต่งให้ทันสมัย)
     ========================================================================== */

  /**
   * Flex 1: รายการแจ้งซ่อมใหม่
   */
  createNewRequestFlex(data: any): any {
    const priority = data.priority || "Normal";
    let priorityColor = "#2563eb";
    if (
      priority === "High" ||
      priority === "Urgent" ||
      priority === "ด่วน" ||
      priority === "ด่วนที่สุด"
    ) {
      priorityColor = "#dc2626";
    } else if (priority === "Medium" || priority === "ปานกลาง") {
      priorityColor = "#d97706";
    }

    const machineDisplay = data.assetName
      ? `${data.assetName} (${data.assetCode || "-"})`
      : data.assetCode || "-";

    const bubble: any = {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0e7490",
        paddingAll: "15px",
        contents: [
          {
            type: "text",
            text: "🔧 รายการแจ้งซ่อมใหม่",
            weight: "bold",
            color: "#ffffff",
            size: "md",
          },
          {
            type: "text",
            text: `เลขที่: ${data.requestCode || data.ticketNo || "-"}`,
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
              {
                type: "text",
                text: machineDisplay,
                size: "xs",
                color: "#0f172a",
                weight: "bold",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "อุปกรณ์", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.component || data.componentName || data.component_code || "-",
                size: "xs",
                color: "#0f172a",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ความผิดปกติ", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.issueDescription || data.symptom || "-",
                size: "xs",
                color: "#dc2626",
                weight: "bold",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ความเร่งด่วน", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: priority,
                size: "xs",
                color: priorityColor,
                weight: "bold",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "แผนก/สถานที่", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: `${data.department || "-"} / ${data.location || "-"}`,
                size: "xs",
                color: "#0f172a",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ผู้แจ้งซ่อม", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.reporter || data.reporterName || "-",
                size: "xs",
                color: "#0f172a",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "วันที่แจ้ง", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.requestDate || data.today || new Date().toLocaleString("th-TH"),
                size: "xs",
                color: "#64748b",
                flex: 7,
              },
            ],
          },
        ],
      },
    };

    // แนบรูปภาพเฉพาะกรณีที่มี URL และขึ้นต้นด้วย https://
    const img = data.imageUrl || data.issueImageUrl || data.issue_image;
    if (img && typeof img === "string" && img.startsWith("https://")) {
      bubble.hero = {
        type: "image",
        url: img,
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
      };
    }

    return {
      type: "flex",
      altText: `🔧 รายการแจ้งซ่อมใหม่: ${data.requestCode || data.ticketNo || ""}`,
      contents: bubble,
    };
  }

  /**
   * Flex 2: มอบหมายงานและออกใบสั่งงาน (Work Order Assigned)
   */
  createAssignWorkFlex(data: any): any {
    const isPM = String(data.workorderType || "").toUpperCase() === "PM";
    const headerTitle = isPM
      ? "📋 ออกใบสั่งงาน PM (Preventive)"
      : "📋 มอบหมายงานซ่อม (WO Assigned)";

    const machineDisplay = data.assetName
      ? `${data.assetName} (${data.assetCode || "-"})`
      : data.assetCode || "-";

    const bubble: any = {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1e40af", // Deep Blue
        paddingAll: "15px",
        contents: [
          {
            type: "text",
            text: headerTitle,
            weight: "bold",
            color: "#ffffff",
            size: "md",
          },
          {
            type: "text",
            text: `ใบสั่งงาน: ${data.woCode || data.workorder_code || "-"}`,
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
                text: `👷 ช่างผู้รับผิดชอบ: ${data.assignees || data.assignee || "ยังไม่ระบุ"}`,
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
              {
                type: "text",
                text: machineDisplay,
                size: "xs",
                color: "#0f172a",
                weight: "bold",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "รหัสคำขอ", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.requestCode || data.request_code || "-",
                size: "xs",
                color: "#0f172a",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "อาการ/งาน", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.issueDescription || data.description || "-",
                size: "xs",
                color: "#0f172a",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "กำหนดเสร็จ", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.dueDate || data.due_date || "-",
                size: "xs",
                color: "#dc2626",
                weight: "bold",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ผู้มอบหมาย", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.assignedBy || "หัวหน้าช่าง",
                size: "xs",
                color: "#64748b",
                flex: 7,
              },
            ],
          },
        ],
      },
    };

    return {
      type: "flex",
      altText: `📋 มอบหมายงาน: ${data.woCode || data.workorder_code || ""}`,
      contents: bubble,
    };
  }

  /**
   * Flex 3: ช่างซ่อมเสร็จสิ้น (Pending Approval - รอหัวหน้าอนุมัติ)
   */
  createTechCompletedFlex(data: any): any {
    const isPM = String(data.workorderType || "").toUpperCase() === "PM";
    const headerTitle = isPM
      ? "🛠️ ช่างทำ PM เสร็จสิ้น (รอตรวจปิดงาน)"
      : "🛠️ ช่างซ่อมเสร็จสิ้น (รอหัวหน้าอนุมัติ)";
    const headerBg = isPM ? "#0284c7" : "#d97706";
    const footerNotice = isPM
      ? "🔔 แจ้งเตือนหัวหน้าช่าง: กรุณาเข้าตรวจสอบและกดปิดงาน PM ในระบบ"
      : "🔔 แจ้งเตือนหัวหน้าช่าง: กรุณาเข้าตรวจสอบและกด Approve งานซ่อม";

    const machineDisplay = data.assetName
      ? `${data.assetName} (${data.assetCode || "-"})`
      : data.assetCode || "-";

    const bubble: any = {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerBg,
        paddingAll: "15px",
        contents: [
          {
            type: "text",
            text: headerTitle,
            weight: "bold",
            color: "#ffffff",
            size: "md",
          },
          {
            type: "text",
            text: `ใบสั่งงาน: ${data.woCode || data.ticketId || data.workorder_code || "-"}`,
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
              {
                type: "text",
                text: machineDisplay,
                size: "xs",
                color: "#0f172a",
                weight: "bold",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "สาเหตุเสีย", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.rootCause || data.issueDescription || "-",
                size: "xs",
                color: "#b91c1c",
                weight: "bold",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "การแก้ไข", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.actionTaken || data.remarks || "-",
                size: "xs",
                color: "#047857",
                weight: "bold",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ช่างผู้ปฏิบัติ", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.technician || data.closedBy || "-",
                size: "xs",
                color: "#0f172a",
                weight: "bold",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "เวลาทำงาน", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: `${data.workingTime || 0} นาที / หยุดเครื่อง: ${data.downTime || 0} นาที` + (data.downtimeCode ? ` (${data.downtimeCode})` : ""),
                size: "xs",
                color: "#0f172a",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "เวลาเสร็จสิ้น", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.completedAt || new Date().toLocaleString("th-TH"),
                size: "xs",
                color: "#64748b",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#f8fafc",
            paddingAll: "10px",
            cornerRadius: "8px",
            margin: "sm",
            contents: [
              {
                type: "text",
                text: footerNotice,
                size: "xxs",
                color: "#475569",
                wrap: true,
              },
            ],
          },
        ],
      },
    };

    const img = data.imageUrl || data.photoAfter || data.image_result;
    if (img && typeof img === "string" && img.startsWith("https://")) {
      bubble.hero = {
        type: "image",
        url: img,
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
      };
    }

    return {
      type: "flex",
      altText: `${headerTitle}: ${data.woCode || data.workorder_code || ""}`,
      contents: bubble,
    };
  }

  /**
   * Flex 4: หัวหน้าอนุมัติงาน CM/BM (Pending Acceptance แจ้งผู้แจ้ง)
   */
  createLeadApprovedFlex(data: any): any {
    const reporterName = data.reporterName || data.reporter || "ผู้แจ้งซ่อม";
    const machineDisplay = data.assetName
      ? `${data.assetName} (${data.assetCode || "-"})`
      : data.assetCode || "-";

    const bubble: any = {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#4f46e5", // Indigo
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
            text: `รหัสคำขอ: ${data.requestCode || data.request_code || "-"}`,
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
                text: `👤 เรียนคุณ: ${reporterName}`,
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
              {
                type: "text",
                text: machineDisplay,
                size: "xs",
                color: "#0f172a",
                weight: "bold",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ใบสั่งงาน", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.woCode || data.workorder_code || "-",
                size: "xs",
                color: "#0f172a",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ผู้อนุมัติ", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.leadApprovedBy || data.approvedBy || "หัวหน้าช่าง",
                size: "xs",
                color: "#4338ca",
                weight: "bold",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "เวลาอนุมัติ", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.leadApprovedAt || new Date().toLocaleString("th-TH"),
                size: "xs",
                color: "#64748b",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#f8fafc",
            paddingAll: "10px",
            cornerRadius: "8px",
            margin: "sm",
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
    };

    return {
      type: "flex",
      altText: `✅ อนุมัติงานซ่อมแล้ว (รอตรวจรับ): ${data.requestCode || ""}`,
      contents: bubble,
    };
  }

  /**
   * Flex 5: ปิดงาน PM เสร็จสมบูรณ์ (PM Closed)
   */
  createPMClosedFlex(data: any): any {
    const machineDisplay = data.assetName
      ? `${data.assetName} (${data.assetCode || "-"})`
      : data.assetCode || "-";

    const bubble: any = {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#059669", // Emerald Green
        paddingAll: "15px",
        contents: [
          {
            type: "text",
            text: "🟢 งานบำรุงรักษาเชิงป้องกัน (PM) เสร็จสมบูรณ์",
            weight: "bold",
            color: "#ffffff",
            size: "md",
          },
          {
            type: "text",
            text: `ใบสั่งงาน: ${data.woCode || data.workorder_code || "-"}`,
            color: "#d1fae5",
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
              {
                type: "text",
                text: machineDisplay,
                size: "xs",
                color: "#0f172a",
                weight: "bold",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ช่างผู้ปฏิบัติ", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.technician || data.assignee || "-",
                size: "xs",
                color: "#0f172a",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ผู้ตรวจปิดงาน", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.leadApprovedBy || data.approvedBy || "หัวหน้าช่าง",
                size: "xs",
                color: "#047857",
                weight: "bold",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "สถานะ", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: "Closed (เสร็จสมบูรณ์)",
                size: "xs",
                color: "#059669",
                weight: "bold",
                flex: 7,
              },
            ],
          },
        ],
      },
    };

    return {
      type: "flex",
      altText: `🟢 ปิดงาน PM เสร็จสมบูรณ์: ${data.woCode || data.workorder_code || ""}`,
      contents: bubble,
    };
  }

  /**
   * Flex 6: ผู้แจ้งตรวจรับงานและประเมินผล (User Accepted)
   */
  createUserAcceptedFlex(data: any): any {
    const score = Number(data.score || data.satisfactionScore || 5);
    const stars = "⭐".repeat(Math.min(5, Math.max(1, score)));

    const bubble: any = {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0d9488", // Teal
        paddingAll: "15px",
        contents: [
          {
            type: "text",
            text: "🎉 ผู้แจ้งตรวจรับงานเรียบร้อยแล้ว",
            weight: "bold",
            color: "#ffffff",
            size: "md",
          },
          {
            type: "text",
            text: `รหัสคำขอ: ${data.requestCode || data.request_code || "-"}`,
            color: "#ccfbf1",
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
            backgroundColor: "#f0fdf4",
            paddingAll: "10px",
            cornerRadius: "8px",
            contents: [
              {
                type: "text",
                text: `คะแนนความพึงพอใจ: ${stars} (${score}/5)`,
                size: "sm",
                weight: "bold",
                color: "#15803d",
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ความคิดเห็น", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.feedback || data.notes || "ไม่มีข้อคิดเห็นเพิ่มเติม",
                size: "xs",
                color: "#0f172a",
                flex: 7,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "ผู้ตรวจรับ", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: data.acceptedBy || data.reporterName || "ผู้แจ้ง",
                size: "xs",
                color: "#0f172a",
                flex: 7,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "สถานะใบงาน", size: "xs", color: "#64748b", flex: 3 },
              {
                type: "text",
                text: "Closed (ปิดงานสมบูรณ์)",
                size: "xs",
                color: "#059669",
                weight: "bold",
                flex: 7,
              },
            ],
          },
        ],
      },
    };

    return {
      type: "flex",
      altText: `🎉 ตรวจรับงานเสร็จสมบูรณ์: ${data.requestCode || ""}`,
      contents: bubble,
    };
  }

  /* ==========================================================================
     CONTEXT ENRICHMENT HELPERS
     ========================================================================== */

  private async enrichRequestContext(data: any): Promise<any> {
    const copy = { ...data };
    if (!this.supabase) return copy;

    try {
      // 1. ค้นหาชื่อเครื่องจักรหากยังไม่มี
      if (
        (!copy.assetName || copy.assetName === "-" || copy.assetName === "ไม่ระบุ") &&
        copy.assetCode
      ) {
        const { data: m } = await this.supabase
          .from("master_machine")
          .select("asset_name, department, location")
          .eq("asset_code", copy.assetCode)
          .maybeSingle();

        if (m) {
          copy.assetName = m.asset_name || copy.assetCode;
          if (!copy.department) copy.department = m.department;
          if (!copy.location) copy.location = m.location;
        }
      }

      // 2. ค้นหาชื่อผู้แจ้งจาก Users หากเป็น LINE ID
      if (copy.reporter_by || copy.userId) {
        const uid = copy.reporter_by || copy.userId;
        const { data: u } = await this.supabase
          .from("users")
          .select("name, display_name")
          .or(`line_user_id.eq.${uid},username.eq.${uid},id.eq.${uid}`)
          .maybeSingle();

        if (u) {
          copy.reporter = u.display_name || u.name || copy.reporter;
          copy.reporterName = copy.reporter;
        }
      }
    } catch (e) {
      console.warn("enrichRequestContext error:", e);
    }
    return copy;
  }

  private async enrichWorkOrderContext(data: any): Promise<any> {
    const copy = { ...data };
    if (!this.supabase) return copy;

    try {
      const woCode = copy.woCode || copy.wo_code || copy.workorder_code;
      if (woCode) {
        const { data: wo } = await this.supabase
          .from("work_orders")
          .select("*")
          .eq("workorder_code", woCode)
          .maybeSingle();

        if (wo) {
          copy.workorderType = copy.workorderType || wo.workorder_type;
          copy.requestCode = copy.requestCode || wo.request_code;
          copy.assetCode = copy.assetCode || wo.asset_code;
          copy.assignees = copy.assignees || wo.assignee;
          copy.dueDate = copy.dueDate || wo.due_date;
        }
      }

      // ดึงรายละเอียด request ที่เชื่อมกัน
      const reqCode = copy.requestCode || copy.request_code;
      if (reqCode) {
        const { data: req } = await this.supabase
          .from("requests")
          .select("*")
          .eq("request_code", reqCode)
          .maybeSingle();

        if (req) {
          copy.assetCode = copy.assetCode || req.asset_code;
          copy.issueDescription = copy.issueDescription || req.issue_description;
          copy.reporter_by = copy.reporter_by || req.reporter_by;
          if (req.reporter_by) {
            const { data: u } = await this.supabase
              .from("users")
              .select("name, display_name")
              .or(`line_user_id.eq.${req.reporter_by},username.eq.${req.reporter_by},id.eq.${req.reporter_by}`)
              .maybeSingle();

            if (u) {
              copy.reporterName = u.display_name || u.name;
            }
          }
        }
      }

      // ดึงชื่อเครื่องจักร
      if (copy.assetCode && !copy.assetName) {
        const { data: m } = await this.supabase
          .from("master_machine")
          .select("asset_name, department, location")
          .eq("asset_code", copy.assetCode)
          .maybeSingle();

        if (m) {
          copy.assetName = m.asset_name;
          copy.department = copy.department || m.department;
          copy.location = copy.location || m.location;
        }
      }
    } catch (e) {
      console.warn("enrichWorkOrderContext error:", e);
    }
    return copy;
  }
}
