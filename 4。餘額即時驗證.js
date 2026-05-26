// ==UserScript==
// @name         遊戲餘額即時驗證驗證工具
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  
// @author       YourName
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 全域流水帳與單局對帳變數 (整數運算)
    let shadowBalance = 0;      // 全域核心影子大帳本（一進遊戲主動獲取後，全程由腳本加減追蹤）
    let spinStartBalance = 0;   // 單局按下 SPIN 當下的乾淨起點（由 shadowBalance 轉交）
    let lastBet = 0;            // 本局投注額
    let expectedBalance = 0;    // 腳本計算的預期餘額

    // 贏分與局號快取
    let currentWinBase = 0;
    let currentWinFree = 0;
    let currentWinBonus = 0;
    let currentTotalWin = 0;
    let currentSeqNo = "等待中";
    let serverUserPoint = 0;

    let isInitialized = false;

    // 【核心修正】：遊戲載入完成後，第一時間主動獲取乾淨餘額
    function init() {
        if (isInitialized) return;

        console.log("%c[餘額驗證] 偵測到遊戲載入完成！", "color: #2196F3; font-weight: bold;");

        // 🟢 執行你要求的核心指令：主動送出 getBalance() 取得最原始的初始餘額
        if (typeof window.getBalance === 'function') {
            shadowBalance = window.getBalance() || 0;
            console.log(`%c[餘額驗證] 🚀 啟動成功！取得初始餘額: ${shadowBalance} (${(shadowBalance/100).toFixed(2)})`, "color: #9C27B0; font-weight: bold;");
        } else {
            console.log("%c[餘額驗證] 警告：初始餘額獲取失敗。", "color: red;");
            return;
        }

        window.enableLog = true;
        console.log("%c[餘額驗證] 已執行 enableLog=true，可查看封包", "color: #4CAF50;");

        hookConsole();
        isInitialized = true;
    }

    // 輸出 8 大項完整對帳單
    function printFinalReport(isError = false) {
        const logColor = isError ? "#FF5252" : "#4CAF50";
        const title = isError ? `[驗證失敗] 局號: ${currentSeqNo}` : `[驗證通過] 局號: ${currentSeqNo}`;

        // 🌟 核心技巧：將所有欄位組裝進同一個陣列，用換行符號連接
        const reportLines = [
            `1. SPIN前餘額   : ${(spinStartBalance/100).toFixed(2)}`,
            `2. 總押分(投注) : ${(lastBet/100).toFixed(2)}`,
            `3. 一般遊戲贏分 : ${(currentWinBase/100).toFixed(2)}`,
            `4. 免費遊戲贏分 : ${(currentWinFree/100).toFixed(2)}`,
            `5. 紅利遊戲贏分 : ${(currentWinBonus/100).toFixed(2)}`,
            `6. 本局總贏分   : ${(currentTotalWin/100).toFixed(2)}`,
            `7. 伺服器餘額   : ${(serverUserPoint/100).toFixed(2)}`,
            `8. 預期餘額     : ${(expectedBalance/100).toFixed(2)}`
        ];

        // 只呼叫一次 console.group 與一個大總匯字串，把雜亂的瀏覽器連結擠出報表區
        console.group(`%c${title}`, `color: ${logColor}; font-weight: bold;`);
        console.log(`%c${reportLines.join('\n')}`, "color: #E0E0E0; line-height: 1.5;");
        console.groupEnd();

        if (isError) {
            alert(`局號: ${currentSeqNo}\n餘額異常`);
        }
    }

    // 核心攔截機制：只管網路封包
    function hookConsole() {
        const originalLog = console.log;

        console.log = function(...args) {
            originalLog.apply(console, args);

            const logString = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');

            // 1. 監聽 EV_CS_SPIN (玩家投注發出)
            if (logString.includes("EV_CS_SPIN")) {
                try {
                    const match = logString.match(/obj:\s*(\{.*?\})/);
                    if (match && match[1]) {
                        const jsonObj = JSON.parse(match[1]);
                        lastBet = jsonObj.bet;

                        // 拿此時此刻最乾淨、由全域大帳本控管的餘額做為這一小局的起點基準
                        spinStartBalance = shadowBalance;

                        // 大帳本立刻在後台扣除本次投注額
                        shadowBalance -= lastBet;

                        originalLog(`%c[餘額驗證] 記帳扣投注：${lastBet} | 當前影子大帳本變更為: ${shadowBalance}`, "color: #FF9800;");
                    }
                } catch (e) {
                    originalLog("%c[餘額驗證腳本錯誤] 解析 EV_CS_SPIN 失敗", "color: red;", e);
                }
            }

            // 2. 監聽 EV_SC_SPIN_RESULT (伺服器回傳結果)
            if (logString.includes("EV_SC_SPIN_RESULT")) {
                try {
                    const jsonMatch = logString.match(/result:\s*(\{.*?\})\s*$/, '');
                    const finalMatch = jsonMatch ? jsonMatch[1] : (logString.match(/(\{.*"body".*\})/) ? logString.match(/(\{.*"body".*\})/)[1] : null);

                    if (finalMatch) {
                        const fullData = JSON.parse(finalMatch);
                        const resultData = fullData.body || fullData;

                        // 快取所有數值
                        currentWinBase = resultData.totalWinBase || 0;
                        currentWinFree = resultData.totalWinFree || 0;
                        currentWinBonus = resultData.totalWinBonus || 0;
                        currentTotalWin = resultData.totalWin || 0;
                        currentSeqNo = resultData.gameSeqNo || "未知局號";
                        serverUserPoint = resultData.userPoint || 0;

                        // A. 驗證四大贏分參數橫向加總是否正確
                        const calculatedTotalWin = currentWinBase + currentWinFree + currentWinBonus;
                        if (calculatedTotalWin !== currentTotalWin) {
                            const errorMsg = `贏分加總異常！\n計算總和: ${calculatedTotalWin} (${currentWinBase}+${currentWinFree}+${currentWinBonus})\n封包總和(totalWin): ${currentTotalWin}`;
                            originalLog(`%c[餘額驗證失敗] ${errorMsg}`, "color: red; font-weight: bold;");
                            alert(`局號: ${currentSeqNo}\n${errorMsg}`);
                            return;
                        }

                        // B. 影子大帳本加上本局總贏分
                        shadowBalance += currentTotalWin;

                        // C. 理論上，這一局經由腳本一扣一加算出來的「影子大帳本」，應該要等於最新的伺服器期望值
                        expectedBalance = shadowBalance;

                        // D. 進行終極三向核對：影子帳本 (expectedBalance) 是否等於 伺服器權威餘額 (userPoint)
                        const isBalanceAbnormal = expectedBalance !== serverUserPoint;

                        // 零延遲，立刻噴出你要的精美對帳報告！
                        printFinalReport(isBalanceAbnormal);

                        // 🌟 防線校正：如果因為極罕見的不可抗力導致斷層，以最新伺服器數據校正影子大帳本
                        if (isBalanceAbnormal) {
                            shadowBalance = serverUserPoint;
                        }
                    }
                } catch (e) {
                    originalLog("%c[餘額驗證錯誤] 解析 EV_SC_SPIN_RESULT 失敗", "color: red;", e);
                }
            }
        };
    }

    // 主動輪詢監聽機制（每 0.5 秒巡邏，一旦確認遊戲加載出 getBalance 函式，立刻執行 init 初始化）
    const checkInterval = setInterval(() => {
        if (typeof window.enableLog !== 'undefined' && typeof window.getBalance === 'function') {
            clearInterval(checkInterval);
            init();
        }
    }, 500);

})();
