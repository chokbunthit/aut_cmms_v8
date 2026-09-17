  function openWODrawer(type, reqNo, woNo) {
    if (!woNo && type && (type.startsWith("WO") || (!reqNo && !woNo))) {
      woNo = type;
      type = "CM";
      reqNo = "";
    } else if (!woNo && reqNo && reqNo.startsWith("WO")) {
      woNo = reqNo;
      reqNo = "";
    }
    var drawer = document.getElementById("woDrawer");
    var panel = document.getElementById("woDrawerPanel");
    var loading = document.getElementById("woDrawerLoading");
    if (loading) loading.classList.remove("hidden");

    if (type === "PM") {
      document.getElementById("drawerTitle").innerText = "PM Work Order Treatment";
      document.getElementById("sourceInfoLabel").innerText = "Source PM Plan Information";
      document.getElementById("sourceStatusBadge").innerHTML = '<i class="fa-solid fa-calendar-check text-[10px]"></i> Scheduled PM Plan';
      document.getElementById("sourceStatusBadge").className = "text-xs font-bold text-blue-600 flex items-center gap-1";
    } else {
      document.getElementById("drawerTitle").innerText = "Repair Work Order Assignment";
      document.getElementById("sourceInfoLabel").innerText = "Source Request Information";
      document.getElementById("sourceStatusBadge").innerHTML = '<i class="fa-solid fa-clock-rotate-left text-[10px]"></i> Waiting for Work Order';
      document.getElementById("sourceStatusBadge").className = "text-xs font-bold text-amber-600 flex items-center gap-1";
    }
    document.getElementById("wo_RequestDocCode").innerText = reqNo || "";
    document.getElementById("drawerWOCodeHeader").innerText = woNo || "";

    drawer.classList.remove("hidden");
    setTimeout(function () {
      panel.classList.remove("translate-x-full");
    }, 50);

    loadWODrawerData(woNo, type);
  }

  function loadWODrawerData(woNo, type) {
    if (!woNo) {
      console.warn("No WO code provided");
      return;
    }
    var loading = document.getElementById("woDrawerLoading");
    google.script.run
      .withSuccessHandler(function (data) {
        if (loading) loading.classList.add("hidden");
        console.log("WO drawer data received:", JSON.stringify(data).substring(0, 200));
        if (!data) {
          console.error("No data returned for WO:", woNo);
          return;
        }
        populateWODrawer(data, type);
      })
      .withFailureHandler(function (err) {
        if (loading) loading.classList.add("hidden");
        console.error("WO Drawer load FAILED:", JSON.stringify(err));
        alert("เกิดข้อผิดพลาดในการโหลดข้อมูล: " + (err.message || err));
      })
      .getWODrawerData(woNo);
  }

  function populateWODrawer(data, type) {
    if (!data) return;
    window._woDrawerData = data;
    var components = data.components || [];
    window._woCurrentComponentCount = components.length;

    var wo = data.wo || {};
    var reqInfo = data.request || {};
    var assetInfo = data.assetInfo || {};
    var assignees = data.assignees || [];
    var expenses = data.expenses || [];
    var totalExp = data.totalExpenses || 0;

    var p = (reqInfo.priority || "Normal").toLowerCase();
    var priorityText = p === "critical" ? "Critical" : p === "high" ? "High" : p === "medium" ? "Medium" : (reqInfo.priority || "Normal");
    var priorityClass = p === "critical" ? "text-red-700" : p === "high" ? "text-orange-600" : p === "medium" ? "text-amber-600" : "text-slate-600";
    document.getElementById("drawerPriority").innerText = (reqInfo.request_type || wo.request_type || type || "-") + " / " + priorityText;
    document.getElementById("drawerPriority").className = "font-bold " + priorityClass;
    document.getElementById("drawerWOTypeHeader").innerText = wo.assignee_type === "VENDOR" ? "ผู้รับเหมาช่วง" : "ดำเนินการเอง";

    var assetName = assetInfo.asset_name || wo.asset_code || "-";
    var location = assetInfo.location || "-";
    var department = assetInfo.department || "-";
    document.getElementById("drawerAssetTarget").innerText = (wo.asset_code || "-") + " (" + assetName + ") — " + location + ", " + department;

    var reporter = reqInfo.reporter_name || "System";
    var reqDate = reqInfo.request_date || "";
    document.getElementById("drawerReportedInfo").innerText = reporter + (reqDate ? " (" + reqDate + ")" : "");

    var desc = reqInfo.issue_description || "-";
    document.getElementById("drawerDesc").innerText = desc;

    // Request Image
    var imgContainer = document.getElementById("drawer-images-container");
    if (reqInfo.issue_image) {
      imgContainer.innerHTML =
        '<span class="text-gray-400 block mb-1 text-[10px] uppercase tracking-wider font-bold">Attached Image from Request</span>' +
        '<div class="flex gap-2 flex-wrap">' +
        '<img src="' + reqInfo.issue_image + '" class="w-24 h-20 rounded-lg object-cover border border-gray-200 cursor-zoom-in hover:shadow-md transition-shadow" onclick="window.open(this.src, \'_blank\')" onerror="this.parentElement.innerHTML=\'<span class=\\\'text-gray-400 text-[11px]\\\'>ไม่พบรูป</span>\'">' +
        '</div>';
    } else {
      imgContainer.innerHTML = '<span class="text-gray-300 text-[11px] italic">No image attached</span>';
    }

    // WO Code
    document.getElementById("drawerWOCodeHeader").innerText = wo.wo_code || "-";

    // WO Status dropdown
    var woStatus = wo.status || "Pending";
    var statusSelect = document.getElementById("drawerWOStatus");
    if (statusSelect) {
      for (var i = 0; i < statusSelect.options.length; i++) {
        if (statusSelect.options[i].value === woStatus) { statusSelect.selectedIndex = i; break; }
      }
    }

    // Assignees - display as badges + edit button
    var assigneeDisplay = document.getElementById("drawerAssigneeDisplay");
    var assigneeEdit = document.getElementById("drawerAssigneeEdit");
    if (assigneeDisplay) {
      if (assignees.length > 0) {
        var badges = assignees.map(function (a) {
          var sc = a.status === "Completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : a.status === "In Progress" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200";
          return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ' + sc + '">' + escHtml(a.name) + '</span>';
        }).join('');
        assigneeDisplay.innerHTML = badges + ' <button type="button" onclick="toggleAssigneeEdit(true)" class="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"><i class="fa-solid fa-pen text-[8px]"></i>แก้ไข</button>';
      } else {
        assigneeDisplay.innerHTML = '<span class="text-gray-400 text-[11px]">ยังไม่มีการมอบหมาย</span> <button type="button" onclick="toggleAssigneeEdit(true)" class="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"><i class="fa-solid fa-pen text-[8px]"></i>แก้ไข</button>';
      }
    }
    if (assigneeEdit) assigneeEdit.classList.add("hidden");
    window._woCurrentAssignees = assignees.map(function (a) { return a.name; });

    // Component list
    var compSection = document.getElementById("drawer-components-section");
    var compList = document.getElementById("drawerComponentList");
    var isVendor = (wo.assignee_type === "VENDOR");
    window._woAssigneeType = wo.assignee_type || "";
    window._woComponents = components;
    if (compList && components.length > 0) {
      if (compSection) compSection.classList.remove("hidden");
      var compHtml = '';
      var woTypeUpper = String(wo.workorder_type || '').toUpperCase();
      if ((woTypeUpper === "BM" || woTypeUpper === "CM") && components.length === 1) {
        compHtml += '<div class="mb-2 px-2.5 py-1.5 bg-blue-50/80 border border-blue-200/80 rounded-lg text-[10px] text-blue-800 flex items-center gap-1.5"><i class="fa-solid fa-circle-info text-blue-500 text-[11px] shrink-0"></i> <span>ใบสั่งงาน <b>' + escHtml(woTypeUpper) + '</b> มี 1 รายการ: เมื่อบันทึกปิดงานส่วนนี้ ระบบจะอัปเดตสถานะของ Work Order และใบแจ้งซ่อม (Request) ให้อัตโนมัติ</span></div>';
      }
      components.forEach(function (c, idx) {
        var sc = c.status === "Completed" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : c.status === "In Progress" ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-amber-50 text-amber-600 border-amber-200";
        var scText = c.status === "Completed" ? "text-emerald-600" : c.status === "In Progress" ? "text-blue-600" : "text-amber-600";

        compHtml += '<div class="border border-gray-200 rounded-lg overflow-hidden mb-1.5">';
        compHtml += '<div class="flex items-center gap-2 px-2 py-1.5 bg-gray-50/80 cursor-pointer hover:bg-gray-100 transition-colors" onclick="toggleWODrawerCompForm(' + idx + ')">';
        compHtml += '<i class="fa-solid fa-chevron-right text-[8px] text-gray-400 transition-transform" id="compChevron-' + idx + '"></i>';
        compHtml += '<span class="font-bold text-blue-700 font-mono text-[10px]">' + escHtml(c.component_code) + '</span>';
        compHtml += '<span class="text-gray-500 text-[10px] truncate max-w-[120px]">' + escHtml(c.component_name || '-') + '</span>';
        if (c.task_no) compHtml += '<span class="px-1.5 py-0.5 bg-cyan-50 text-cyan-600 border border-cyan-200 rounded text-[8px] font-bold">' + escHtml(c.task_no) + '</span>';
        if (c.pm_type) compHtml += '<span class="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded text-[8px] font-bold">' + escHtml(c.pm_type) + '</span>';
        compHtml += '<span class="ml-auto px-1.5 py-0.5 ' + sc + ' border rounded font-bold text-[8px]">' + escHtml(c.status) + '</span>';
        if (isVendor && c.status !== "Completed") {
          compHtml += '<button type="button" onclick="event.stopPropagation(); openVendorCloseModal(\'' + escHtml(c.component_code) + '\', \'' + escHtml(c.component_name || '') + '\')" class="px-2 py-0.5 text-[8px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-all">ปิดงาน</button>';
        }
        compHtml += '</div>';
        compHtml += '<div id="compForm-' + idx + '" class="hidden border-t border-gray-200 p-2 bg-white"></div>';
        compHtml += '</div>';
      });
      compList.innerHTML = compHtml;
    } else {
      if (compSection) compSection.classList.add("hidden");
    }

    // Due date
    var dueEl = document.getElementById("drawerDueDate");
    var dueBadge = document.getElementById("drawerDueDateBadge");
    var rawDue = wo.due_date || wo.dueDate || "";
    if (dueEl) {
      var dateVal = "";
      if (rawDue) {
        var s = String(rawDue).trim();
        if (s.includes("T")) dateVal = s.split("T")[0];
        else if (s.includes(" ")) dateVal = s.split(" ")[0];
        else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) dateVal = s;
        else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
          var p = s.split("/");
          dateVal = p[2] + "-" + p[1] + "-" + p[0];
        }
      }
      dueEl.value = dateVal;
      if (dueBadge) {
        if (dateVal) {
          dueBadge.textContent = dateVal;
          dueBadge.classList.remove("hidden");
        } else {
          dueBadge.classList.add("hidden");
        }
      }
    }

    // Source status badge
    var statusBadge = document.getElementById("sourceStatusBadge");
    if (statusBadge) {
      if (woStatus === "Pending") {
        statusBadge.innerHTML = '<i class="fa-solid fa-clock-rotate-left text-[10px]"></i> Pending';
        statusBadge.className = "text-xs font-bold text-amber-600 flex items-center gap-1";
      } else if (woStatus === "In Progress") {
        statusBadge.innerHTML = '<i class="fa-solid fa-spinner text-[10px]"></i> In Progress';
        statusBadge.className = "text-xs font-bold text-blue-600 flex items-center gap-1";
      } else if (woStatus === "Waiting Parts") {
        statusBadge.innerHTML = '<i class="fa-solid fa-box-open text-[10px]"></i> Waiting Parts';
        statusBadge.className = "text-xs font-bold text-orange-600 flex items-center gap-1";
      } else if (woStatus === "Completed") {
        statusBadge.innerHTML = '<i class="fa-solid fa-circle-check text-[10px]"></i> Completed';
        statusBadge.className = "text-xs font-bold text-emerald-600 flex items-center gap-1";
      }
    }

    // Closing tab status
    var closingStatus = document.getElementById("drawerStatus");
    if (closingStatus) {
      for (var j = 0; j < closingStatus.options.length; j++) {
        if (closingStatus.options[j].value === woStatus) { closingStatus.selectedIndex = j; break; }
      }
    }

    // Pre-fill closing tab from first component detail
    if (components.length > 0) {
      var c0 = components[0];
      var elRC = document.getElementById("drawerRootCause");
      if (elRC) elRC.value = c0.root_cause || "";
      var elSV = document.getElementById("drawerMeasured");
      if (elSV) elSV.value = c0.measured_value || "";
      var elDT = document.getElementById("drawerDowntime");
      if (elDT) elDT.value = c0.down_time || "";
      var elAT = document.getElementById("drawerActionTaken");
      if (elAT) elAT.value = c0.action_taken || "";
      var elSD = document.getElementById("drawerStartDate");
      if (elSD && c0.start_date) {
        try {
          var sd = new Date(c0.start_date);
          if (!isNaN(sd.getTime())) elSD.value = sd.toISOString().slice(0, 16);
        } catch (e) { }
      }
      var elED = document.getElementById("drawerEndDate");
      if (elED && c0.end_date) {
        try {
          var ed = new Date(c0.end_date);
          if (!isNaN(ed.getTime())) elED.value = ed.toISOString().slice(0, 16);
        } catch (e) { }
      }
      var elWT = document.getElementById("drawerWorkingTime");
      if (elWT) elWT.value = c0.working_time || "";

      // Init listeners after pre-fill
      if (typeof initDrawerDateListeners === "function") initDrawerDateListeners();
      // Auto-calc if dates are pre-filled but working_time is empty
      if (elWT && !elWT.value && typeof calcDrawerWorkingTime === "function") {
        calcDrawerWorkingTime();
      }
    }

    renderWODrawerExpenses(expenses, totalExp);
  }

  function renderWODrawerExpenses(expenses, totalExp) {
    var tbody = document.getElementById("woDrawerExpenseList");
    if (!tbody) return;
    if (!expenses || expenses.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-gray-400 text-[11px]">ยังไม่มีรายการค่าใช้จ่าย</td></tr>';
      return;
    }
    tbody.innerHTML = expenses.map(function (exp) {
      var badgeClass = exp.type === "Spare Parts" ? "bg-blue-50 text-blue-600" : exp.type === "Outsource" ? "bg-amber-50 text-amber-600" : "bg-purple-50 text-purple-600";
      return '<tr>' +
        '<td class="p-2"><span class="px-1.5 py-0.5 ' + badgeClass + ' rounded font-bold text-[9px]">' + exp.type + '</span></td>' +
        '<td class="p-2 text-gray-600">' + exp.description + '</td>' +
        '<td class="p-2 text-right font-bold text-gray-900">' + Number(exp.amount).toFixed(2) + '</td>' +
        '<td class="p-2 text-center"><button type="button" onclick="this.closest(\'tr\').remove()" class="text-gray-300 hover:text-red-500"><i class="fa-solid fa-trash-can"></i></button></td>' +
        '</tr>';
    }).join('');
  }

  function toggleWODrawerCompForm(idx) {
    var formDiv = document.getElementById("compForm-" + idx);
    var chevron = document.getElementById("compChevron-" + idx);
    if (!formDiv) return;
    if (formDiv.classList.contains("hidden")) {
      formDiv.classList.remove("hidden");
      if (chevron) chevron.style.transform = "rotate(90deg)";
      if (!formDiv.innerHTML || formDiv.innerHTML.trim() === "") {
        renderWODrawerCompTaskForm(formDiv, idx);
      }
    } else {
      formDiv.classList.add("hidden");
      if (chevron) chevron.style.transform = "";
    }
  }

  function renderWODrawerCompTaskForm(container, idx) {
    var comps = window._woComponents || [];
    var c = comps[idx];
    if (!c) return;

    var compKey = (c.component_code || "").replace(/[^a-zA-Z0-9]/g, "_");
    var taskNo = c.task_no || "";
    var pmType = c.pm_type || "";
    var status = c.status || "Pending";

    var stepsHtml = "";
    if (taskNo && pmType) {
      stepsHtml = '<div class="bg-gray-50 rounded-lg border border-gray-200 p-2 mb-2">';
      stepsHtml += '<div class="text-[10px] font-bold text-gray-600 mb-1 flex items-center gap-1"><i class="fa-solid fa-list-check text-blue-500"></i> Task: ' + escHtml(taskNo) + ' | ' + escHtml(pmType) + '</div>';
      stepsHtml += '<div id="wodTaskSteps-' + compKey + '" class="text-[10px] text-gray-400">กำลังโหลด...</div>';
      stepsHtml += '</div>';
    }

    var imgBeforeHtml = '';
    var imgAfterHtml = '';
    if (c.image_before && c.image_before !== "-") {
      imgBeforeHtml = '<div class="mt-1"><img src="' + escHtml(c.image_before) + '" class="w-16 h-12 rounded object-cover border border-gray-200 cursor-pointer hover:shadow" onclick="window.open(this.src, \'_blank\')" onerror="this.parentElement.innerHTML=\'<span class=\\\'text-gray-300 text-[9px]\\\'>รูปไม่โหลด</span>\'" /></div>';
    }
    if (c.image_result && c.image_result !== "-") {
      imgAfterHtml = '<div class="mt-1"><img src="' + escHtml(c.image_result) + '" class="w-16 h-12 rounded object-cover border border-gray-200 cursor-pointer hover:shadow" onclick="window.open(this.src, \'_blank\')" onerror="this.parentElement.innerHTML=\'<span class=\\\'text-gray-300 text-[9px]\\\'>รูปไม่โหลด</span>\'" /></div>';
    }

    var html = stepsHtml +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' +
      '<div><label class="text-[10px] font-bold text-gray-500 mb-0.5 block">Root Cause</label>' +
      '<input type="text" id="wod-rc-' + compKey + '" value="' + escHtml(c.root_cause || "") + '" placeholder="..." class="w-full text-[10px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" /></div>' +
      '<div><label class="text-[10px] font-bold text-gray-500 mb-0.5 block">Action Taken</label>' +
      '<input type="text" id="wod-at-' + compKey + '" value="' + escHtml(c.action_taken || "") + '" placeholder="..." class="w-full text-[10px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" /></div>' +
      '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">' +
      '<div><label class="text-[10px] font-bold text-gray-500 mb-0.5 block">Start DateTime</label>' +
      '<input type="datetime-local" id="wod-sd-' + compKey + '" value="' + (c.start_date ? c.start_date.slice(0, 16) : "") + '" onchange="calcWODCompTime(\'' + compKey + '\')" class="w-full text-[10px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" /></div>' +
      '<div><label class="text-[10px] font-bold text-gray-500 mb-0.5 block">End DateTime</label>' +
      '<input type="datetime-local" id="wod-ed-' + compKey + '" value="' + (c.end_date ? c.end_date.slice(0, 16) : "") + '" onchange="calcWODCompTime(\'' + compKey + '\')" class="w-full text-[10px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" /></div>' +
      '<div><label class="text-[10px] font-bold text-gray-500 mb-0.5 block">Working Time (hrs)</label>' +
      '<input type="text" id="wod-wt-' + compKey + '" value="' + escHtml(c.working_time || "") + '" readonly class="w-full text-[10px] border border-gray-200 rounded-md px-2 py-1 bg-gray-50 text-gray-600 font-bold" /></div>' +
      '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">' +
      '<div><label class="text-[10px] font-bold text-gray-500 mb-0.5 block">Down Time (hrs)</label>' +
      '<input type="number" step="0.25" min="0" id="wod-dt-' + compKey + '" value="' + escHtml(c.down_time || "") + '" class="w-full text-[10px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" /></div>' +
      '<div><label class="text-[10px] font-bold text-gray-500 mb-0.5 block">Measured Value</label>' +
      '<input type="text" id="wod-mv-' + compKey + '" value="' + escHtml(c.measured_value || "") + '" placeholder="..." class="w-full text-[10px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" /></div>' +
      '<div class="flex items-end gap-2">' +
      (imgBeforeHtml ? '<div><label class="text-[10px] font-bold text-gray-500 mb-0.5 block">Image Before</label>' + imgBeforeHtml + '</div>' : '') +
      (imgAfterHtml ? '<div><label class="text-[10px] font-bold text-gray-500 mb-0.5 block">Image Result</label>' + imgAfterHtml + '</div>' : '') +
      '</div>' +
      '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' +
      '<div><label class="text-[10px] font-bold text-gray-500 mb-0.5 block">Image Before</label>' +
      '<input type="file" accept="image/*" id="wod-ib-' + compKey + '" class="w-full text-[10px] border border-gray-200 rounded-md px-2 py-1 text-gray-500" /></div>' +
      '<div><label class="text-[10px] font-bold text-gray-500 mb-0.5 block">Image Result</label>' +
      '<input type="file" accept="image/*" id="wod-ir-' + compKey + '" class="w-full text-[10px] border border-gray-200 rounded-md px-2 py-1 text-gray-500" /></div>' +
      '</div>' +
      '<div class="flex justify-end pt-1">' +
      '<button type="button" onclick="saveWODrawerCompResult(\'' + escHtml(c.component_code) + '\')" id="wod-btn-' + compKey + '" class="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-sm">' +
      '<i class="fa-solid fa-floppy-disk text-[9px]"></i> บันทึก</button></div>';

    container.innerHTML = html;

    // Load task steps
    if (taskNo && pmType) {
      var stepsContainer = document.getElementById("wodTaskSteps-" + compKey);
      google.script.run
        .withSuccessHandler(function (taskData) {
          if (stepsContainer && taskData && taskData.steps && taskData.steps.length > 0) {
            var sHtml = '';
            for (var s = 0; s < taskData.steps.length; s++) {
              sHtml += '<div class="flex items-center gap-2 py-0.5">' +
                '<span class="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-[8px] shrink-0">' + taskData.steps[s].stepNo + '</span>' +
                '<span>' + escHtml(taskData.steps[s].stepName) + '</span></div>';
            }
            stepsContainer.innerHTML = sHtml;
          } else if (stepsContainer) {
            stepsContainer.innerHTML = '<span class="text-gray-400">ไม่มี steps</span>';
          }
        })
        .withFailureHandler(function () {
          if (stepsContainer) stepsContainer.innerHTML = '<span class="text-gray-400">ไม่สามารถโหลด steps ได้</span>';
        })
        .getTaskListData(taskNo, pmType);
    }
  }

  function calcWODCompTime(key) {
    var sd = document.getElementById("wod-sd-" + key);
    var ed = document.getElementById("wod-ed-" + key);
    var wt = document.getElementById("wod-wt-" + key);
    if (!sd || !ed || !wt) return;
    if (sd.value && ed.value) {
      var diffMs = new Date(ed.value) - new Date(sd.value);
      if (diffMs >= 0) {
        wt.value = (diffMs / 3600000).toFixed(2);
      } else {
        wt.value = "";
      }
    }
  }

  function saveWODrawerCompResult(componentCode) {
    var woNo = document.getElementById("drawerWOCodeHeader").innerText;
    if (!woNo || woNo === "-") return;

    var compKey = componentCode.replace(/[^a-zA-Z0-9]/g, "_");
    var rootCause = (document.getElementById("wod-rc-" + compKey) || {}).value || "";
    var actionTaken = (document.getElementById("wod-at-" + compKey) || {}).value || "";
    var measuredValue = (document.getElementById("wod-mv-" + compKey) || {}).value || "";
    var startDate = (document.getElementById("wod-sd-" + compKey) || {}).value || "";
    var endDate = (document.getElementById("wod-ed-" + compKey) || {}).value || "";
    var workingTime = (document.getElementById("wod-wt-" + compKey) || {}).value || "";
    var downTime = (document.getElementById("wod-dt-" + compKey) || {}).value || "";

    if (!actionTaken) {
      alert("กรุณากรอก Action Taken");
      return;
    }

    var btn = document.getElementById("wod-btn-" + compKey);
    var origText = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin text-[9px]"></i> Saving...'; }

    var payload = {
      woNo: woNo,
      componentCode: componentCode,
      root_cause: rootCause,
      action_taken: actionTaken,
      measured_value: measuredValue,
      start_date: startDate,
      end_date: endDate,
      working_time: workingTime,
      down_time: downTime,
      assignee: sessionStorage.getItem("userName") || "",
      imageBefore: null,
      imageAfter: null
    };

    var ibInput = document.getElementById("wod-ib-" + compKey);
    var irInput = document.getElementById("wod-ir-" + compKey);
    var hasFiles = (ibInput && ibInput.files && ibInput.files[0]) || (irInput && irInput.files && irInput.files[0]);

    function doWodSave() {
      google.script.run
        .withSuccessHandler(function (response) {
          if (btn) { btn.disabled = false; btn.innerHTML = origText; }
          if (response && response.success) {
            alert("บันทึกสำเร็จ!");
            loadWODrawerData(woNo, null);
            if (typeof loadWorkOrders === "function") loadWorkOrders();
            if (typeof loadWorkOrderData === "function") loadWorkOrderData();
            if (typeof loadRequests === "function") loadRequests();
            if (typeof loadRequestData === "function") loadRequestData();
          } else {
            alert("บันทึกไม่สำเร็จ: " + (response ? response.error : "Unknown"));
          }
        })
        .withFailureHandler(function (err) {
          if (btn) { btn.disabled = false; btn.innerHTML = origText; }
          alert("เกิดข้อผิดพลาด: " + err);
        })
        .saveComponentTaskResult(payload);
    }

    if (hasFiles) {
      var promises = [];
      if (ibInput && ibInput.files && ibInput.files[0]) {
        promises.push(convertFileToBase64(ibInput.files[0]).then(function (d) { payload.imageBefore = d; }));
      }
      if (irInput && irInput.files && irInput.files[0]) {
        promises.push(convertFileToBase64(irInput.files[0]).then(function (d) { payload.imageAfter = d; }));
      }
      Promise.all(promises).then(doWodSave).catch(doWodSave);
    } else {
      doWodSave();
    }
  }

  function toggleAssigneeEdit(show) {
    var display = document.getElementById("drawerAssigneeDisplay");
    var edit = document.getElementById("drawerAssigneeEdit");
    if (show) {
      if (display) display.classList.add("hidden");
      if (edit) edit.classList.remove("hidden");
      loadWOAssigneeCheckboxes();
    } else {
      if (display) display.classList.remove("hidden");
      if (edit) edit.classList.add("hidden");
    }
  }

  function loadWOAssigneeCheckboxes() {
    var container = document.getElementById("woAssigneeCheckboxList");
    if (!container) return;
    container.innerHTML = '<div class="flex items-center justify-center p-3 text-xs text-gray-400 gap-2"><i class="fa-solid fa-spinner animate-spin"></i> กำลังโหลด...</div>';
    var current = window._woCurrentAssignees || [];
    google.script.run
      .withSuccessHandler(function (technicians) {
        if (!technicians || technicians.length === 0) {
          container.innerHTML = '<div class="p-3 text-xs text-gray-400 text-center">ไม่พบรายชื่อช่าง</div>';
          return;
        }
        container.innerHTML = technicians.map(function (t) {
          var checked = current.indexOf(t.name) !== -1 ? "checked" : "";
          var count = t.pending_count || 0;
          var badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
          var badgeText = "ว่าง";
          if (count > 0 && count <= 3) { badgeClass = "bg-amber-50 text-amber-700 border-amber-200"; badgeText = count + " งาน"; }
          else if (count > 3) { badgeClass = "bg-red-50 text-red-700 border-red-200"; badgeText = count + " งาน"; }
          return '<label class="flex items-center gap-2 px-3 py-2 hover:bg-blue-50/50 cursor-pointer transition-colors">' +
            '<input type="checkbox" name="woAssigneeCb" value="' + escHtml(t.name) + '" data-id="' + escHtml(t.user_id || '') + '" ' + checked + ' class="w-3.5 h-3.5 rounded border-gray-300 text-blue-600">' +
            '<div class="flex-1 min-w-0"><div class="text-[11px] font-semibold text-gray-800 truncate">' + escHtml(t.name) + '</div></div>' +
            '<span class="text-[10px] font-bold rounded-full border px-1.5 py-0.5 ' + badgeClass + '">' + badgeText + '</span>' +
            '</label>';
        }).join('');
      })
      .withFailureHandler(function (err) {
        console.error(err);
        container.innerHTML = '<div class="p-3 text-xs text-red-500 text-center">โหลดรายชื่อไม่สำเร็จ</div>';
      })
      .getTechnicianList();
  }

  function saveWOAssignees() {
    var woNo = document.getElementById("drawerWOCodeHeader").innerText;
    var checked = document.querySelectorAll('input[name="woAssigneeCb"]:checked');
    var names = Array.from(checked).map(function (cb) { return cb.value; });
    var ids = Array.from(checked).map(function (cb) { return cb.getAttribute("data-id") || ""; });
    if (names.length === 0) { alert("กรุณาเลือกช่างอย่างน้อย 1 คน"); return; }
    var btn = event.target;
    btn.disabled = true;
    btn.textContent = "กำลังบันทึก...";
    google.script.run
      .withSuccessHandler(function (result) {
        btn.disabled = false;
        btn.textContent = "บันทึก";
        if (result && result.success) {
          toggleAssigneeEdit(false);
          loadWODrawerData(woNo, null);
        } else {
          alert("บันทึกไม่สำเร็จ: " + (result ? result.message : "Unknown error"));
        }
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "บันทึก";
        console.error(err);
        alert("เกิดข้อผิดพลาดในการบันทึก");
      })
      .updateWOAssignees(woNo, names, ids);
  }

  function closeWODrawer() {
    var drawer = document.getElementById("woDrawer");
    var panel = document.getElementById("woDrawerPanel");
    closeWOStepsPanel();
    panel.classList.add("translate-x-full");
    setTimeout(function () {
      drawer.classList.add("hidden");
    }, 300);
  }

  async function saveWODrawerData(btnEl) {
    var woNo = document.getElementById("drawerWOCodeHeader").innerText;
    if (!woNo || woNo === "-") {
      alert("ไม่พบรหัสใบสั่งงาน");
      return;
    }

    var dueDate = document.getElementById("drawerDueDate").value;
    var rawExpenses = collectExpenseRows('woDrawer');
    var expenses = rawExpenses.filter(function (exp) {
      return exp.type && exp.type !== "ยังไม่มีรายการค่าใช้จ่าย" && exp.description;
    });

    var payload = {
      woNo: woNo,
      dueDate: dueDate,
      expenses: expenses,
      userName: sessionStorage.getItem("userName") || ""
    };

    // Always collect closing info
    var status = document.getElementById("drawerStatus").value;
    var rootCause = document.getElementById("drawerRootCause") ? document.getElementById("drawerRootCause").value.trim() : "";
    var measuredValue = document.getElementById("drawerMeasured").value.trim();
    var downtime = Number(document.getElementById("drawerDowntime").value) || 0;
    var actionTaken = document.getElementById("drawerActionTaken").value.trim();
    var startDate = document.getElementById("drawerStartDate") ? document.getElementById("drawerStartDate").value : "";
    var endDate = document.getElementById("drawerEndDate") ? document.getElementById("drawerEndDate").value : "";
    var workingTime = Number(document.getElementById("drawerWorkingTime") ? document.getElementById("drawerWorkingTime").value : 0) || 0;

    // Images
    var imageBefore = await getBase64FromFileEl("woImageBefore");
    var imageAfter = await getBase64FromFileEl("woImageAfter");

    payload.closing = {
      status: status,
      rootCause: rootCause,
      measuredValue: measuredValue,
      downtime: downtime,
      actionTaken: actionTaken,
      startDate: startDate,
      endDate: endDate,
      workingTime: workingTime,
      imageBefore: imageBefore,
      imageAfter: imageAfter
    };

    // Disable save button to prevent double click
    var actualBtn = btnEl ? (btnEl.closest ? btnEl.closest("button") || btnEl : null) : null;
    var originalText = "";
    if (actualBtn) {
      originalText = actualBtn.innerHTML;
      actualBtn.disabled = true;
      actualBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> กำลังบันทึก...';
    }

    google.script.run
      .withSuccessHandler(function (result) {
        if (actualBtn) {
          actualBtn.disabled = false;
          actualBtn.innerHTML = originalText;
        }
        if (result && result.success) {
          alert("บันทึกข้อมูลสำเร็จเรียบร้อยแล้ว!");
          closeWODrawer();
          if (typeof loadWorkOrders === "function") {
            loadWorkOrders(); // Refresh table on workorder page
          }
          if (typeof loadMyWork === "function") {
            loadMyWork(); // Refresh work list on my work page
          }
        } else {
          alert("บันทึกไม่สำเร็จ: " + (result ? result.error : "Unknown error"));
        }
      })
      .withFailureHandler(function (err) {
        if (actualBtn) {
          actualBtn.disabled = false;
          actualBtn.innerHTML = originalText;
        }
        console.error("Save WO Drawer FAILED:", err);
        alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + err);
      })
      .updateWODrawerData(payload);
  }

  async function getBase64FromFileEl(elId) {
    var el = document.getElementById(elId);
    if (el && el.files && el.files[0]) {
      try {
        return await convertFileToBase64(el.files[0]);
      } catch (err) {
        console.error("Error converting file: ", err);
        return null;
      }
    }
    return null;
  }

  // === Vendor Closure Modal ===
  var _vendorCloseCompCode = "";

  function openVendorCloseModal(compCode, compName) {
    _vendorCloseCompCode = compCode;
    document.getElementById("vendorCloseCompInfo").textContent = compCode + " — " + (compName || "-");
    document.getElementById("vendorCloseStatus").value = "Completed";
    document.getElementById("vendorCloseMeasured").value = "";
    document.getElementById("vendorCloseDowntime").value = "";
    document.getElementById("vendorCloseAction").value = "";
    document.getElementById("vendorCloseImgBefore").value = "";
    document.getElementById("vendorCloseImgAfter").value = "";

    var modal = document.getElementById("vendorCloseModal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }

  function closeVendorCloseModal() {
    var modal = document.getElementById("vendorCloseModal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }

  async function submitVendorClose() {
    var woNo = document.getElementById("drawerWOCodeHeader").innerText;
    var status = document.getElementById("vendorCloseStatus").value;
    var measuredValue = document.getElementById("vendorCloseMeasured").value.trim();
    var downtime = Number(document.getElementById("vendorCloseDowntime").value) || 0;
    var actionTaken = document.getElementById("vendorCloseAction").value.trim();

    if (!actionTaken) { alert("กรุณากรอกรายละเอียดการแก้ไข (Action Taken)"); return; }

    var imageBefore = await getBase64FromFileEl("vendorCloseImgBefore");
    var imageAfter = await getBase64FromFileEl("vendorCloseImgAfter");

    // Find component data from drawer
    var compCode = _vendorCloseCompCode;
    var woData = window._woDrawerData || {};
    var wo = woData.wo || {};
    var reqInfo = woData.request || {};
    var assetInfo = woData.assetInfo || {};
    var components = woData.components || [];
    var matchedComp = components.find(function (c) { return c.component_code === compCode; });

    var btn = document.getElementById("vendorCloseSubmitBtn");
    var origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin text-[10px]"></i> กำลังบันทึก...';

    google.script.run
      .withSuccessHandler(function (result) {
        btn.disabled = false;
        btn.innerHTML = origText;
        if (result && result.success) {
          alert("บันทึกปิดงานสำเร็จ!");
          closeVendorCloseModal();
          loadWODrawerData(woNo, null);
          if (typeof loadWorkOrders === "function") loadWorkOrders();
          if (typeof loadMyWork === "function") loadMyWork();
        } else {
          alert("บันทึกไม่สำเร็จ: " + (result ? result.error : "Unknown error"));
        }
      })
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.innerHTML = origText;
        console.error("Vendor close error:", err);
        alert("เกิดข้อผิดพลาด: " + err);
      })
      .saveVendorComponentClosure({
        woNo: woNo,
        reqNo: reqInfo.request_code || "",
        componentCode: compCode,
        componentName: matchedComp ? (matchedComp.component_name || compCode) : compCode,
        request_type: wo.request_type || reqInfo.request_type || "",
        asset_code: wo.asset_code || "",
        asset_name: assetInfo.asset_name || "",
        status: status,
        measuredValue: measuredValue,
        downtime: downtime,
        actionTaken: actionTaken,
        imageBefore: imageBefore,
        imageAfter: imageAfter,
        assignedBy: wo.assignee || "",
        vendorName: wo.assignee || ""
      });
  }