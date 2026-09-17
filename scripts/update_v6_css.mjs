import fs from "fs";

const cssPath = "e:/aut_cmms_v6/workload_dashboard_css.html";
if (fs.existsSync(cssPath)) {
  let c = fs.readFileSync(cssPath, "utf8");
  c = c.replace(
    /\.wl-tech-stats\s*\{[\s\S]*?\.wl-stat-value\s*\{[^}]*\}/,
    `.wl-tech-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
  margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e2e8f0;
}
.wl-stat-box {
  display: flex; justify-content: space-between; align-items: center;
  background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 6px;
  padding: 3px 6px; transition: background 0.15s ease;
}
.wl-stat-box:hover { background: #f1f5f9; }
.wl-stat-label { font-size: 10px; color: #64748b; font-weight: 500; }
.wl-stat-value { font-size: 11px; font-weight: 700; }`
  );
  fs.writeFileSync(cssPath, c, "utf8");
  console.log("v6 CSS updated successfully");
} else {
  console.log("v6 CSS not found");
}
