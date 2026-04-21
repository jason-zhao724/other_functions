(function() {
    'use strict';

    const getParam = (name) => new URLSearchParams(window.location.search).get(name);
    const storage = {
        set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
        get: (key, def) => {
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : def;
        },
        remove: (key) => localStorage.removeItem(key)
    };

    let isRunning = getParam('vc_run') === '1' || storage.get('vc_is_checking', false);

    if (isRunning) {
        storage.set('vc_is_checking', true);
        if (getParam('vc_id')) {
            storage.set('vc_current_target', { 
                id: getParam('vc_id'), 
                ver: getParam('vc_ver'), 
                name: getParam('vc_name') 
            });
        }
    }

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
            <div style="font-size:16px; font-weight:bold; margin-bottom:12px; border-bottom:1px solid #ccc; padding-bottom:6px;">🧪 版本驗證與投注測試 v4.0</div>
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

    function setupLogic() {
        const inputArea = document.getElementById('vc-input');
        const displayArea = document.getElementById('vc-display');
        const runBtn = document.getElementById('vc-run-btn');
        const clearStopBtn = document.getElementById('vc-clear-stop-btn');
        const roundsInp = document.getElementById('vc-rounds');
        const speedSel = document.getElementById('vc-speed');

        document.getElementById('vc-close-btn').onclick = () => {
            storage.set('vc_is_checking', false);
            storage.remove('vc_external_script_url'); // 告訴 Loader 停止接力
            document.getElementById('vc-panel').remove();
        };

        function processNext() {
            let queue = storage.get('vc_queue', []);
            if (queue.length === 0) {
                storage.set('vc_is_checking', false);
                storage.remove('vc_external_script_url');
                finishAndShow(); 
                return; 
            }
            const next = queue.shift();
            storage.set('vc_queue', queue);
            storage.set('vc_current_target', next);

            if (typeof window.changeGame === 'function') {
                window.changeGame(next.id);
                setTimeout(() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('vc_run', '1');
                    url.searchParams.set('vc_id', next.id);
                    url.searchParams.set('vc_ver', next.ver);
                    url.searchParams.set('vc_name', next.name);
                    window.location.href = url.toString();
                }, 200);
            }
        }

        // --- 其餘下注與監控邏輯保持不變 ---
        // (省略部分重複代碼，請延用 v3.9 的 applyAutoSettings 與 flowTimer)
        const flowTimer = setInterval(() => {
            if (!document.querySelector('#Cocos2dGameContainer')) return;
            clearInterval(flowTimer);
            window.callbackLog = function(src, msg) {
                if (msg === 'Start Game!') {
                    const rounds = Number(storage.get('vc_test_rounds', 0));
                    const speed = Number(storage.get('vc_test_speed', 5));
                    if (rounds > 0) { 
                        // 下注監控邏輯
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
                        // 套用下注
                        setTimeout(() => {
                            const facade = window.puremvc.Facade.getInstance();
                            const proxy = facade.model.proxyMap;
                            proxy.ControlProxy.setAutoTimes(rounds);
                            proxy.GameDataProxy.gameSpeed = speed;
                            proxy.GameDataProxy.turboMode = true;
                            facade.sendNotification('SlotEvent.sendBetRequest');
                        }, 1000);
                    } else { setTimeout(processNext, 1000); }
                }
            };
        }, 300);
        
        // --- 重新檢查按鈕邏輯 ---
        runBtn.onclick = () => {
            if (runBtn.innerText === "重新檢查") {
                storage.set('vc_results', []);
                location.reload();
            } else {
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
                processNext();
            }
        };
        
        function finishAndShow() { /* 同 v3.9 邏輯 */ }
    }

    if (isRunning) ensureUI(); else requestAnimationFrame(ensureUI);
})();
