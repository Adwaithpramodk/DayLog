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
  isLoggingIn: false
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const showLoading = (on) => $("#loading-overlay").style.display = on ? "flex" : "none";

const debounce = (fn, ms) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

const toast = (msg, type = "info") => {
  const t = document.createElement("div");
  t.className = `toast toast-${type} show`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 3000);
};

// ── Data ─────────────────────────────────────────────────────

async function loadDayData(date) {
  if (!state.uid) return;
  const data = await dbActions.getDay(state.uid, date);
  if (data) {
    state.dayData = {
      ...data,
      tasks: typeof data.tasks === 'string' ? JSON.parse(data.tasks) : data.tasks,
      habits: typeof data.habits === 'string' ? JSON.parse(data.habits) : data.habits,
      schedule: typeof data.schedule === 'string' ? JSON.parse(data.schedule) : (data.schedule || [])
    };
  } else {
    state.dayData = { tasks: [], habits: {}, notes: "", score: 0 };
  }
  renderAll();
  loadHistory(); // Load history in background
}

async function loadHistory() {
  if (!state.uid) return;
  try {
    const data = await dbActions.getHistory(state.uid);
    state.history = data || {};
    
    state.history[state.activeDate] = calculateScore();
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

  // 4. List Items

  // 4. List History Items
  Object.keys(state.history).sort().reverse().slice(0, 10).forEach(date => {
    const scoreVal = state.history[date].score !== undefined ? state.history[date].score : state.history[date];
    const div = document.createElement("div");
    div.className = "card";
    div.style = "margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; padding: 16px;";
    div.innerHTML = `
      <div>
        <div style="font-weight: 600;">${date}</div>
        <div style="font-size: 12px; color: var(--text-2)">Productivity Score</div>
      </div>
      <div style="font-family: var(--font-display); font-size: 24px; color: var(--accent)">${scoreVal}%</div>
    `;
    list.appendChild(div);
  });
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

async function changeDate(offset) {
  const d = new Date(state.activeDate);
  d.setDate(d.getDate() + offset);
  state.activeDate = d.toISOString().split("T")[0];
  showLoading(true);
  await loadDayData(state.activeDate);
  showLoading(false);
}

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
    $("#active-date").textContent = state.activeDate === state.today ? "Today" : state.activeDate;
    
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
        state.dayData.schedule[i][e.target.dataset.key] = e.target.value;
        renderSchedule();
        debouncedSync();
      };
    });
    div.querySelector(".slot-task-input").onchange = (e) => {
      state.dayData.schedule[i].task = e.target.value;
      debouncedSync();
    };
    div.querySelector(".btn-delete").onclick = () => {
      state.dayData.schedule.splice(i, 1);
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
      await loadDayData(state.today);
      showLoading(false);
      toast("Synced with Cloud", "success");
    } else {
      // DEFAULT: SHOW AUTH SCREEN
      $("#auth-screen").classList.add("active");
      $("#app-screen").classList.remove("active");
      state.uid = null;
    }
  } catch (err) {
    console.error("onAuthChange CRASH:", err);
    // Force show app anyway
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
  $("#btn-prev-day").onclick = () => changeDate(-1);
  $("#btn-next-day").onclick = () => changeDate(1);
  
  const btnGoToday = $("#btn-go-today");
  if (btnGoToday) {
    btnGoToday.onclick = () => {
      state.activeDate = state.today;
      loadDayData(state.activeDate);
    };
  }

  document.querySelectorAll(".nav-item").forEach(item => {
    item.onclick = () => {
      const tab = item.dataset.tab;
      document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      $(`#panel-${tab}`).classList.add("active");
      if (tab === "history") renderHistory();
    };
  });

  $("#btn-add-slot").onclick = () => {
    const lastSlot = state.dayData.schedule[state.dayData.schedule.length - 1];
    let start = "09:00", end = "10:00";
    if (lastSlot) {
      start = lastSlot.end;
      const [h, m] = lastSlot.end.split(":").map(Number);
      end = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    state.dayData.schedule.push({ start, end, task: "", done: false });
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

  // GLOBAL CLICK HANDLER
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
    
    // Delete Habit
    if (e.target.classList.contains("btn-delete-habit")) {
      const habit = e.target.dataset.habit;
      state.settings.habits = state.settings.habits.filter(h => h !== habit);
      localStorage.setItem("daylog_settings", JSON.stringify(state.settings));
      renderSettings();
      renderAll();
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

