// ===== 全域變數 =====
let quizType = ''; 
let selectedWords = []; 
let currentIdx = 0;
let sessionCorrect = 0;
let sessionWrongList = [];
let isAnswering = false; 

// ===== 0. 從 GitHub 讀取外部單字檔 =====
// ===== 2. 資料讀取邏輯 (讀取 words.txt - 強制更新版) =====

async function loadExternalWords() {
    try {
        // 在檔名後加上時間戳記，防止瀏覽器讀取舊快取
        const cacheBuster = new Date().getTime();
        const response = await fetch(`words.txt?v=${cacheBuster}`); 
        
        if (!response.ok) throw new Error("找不到 words.txt");
        
        const text = await response.text();
        const parsedWords = text.trim().split('\n').map(line => {
            const parts = line.split('/');
            if (parts.length === 3) {
                return { 
                    year: parts[0].trim(), 
                    en: parts[1].trim(), 
                    zh: parts[2].trim(), 
                    wrongCount: 0 
                };
            }
            return null;
        }).filter(v => v);

        if (parsedWords.length > 0) {
            // 每次成功抓取都覆蓋 LocalStorage，確保同步
            saveWords(parsedWords);
            console.log("成功從 words.txt 載入最新單字庫！數量：" + parsedWords.length);
            return parsedWords;
        }
    } catch (error) {
        console.error("載入失敗，改用本地紀錄:", error);
    }
    return getWords(); // 失敗時抓舊的
}

// 修改初始化邏輯：每次重新整理都強行抓一次最新的 txt
window.addEventListener('DOMContentLoaded', async () => {
    console.log("正在檢查伺服器單字庫...");
    await loadExternalWords();
    
    // 如果目前人在單字頁，抓完立刻重新顯示
    if (!document.getElementById('vocab').classList.contains('hidden')) {
        renderVocab();
    }
});

// ===== 1. 核心頁面切換功能 =====
function showPage(id) {
    const pages = document.querySelectorAll(".page");
    pages.forEach(p => p.classList.add("hidden"));
    
    const targetPage = document.getElementById(id);
    if (targetPage) {
        targetPage.classList.remove("hidden");
    }
}

function renderVocabPage() {
    showPage('vocab');
    renderVocab();
}

// ===== 2. 資料存取邏輯 (LocalStorage) =====
function getWords() {
    const data = localStorage.getItem("customVocab");
    return data ? JSON.parse(data) : [];
}

function saveWords(words) {
    localStorage.setItem("customVocab", JSON.stringify(words));
}

// ===== 3. 單字總覽與排序 (Vocab List) =====
function renderVocab() {
    const area = document.getElementById("vocab-area");
    const sortSelect = document.getElementById("sort-select");
    if (!area) return;

    let words = getWords();
    if (words.length === 0) {
        area.innerHTML = `<div style="text-align:center; padding: 40px; color: #888;">📭 目前無單字</div>`;
        return;
    }

    if (sortSelect) {
        const sortType = sortSelect.value;
        words.sort((a, b) => {
            switch (sortType) {
                case "year-desc": return (b.year || 0) - (a.year || 0);
                case "year-asc":  return (a.year || 0) - (b.year || 0);
                case "az":        return a.en.localeCompare(b.en);
                case "za":        return b.en.localeCompare(a.en);
                case "wrong":     return (b.wrongCount || 0) - (a.wrongCount || 0);
                default: return 0;
            }
        });
    }

    area.innerHTML = words.map(w => `
        <div class="card" style="border-left: 5px solid #3f51b5;">
            <div style="display: flex; justify-content: space-between;">
                <b style="color: #3f51b5;">${w.en}</b>
                <span style="font-size:0.8rem; color:#666;">${w.year}年</span>
            </div>
            <div>${w.zh}</div>
            ${w.wrongCount ? `<div style="color:red; font-size:0.7rem; margin-top:5px;">累積錯誤: ${w.wrongCount}</div>` : ''}
        </div>
    `).join("");
}

// ===== 4. 測驗功能 (Quiz) =====

// A. 選擇題型進入設定
function selectQuizType(type) {
    quizType = type;
    showPage('quiz-config');
    renderYearCheckboxes();
    updateQuizCountHint();
}

// B. 動態產生年度複選框
function renderYearCheckboxes() {
    const container = document.getElementById('year-checkboxes');
    const words = getWords();
    const years = [...new Set(words.map(w => String(w.year)))].sort((a,b) => b-a);
    
    if (years.length === 0) {
        container.innerHTML = `<span style="color:gray; font-size:0.8rem;">(尚未匯入單字資料)</span>`;
        return;
    }

    container.innerHTML = years.map(y => `
        <label style="display: flex; align-items: center; gap: 5px;">
            <input type="checkbox" class="year-cb" value="${y}" checked onchange="updateQuizCountHint()"> ${y}
        </label>
    `).join('');
}

function toggleAllYears(bool) {
    document.querySelectorAll('.year-cb').forEach(cb => cb.checked = bool);
    updateQuizCountHint();
}

// C. 題數鎖定邏輯 (依年度總數動態變化)
// --- 修正後的題數連動邏輯 ---
function updateQuizCountHint() {
    const pool = getFilteredPool(); // 取得當前過濾後的單字
    const input = document.getElementById('quiz-count-input');
    const hint = document.getElementById('count-hint');
    const countMode = document.getElementById('count-mode').value;

    if (!input || !hint) return;

    hint.innerText = `符合條件的總單字量：${pool.length} 字`;

    if (countMode === 'auto') {
        // 【自動模式】鎖定輸入框，強制測驗全部
        input.value = pool.length;
        input.disabled = true;
        input.style.backgroundColor = "#f0f0f0";
        input.style.cursor = "not-allowed";
    } else {
        // 【手動模式】解鎖輸入框，讓使用者自行輸入
        input.disabled = false;
        input.style.backgroundColor = "#ffffff";
        input.style.cursor = "text";
        
        // 若輸入框內的數字大於目前的單字池，則調回最大值
        if (parseInt(input.value) > pool.length || !input.value || input.value == "0") {
            input.value = Math.min(10, pool.length); 
        }
    }
}

// --- 題數輸入驗證 ---
function validateCount() {
    const pool = getFilteredPool();
    const input = document.getElementById('quiz-count-input');
    const countMode = document.getElementById('count-mode').value;
    
    if (countMode === 'auto') {
        input.value = pool.length;
        return;
    }

    let val = parseInt(input.value);
    if (isNaN(val) || val < 1) {
        input.value = 1;
    } else if (val > pool.length) {
        input.value = pool.length;
        // 小提醒：如果單字量太少，就不跳警告打擾使用者
        if(pool.length > 0) alert(`範圍內最多只有 ${pool.length} 個單字！`);
    }
}

// E. 取得過濾後的單字池
function getFilteredPool() {
    const checkedYears = Array.from(document.querySelectorAll('.year-cb:checked')).map(cb => cb.value);
    const mode = document.getElementById('filter-mode').value;
    let words = getWords().filter(w => checkedYears.includes(String(w.year)));
    if (mode === 'high-wrong') words = words.filter(w => (w.wrongCount || 0) > 0);
    return words;
}

// F. 開始測驗 session
function confirmStartQuiz() {
    const pool = getFilteredPool();
    const count = parseInt(document.getElementById('quiz-count-input').value);
    if (pool.length === 0) return alert("目前單字池沒有符合條件的單字！");
    
    startSession(shuffle(pool).slice(0, count));
}

function startSession(wordList) {
    selectedWords = wordList;
    currentIdx = 0;
    sessionCorrect = 0;
    sessionWrongList = [];
    showPage('quiz-running');
    renderQuestion();
}

// G. 出題與按鈕判定 (1秒跳題)
function renderQuestion() {
    isAnswering = false;
    const word = selectedWords[currentIdx];
    const all = getWords();
    document.getElementById('q-progress').innerText = `第 ${currentIdx + 1} / ${selectedWords.length} 題`;

    const distractors = shuffle(all.filter(w => w.en !== word.en)).slice(0, 3);
    let options = [], qText = "", correctAns = "";

    if (quizType === 'en-zh') {
        qText = word.en; correctAns = word.zh;
        options = shuffle([word.zh, ...distractors.map(d => d.zh)]);
    } else {
        qText = word.zh; correctAns = word.en;
        options = shuffle([word.en, ...distractors.map(d => d.en)]);
    }

    const area = document.getElementById('q-area');
    area.innerHTML = `
        <h2 style="text-align:center; font-size: 2.2rem; margin: 30px 0;">${qText}</h2>
        <div id="opt-container">
            ${options.map(opt => `<button class="opt-btn" onclick="checkBtn(this, '${opt}', '${correctAns}')">${opt}</button>`).join('')}
        </div>
    `;
}

function checkBtn(btn, selected, correct) {
    if (isAnswering) return;
    isAnswering = true;
    
    const word = selectedWords[currentIdx];
    const isRight = (selected === correct);

    // 答題視覺反饋 (勾選/叉叉)
    const allBtns = document.querySelectorAll('.opt-btn');
    allBtns.forEach(b => {
        if (b.innerText === correct) {
            b.style.background = "#4caf50"; 
            b.innerHTML += " ✅";
        } else if (b.innerText === selected && !isRight) {
            b.style.background = "#f44336";
            b.innerHTML += " ❌";
        }
    });

    updateGlobalStats(word.en, isRight);
    if (isRight) sessionCorrect++;
    else sessionWrongList.push(word);

    // 1秒後自動跳下一題
    setTimeout(() => {
        currentIdx++;
        if (currentIdx < selectedWords.length) {
            renderQuestion();
        } else {
            finishQuiz();
        }
    }, 1000);
}

// H. 結算與紀錄
function finishQuiz() {
    showPage('quiz-finish');
    const total = currentIdx;
    const scoreVal = total === 0 ? 0 : Math.round((sessionCorrect / total) * 100);
    
    // 寫入作答紀錄到歷史清單
    addHistoryRecord(scoreVal, sessionCorrect, total);

    document.getElementById('final-score-text').innerText = `${scoreVal}%`;
    document.getElementById('final-detail-text').innerText = `答對 ${sessionCorrect} 題 / 共 ${total} 題`;
    
    const listDiv = document.getElementById('final-wrong-list');
    if (sessionWrongList.length > 0) {
        listDiv.innerHTML = "<b>錯誤單字清單：</b><br>" + sessionWrongList.map(w => `${w.en} (${w.zh})`).join('、');
        document.getElementById('retry-btn').style.display = "block";
    } else {
        listDiv.innerHTML = "✨ 非常棒！全對！";
        document.getElementById('retry-btn').style.display = "none";
    }
}

function startRetry() {
    startSession(shuffle([...sessionWrongList]));
}

// ===== 5. 開發者功能 =====
function checkDev() {
    const pass = document.getElementById("dev-pass").value;
    if (pass === "12345678") showPage("dev-panel");
    else alert("密碼錯誤！");
}

function renderAddWord() {
    document.getElementById("dev-content").innerHTML = `
        <div class="card">
            <h3>批次寫入單字</h3>
            <p style="font-size:0.7rem; color:gray;">格式: 年份/英文/中文 (每行一筆)</p>
            <textarea id="wordInput" rows="5" placeholder="112/apple/蘋果"></textarea>
            <button onclick="previewWords()">預覽解析</button>
            <div id="wordPreview"></div>
        </div>`;
}

let wordBuffer = [];
function previewWords() {
    const input = document.getElementById("wordInput").value.trim();
    if (!input) return;
    wordBuffer = input.split("\n").map(line => {
        const parts = line.split("/");
        if (parts.length === 3) {
            return { year: parts[0].trim(), en: parts[1].trim(), zh: parts[2].trim() };
        }
        return null;
    }).filter(v => v);

    document.getElementById("wordPreview").innerHTML = `
        <p>解析成功：${wordBuffer.length} 筆資料</p>
        <button onclick="confirmAddWords()" style="background:green;">確認存入資料庫</button>`;
}

function confirmAddWords() {
    const words = getWords().concat(wordBuffer);
    saveWords(words);
    alert("儲存成功！");
    document.getElementById("wordInput").value = "";
    document.getElementById("wordPreview").innerHTML = "";
}

function renderManageWord() {
    const words = getWords();
    document.getElementById("dev-content").innerHTML = `<h3>單字管理 (共 ${words.length} 字)</h3>` + 
    words.map((w, i) => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
            <span>${w.year} | ${w.en} (${w.zh})</span>
            <button class="secondary" style="width:auto; margin:0; padding:5px 10px;" onclick="deleteWord(${i})">刪除</button>
        </div>`).join("");
}

function deleteWord(i) {
    if (!confirm("確定刪除？")) return;
    const words = getWords();
    words.splice(i, 1);
    saveWords(words);
    renderManageWord();
}

// ===== 6. 工具與歷史紀錄 =====
function shuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

function updateGlobalStats(en, isRight) {
    let words = getWords();
    const i = words.findIndex(w => w.en === en);
    if (i !== -1) {
        if (isRight) words[i].correctCount = (words[i].correctCount || 0) + 1;
        else words[i].wrongCount = (words[i].wrongCount || 0) + 1;
        saveWords(words);
    }
}

function addHistoryRecord(score, correct, total) {
    const records = JSON.parse(localStorage.getItem("quizRecords") || "[]");
    const newRecord = {
        time: new Date().toLocaleString(),
        type: quizType === 'en-zh' ? '英選中' : '中選英',
        score: score,
        detail: `${correct}/${total}`
    };
    records.unshift(newRecord);
    localStorage.setItem("quizRecords", JSON.stringify(records.slice(0, 20))); // 只留前20筆
    renderHistory();
}

function renderHistory() {
    const area = document.getElementById("record-area");
    if (!area) return;
    const records = JSON.parse(localStorage.getItem("quizRecords") || "[]");
    
    if (records.length === 0) {
        area.innerHTML = "目前尚無紀錄";
        return;
    }

    area.innerHTML = records.map(r => `
        <div class="card" style="font-size: 0.9rem;">
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding-bottom:5px;">
                <b>${r.time}</b>
                <span style="color:#3f51b5;">${r.type}</span>
            </div>
            <div style="margin-top:5px;">分數：<span style="color:red; font-weight:bold;">${r.score}%</span> (${r.detail})</div>
        </div>
    `).join("");
}

// 初始化歷史紀錄渲染

window.onload = renderHistory;


