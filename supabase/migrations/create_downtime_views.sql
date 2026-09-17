-- ==============================================================================
-- CMMS DOWNTIME REPORTING & ANALYTICS VIEWS
-- สำหรับใช้งานในหน้า Dashboard, หน้าประวัติงานซ่อม, และรายงานวิเคราะห์ Downtime
-- สามารถนำ SQL นี้ไปวางใน Supabase SQL Editor แล้วกด RUN ได้ทันที
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. VIEW: v_downtime_details (รายละเอียดงานซ่อมและ Downtime ระดับรายการ)
-- รวมข้อมูลจาก work_order_details, work_orders, requests, master_machine, lookup_downtime_code
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_downtime_details AS
SELECT 
    wod.id AS detail_id,
    wod.workorder_code,
    COALESCE(wo.workorder_type::text, req.request_type::text, 'CM') AS workorder_type,
    wod.request_code,
    wod.task_no,
    
    -- ข้อมูลเครื่องจักรและชิ้นส่วน (Asset & Component Hierarchy)
    COALESCE(wod.asset_code, wo.asset_code, req.asset_code) AS asset_code,
    COALESCE(mm.asset_name, wo.asset_code, wod.asset_code, 'เครื่องจักรทั่วไป') AS asset_name,
    COALESCE(wod.component_code, req.component_code) AS component_code,
    COALESCE(mc.description, mc.asset_name, wod.component_code) AS component_name,
    mm.category,
    mm.machine_group,
    COALESCE(mm.department, req.reporter_by, '-') AS department,
    COALESCE(mm.location, '-') AS location,
    
    -- ตัวเลข Downtime และเวลาที่ใช้ซ่อม (Downtime & Work Time Metrics)
    COALESCE(wod.down_time, wo.total_down_time, 0)::numeric AS down_time_minutes,
    ROUND(COALESCE(wod.down_time, wo.total_down_time, 0)::numeric / 60.0, 2) AS down_time_hours,
    COALESCE(wod.working_time, wo.total_working_time, 0)::numeric AS working_time_minutes,
    ROUND(COALESCE(wod.working_time, wo.total_working_time, 0)::numeric / 60.0, 2) AS working_time_hours,
    
    -- รหัสและประเภท Downtime (Downtime Classification)
    wod.downtime_code,
    COALESCE(ldc.name, wod.downtime_code) AS downtime_name,
    CASE 
        WHEN wod.downtime_code = 'M' THEN 'เครื่องจักรขัดข้องทางกล (Mechanical)'
        WHEN wod.downtime_code = 'E' THEN 'ระบบไฟฟ้า/คอนโทรล (Electrical)'
        WHEN wod.downtime_code = 'O' THEN 'ข้อผิดพลาดจากการปฏิบัติงาน (Operational)'
        WHEN wod.downtime_code = 'U' THEN 'ปัจจัยภายนอก/ควบคุมไม่ได้ (Uncontrollable)'
        ELSE COALESCE(ldc.name, 'ไม่ระบุ')
    END AS downtime_category_desc,
    
    -- ลำดับเวลา (Timelines & Dates)
    req.created_at AS request_created_at,
    req.request_date,
    wo.workorder_date,
    COALESCE(wod.start_date, wo.start_date) AS repair_start_date,
    COALESCE(wod.end_date, wo.end_date, wo.tech_completed_at) AS repair_end_date,
    wo.due_date,
    wod.created_at AS detail_created_at,
    
    -- สาเหตุและการแก้ไข (Root Cause & Action Taken)
    req.issue_description,
    COALESCE(wod.root_cause, wo.root_cause) AS root_cause,
    COALESCE(wod.action_taken, wo.action_taken) AS action_taken,
    
    -- สถานะและผู้รับผิดชอบ
    COALESCE(wod.status::text, wo.status::text, 'In Progress') AS status,
    COALESCE(wod.assignee, wo.assignee, '-') AS assignee,
    req.reporter_by
FROM work_order_details wod
LEFT JOIN work_orders wo ON wod.workorder_code = wo.workorder_code
LEFT JOIN requests req ON wod.request_code = req.request_code
LEFT JOIN master_machine mm ON COALESCE(wod.asset_code, wo.asset_code) = mm.asset_code
LEFT JOIN master_machine mc ON COALESCE(wod.component_code, req.component_code) = mc.asset_code
LEFT JOIN lookup_downtime_code ldc ON wod.downtime_code = ldc.code;

COMMENT ON VIEW v_downtime_details IS 'มุมมองรายละเอียดงานซ่อมและเวลาหยุดเครื่อง (Downtime) สำหรับรายงานและวิเคราะห์ประวัติการซ่อม';


-- ------------------------------------------------------------------------------
-- 2. VIEW: v_top10_downtime_workorders (10 อันดับใบงานที่เครื่องหยุดนานที่สุด)
-- ออกแบบสำหรับนำไปแสดงผลบน Dashboard ข้างกราฟ Downtime %
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_top10_downtime_workorders AS
WITH wo_summary AS (
    SELECT 
        wo.workorder_code,
        COALESCE(wo.workorder_type::text, req.request_type::text, 'CM') AS workorder_type,
        wo.request_code,
        COALESCE(wo.asset_code, max_wod.asset_code, req.asset_code) AS asset_code,
        COALESCE(mm.asset_name, wo.asset_code, 'เครื่องจักรทั่วไป') AS asset_name,
        COALESCE(mm.department, '-') AS department,
        COALESCE(mm.location, '-') AS location,
        
        -- ดึง Downtime ที่มากที่สุดระหว่างระดับใบงานและระดับงานย่อย
        GREATEST(
            COALESCE(wo.total_down_time, 0), 
            COALESCE(MAX(wod.down_time), 0)
        )::numeric AS down_time_minutes,
        
        ROUND(GREATEST(
            COALESCE(wo.total_down_time, 0), 
            COALESCE(MAX(wod.down_time), 0)
        )::numeric / 60.0, 2) AS down_time_hours,
        
        GREATEST(
            COALESCE(wo.total_working_time, 0), 
            COALESCE(MAX(wod.working_time), 0)
        )::numeric AS working_time_minutes,
        
        MAX(wod.downtime_code) AS downtime_code,
        MAX(ldc.name) AS downtime_name,
        MAX(COALESCE(wod.root_cause, wo.root_cause)) AS root_cause,
        MAX(COALESCE(wod.action_taken, wo.action_taken)) AS action_taken,
        wo.status,
        COALESCE(wo.assignee, MAX(wod.assignee), '-') AS assignee,
        wo.workorder_date,
        COALESCE(wo.end_date, MAX(wod.end_date), wo.tech_completed_at) AS end_date,
        req.created_at AS request_created_at
    FROM work_orders wo
    LEFT JOIN work_order_details wod ON wo.workorder_code = wod.workorder_code
    LEFT JOIN (
        SELECT workorder_code, MAX(asset_code) as asset_code
        FROM work_order_details
        GROUP BY workorder_code
    ) max_wod ON wo.workorder_code = max_wod.workorder_code
    LEFT JOIN requests req ON wo.request_code = req.request_code
    LEFT JOIN master_machine mm ON COALESCE(wo.asset_code, max_wod.asset_code, req.asset_code) = mm.asset_code
    LEFT JOIN lookup_downtime_code ldc ON wod.downtime_code = ldc.code
    WHERE GREATEST(COALESCE(wo.total_down_time, 0), COALESCE(wod.down_time, 0)) > 0
    GROUP BY 
        wo.workorder_code, wo.workorder_type, req.request_type, wo.request_code, wo.asset_code,
        max_wod.asset_code, req.asset_code, mm.asset_name, mm.department, mm.location,
        wo.total_down_time, wo.total_working_time, wo.status, wo.assignee,
        wo.workorder_date, wo.end_date, wo.tech_completed_at, req.created_at
)
SELECT 
    ROW_NUMBER() OVER (ORDER BY down_time_minutes DESC, working_time_minutes DESC) AS rank,
    workorder_code,
    workorder_type,
    request_code,
    asset_code,
    asset_name,
    department,
    location,
    down_time_minutes,
    down_time_hours,
    working_time_minutes,
    downtime_code,
    COALESCE(downtime_name, downtime_code, '-') AS downtime_name,
    CASE 
        WHEN downtime_code = 'M' THEN 'กลไก (Mechanical)'
        WHEN downtime_code = 'E' THEN 'ไฟฟ้า (Electrical)'
        WHEN downtime_code = 'O' THEN 'ผู้ปฏิบัติงาน (Operational)'
        WHEN downtime_code = 'U' THEN 'ปัจจัยภายนอก (Uncontrollable)'
        ELSE COALESCE(downtime_name, '-')
    END AS downtime_category_label,
    root_cause,
    action_taken,
    status,
    assignee,
    workorder_date,
    end_date,
    request_created_at,
    ROUND(
        (down_time_minutes::numeric / NULLIF(SUM(down_time_minutes) OVER(), 0)) * 100.0, 
        1
    ) AS pct_of_total_downtime
FROM wo_summary
ORDER BY down_time_minutes DESC
LIMIT 10;

COMMENT ON VIEW v_top10_downtime_workorders IS '10 อันดับใบสั่งงานที่เครื่องจักรหยุดทำงานนานที่สุด สำหรับแสดงข้างกราฟ Downtime % บน Dashboard';


-- ------------------------------------------------------------------------------
-- 3. VIEW: v_downtime_summary_asset (สรุปสถิติ Downtime สะสมแยกตามเครื่องจักร)
-- สำหรับวิเคราะห์ความเสี่ยงรายเครื่องจักร (Asset Reliability & MTTR)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_downtime_summary_asset AS
SELECT 
    mm.asset_code,
    mm.asset_name,
    mm.category,
    mm.machine_group,
    COALESCE(mm.department, '-') AS department,
    COALESCE(mm.location, '-') AS location,
    
    -- สรุปจำนวนใบงาน
    COUNT(DISTINCT wo.workorder_code) AS total_work_orders,
    COUNT(DISTINCT CASE WHEN wo.workorder_type = 'BM' THEN wo.workorder_code END) AS total_bm_count,
    COUNT(DISTINCT CASE WHEN wo.workorder_type = 'CM' THEN wo.workorder_code END) AS total_cm_count,
    
    -- เวลารวม Downtime และเวลาช่างซ่อม
    COALESCE(SUM(COALESCE(wod.down_time, wo.total_down_time, 0)), 0)::numeric AS total_downtime_minutes,
    ROUND(COALESCE(SUM(COALESCE(wod.down_time, wo.total_down_time, 0)), 0)::numeric / 60.0, 2) AS total_downtime_hours,
    COALESCE(SUM(COALESCE(wod.working_time, wo.total_working_time, 0)), 0)::numeric AS total_working_minutes,
    ROUND(COALESCE(SUM(COALESCE(wod.working_time, wo.total_working_time, 0)), 0)::numeric / 60.0, 2) AS total_working_hours,
    
    -- ค่าเฉลี่ย Downtime ต่อครั้ง
    ROUND(
        AVG(NULLIF(COALESCE(wod.down_time, wo.total_down_time, 0), 0))::numeric, 
        1
    ) AS avg_downtime_per_incident_minutes,
    
    -- วันที่เกิดงานล่าสุด
    MAX(wo.workorder_date) AS last_workorder_date
FROM master_machine mm
LEFT JOIN work_orders wo ON mm.asset_code = wo.asset_code
LEFT JOIN work_order_details wod ON wo.workorder_code = wod.workorder_code
WHERE mm.part_group IS NULL -- เฉพาะเครื่องจักรหลัก (Parent Assets)
GROUP BY 
    mm.asset_code, mm.asset_name, mm.category, mm.machine_group, 
    mm.department, mm.location;

COMMENT ON VIEW v_downtime_summary_asset IS 'สรุปสถิติเวลาหยุดเครื่องและจำนวนครั้งที่เสียสะสมแยกตามเครื่องจักรหลัก';
