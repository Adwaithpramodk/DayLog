// app.js — Appwrite Integration
import { authActions, dbActions } from "./backend.js";

const state = {
  uid: null,
  email: null,
  today: new Date().toISOString().split("T")[0],
  activeDate: new Date().toISOString().split("T")[0],
  dayData: { tasks: [], habits: {}, schedule: [], notes: "", score: 0 },
  history: {},
  settings: { habits: ["Exercise", "Read", "Meditate", "Water", "Sleep 8h"] },
  globalSchedule: JSON.parse(localStorage.getItem("daylog_global_schedule")) || [],
  roadmaps: [],
  library: [],
  isLoggingIn: false,
  realtimeSubscription: null
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const showLoading = (on) => $("#loading-overlay").style.display = on ? "flex" : "none";

const debounce = (fn, ms) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

const toast = (msg, type = "info") => {
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span>${icons[type] || "ℹ"}</span> <span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 500); }, 3000);
};

// ── Data ─────────────────────────────────────────────────────

async function loadDayData(date) {
  if (!state.uid) return;
  // Always use today if no date navigation
  const targetDate = state.today; 
  const data = await dbActions.getDay(state.uid, targetDate);
  
  // Load Global Schedule structure
  const globalSched = state.globalSchedule;
  
  if (data) {
    const dailySched = typeof data.schedule === 'string' ? JSON.parse(data.schedule) : (data.schedule || []);
    
    // Merge: Use global tasks/times but daily 'done' status
    const mergedSchedule = globalSched.map((globalSlot, idx) => {
      const dailyMatch = dailySched[idx] || {};
      return {
        ...globalSlot,
        done: dailyMatch.done || false
      };
    });

    state.dayData = {
      ...data,
      tasks: typeof data.tasks === 'string' ? JSON.parse(data.tasks) : data.tasks,
      habits: typeof data.habits === 'string' ? JSON.parse(data.habits) : data.habits,
      schedule: mergedSchedule
    };
  } else {
    // New day: all global slots are 'not done'
    state.dayData = { 
      tasks: [], 
      habits: {}, 
      notes: "", 
      score: 0,
      schedule: globalSched.map(s => ({ ...s, done: false }))
    };
  }
  renderAll();
  loadHistory();
}

function saveGlobalSchedule() {
  localStorage.setItem("daylog_global_schedule", JSON.stringify(state.globalSchedule));
  if (state.uid) dbActions.saveGlobalSchedule(state.uid, state.globalSchedule);
}

async function loadHistory() {
  if (!state.uid) return;
  try {
    const data = await dbActions.getHistory(state.uid);
    state.history = data || {};
    
    state.history[state.activeDate] = { 
      score: calculateScore(),
      habits: { ...state.dayData.habits } 
    };
    renderHistory();
  } catch (e) {
    console.error("History load failed", e);
  }
}

function renderHistory() {
  const list = $("#history-list");
  const chartContainer = $("#history-chart");
  if (!list || !chartContainer) return;
  
  list.innerHTML = "";
  chartContainer.innerHTML = ""; // Clear chart

  // 1. Align to this Sunday (Calendar Week)
  const labels = [];
  const scores = [];
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());

  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    
    const dayData = state.history[dateStr];
    let score = 0;
    if (dayData) {
      score = dayData.score !== undefined ? dayData.score : (typeof dayData === 'number' ? dayData : 0);
    }
    scores.push(score);
  }

  // 2. Weekly Stats
  const totalScores = scores.reduce((a, b) => a + b, 0);
  const avgScore = Math.round(totalScores / 7);
  let totalTasksDone = 0;
  let bestScore = -1;
  let bestDayName = "—";
  
  Object.keys(state.history).forEach(date => {
    // Only process actual date-based daily logs (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    
    const data = state.history[date];
    const done = (data.tasks || []).filter(t => t.completed).length;
    totalTasksDone += done;
    const s = data.score !== undefined ? data.score : (typeof data === 'number' ? data : 0);
    if (s >= bestScore) {
      bestScore = s;
      bestDayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
    }
  });

  if ($("#report-avg-score")) $("#report-avg-score").textContent = `${avgScore}%`;
  if ($("#report-total-tasks")) $("#report-total-tasks").textContent = totalTasksDone;
  if ($("#report-best-day")) $("#report-best-day").textContent = bestDayName;

  // 3. Render Trend Chart
  chartContainer.style.display = "flex";
  chartContainer.style.alignItems = "flex-end";
  chartContainer.style.justifyContent = "space-around";
  chartContainer.style.height = "140px";
  chartContainer.style.gap = "12px";

  scores.forEach((score, i) => {
    const barWrap = document.createElement("div");
    barWrap.style = "flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; height: 100%; justify-content: flex-end;";
    
    const bar = document.createElement("div");
    const h = Math.max(score, 5);
    bar.style = `width: 100%; height: 0%; background: var(--accent); border-radius: 6px; box-shadow: 0 4px 15px var(--accent-soft); transition: height 1s cubic-bezier(0.4, 0, 0.2, 1);`;
    
    const label = document.createElement("div");
    label.style = "font-size: 10px; color: var(--text-2); font-weight: 600;";
    label.textContent = labels[i];
    
    barWrap.appendChild(bar);
    barWrap.appendChild(label);
    chartContainer.appendChild(barWrap);
    
    // Trigger animation
    setTimeout(() => { bar.style.height = `${h}%`; }, i * 50);
  });

  // 4. Render Heatmap
  renderHeatmap();

  // 5. Render Habit Stats
  renderHabitStats();

  // 6. List Items (Grouped by Month)
  let lastMonth = "";
  Object.keys(state.history).sort().reverse().slice(0, 30).forEach(date => {
    // Only process actual date-based daily logs (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    
    // Check for month change
    const dObj = new Date(date);
    const monthYear = dObj.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    if (monthYear !== lastMonth) {
      const monthHeader = document.createElement("div");
      monthHeader.style = "font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--text-3); margin: 32px 0 16px 8px; border-left: 2px solid var(--accent); padding-left: 12px;";
      monthHeader.textContent = monthYear;
      list.appendChild(monthHeader);
      lastMonth = monthYear;
    }

    const scoreVal = state.history[date].score !== undefined ? state.history[date].score : state.history[date];
    const div = document.createElement("div");
    div.className = "card";
    div.style = "margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; padding: 16px; border-left: 1px solid var(--border);";
    div.innerHTML = `
      <div>
        <div style="font-weight: 600;">${date}</div>
        <div style="font-size: 12px; color: var(--text-2)">Daily Score</div>
      </div>
      <div style="font-family: var(--font-display); font-size: 24px; color: var(--accent)">${scoreVal}%</div>
    `;
    list.appendChild(div);
  });
}

function renderHabitStats() {
  const container = $("#habit-stats-list");
  if (!container) return;
  container.innerHTML = "";

  const habits = state.settings.habits || [];
  const historyEntries = Object.entries(state.history).filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  const totalDays = historyEntries.length;

  if (totalDays === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-3); font-size: 13px;">Complete your first day to see habit analytics.</div>`;
    return;
  }

  habits.forEach(habit => {
    let completedCount = 0;
    historyEntries.forEach(([date, dayData]) => {
      // Robust check: Handle both object and legacy number formats
      let dayHabits = {};
      if (dayData && typeof dayData === 'object' && dayData.habits) {
        dayHabits = typeof dayData.habits === 'string' ? JSON.parse(dayData.habits) : dayData.habits;
      }
      if (dayHabits[habit]) completedCount++;
    });

    const pct = Math.round((completedCount / totalDays) * 100);

    const card = document.createElement("div");
    card.className = "habit-stat-card";
    card.innerHTML = `
      <div class="habit-stat-header">
        <span>${habit}</span>
        <span class="habit-stat-pct">${pct}%</span>
      </div>
      <div class="habit-stat-bar-bg">
        <div class="habit-stat-bar-fill" style="width: 0%"></div>
      </div>
      <div style="font-size: 11px; color: var(--text-3); margin-top: 8px;">
        Completed ${completedCount} of ${totalDays} days tracked
      </div>
    `;
    container.appendChild(card);

    // Animate bar
    setTimeout(() => {
      const fill = card.querySelector(".habit-stat-bar-fill");
      if (fill) fill.style.width = `${pct}%`;
    }, 100);
  });
}

function renderHeatmap() {
  const container = $("#heatmap-container");
  if (!container) return;
  container.innerHTML = "";

  const now = new Date();
  const currentYear = now.getFullYear();

  // Render January to December of the current year
  for (let m = 0; m < 12; m++) {
    const d = new Date(currentYear, m, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthName = d.toLocaleString('default', { month: 'long' });

    const monthWrapper = document.createElement("div");
    monthWrapper.className = "month-wrapper";
    container.appendChild(monthWrapper);

    // 1. Month Header
    const header = document.createElement("div");
    header.style = "font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--accent); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;";
    header.innerHTML = `<span>${monthName} ${year}</span>`;
    monthWrapper.appendChild(header);

    // 2. The Unified Grid (Labels + Squares)
    const grid = document.createElement("div");
    grid.style = "display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;";
    monthWrapper.appendChild(grid);

    // Add Weekday Labels
    ["S", "M", "T", "W", "T", "F", "S"].forEach(l => {
      const lbl = document.createElement("div");
      lbl.style = "font-size: 10px; font-weight: 800; color: var(--text-3); text-align: center; margin-bottom: 6px;";
      lbl.textContent = l;
      grid.appendChild(lbl);
    });
    
    // Get calendar info
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Padding
    for (let p = 0; p < firstDay; p++) {
      const empty = document.createElement("div");
      empty.style.opacity = "0";
      grid.appendChild(empty);
    }

    // Actual days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayData = state.history[dateStr];
      const score = dayData ? (dayData.score !== undefined ? dayData.score : (typeof dayData === 'number' ? dayData : 0)) : 0;

      let level = 0;
      if (score > 0) level = 1;
      if (score > 40) level = 2;
      if (score > 75) level = 3;

      const square = document.createElement("div");
      square.className = `heat-square level-${level}`;
      square.title = `${dateStr}: ${score}%`;
      grid.appendChild(square);
    }
  }
}

function renderRoadmaps() {
  const list = $("#roadmap-list");
  if (!list) return;
  list.innerHTML = "";

  if (state.roadmaps.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding: 40px 0; color: var(--text-3); font-size: 14px;">No active plans. Create your first roadmap!</div>`;
    return;
  }

  state.roadmaps.forEach((rm, rmIdx) => {
    const doneSteps = rm.steps.filter(s => s.completed).length;
    const progress = rm.steps.length ? Math.round((doneSteps / rm.steps.length) * 100) : 0;

    const card = document.createElement("div");
    card.className = "roadmap-card";
    card.innerHTML = `
      <div class="roadmap-header">
        <div class="roadmap-name">${rm.title}</div>
        <div class="roadmap-pct">${progress}%</div>
      </div>
      <div class="roadmap-bar-bg">
        <div class="roadmap-bar-fill" style="width: ${progress}%"></div>
      </div>
      <div class="roadmap-steps">
        ${rm.steps.map((s, sIdx) => `
          <div class="roadmap-step-container" style="margin-bottom: 16px;">
            <div class="roadmap-step ${s.completed ? "done" : ""}" data-rm="${rmIdx}" data-step="${sIdx}" style="display: flex; align-items: flex-start; gap: 14px;">
              <div style="width: 22px; height: 22px; border: 2px solid ${s.completed ? "var(--accent)" : "var(--border)"}; border-radius: 40%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                ${s.completed ? '<div style="width: 12px; height: 12px; background: var(--accent); border-radius: 20%;"></div>' : ''}
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
                <span style="font-weight: 700; font-size: 16px; line-height: 1.2;">${s.title}</span>
                ${s.desc ? `
                  <div style="font-size: 13px; color: var(--text-2); background: var(--surface-2); padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.03); line-height: 1.4; margin-top: 4px;">
                    ${s.desc}
                  </div>
                ` : ""}
              </div>
            </div>
          </div>
        `).join("")}
      </div>

      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px dashed var(--border);">
        <div class="form-group" style="margin-bottom: 12px;">
          <label style="font-size: 10px; opacity: 0.6; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Milestone Title</label>
          <input type="text" class="form-input roadmap-step-input" placeholder="What's the next big step?" data-rm="${rmIdx}" style="padding: 14px 16px; font-size: 15px;">
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
          <label style="font-size: 10px; opacity: 0.6; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Extra Details (Optional)</label>
          <textarea class="form-input roadmap-step-desc" placeholder="Add notes, links, or sub-tasks..." data-rm="${rmIdx}" style="padding: 14px 16px; font-size: 15px;"></textarea>
        </div>
        <button class="btn-primary btn-add-step-ui" data-rm="${rmIdx}" style="width: 100%; padding: 16px; font-size: 14px; font-weight: 700;">Add Milestone</button>
      </div>

      <div style="display: flex; justify-content: center; margin-top: 16px;">
        <button class="btn-roadmap-del" data-rm="${rmIdx}">Delete this whole plan</button>
      </div>
    `;
    list.appendChild(card);
  });
}

async function syncRoadmaps() {
  if (state.uid) {
    await dbActions.saveRoadmaps(state.uid, state.roadmaps);
  }
}

function renderLibrary() {
  const list = $("#book-list");
  if (!list) return;
  list.innerHTML = "";

  if (state.library.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding: 40px 0; color: var(--text-3); font-size: 14px;">Your library is empty. Start your first book!</div>`;
    return;
  }

  state.library.forEach((book, bIdx) => {
    const progress = book.totalPages ? Math.round((book.currentPage / book.totalPages) * 100) : 0;

    const card = document.createElement("div");
    card.className = "book-card";
    card.innerHTML = `
      <div class="book-header">
        <div class="book-title">${book.title}</div>
        <div class="book-stats">Page ${book.currentPage} of ${book.totalPages}</div>
      </div>
      
      <div class="book-progress-info">
        <div class="book-pct">${progress}% Read</div>
      </div>
      <div class="book-bar-bg">
        <div class="book-bar-fill" style="width: ${progress}%"></div>
      </div>

      <div class="book-controls">
        <button class="btn-book-step" data-action="dec" data-idx="${bIdx}">-</button>
        <div class="book-input-group">
          <input type="number" class="form-input book-current-input" value="${book.currentPage}" data-idx="${bIdx}">
        </div>
        <button class="btn-book-step" data-action="inc" data-idx="${bIdx}" style="background: var(--green); color: white;">+</button>
      </div>

      <div style="display: flex; justify-content: center;">
        <button class="btn-book-del" data-idx="${bIdx}">Remove Book</button>
      </div>
    `;
    list.appendChild(card);
  });
}

async function syncLibrary() {
  if (state.uid) {
    await dbActions.saveLibrary(state.uid, state.library);
  }
}

async function syncDay() {
  if (!state.uid || state.uid === "local-user") {
    console.log("Offline mode: Saving locally only.");
    localStorage.setItem(`daylog_local_${state.activeDate}`, JSON.stringify(state.dayData));
    return;
  }
  state.dayData.score = calculateScore();
  await dbActions.saveDay(state.uid, state.activeDate, state.dayData);
  $("#sync-status").textContent = "Synced ✓";
  setTimeout(() => $("#sync-status").textContent = "", 2000);
}

const debouncedSync = debounce(syncDay, 1000);

// changeDate removed

// ── UI ───────────────────────────────────────────────────────

function calculateScore() {
  const tasks = state.dayData.tasks || [];
  const habits = state.dayData.habits || {};
  const habitKeys = state.settings.habits || [];
  const tScore = tasks.length ? (tasks.filter(t => t.completed).length / tasks.length) * 60 : 0;
  const hScore = habitKeys.length ? (habitKeys.filter(h => habits[h]).length / habitKeys.length) * 40 : 0;
  return Math.round(tScore + hScore);
}

function calculateStreak() {
  // Simple streak logic: check last 7 days in history (conceptually)
  return 0; // For now
}

function renderAll() {
  try {
    // active-date display logic removed
    
    const score = calculateScore();
    if ($("#score-value")) $("#score-value").textContent = score;
    if ($("#score-bar-fill")) $("#score-bar-fill").style.width = `${score}%`;
    if ($("#streak-value")) $("#streak-value").textContent = calculateStreak ? calculateStreak() : 0;

    // Tasks
    const list = $("#task-list");
    if (list) {
      list.innerHTML = "";
      state.dayData.tasks.forEach((t, i) => {
        const li = document.createElement("li");
        li.className = `task-item ${t.completed ? "done" : ""}`;
        li.innerHTML = `
          <label class="task-label">
            <input type="checkbox" ${t.completed ? "checked" : ""} data-index="${i}">
            <span class="checkmark"></span>
            <span class="task-title">${t.title}</span>
          </label>
          <button class="btn-delete" data-index="${i}">×</button>
        `;
        list.appendChild(li);
      });
      if ($("#task-count")) {
        const done = state.dayData.tasks.filter(t => t.completed).length;
        $("#task-count").textContent = `${done}/${state.dayData.tasks.length}`;
      }
    }

    // Habits
    const grid = $("#habit-grid");
    if (grid) {
      grid.innerHTML = "";
      state.settings.habits.forEach(h => {
        const active = state.dayData.habits[h];
        const btn = document.createElement("button");
        btn.className = `habit-btn ${active ? "active" : ""}`;
        btn.innerHTML = `<span>${h}</span>`;
        btn.onclick = () => {
          state.dayData.habits[h] = !state.dayData.habits[h];
          renderAll();
          debouncedSync();
        };
        grid.appendChild(btn);
      });
    }

    if ($("#notes-area")) $("#notes-area").value = state.dayData.notes || "";

    renderSchedule();
    renderQuote();
    renderSummary();
  } catch (err) {
    console.error("Render error:", err);
  }
}

function renderSummary() {
  const now = new Date();
  if ($("#summary-time")) {
    const day = now.toLocaleDateString('en-US', { weekday: 'short' });
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $("#summary-time").textContent = `${day} • ${time}`;
  }

  // 1. Find Next Task from Schedule
  const currentMin = now.getHours() * 60 + now.getMinutes();
  const nextTask = state.dayData.schedule
    .filter(s => !s.done && timeToMin(s.start) >= currentMin)
    .sort((a, b) => timeToMin(a.start) - timeToMin(b.start))[0];

  if ($("#summary-next-task")) {
    $("#summary-next-task").textContent = nextTask ? `${nextTask.start} – ${nextTask.task}` : "---";
    $("#summary-next-task").style.opacity = nextTask ? "1" : "0.3";
  }

  // 2. Counts
  const tasksLeft = state.dayData.tasks.filter(t => !t.completed).length;
  const habitsDone = Object.values(state.dayData.habits).filter(v => v === true).length;
  const habitsTotal = state.settings.habits.length;
  const habitsLeft = habitsTotal - habitsDone;

  if ($("#summary-tasks-left")) $("#summary-tasks-left").textContent = tasksLeft;
  if ($("#summary-habits-left")) $("#summary-habits-left").textContent = habitsLeft;
}

function renderQuote() {
  const quotes = [
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
    { text: "Your talent determines what you can do. Your motivation determines how much you are willing to do.", author: "Lou Holtz" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
    { text: "Productivity is being able to do things that you were never able to do before.", author: "Franz Kafka" },
    { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
    { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
    { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
    { text: "Lost time is never found again.", author: "Benjamin Franklin" }
  ];

  // Pick quote based on date so it's the same for the whole day
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const quote = quotes[dayOfYear % quotes.length];

  if ($("#daily-quote-text")) $("#daily-quote-text").textContent = `"${quote.text}"`;
  if ($("#daily-quote-author")) $("#daily-quote-author").textContent = `— ${quote.author}`;
}

function renderSchedule() {
  const list = $("#schedule-list");
  if (!list) return;
  list.innerHTML = "";
  
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  // Sort by start time
  state.dayData.schedule.sort((a, b) => {
    return timeToMin(a.start) - timeToMin(b.start);
  });

  let doneCount = 0;
  state.dayData.schedule.forEach((slot, i) => {
    if (slot.done) doneCount++;
    
    const startMin = timeToMin(slot.start);
    const endMin = timeToMin(slot.end);
    const isActive = currentTime >= startMin && currentTime < endMin && state.activeDate === state.today;

    const div = document.createElement("div");
    div.className = `schedule-slot ${isActive ? "active" : ""} ${slot.done ? "done" : ""}`;
    div.innerHTML = `
      <div class="slot-time-group">
        <input type="text" class="slot-time-input" value="${slot.start}" data-key="start" data-index="${i}">
        <span>–</span>
        <input type="text" class="slot-time-input" value="${slot.end}" data-key="end" data-index="${i}">
      </div>
      <input type="text" class="slot-task-input" placeholder="Task..." value="${slot.task}" data-index="${i}">
      <label class="task-label" style="width: auto; flex: none;">
        <input type="checkbox" ${slot.done ? "checked" : ""} data-index="${i}" class="slot-check">
        <span class="checkmark"></span>
      </label>
      <button class="btn-delete" data-index="${i}">×</button>
    `;

    // Event Listeners for inline editing
    div.querySelector(".slot-check").onchange = (e) => {
      state.dayData.schedule[i].done = e.target.checked;
      renderSchedule();
      debouncedSync();
    };
    div.querySelectorAll(".slot-time-input").forEach(input => {
      input.onchange = (e) => {
        const val = e.target.value;
        const key = e.target.dataset.key;
        state.dayData.schedule[i][key] = val;
        // Update GLOBAL structure too
        if (state.globalSchedule[i]) {
          state.globalSchedule[i][key] = val;
          saveGlobalSchedule();
        }
        renderSchedule();
        debouncedSync();
      };
    });
    div.querySelector(".slot-task-input").onchange = (e) => {
      const val = e.target.value;
      state.dayData.schedule[i].task = val;
      // Update GLOBAL structure too
      if (state.globalSchedule[i]) {
        state.globalSchedule[i].task = val;
        saveGlobalSchedule();
      }
      debouncedSync();
    };
    div.querySelector(".btn-delete").onclick = () => {
      state.dayData.schedule.splice(i, 1);
      state.globalSchedule.splice(i, 1);
      saveGlobalSchedule();
      renderSchedule();
      debouncedSync();
    };

    list.appendChild(div);
  });

  // Progress
  const progress = state.dayData.schedule.length ? Math.round((doneCount / state.dayData.schedule.length) * 100) : 0;
  if ($("#schedule-progress")) {
    $("#schedule-progress").querySelector("span").textContent = `${progress}%`;
    $("#schedule-progress").style.setProperty('--progress', `${progress}%`);
  }
}

function timeToMin(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ── Auth ─────────────────────────────────────────────────────

async function onAuthChange(user) {
  console.log("Auth State Changed. User:", user ? user.email : "None");
  
  // If user just logged out, ignore the cloud session until they manually log in
  if (localStorage.getItem("daylog_logged_out") === "true" && !state.isLoggingIn) {
    console.log("Logout flag detected. Staying on Auth screen.");
    user = null; 
  }

  try {
    if (user) {
      localStorage.removeItem("daylog_logged_out"); // Clear the lock on successful login
      // 1. SWITCH SCREEN IMMEDIATELY
      state.uid = user.$id;
      state.email = user.email;
      $("#auth-screen").classList.remove("active");
      $("#app-screen").classList.add("active");
      
      if ($("#settings-email")) $("#settings-email").textContent = state.email;
      
      // 2. LOAD DATA IN BACKGROUND
      showLoading(true);
      
      // Sync Settings
      const cloudSettings = await dbActions.getSettings(state.uid);
      if (cloudSettings) {
        state.settings.habits = cloudSettings;
        localStorage.setItem("daylog_settings", JSON.stringify(state.settings));
      }

      // Sync Roadmaps
      const cloudRoadmaps = await dbActions.getRoadmaps(state.uid);
      if (cloudRoadmaps) state.roadmaps = cloudRoadmaps;

      // Sync Library
      const cloudLibrary = await dbActions.getLibrary(state.uid);
      if (cloudLibrary) state.library = cloudLibrary;

      // Sync Global Schedule (Timetable Structure)
      const cloudGlobalSched = await dbActions.getGlobalSchedule(state.uid);
      if (cloudGlobalSched) {
        state.globalSchedule = cloudGlobalSched;
        localStorage.setItem("daylog_global_schedule", JSON.stringify(state.globalSchedule));
      }

      await loadDayData(state.today);
      
      // 3. START REALTIME LISTENER
      if (state.realtimeSubscription) state.realtimeSubscription(); // Unsubscribe old
      state.realtimeSubscription = dbActions.subscribe(res => {
        const doc = res.payload;
        console.log("Realtime Update Detected:", res.events);
        
        // Handle Daily Log Updates (Today)
        if (doc.date === state.today && doc.uid === state.uid) {
           const incomingTasks = JSON.stringify(JSON.parse(doc.tasks || '[]'));
           const currentTasks = JSON.stringify(state.dayData.tasks);
           const incomingHabits = JSON.stringify(JSON.parse(doc.habits || '{}'));
           const currentHabits = JSON.stringify(state.dayData.habits);
           
           // Only update if data actually changed (prevent loops)
           if (incomingTasks !== currentTasks || incomingHabits !== currentHabits || doc.notes !== state.dayData.notes) {
             console.log("Applying Live Sync from other device...");
             state.dayData = {
               ...doc,
               tasks: JSON.parse(doc.tasks || '[]'),
               habits: JSON.parse(doc.habits || '{}'),
               schedule: state.dayData.schedule // Keep local schedule merge logic
             };
             // Re-trigger merge logic for schedule done status
             loadDayData(state.today); 
           }
        }
        
        // Handle Settings Updates
        if (doc.date === 'user_settings' && doc.uid === state.uid) {
          state.settings.habits = JSON.parse(doc.habits || '[]');
          renderSettings();
          renderAll();
        }

        // Handle Roadmap Updates
        if (doc.date === 'user_roadmaps' && doc.uid === state.uid) {
          state.roadmaps = JSON.parse(doc.tasks || '[]');
          renderRoadmaps();
        }

        // Handle Global Schedule Updates (Timetable Structure)
        if (doc.date === 'user_global_schedule' && doc.uid === state.uid) {
          const incomingSched = JSON.parse(doc.schedule || '[]');
          if (JSON.stringify(incomingSched) !== JSON.stringify(state.globalSchedule)) {
             console.log("Applying Live Schedule Structure Sync...");
             state.globalSchedule = incomingSched;
             localStorage.setItem("daylog_global_schedule", JSON.stringify(state.globalSchedule));
             loadDayData(state.today); // Re-render everything with new structure
          }
        }
      });

      showLoading(false);
      toast("Synced & Live ⚡", "success");
    } else {
      // DEFAULT: SHOW AUTH SCREEN
      $("#auth-screen").classList.add("active");
      $("#app-screen").classList.remove("active");
      state.uid = null;
    }
    renderAll();
  } catch (err) {
    console.error("onAuthChange CRASH:", err);
    $("#auth-screen").classList.remove("active");
    $("#app-screen").classList.add("active");
    renderAll();
  }
}

// ── Setup ────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Auth Form
  $("#auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const mode = $("#auth-form").dataset.mode;
    const email = $("#auth-email").value;
    const pw = $("#auth-password").value;
    try {
      showLoading(true);
      state.isLoggingIn = true;
      localStorage.removeItem("daylog_logged_out"); // UNLOCK IMMEDIATELY
      console.log("Attempting Login...", { email, mode });
      
      if (mode === "login") {
        const session = await authActions.login(email, pw);
        console.log("LOGIN SUCCESS:", session);
      } else {
        const userRes = await authActions.register(email, pw);
        console.log("REGISTER SUCCESS:", userRes);
        const session = await authActions.login(email, pw);
        console.log("AUTO-LOGIN SUCCESS:", session);
      }
      
      // Confirm session works before reload
      const user = await authActions.getUser();
      console.log("CURRENT USER:", user);
      
      location.reload(); 
    } catch (err) {
      if (err.message && err.message.includes("session is active")) {
        console.log("Found existing session. Moving to dashboard...");
        location.reload();
        return;
      }
      console.error("AUTH ERROR:", err);
      toast(err.message || "Authentication failed", "error");
    } finally {
      showLoading(false);
    }
  };

  $("#toggle-auth-mode").onclick = () => {
    const mode = $("#auth-form").dataset.mode;
    const isLogin = mode === "login";
    $("#auth-form").dataset.mode = isLogin ? "register" : "login";
    $("#auth-title").textContent = isLogin ? "Create Account" : "Welcome Back";
    $("#auth-submit").textContent = isLogin ? "Sign Up" : "Sign In";
    $("#toggle-auth-mode").textContent = isLogin ? "Have an account? Login" : "New here? Register";
  };

  // App Events
  $("#task-form").onsubmit = (e) => {
    e.preventDefault();
    const input = $("#new-task-input");
    if (!input.value.trim()) return;
    state.dayData.tasks.push({ title: input.value.trim(), completed: false });
    input.value = "";
    renderAll();
    debouncedSync();
  };

  $("#task-list").onclick = (e) => {
    const i = e.target.dataset.index;
    if (e.target.type === "checkbox") {
      state.dayData.tasks[i].completed = e.target.checked;
    } else if (e.target.classList.contains("btn-delete")) {
      state.dayData.tasks.splice(i, 1);
    } else return;
    renderAll();
    debouncedSync();
  };

  $("#notes-area").oninput = (e) => {
    state.dayData.notes = e.target.value;
    debouncedSync();
  };

  // Midnight Watcher
  setInterval(() => {
    const now = new Date().toISOString().split("T")[0];
    if (now !== state.today) {
      console.log("Midnight detected! Refreshing for new day...");
      location.reload(); // Hard refresh is safest for a new day
    }
  }, 60000); // Check every minute

  // Settings Toggle
  $("#btn-settings").onclick = () => {
    renderSettings();
    $("#settings-overlay").classList.add("active");
  };
  $("#btn-close-settings").onclick = () => $("#settings-overlay").classList.remove("active");

  $("#btn-toggle-theme").onclick = () => {
    const isDark = document.body.classList.toggle("dark");
    document.body.classList.toggle("light", !isDark);
    localStorage.setItem("daylog_theme", isDark ? "dark" : "light");
  };

  // Tab Switching (Bottom Nav)
  // Date switching removed per request


  // Handle Tab Switching
  const updateActiveTabs = (tab) => {
    document.querySelectorAll(".nav-item").forEach(i => {
      i.classList.toggle("active", i.dataset.tab === tab);
    });
  };

  document.querySelectorAll(".nav-item").forEach(item => {
    item.onclick = () => {
      const tab = item.dataset.tab;
      updateActiveTabs(tab);
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      $(`#panel-${tab}`).classList.add("active");
      
      // RESET SCROLL TO TOP
      window.scrollTo(0, 0);
      
      if (tab === "report") renderHistory();
      if (tab === "roadmap") renderRoadmaps();
      if (tab === "library") renderLibrary();
    };
  });

  // Dynamic Bottom Nav Scroll Listener
  window.addEventListener("scroll", () => {
    const bottomNav = $("#dynamic-bottom-nav");
    const isAtBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 60);
    if (isAtBottom) {
      bottomNav.classList.add("show");
    } else {
      bottomNav.classList.remove("show");
    }
  });

  // LIBRARY EVENTS
  $("#btn-show-add-book").onclick = () => $("#book-overlay").classList.add("active");
  $("#btn-close-book").onclick = () => $("#book-overlay").classList.remove("active");

  $("#add-book-form").onsubmit = (e) => {
    e.preventDefault();
    const title = $("#new-book-title").value.trim();
    const pages = parseInt($("#new-book-pages").value);
    if (title && pages) {
      state.library.push({ title, totalPages: pages, currentPage: 0 });
      syncLibrary();
      renderLibrary();
      $("#add-book-form").reset();
      $("#book-overlay").classList.remove("active");
      toast("Book Added!", "success");
    }
  };

  $("#btn-add-slot").onclick = () => {
    const lastSlot = state.globalSchedule[state.globalSchedule.length - 1];
    let start = "09:00", end = "10:00";
    if (lastSlot) {
      start = lastSlot.end;
      const [h, m] = lastSlot.end.split(":").map(Number);
      end = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const newSlot = { start, end, task: "", done: false };
    state.globalSchedule.push(newSlot);
    state.dayData.schedule.push({ ...newSlot });
    saveGlobalSchedule();
    renderSchedule();
    debouncedSync();
  };

  // Add Habit Form
  $("#add-habit-form").onsubmit = (e) => {
    e.preventDefault();
    const val = $("#new-habit-input").value.trim();
    if (val && !state.settings.habits.includes(val)) {
      state.settings.habits.push(val);
      localStorage.setItem("daylog_settings", JSON.stringify(state.settings));
      dbActions.saveSettings(state.uid, state.settings.habits); // Sync to Cloud
      $("#new-habit-input").value = "";
      renderSettings();
      renderAll();
    }
  };

  // Load saved theme & settings
  const savedTheme = localStorage.getItem("daylog_theme") || "light";
  document.body.className = savedTheme;
  const savedSettings = localStorage.getItem("daylog_settings");
  if (savedSettings) state.settings = JSON.parse(savedSettings);

  // ROADMAP EVENTS
  $("#btn-show-add-roadmap").onclick = () => $("#roadmap-overlay").classList.add("active");
  $("#btn-close-roadmap").onclick = () => $("#roadmap-overlay").classList.remove("active");

  $("#add-roadmap-form").onsubmit = (e) => {
    e.preventDefault();
    const input = $("#new-roadmap-title");
    const title = input.value.trim();
    if (title) {
      state.roadmaps.push({ title, steps: [] });
      syncRoadmaps();
      renderRoadmaps();
      input.value = "";
      $("#roadmap-overlay").classList.remove("active");
      toast("Plan Created!", "success");
    }
  };

  document.addEventListener("click", async (e) => {
    // Logout (Nuclear Fix)
    if (e.target.closest("#btn-logout")) {
      try {
        console.log("Nuclear Logout triggered...");
        showLoading(true);
        localStorage.setItem("daylog_logged_out", "true"); 
        
        // Unregister Service Workers to clear cache
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (let reg of regs) await reg.unregister();
        }
        
        await authActions.logout().catch(() => {}); 
      } catch (err) {
        console.warn("Logout error:", err);
      } finally {
        localStorage.clear();
        localStorage.setItem("daylog_logged_out", "true"); 
        location.reload();
      }
    }
    
    // Reset Day
    if (e.target.closest("#btn-reset-day")) {
      if (confirm("This will clear all checkboxes for today. Your schedule timetable will stay. Continue?")) {
        state.dayData.tasks.forEach(t => t.completed = false);
        state.dayData.habits = {};
        state.dayData.schedule.forEach(s => s.done = false);
        state.dayData.notes = "";
        state.dayData.score = 0;
        
        renderAll();
        debouncedSync();
        toast("Today's progress reset!", "success");
        $("#settings-overlay").classList.remove("active");
      }
    }

    // Master Wipe
    if (e.target.closest("#btn-master-wipe")) {
      const confirmed = confirm("CRITICAL: This will PERMANENTLY DELETE all your history, reports, and heatmap data. Your Habits and Schedule structure will remain. Are you 100% sure?");
      if (confirmed) {
        showLoading(true);
        try {
          // 1. Clear local state
          state.history = {};
          state.dayData.tasks = [];
          state.dayData.habits = {};
          if (state.dayData.schedule) {
            state.dayData.schedule.forEach(s => s.done = false);
          }
          state.dayData.notes = "";
          state.dayData.score = 0;
          
          // 2. Wipe Local Storage (Keep essentials)
          const theme = localStorage.getItem("daylog_theme");
          const settings = localStorage.getItem("daylog_settings");
          const schedule = localStorage.getItem("daylog_global_schedule");
          
          localStorage.clear();
          
          if (theme) localStorage.setItem("daylog_theme", theme);
          if (settings) localStorage.setItem("daylog_settings", settings);
          if (schedule) localStorage.setItem("daylog_global_schedule", schedule);

          // 3. Attempt cloud sync (Don't let failure stop the local purge)
          try {
            await syncDay();
          } catch (cloudErr) {
            console.warn("Cloud sync failed during purge, but local wipe continued.");
          }
          
          toast("System Purged. Starting fresh!", "success");
          setTimeout(() => location.reload(), 1000);
        } catch (err) {
          console.error("Master Wipe Error:", err);
          toast("Something went wrong. Please try again.", "error");
        } finally {
          showLoading(false);
        }
      }
    }

    // Delete Habit
    if (e.target.classList.contains("btn-delete-habit")) {
      const habit = e.target.dataset.habit;
      state.settings.habits = state.settings.habits.filter(h => h !== habit);
      localStorage.setItem("daylog_settings", JSON.stringify(state.settings));
      dbActions.saveSettings(state.uid, state.settings.habits); // Sync to Cloud
      renderSettings();
      renderAll();
    }

    // --- ROADMAP HANDLERS (Modern UI) ---
    
    // Add Step via Button
    if (e.target.classList.contains("btn-add-step-ui")) {
      const rmIdx = e.target.dataset.rm;
      const input = document.querySelector(`.roadmap-step-input[data-rm="${rmIdx}"]`);
      const descInput = document.querySelector(`.roadmap-step-desc[data-rm="${rmIdx}"]`);
      
      const title = input.value.trim();
      const desc = descInput.value.trim();
      
      if (title) {
        state.roadmaps[rmIdx].steps.push({ title, desc, completed: false });
        syncRoadmaps();
        renderRoadmaps();
        toast("Milestone Added", "success");
      }
    }

    // Toggle Step
    const stepEl = e.target.closest(".roadmap-step");
    if (stepEl) {
      const rmIdx = stepEl.dataset.rm;
      const stepIdx = stepEl.dataset.step;
      state.roadmaps[rmIdx].steps[stepIdx].completed = !state.roadmaps[rmIdx].steps[stepIdx].completed;
      syncRoadmaps();
      renderRoadmaps();
    }

    // Delete Roadmap
    if (e.target.classList.contains("btn-roadmap-del")) {
      if (confirm("Delete this roadmap?")) {
        const rmIdx = e.target.dataset.rm;
        state.roadmaps.splice(rmIdx, 1);
        syncRoadmaps();
        renderRoadmaps();
      }
    }

    // --- LIBRARY HANDLERS ---
    
    // Increment/Decrement
    if (e.target.classList.contains("btn-book-step")) {
      const idx = e.target.dataset.idx;
      const action = e.target.dataset.action;
      if (action === "inc") {
        if (state.library[idx].currentPage < state.library[idx].totalPages) {
          state.library[idx].currentPage++;
        }
      } else {
        if (state.library[idx].currentPage > 0) {
          state.library[idx].currentPage--;
        }
      }
      syncLibrary();
      renderLibrary();
    }

    // Delete Book
    if (e.target.classList.contains("btn-book-del")) {
      if (confirm("Remove this book from your library?")) {
        const idx = e.target.dataset.idx;
        state.library.splice(idx, 1);
        syncLibrary();
        renderLibrary();
      }
    }
  });

  // --- Day Explorer Logic ---
  const datePicker = $("#history-date-picker");
  if (datePicker) {
    datePicker.onchange = async (e) => {
      const selectedDate = e.target.value;
      if (!selectedDate) return;

      showLoading(true);
      // 1. Check local history first
      let data = state.history[selectedDate];
      
      // 2. If not in local memory or partial, try fetching from cloud
      if (!data || !data.tasks) {
        data = await dbActions.getDay(state.uid, selectedDate);
        if (data && typeof data.tasks === 'string') {
          data = {
            ...data,
            tasks: JSON.parse(data.tasks || '[]'),
            habits: JSON.parse(data.habits || '{}'),
            score: parseInt(data.score || 0)
          };
        }
      }

      showLoading(false);
      
      const detailView = $("#history-detail-view");
      const emptyMsg = $("#history-empty-msg");

      if (data && (data.tasks?.length > 0 || Object.keys(data.habits || {}).length > 0 || data.notes)) {
        detailView.style.display = "block";
        emptyMsg.style.display = "none";
        
        // Render Score
        const score = data.score || 0;
        $("#history-score-text").textContent = `${score}%`;
        $("#history-score-bar").style.width = `${score}%`;

        // Render Tasks/Habits
        const list = $("#history-tasks-list");
        list.innerHTML = "";
        
        // Habits
        const habits = data.habits || {};
        Object.entries(habits).forEach(([name, done]) => {
          if (done) {
            const item = document.createElement("div");
            item.style = "display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--accent); font-weight: 600; background: var(--accent-soft); padding: 8px 12px; border-radius: 10px;";
            item.innerHTML = `<span>✓</span> <span>${name}</span>`;
            list.appendChild(item);
          }
        });

        // Tasks
        const tasks = data.tasks || [];
        tasks.forEach(t => {
          const item = document.createElement("div");
          item.style = `display: flex; align-items: center; gap: 10px; font-size: 14px; padding: 8px 12px; border-radius: 10px; background: ${t.completed ? 'var(--surface-2)' : 'transparent'}; border: 1px solid ${t.completed ? 'transparent' : 'var(--border)'}; color: ${t.completed ? 'var(--text-2)' : 'var(--text-3)'};`;
          item.innerHTML = `<span>${t.completed ? '●' : '○'}</span> <span>${t.text}</span>`;
          list.appendChild(item);
        });

        // Render Notes
        $("#history-notes-view").textContent = data.notes || "No journal entry for this day.";
      } else {
        detailView.style.display = "none";
        emptyMsg.style.display = "block";
        emptyMsg.innerHTML = `<div style="font-size: 24px; margin-bottom: 12px;">🔍</div> No data found for this date.`;
      }
    };
  }

  // Manual Page Input
  document.addEventListener("input", (e) => {
    if (e.target.classList.contains("book-current-input")) {
      const idx = e.target.dataset.idx;
      let val = parseInt(e.target.value) || 0;
      if (val < 0) val = 0;
      if (val > state.library[idx].totalPages) val = state.library[idx].totalPages;
      state.library[idx].currentPage = val;
      syncLibrary();
      // Don't render while typing to avoid losing focus, but maybe update progress bar
      const card = e.target.closest(".book-card");
      const progress = Math.round((val / state.library[idx].totalPages) * 100);
      card.querySelector(".book-bar-fill").style.width = `${progress}%`;
      card.querySelector(".book-pct").textContent = `${progress}% Read`;
      card.querySelector(".book-stats").textContent = `Page ${val} of ${state.library[idx].totalPages}`;
    }
  });

  // Handle Enter Key in Milestone Input
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("roadmap-step-input")) {
      const rmIdx = e.target.dataset.rm;
      const title = e.target.value.trim();
      if (title) {
        state.roadmaps[rmIdx].steps.push({ title, completed: false });
        syncRoadmaps();
        renderRoadmaps();
        toast("Milestone Added", "success");
      }
    }
  });

  authActions.onStateChange(onAuthChange);
});

function renderSettings() {
  const list = $("#settings-habit-list");
  if (!list) return;
  list.innerHTML = "";
  state.settings.habits.forEach(h => {
    const div = document.createElement("div");
    div.className = "settings-habit-item";
    div.innerHTML = `
      <span>${h}</span>
      <button class="btn-delete-habit" data-habit="${h}">×</button>
    `;
    list.appendChild(div);
  });
}

