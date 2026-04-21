(function() {
    'use strict';

    // 定義 localStorage 輔助函式，取代 GM_getValue/SetValue
    const storage = {
        set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
        get: (key, def) => {
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : def;
        }
    };

    const styleText = `
        #vc-panel {
            position: fixed !important; top: 20px !important; left: 20px !important; z-index: 2147483647 !important;
            background: white !important; border: 2px solid #333 !important; padding: 15px !important;
            width: 500px !important; height: auto !important;
            box-shadow: 5px 5px 15px rgba(0,0,0,0.5) !important;
            border-radius: 10px !important; font-family: sans-serif !important; color: black !important;
            display: flex !important; flex-direction: column !important;
        }
        #vc-close-btn { position: absolute !important; top: 8px !important; right: 12px !important; cursor: pointer !important; font-size: 18px !important; color: #999 !important; border: none !important; background: none !important; }
        #vc-input { width: 100% !important; min-height: 100px !important; margin-bottom: 10px !important; box-sizing: border-box !important; border: 1px solid #ccc !important; padding: 8px !important; font-size: 13px !important; resize: vertical !important; }
        #vc-display { max-height: 400px !important; overflow-y: auto !important; background: #f9f9f9 !important; padding: 10px !important; border: 1px solid #ddd !important; display: none; margin-bottom: 10px !important; font-size: 13px !important; }
        .vc-row { position: relative !important; margin-bottom: 8px; padding: 8px 60px 8px 12px; border-bottom: 1px solid #eee; line-height: 1.6; border-radius: 4px; }
        .vc-success { color: #1b5e20; background: #e8f5e9; border-left: 5px solid #2e7d32; }
        .vc-fail { color: #b71c1c; background: #ffebee; border-left: 5px solid #d32f2f; }
        .vc-status-icon { position: absolute !important; right: 20px !important; top: 50% !important; transform: translateY(-50%) !important; font-size: 28px !important; font-weight: bold !important; }
        .setting-row { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; font-size: 13px; }
        .btn-group { display: flex; gap: 10px; }
        .vc-btn { flex: 1; padding: 6px !important; cursor: pointer; background: #eee; border: 1px solid #666; font-weight: bold; border-radius: 4px; }
        .vc-btn:disabled { opacity: 0.5; cursor: not-allowed; color: #999; }
        .vc-btn-stop { color: #b71c1c !important; border-color: #b71c1c !important; }
    `;

    function ensureUI() {
        if (document.getElementById('vc-panel')) return;
        if (!document.head || !document.body) {
            requestAnimationFrame(ensureUI);
            return;
        }
        const style = document.createElement('style');
        style.textContent = styleText;
        document.head.appendChild(style);
        const container = document.createElement('div');
        container.id = 'vc-panel';
        const savedRounds = storage.get('vc_test_rounds', 8);
        const savedSpeed = storage.get('vc_test_speed', 5);
        container.innerHTML = `
            <button id="vc-close-btn">×</button>
            <div style="font-size:16px; font-weight:bold; margin-bottom:12px; border-bottom:1px solid #ccc; padding-bottom:6px;">🧪 版本驗證與投注測試 v3.7 (GitHub版)</div>
            <div class="setting-row">
                <span>投注局數:</span><input type="number" id="vc-rounds" value="${savedRounds}" min="0" style="width:50px; border:1px solid #ccc;">
                <span>倍速:</span>
                <select id="vc-speed" style="border:1px solid #ccc;">
                    <option value="1" ${savedSpeed == 1 ? 'selected' : ''}>1x</option>
                    <option value="2" ${savedSpeed == 2 ? 'selected' : ''}>2x</option>
                    <option value="5" ${savedSpeed == 5 ? 'selected' : ''}>5x</option>
                    <option value="10" ${savedSpeed == 10 ? 'selected' : ''}>10x</option>
                    <option value="25" ${savedSpeed == 25 ? 'selected' : ''}>25x</option>
                </select>
            </div>
            <textarea id="vc-input" placeholder="22053 印加傳奇 ver. 84b3f34"></textarea>
            <div id="vc-display"></div>
            <div class="btn-group">
                <button id="vc-run-btn" class="vc-btn">執行檢查</button>
                <button id="vc-clear-stop-btn" class="vc-btn">清空</button>
            </div>
        `;
        document.body.appendChild(container);
        setupLogic();
    }

    function applyAutoSettings(rounds, speed) {
        try {
            const facade = window.puremvc.Facade.getInstance();
            const proxy = facade.model.proxyMap;
            proxy.ControlProxy.setAutoTimes(Number(rounds));
            proxy.GameDataProxy.gameSpeed = Number(speed);
            proxy.GameDataProxy.turboMode = true;
            proxy.GameDataProxy.superTurboMode = false;
            facade.sendNotification('SlotEvent.sendBetRequest');
        } catch (e) { console.warn('❌ 套用失敗', e); }
    }

    function setupLogic() {
        const inputArea = document.getElementById('vc-input');
        const displayArea = document.getElementById('vc-display');
        const runBtn = document.getElementById('vc-run-btn');
        const clearStopBtn = document.getElementById('vc-clear-stop-btn');
        const roundsInp = document.getElementById('vc-rounds');
        const speedSel = document.getElementById('vc-speed');

        const isRunning = storage.get('vc_is_checking', false);
        const results = storage.get('vc_results', []);
        inputArea.value = storage.get('vc_input_raw', '');

        document.getElementById('vc-close-btn').onclick = () => document.getElementById('vc-panel').remove();

        function startSpinMonitor() {
            const handler = (event) => {
                try {
                    const proxy = window.puremvc.Facade.getInstance().model.proxyMap;
                    if (event.data === 'spinEnded' && proxy.GameDataProxy.curAutoTimes === 0) {
                        window.removeEventListener('message', handler);
                        setTimeout(processNext, 1000);
                    }
                } catch (e) {}
            };
            window.addEventListener('message', handler);
        }

        function processNext() {
            let queue = storage.get('vc_queue', []);
            if (queue.length === 0) { finishAndShow(); return; }
            const next = queue.shift();
            storage.set('vc_queue', queue);
            storage.set('vc_current_target', next);
            if (typeof window.changeGame === 'function') window.changeGame(next.id);
        }

        function resetToInitial() {
            storage.set('vc_is_checking', false);
            storage.set('vc_results', []);
            storage.set('vc_queue', []);
            displayArea.style.display = 'none';
            inputArea.style.display = 'block';
            inputArea.disabled = false;
            roundsInp.disabled = false;
            speedSel.disabled = false;
            runBtn.innerText = "執行檢查";
            runBtn.disabled = false;
            clearStopBtn.innerText = "清空";
            clearStopBtn.disabled = false;
            clearStopBtn.classList.remove('vc-btn-stop');
        }

        function finishAndShow() {
            storage.set('vc_is_checking', false);
            const res = storage.get('vc_results', []);
            displayArea.style.display = 'block';
            inputArea.style.display = 'none';
            displayArea.innerHTML = res.map(r => `<div class="vc-row ${r.status === 'OK' ? 'vc-success' : 'vc-fail'}">${r.text} <span class="vc-status-icon">${r.icon}</span></div>`).join('');
            runBtn.innerText = "重新檢查";
            runBtn.disabled = false;
            clearStopBtn.innerText = "清空";
            clearStopBtn.disabled = true;
            clearStopBtn.classList.remove('vc-btn-stop');
            roundsInp.disabled = true;
            speedSel.disabled = true;
        }

        if (isRunning) {
            inputArea.style.display = 'none';
            runBtn.disabled = true;
            runBtn.innerText = "測試進行中...";
            clearStopBtn.innerText = "終止";
            clearStopBtn.disabled = false;
            clearStopBtn.classList.add('vc-btn-stop');
            roundsInp.disabled = true;
            speedSel.disabled = true;

            const verCheckTimer = setInterval(() => {
                const info = window.gameSetting;
                const current = storage.get('vc_current_target');
                if (info && info.version && current) {
                    clearInterval(verCheckTimer);
                    const actualTxt = info.versionTxt || "N/A";
                    const isMatch = (String(info.version[current.id]) === String(current.ver) && String(actualTxt) === String(current.ver));
                    let currentResults = storage.get('vc_results', []);
                    currentResults.push({ status: isMatch ? 'OK' : 'FAIL', icon: isMatch ? '✓' : '✗', text: `<b>${current.id} ${current.name}</b><br>預期: ${current.ver}<br>實際: ${actualTxt}` });
                    storage.set('vc_results', currentResults);
                }
            }, 1000);

            const flowTimer = setInterval(() => {
                if (!document.querySelector('#Cocos2dGameContainer')) return;
                clearInterval(flowTimer);
                window.callbackLog = function(src, msg) {
                    if (msg === 'Start Game!') {
                        const rounds = Number(storage.get('vc_test_rounds', 0));
                        const speed = storage.get('vc_test_speed', 5);
                        if (rounds > 0) { startSpinMonitor(); setTimeout(() => applyAutoSettings(rounds, speed), 1000); }
                        else { setTimeout(processNext, 1000); }
                    }
                };
            }, 300);
        } else if (results.length > 0) {
            finishAndShow();
        }

        runBtn.onclick = () => {
            if (runBtn.innerText === "重新檢查") { resetToInitial(); }
            else {
                const lines = inputArea.value.trim().split('\n');
                const queue = lines.map(l => {
                    const p = l.trim().split(/\s+/);
                    if (p.length < 2) return null;
                    return { id: p[0], ver: p[p.length - 1], name: p.slice(1, -1).join(' ') };
                }).filter(x => x);
                if (queue.length === 0) return alert('格式錯誤！');
                storage.set('vc_input_raw', inputArea.value);
                storage.set('vc_test_rounds', roundsInp.value);
                storage.set('vc_test_speed', speedSel.value);
                storage.set('vc_is_checking', true);
                storage.set('vc_results', []);
                const first = queue.shift();
                storage.set('vc_queue', queue);
                storage.set('vc_current_target', first);
                if (typeof window.changeGame === 'function') window.changeGame(first.id);
            }
        };

        clearStopBtn.onclick = () => {
            if (clearStopBtn.innerText === "終止") { if (confirm("確定終止？")) resetToInitial(); }
            else if (!clearStopBtn.disabled) { inputArea.value = ''; storage.set('vc_input_raw', ''); storage.set('vc_results', []); }
        };
    }

    requestAnimationFrame(ensureUI);
})();
