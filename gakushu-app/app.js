/* 公共 一問一答ドリル ― アプリ本体（エンジン部分）
 * UNITS / TERMS は data.js で定義される。このファイルは編集不要。
 */

let currentUnitId = null;
let unitTerms = [];
let state = { order: [], index: 0, correctCount: 0, wrongCount: 0, revealed: false, streak: 0, recorded: false, wrongIndices: [] };

/* ---------- localStorage キー ---------- */
function progressKey(unitId){ return "gakushu_progress_" + unitId; }
function statsKey(unitId){ return "gakushu_stats_" + unitId; }
const LAST_ACTIVE_KEY = "gakushu_lastActive";
const STREAK_KEY = "gakushu_dailyStreak";

function loadStats(unitId){
  try{
    const raw = localStorage.getItem(statsKey(unitId));
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && typeof parsed.attemptCount === "number"){
        if(!Array.isArray(parsed.history)) parsed.history = [];
        return parsed;
      }
    }
  }catch(e){ /* ignore */ }
  return { attemptCount: 0, bestAccuracy: 0, totalAnsweredEver: 0, totalCorrectEver: 0, history: [] };
}
function saveStats(unitId, stats){
  try{ localStorage.setItem(statsKey(unitId), JSON.stringify(stats)); }catch(e){ /* ignore */ }
}
function recordCompletion(unitId, correctCount, totalAnswered){
  const stats = loadStats(unitId);
  const rate = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
  stats.attemptCount += 1;
  stats.totalAnsweredEver += totalAnswered;
  stats.totalCorrectEver += correctCount;
  stats.history.push(rate);
  if(stats.history.length > 50) stats.history = stats.history.slice(-50);
  const isNewBest = rate >= stats.bestAccuracy;
  if(rate > stats.bestAccuracy) stats.bestAccuracy = rate;
  saveStats(unitId, stats);
  return { attemptCount: stats.attemptCount, bestAccuracy: stats.bestAccuracy, isNewBest: isNewBest && stats.attemptCount > 1 };
}

function touchLastActive(unitId){
  try{ localStorage.setItem(LAST_ACTIVE_KEY, JSON.stringify({ unit: unitId, ts: Date.now() })); }catch(e){ /* ignore */ }
}
function getLastActiveUnit(){
  try{
    const raw = JSON.parse(localStorage.getItem(LAST_ACTIVE_KEY));
    if(raw && UNITS.some(u => u.id === raw.unit)) return raw.unit;
  }catch(e){ /* ignore */ }
  return null;
}

function todayStr(){ return new Date().toISOString().slice(0,10); }
function touchDailyStreak(){
  const today = todayStr();
  let data;
  try{ data = JSON.parse(localStorage.getItem(STREAK_KEY)) || { lastDate:null, streakDays:0, studiedDates:[] }; }
  catch(e){ data = { lastDate:null, streakDays:0, studiedDates:[] }; }
  if(!Array.isArray(data.studiedDates)) data.studiedDates = [];
  if(data.lastDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  data.streakDays = (data.lastDate === yesterday) ? data.streakDays + 1 : 1;
  data.lastDate = today;
  data.studiedDates.push(today);
  if(data.studiedDates.length > 60) data.studiedDates = data.studiedDates.slice(-60);
  try{ localStorage.setItem(STREAK_KEY, JSON.stringify(data)); }catch(e){ /* ignore */ }
}
function getDailyStreakDisplay(){
  try{
    const data = JSON.parse(localStorage.getItem(STREAK_KEY));
    if(!data) return 0;
    const today = todayStr();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    return (data.lastDate === today || data.lastDate === yesterday) ? data.streakDays : 0;
  }catch(e){ return 0; }
}
function getStudiedDatesSet(){
  try{
    const data = JSON.parse(localStorage.getItem(STREAK_KEY));
    return new Set((data && Array.isArray(data.studiedDates)) ? data.studiedDates : []);
  }catch(e){ return new Set(); }
}

/* ---------- レベル・知恵の木 ---------- */
const LEVEL_TITLES = [
  { min:1,  max:2,        title:"見習い" },
  { min:3,  max:5,        title:"研究員" },
  { min:6,  max:9,        title:"准教授" },
  { min:10, max:14,       title:"教授" },
  { min:15, max:Infinity, title:"伝説の学者" },
];
const POINTS_PER_LEVEL = 20;
function getLevelInfo(totalCorrect){
  const level = Math.floor(totalCorrect / POINTS_PER_LEVEL) + 1;
  const intoLevel = totalCorrect % POINTS_PER_LEVEL;
  const percent = Math.round((intoLevel / POINTS_PER_LEVEL) * 100);
  const tier = LEVEL_TITLES.find(t => level >= t.min && level <= t.max) || LEVEL_TITLES[LEVEL_TITLES.length - 1];
  return { level, percent, remaining: POINTS_PER_LEVEL - intoLevel, title: tier.title };
}

function computeOverallStats(){
  let startedUnits = 0, completedUnits = 0, totalAnswered = 0, totalCorrect = 0, totalAttempts = 0;
  UNITS.forEach(u => {
    const prog = getUnitProgress(u.id);
    if(prog) startedUnits++;
    if(prog && prog.isComplete) completedUnits++;
    const stats = loadStats(u.id);
    totalAttempts += stats.attemptCount;
    totalAnswered += stats.totalAnsweredEver;
    totalCorrect += stats.totalCorrectEver;
  });
  return {
    startedUnits, completedUnits, totalUnits: UNITS.length,
    totalAnswered, totalCorrect, totalAttempts,
    overallAccuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
    unitProgressPercent: UNITS.length > 0 ? Math.round((startedUnits / UNITS.length) * 100) : 0,
  };
}

function getUnitProgress(unitId){
  try{
    const raw = localStorage.getItem(progressKey(unitId));
    if(!raw) return null;
    const saved = JSON.parse(raw);
    if(!saved || !Array.isArray(saved.order) || saved.order.length === 0) return null;
    const answered = saved.correctCount + saved.wrongCount;
    if(answered === 0 && saved.index === 0) return null;
    const total = saved.order.length;
    const stats = loadStats(unitId);
    return {
      totalQuestions: total,
      doneCount: saved.index,
      percentDone: Math.min(100, Math.round((saved.index / total) * 100)),
      correctCount: saved.correctCount,
      wrongCount: saved.wrongCount,
      accuracy: answered > 0 ? Math.round((saved.correctCount / answered) * 100) : 0,
      isComplete: saved.index >= total,
      attemptCount: stats.attemptCount,
      bestAccuracy: stats.bestAccuracy,
    };
  }catch(e){ return null; }
}

function getUnitMastery(unitId){
  const s = loadStats(unitId);
  if(s.totalAnsweredEver === 0) return null;
  return Math.round((s.totalCorrectEver / s.totalAnsweredEver) * 100);
}

/* ---------- おすすめ ---------- */
function getRecommendation(){
  let weakest = null;
  UNITS.forEach(u => {
    const s = loadStats(u.id);
    if(s.totalAnsweredEver >= 5){
      const acc = Math.round((s.totalCorrectEver / s.totalAnsweredEver) * 100);
      if(acc < 75 && (!weakest || acc < weakest.acc)) weakest = { unit: u.id, acc };
    }
  });
  if(weakest){
    const u = UNITS.find(x => x.id === weakest.unit);
    return { unit: weakest.unit, label: "苦手を克服しよう", icon:"!", title: u.title, desc: "正答率" + weakest.acc + "%です。もう一度解いて得点源にしましょう。" };
  }
  const unattempted = UNITS.find(u => getUnitProgress(u.id) === null);
  if(unattempted){
    return { unit: unattempted.id, label: "次のステップに進もう", icon:"+", title: unattempted.title, desc: "まだ手つかずの単元です。新しい範囲に進みましょう。" };
  }
  if(UNITS.length === 0) return null;
  const pick = UNITS[Math.floor(Math.random() * UNITS.length)];
  return { unit: pick.id, label: "総仕上げをしよう", icon:"★", title: pick.title, desc: "全単元に着手済みです。もう一度解いて仕上げましょう。" };
}

/* ---------- ハブ画面描画 ---------- */
function renderHub(){
  renderContinueBanner();
  renderOverallSummary();
  renderRecommendCard();
  renderUnitHeatmap();
  renderStudyCalendar();
  renderUnitGrid();
  document.getElementById("hubView").hidden = false;
  document.getElementById("drillView").hidden = true;
}

function renderContinueBanner(){
  const banner = document.getElementById("continueBanner");
  const lastId = getLastActiveUnit();
  if(!lastId){ banner.style.display = "none"; return; }
  const u = UNITS.find(x => x.id === lastId);
  banner.style.display = "flex";
  banner.innerHTML = '<span class="continue-label">続きから</span><span class="continue-title">' + u.title + '</span><span class="continue-arrow">→</span>';
  banner.onclick = ()=> openUnit(lastId);
}

function renderOverallSummary(){
  const div = document.getElementById("overallSummary");
  const s = computeOverallStats();
  const lv = getLevelInfo(s.totalCorrect);
  const streakDays = getDailyStreakDisplay();
  div.innerHTML =
    '<div class="level-badge">' +
      '<span class="level-ring" style="--lv-pct:' + lv.percent + ';"><span class="level-ring-inner">Lv.' + lv.level + '</span></span>' +
      '<div class="level-info"><span class="level-title">' + lv.title + '</span><span class="level-sub">あと' + lv.remaining + '問正解で次のレベルへ</span></div>' +
    '</div>' +
    '<span class="dashboard-divider"></span>' +
    osStat("学習日数記録", streakDays + '<span class="os-unit"> 日連続</span>') +
    osStat("取り組んだ単元", s.startedUnits + '<span class="os-unit"> / ' + s.totalUnits + ' 単元</span>') +
    '<span class="overall-bar-outer"><span class="overall-bar-inner" style="width:' + s.unitProgressPercent + '%;"></span></span>' +
    osStat("完了した単元", s.completedUnits + '<span class="os-unit"> 単元</span>') +
    osStat("解いた問題数", s.totalAnswered + '<span class="os-unit"> 問</span>') +
    osStat("通算正答率", (s.totalAnswered > 0 ? s.overallAccuracy + '<span class="os-unit">%</span>' : "―"));
}
function osStat(label, valueHtml){
  return '<div class="os-stat"><span class="os-label">' + label + '</span><span class="os-value">' + valueHtml + '</span></div>';
}

function renderRecommendCard(){
  const card = document.getElementById("recommendCard");
  const rec = getRecommendation();
  if(!rec){ card.style.display = "none"; return; }
  const unit = UNITS.find(u => u.id === rec.unit);
  card.style.display = "flex";
  card.style.setProperty("--rec-color", unit.color);
  card.innerHTML =
    '<span class="rec-icon">' + rec.icon + '</span>' +
    '<div class="rec-body"><div class="rec-label">今日のおすすめ ・ ' + rec.label + '</div>' +
    '<div class="rec-title">' + rec.title + '</div><div class="rec-desc">' + rec.desc + '</div></div>' +
    '<span class="rec-arrow">→</span>';
  card.onclick = ()=> openUnit(rec.unit);
}

function renderUnitHeatmap(){
  const container = document.getElementById("unitHeatmap");
  container.innerHTML = "";
  UNITS.forEach(u => {
    const mastery = getUnitMastery(u.id);
    const cell = document.createElement("button");
    cell.className = "heatmap-cell";
    cell.type = "button";
    if(mastery === null){
      cell.style.background = "var(--surface-alt)";
      cell.title = u.title + "（未着手）";
    }else{
      cell.style.background = u.color;
      cell.style.opacity = (0.22 + (mastery/100)*0.78).toFixed(2);
      cell.title = u.title + "（正答率" + mastery + "%）";
    }
    cell.addEventListener("click", ()=> openUnit(u.id));
    container.appendChild(cell);
  });
}

function renderStudyCalendar(){
  const container = document.getElementById("studyCalendar");
  container.innerHTML = "";
  const studied = getStudiedDatesSet();
  const today = new Date();
  const todayDow = today.getDay();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - todayDow - 7);
  const weekdayLabels = ["日","月","火","水","木","金","土"];
  for(let i=0;i<14;i++){
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate()+i);
    const dStr = d.toISOString().slice(0,10);
    const isToday = dStr === todayStr();
    const cell = document.createElement("div");
    cell.className = "calendar-day" + (studied.has(dStr) ? " studied" : "") + (isToday ? " is-today" : "");
    cell.textContent = d.getDate();
    cell.title = (d.getMonth()+1) + "/" + d.getDate() + "(" + weekdayLabels[d.getDay()] + ")";
    container.appendChild(cell);
  }
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate()+13);
  document.getElementById("calendarRange").textContent = (start.getMonth()+1)+"/"+start.getDate()+"〜"+(end.getMonth()+1)+"/"+end.getDate();
  const streakDays = getDailyStreakDisplay();
  document.getElementById("calendarStreakLine").innerHTML = streakDays > 0
    ? '<span class="streak-num">' + streakDays + '</span><span class="streak-unit">日連続で学習中</span>'
    : '<span class="streak-unit">今日から学習記録をつけ始めよう</span>';
}

function renderUnitGrid(){
  const grid = document.getElementById("unitGrid");
  grid.innerHTML = "";
  UNITS.forEach(u => {
    const prog = getUnitProgress(u.id);
    const total = TERMS.filter(t => t.unit === u.id).length;
    const card = document.createElement("button");
    card.className = "unit-card";
    card.style.setProperty("--theme-color", u.color);
    let badge;
    if(!prog) badge = '<span class="unit-status-badge status-new">未着手</span>';
    else if(prog.isComplete) badge = '<span class="unit-status-badge status-done">完了</span>';
    else badge = '<span class="unit-status-badge status-progress">学習中</span>';
    const ringPct = prog ? prog.percentDone : 0;
    let summary;
    if(!prog){
      summary = '<div class="unit-empty-note">まだ解いていません</div><span class="unit-meta">' + total + '問</span>';
    }else{
      summary = '<div class="unit-progress-summary"><div class="ups-line">' +
        '<span>' + prog.doneCount + ' / ' + prog.totalQuestions + '問</span>' +
        '<span class="ups-accuracy" style="color:' + u.color + ';">正答率 ' + prog.accuracy + '%</span></div>' +
        (prog.attemptCount > 0 ? '<div class="unit-meta-secondary">挑戦' + prog.attemptCount + '回・自己ベスト' + prog.bestAccuracy + '%</div>' : '') +
        '</div>';
    }
    card.innerHTML =
      '<div class="unit-card-top">' +
        '<span class="unit-ring" style="--pct:' + ringPct + '; --ring-color:' + u.color + ';"><span class="unit-ring-inner">' + total + '</span></span>' +
        '<div class="unit-title-block"><span class="unit-name">' + u.title + '</span>' + badge + '</div>' +
      '</div>' + summary + '<div class="unit-pages">' + u.pages + '</div>';
    card.addEventListener("click", ()=> openUnit(u.id));
    grid.appendChild(card);
  });
}

/* ---------- ドリル画面 ---------- */
function backToHub(){
  currentUnitId = null;
  renderHub();
}

function shuffledOrder(n){
  const arr = Array.from({length:n}, (_,i)=>i);
  for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  return arr;
}

function loadProgress(unitId, total){
  try{
    const raw = localStorage.getItem(progressKey(unitId));
    if(raw){
      const saved = JSON.parse(raw);
      if(saved && Array.isArray(saved.order) && saved.order.length === total) return saved;
    }
  }catch(e){ /* ignore */ }
  return null;
}
function saveProgress(){
  try{ localStorage.setItem(progressKey(currentUnitId), JSON.stringify(state)); }catch(e){ /* ignore */ }
}

function openUnit(unitId){
  currentUnitId = unitId;
  unitTerms = TERMS.filter(t => t.unit === unitId);
  const meta = UNITS.find(u => u.id === unitId);
  touchLastActive(unitId);
  touchDailyStreak();

  document.getElementById("hubView").hidden = true;
  document.getElementById("drillView").hidden = false;
  document.getElementById("unitTitle").textContent = meta.title;
  document.getElementById("unitPages").textContent = meta.pages;

  const saved = loadProgress(unitId, unitTerms.length);
  if(saved){
    state = saved;
    if(!state.wrongIndices) state.wrongIndices = [];
  }else{
    state = { order: shuffledOrder(unitTerms.length), index:0, correctCount:0, wrongCount:0, revealed:false, streak:0, recorded:false, wrongIndices:[] };
  }
  document.getElementById("doneScreen").classList.remove("show");
  document.getElementById("cardArea").style.display = "block";
  renderCard();
  updateStats();
  saveProgress();
}

function updateStreakBadge(){
  const badge = document.getElementById("streakBadge");
  const streak = state.streak || 0;
  if(streak >= 2){ badge.style.display = "block"; badge.textContent = "連続正解中: " + streak + "問"; }
  else badge.style.display = "none";
}

function renderCard(){
  updateStreakBadge();
  document.getElementById("revealBtn").style.display = "inline-block";
  document.getElementById("judgeButtons").style.display = "none";
  document.getElementById("answerBox").style.display = "none";
  state.revealed = false;

  if(state.index >= state.order.length){ showDone(); return; }
  document.getElementById("cardArea").style.display = "block";
  document.getElementById("doneScreen").classList.remove("show");

  const tIdx = state.order[state.index];
  const term = unitTerms[tIdx];
  document.getElementById("qCount").textContent = (state.index+1) + " / " + state.order.length;
  document.getElementById("questionText").textContent = term.q;
  document.getElementById("answerTerm").textContent = term.a;
  document.getElementById("answerExpl").textContent = term.expl || "";
}

function revealAnswer(){
  state.revealed = true;
  document.getElementById("revealBtn").style.display = "none";
  document.getElementById("answerBox").style.display = "block";
  document.getElementById("judgeButtons").style.display = "flex";
}

function judge(isCorrect){
  if(!state.revealed) return;
  const tIdx = state.order[state.index];
  if(isCorrect){
    state.correctCount++;
    state.streak = (state.streak || 0) + 1;
  }else{
    state.wrongCount++;
    state.streak = 0;
    if(!state.wrongIndices) state.wrongIndices = [];
    if(!state.wrongIndices.includes(tIdx)) state.wrongIndices.push(tIdx);
  }
  updateStats();
  saveProgress();
  state.index++;
  saveProgress();
  renderCard();
}

function updateStats(){
  document.getElementById("statCorrect").textContent = state.correctCount;
  document.getElementById("statWrong").textContent = state.wrongCount;
  const total = state.correctCount + state.wrongCount;
  const rate = total>0 ? Math.round((state.correctCount/total)*100) : 0;
  document.getElementById("statRate").textContent = rate + "%";
  document.getElementById("barInner").style.width = Math.min(100, Math.round((state.index/state.order.length)*100)) + "%";
}

let lastSessionWrongIndices = [];
function showDone(){
  document.getElementById("cardArea").style.display = "none";
  document.getElementById("streakBadge").style.display = "none";
  const done = document.getElementById("doneScreen");
  done.classList.add("show");
  const total = state.correctCount + state.wrongCount;
  const rate = total>0 ? Math.round((state.correctCount/total)*100) : 0;
  let summaryText = "全" + state.order.length + "問中 " + state.correctCount + "問正解（正答率" + rate + "%）。お疲れさまでした。";

  if(!state.recorded){
    state.recorded = true;
    const result = recordCompletion(currentUnitId, state.correctCount, total);
    saveProgress();
    summaryText += " これで" + result.attemptCount + "周目です。" +
      (result.isNewBest ? "自己ベストを更新しました！" : "自己ベスト正答率は" + result.bestAccuracy + "%です。");
  }

  document.getElementById("doneSummary").textContent = summaryText;
  lastSessionWrongIndices = state.wrongIndices || [];
  const reviewBtn = document.getElementById("reviewMistakesBtn");
  if(lastSessionWrongIndices.length > 0){
    reviewBtn.style.display = "inline-block";
    reviewBtn.textContent = "間違えた問題だけ復習する（" + lastSessionWrongIndices.length + "問）";
  }else{
    reviewBtn.style.display = "none";
  }
}

function restart(customPool){
  const pool = customPool || shuffledOrder(unitTerms.length);
  state.order = customPool ? customPool.slice() : pool;
  state.index = 0; state.correctCount = 0; state.wrongCount = 0; state.recorded = false; state.streak = 0; state.wrongIndices = [];
  saveProgress();
  document.getElementById("doneScreen").classList.remove("show");
  document.getElementById("cardArea").style.display = "block";
  renderCard();
  updateStats();
}
function reviewMistakes(){
  if(lastSessionWrongIndices.length === 0) return;
  restart(lastSessionWrongIndices.slice());
}

/* ---------- 進捗のエクスポート/インポート ---------- */
function exportProgress(){
  const data = {};
  for(let i=0;i<localStorage.length;i++){
    const key = localStorage.key(i);
    if(key && key.indexOf("gakushu_") === 0) data[key] = localStorage.getItem(key);
  }
  const payload = { exportedAt: new Date().toISOString(), data: data };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "gakushu_progress_" + todayStr() + ".json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function importProgressFile(file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const payload = JSON.parse(e.target.result);
      const data = payload && payload.data ? payload.data : payload;
      const keys = Object.keys(data || {}).filter(k => k.indexOf("gakushu_") === 0);
      if(keys.length === 0) throw new Error("no valid keys");
      keys.forEach(key => localStorage.setItem(key, data[key]));
      alert("進捗を読み込みました（" + keys.length + "件のデータを復元しました）。");
      renderHub();
    }catch(err){
      alert("ファイルの読み込みに失敗しました。正しい進捗ファイル（.json）か確認してください。");
    }
  };
  reader.readAsText(file);
}

/* ---------- イベント登録・起動 ---------- */
document.getElementById("revealBtn").addEventListener("click", revealAnswer);
document.getElementById("judgeCorrectBtn").addEventListener("click", ()=> judge(true));
document.getElementById("judgeWrongBtn").addEventListener("click", ()=> judge(false));
document.getElementById("restartBtn").addEventListener("click", ()=> restart());
document.getElementById("reviewMistakesBtn").addEventListener("click", reviewMistakes);
document.getElementById("toHubFromDoneBtn").addEventListener("click", backToHub);
document.getElementById("backToHubBtn").addEventListener("click", backToHub);
document.getElementById("resetUnitProgress").addEventListener("click", ()=>{
  if(confirm("この単元の学習記録（挑戦回数を含む）をリセットします。よろしいですか？")){
    localStorage.removeItem(progressKey(currentUnitId));
    localStorage.removeItem(statsKey(currentUnitId));
    openUnit(currentUnitId);
  }
});
document.getElementById("exportProgressBtn").addEventListener("click", exportProgress);
document.getElementById("importProgressBtn").addEventListener("click", ()=> document.getElementById("importProgressInput").click());
document.getElementById("importProgressInput").addEventListener("change", (e)=>{
  const file = e.target.files[0];
  if(file) importProgressFile(file);
  e.target.value = "";
});
document.getElementById("resetAllProgress").addEventListener("click", ()=>{
  if(confirm("全単元の学習記録をすべて削除します。この操作は取り消せません。よろしいですか？")){
    UNITS.forEach(u => {
      localStorage.removeItem(progressKey(u.id));
      localStorage.removeItem(statsKey(u.id));
    });
    localStorage.removeItem(LAST_ACTIVE_KEY);
    localStorage.removeItem(STREAK_KEY);
    renderHub();
  }
});
document.addEventListener("keydown", (e)=>{
  if(currentUnitId === null) return;
  if(e.key === "Enter" || e.key === " "){
    if(!state.revealed){ e.preventDefault(); revealAnswer(); }
  }
});

renderHub();
