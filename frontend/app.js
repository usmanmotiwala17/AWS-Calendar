const API_BASE_URL = "https://wbwudji731.execute-api.us-east-2.amazonaws.com/dev";

const els = {
  date: document.getElementById("date"),
  start: document.getElementById("start"),
  end: document.getElementById("end"),
  label: document.getElementById("label"),
  output: document.getElementById("output"),
  debugBox: document.getElementById("debugBox"),
  tableBody: document.querySelector("#blocksTable tbody"),
  saveBtn: document.getElementById("saveBtn"),
  loadBtn: document.getElementById("loadBtn"),
  connectionTestBtn: document.getElementById("connectionTestBtn"),
  userInfo: document.getElementById("userInfo"),
  selectedDateTitle: document.getElementById("selectedDateTitle"),
  calendar: document.getElementById("calendar"),
};

const state = {
  userId: "",
  selectedDate: "",
  calendar: null,
};

function getOrCreateUserId() {
  let userId = localStorage.getItem("calendarUserId");
  if (!userId) {
    userId = (crypto.randomUUID && crypto.randomUUID()) || `user-${Date.now()}`;
    localStorage.setItem("calendarUserId", userId);
  }
  return userId;
}

function formatDateLocal(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayIso() {
  return formatDateLocal(new Date());
}

function isIsoDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function showMessage(message, isError = false) {
  els.output.textContent = message;
  els.output.className = isError ? "output error" : "output success";
}

function setDebug(text) {
  els.debugBox.textContent = text || "";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sortBlocks(blocks) {
  return [...blocks].sort((a, b) => (a.start || "").localeCompare(b.start || ""));
}

function toCalendarEvents(blocks) {
  return blocks.map((block) => ({
    id: block.blockId,
    title: block.label,
    start: `${block.date}T${block.start}`,
    end: `${block.date}T${block.end}`,
  }));
}

function highlightSelectedDay(dateStr, clickedDayEl) {
  document.querySelectorAll(".fc-daygrid-day.selected-day").forEach((cell) => {
    cell.classList.remove("selected-day");
  });

  if (clickedDayEl) {
    const candidate = clickedDayEl.closest(".fc-daygrid-day") || clickedDayEl;
    if (candidate.classList && candidate.classList.contains("fc-daygrid-day")) {
      candidate.classList.add("selected-day");
      return;
    }
  }

  const monthCell = document.querySelector(`.fc-daygrid-day[data-date="${dateStr}"]`);
  if (monthCell) {
    monthCell.classList.add("selected-day");
  }
}

function setSelectedDate(dateStr, clickedDayEl = null) {
  if (!isIsoDate(dateStr)) {
    throw new Error("Selected date is invalid. Expected YYYY-MM-DD.");
  }
  state.selectedDate = dateStr;
  els.date.value = dateStr;
  els.selectedDateTitle.textContent = `Selected Date: ${dateStr}`;
  highlightSelectedDay(dateStr, clickedDayEl);
}

async function apiPost(path, payload, options = { throwOnHttp: true }) {
  const base = API_BASE_URL.replace(/\/$/, "");
  const url = `${base}${path}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const runningFromFile = window.location.protocol === "file:";
    const hint = runningFromFile
      ? " You are running from file://. Use python -m http.server 5500 and open http://localhost:5500."
      : "";
    throw new Error(
      `Network request failed before reaching API. URL: ${url}. Possible CORS/API URL/network issue.${hint} Original error: ${err.message}`
    );
  }

  const responseText = await response.text();
  let json = null;
  try {
    json = responseText ? JSON.parse(responseText) : null;
  } catch {
    json = null;
  }

  if (!response.ok && options.throwOnHttp) {
    throw new Error(
      `HTTP ${response.status} from ${url}. Response: ${responseText || "<empty>"}`
    );
  }

  if (json && json.ok === false && options.throwOnHttp) {
    throw new Error(
      `API error from ${url}. HTTP ${response.status}. Message: ${json.error || "Unknown error"}`
    );
  }

  return {
    status: response.status,
    text: responseText,
    json,
    url,
  };
}

function renderBlocks(blocks) {
  const sorted = sortBlocks(blocks);
  els.tableBody.innerHTML = "";

  if (!sorted.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5">No blocks for this date.</td>';
    els.tableBody.appendChild(tr);
    return;
  }

  sorted.forEach((block) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(block.start || "")}</td>
      <td>${escapeHtml(block.end || "")}</td>
      <td>${escapeHtml(block.label || "")}</td>
      <td>${escapeHtml(block.createdAt || "")}</td>
      <td><button data-id="${escapeHtml(block.blockId || "")}" class="delete-btn">Delete</button></td>
    `;

    const deleteBtn = tr.querySelector("button");
    deleteBtn.addEventListener("click", () => deleteBlock(block.blockId));

    els.tableBody.appendChild(tr);
  });
}

async function listBlocks(date = state.selectedDate, options = { showStatus: true }) {
  const payload = { userId: state.userId, date };
  const result = await apiPost("/blocks/list", payload);
  const blocks = (result.json && result.json.blocks) || [];

  renderBlocks(blocks);

  if (options.showStatus) {
    showMessage(`Loaded ${blocks.length} block(s) for ${date}.`);
  }

  setDebug(
    `LIST /blocks/list\nURL: ${result.url}\nHTTP: ${result.status}\nResponse:\n${result.text || "<empty>"}`
  );

  return blocks;
}

async function loadMonthEvents(anchorDate) {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(formatDateLocal(new Date(year, month, day)));
  }

  const promises = days.map((date) =>
    apiPost("/blocks/list", { userId: state.userId, date }, { throwOnHttp: false })
  );

  const settled = await Promise.allSettled(promises);

  let allBlocks = [];
  let failures = 0;

  for (const result of settled) {
    if (result.status === "fulfilled") {
      const resp = result.value;
      if (resp.status >= 200 && resp.status < 300 && resp.json && resp.json.ok !== false) {
        allBlocks = allBlocks.concat(resp.json.blocks || []);
      } else {
        failures += 1;
      }
    } else {
      failures += 1;
    }
  }

  state.calendar.removeAllEvents();
  toCalendarEvents(allBlocks).forEach((eventObj) => state.calendar.addEvent(eventObj));

  if (failures > 0) {
    showMessage(
      `Calendar loaded with ${failures} day request failure(s). Check Connection Test for details.`,
      true
    );
  }
}

async function refreshCalendarForCurrentMonth() {
  try {
    await loadMonthEvents(state.calendar.getDate());
    highlightSelectedDay(state.selectedDate, null);
  } catch (err) {
    showMessage(err.message, true);
  }
}

function initializeCalendar() {
  state.calendar = new FullCalendar.Calendar(els.calendar, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },
    selectable: true,
    dayMaxEvents: true,
    height: "auto",
    dateClick: async (info) => {
      console.log("dateClick fired:", info.dateStr);
      try {
        setSelectedDate(info.dateStr, info.dayEl);
        await listBlocks(info.dateStr, { showStatus: true });
      } catch (err) {
        showMessage(err.message, true);
      }
    },
    datesSet: async () => {
      await refreshCalendarForCurrentMonth();
    },
  });

  state.calendar.render();
  highlightSelectedDay(state.selectedDate, null);
}

async function saveBlock() {
  try {
    const date = state.selectedDate;
    const start = els.start.value;
    const end = els.end.value;
    const label = els.label.value.trim();

    if (!date || !isIsoDate(date)) {
      showMessage("Please select a valid date (YYYY-MM-DD).", true);
      return;
    }

    if (!start || !end || !label) {
      showMessage("Date, start, end, and label are required.", true);
      return;
    }

    if (end <= start) {
      showMessage("End time must be after start time.", true);
      return;
    }

    const payload = {
      userId: state.userId,
      date,
      start,
      end,
      label,
    };

    const result = await apiPost("/blocks", payload);
    const blocks = (result.json && result.json.blocks) || [];

    showMessage((result.json && result.json.message) || "Block saved.");
    renderBlocks(blocks);
    setDebug(
      `POST /blocks\nURL: ${result.url}\nHTTP: ${result.status}\nResponse:\n${result.text || "<empty>"}`
    );

    await refreshCalendarForCurrentMonth();
  } catch (err) {
    showMessage(err.message, true);
    setDebug(`SAVE ERROR\n${err.message}`);
  }
}

async function deleteBlock(blockId) {
  try {
    const payload = {
      userId: state.userId,
      date: state.selectedDate,
      blockId,
    };

    const result = await apiPost("/blocks/delete", payload);
    const blocks = (result.json && result.json.blocks) || [];

    showMessage((result.json && result.json.message) || "Deleted.");
    renderBlocks(blocks);
    setDebug(
      `POST /blocks/delete\nURL: ${result.url}\nHTTP: ${result.status}\nResponse:\n${result.text || "<empty>"}`
    );

    await refreshCalendarForCurrentMonth();
  } catch (err) {
    showMessage(err.message, true);
    setDebug(`DELETE ERROR\n${err.message}`);
  }
}

async function loadSelectedDate() {
  try {
    const inputDate = els.date.value;
    if (!isIsoDate(inputDate)) {
      showMessage("Enter date as YYYY-MM-DD.", true);
      return;
    }

    setSelectedDate(inputDate, null);
    state.calendar.gotoDate(inputDate);
    await listBlocks(inputDate, { showStatus: true });
  } catch (err) {
    showMessage(err.message, true);
    setDebug(`LOAD ERROR\n${err.message}`);
  }
}

async function runConnectionTest() {
  const today = todayIso();
  try {
    const result = await apiPost(
      "/blocks/list",
      { userId: state.userId, date: today },
      { throwOnHttp: false }
    );

    const ok = result.status >= 200 && result.status < 300;
    showMessage(
      ok
        ? `Connection test succeeded (HTTP ${result.status}).`
        : `Connection test failed (HTTP ${result.status}).`,
      !ok
    );

    setDebug(
      `CONNECTION TEST\nURL: ${result.url}\nHTTP: ${result.status}\nResponse:\n${result.text || "<empty>"}`
    );
  } catch (err) {
    showMessage("Connection test failed before receiving HTTP response.", true);
    setDebug(`CONNECTION TEST ERROR\n${err.message}`);
  }
}

function init() {
  state.userId = getOrCreateUserId();
  els.userInfo.textContent = `User ID (localStorage): ${state.userId}`;

  state.selectedDate = todayIso();
  els.date.value = state.selectedDate;
  els.selectedDateTitle.textContent = `Selected Date: ${state.selectedDate}`;

  initializeCalendar();

  els.saveBtn.addEventListener("click", saveBlock);
  els.loadBtn.addEventListener("click", loadSelectedDate);
  els.connectionTestBtn.addEventListener("click", runConnectionTest);

  els.date.addEventListener("change", (event) => {
    const inputDate = event.target.value;
    if (isIsoDate(inputDate)) {
      setSelectedDate(inputDate, null);
    }
  });

  listBlocks(state.selectedDate, { showStatus: true }).catch((err) => {
    showMessage(err.message, true);
    setDebug(`INITIAL LOAD ERROR\n${err.message}`);
  });
}

init();
