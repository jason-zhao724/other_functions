// ==UserScript==
// @name         遊戲餘額即時驗證驗證工具
// @namespace    http://tampermonkey.net/
// @version      2.6
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
    let shadowBalance = 0;      // 全域影子大帳本
    let spinStartBalance = 0;   // 本次事件前的基準餘額
    let lastBet = 0;            // 本局投注額
    let expectedBalance = 0;    // 腳本計算的預期餘額

    // 數據快取欄位
    let currentWinBase = 0;
    let currentWinFree = 0;
    let currentWinBonus = 0;
    let currentSpinJackpot = 0; // 遊戲內依附型 Jackpot 快取
    let currentTotalWin = 0;
    let currentSeqNo = "等待中";
    let serverUserPoint = 0;

    let isInitialized = false;

    // 遊戲載入完成後，主動獲取最原始的乾淨起點
    function init() {
        if (isInitialized) return;

        console.log("%c[餘額驗證] 偵測到遊戲載入完成！", "color: #2196F3; font-weight: bold;");

        if (typeof window.getBalance === 'function') {
            shadowBalance = window.getBalance() || 0;
            console.log(`%c[餘額驗證] 🚀 啟動成功！取得初始餘額: ${shadowBalance} (${(shadowBalance/100).toFixed(2)})`, "color: #9C27B0; font-weight: bold;");
        } else {
            console.log("%c[餘額驗證] 警告：初始餘額獲取失敗。", "color: red;");
            return;
        }

        window.enableLog = true;
        hookConsole();
        isInitialized = true;
    }

    // 輸出完整對帳單 (視覺淨化：九行合一純文字版)
    function printFinalReport(titleText, reportLines, isError = false) {
        const logColor = isError ? "#FF5252" : "#4CAF50";
        const finalTitle = isError ? `[餘額驗證失敗] ${titleText}` : `[餘額驗證通過] ${titleText}`;

        console.group(`%c${finalTitle}`, `color: ${logColor}; font-weight: bold;`);
        console.log(`%c${reportLines.join('\n')}`, "color: #E0E0E0; line-height: 1.6;");
        console.groupEnd();

        if (isError) {
            alert(`${titleText}\n餘額異常，請檢查控制台！`);
        }
    }

    // 核心監聽機制
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

                        spinStartBalance = shadowBalance; // 鎖定這局起點
                        shadowBalance -= lastBet;         // 大帳本扣投注

                        originalLog(`%c[餘額驗證] 記帳扣投注：${lastBet} | 影子帳本變更為: ${shadowBalance}`, "color: #FF9800;");
                    }
                } catch (e) {
                    originalLog("%c[餘額驗證腳本錯誤] 解析 EV_CS_SPIN 失敗", "color: red;", e);
                }
            }

            // 2. 監聽 EV_SC_SPIN_RESULT (一般/免費/紅利遊戲結算結果)
            if (logString.includes("EV_SC_SPIN_RESULT")) {
                try {
                    const jsonMatch = logString.match(/result:\s*(\{.*?\})\s*$/, '');
                    const finalMatch = jsonMatch ? jsonMatch[1] : (logString.match(/(\{.*"body".*\})/) ? logString.match(/(\{.*"body".*\})/)[1] : null);

                    if (finalMatch) {
                        const fullData = JSON.parse(finalMatch);
                        const resultData = fullData.body || fullData;

                        currentWinBase = resultData.totalWinBase || 0;
                        currentWinFree = resultData.totalWinFree || 0;
                        currentWinBonus = resultData.totalWinBonus || 0;
                        currentSpinJackpot = resultData.jackpotHitAmount || 0; // 讀取遊戲內內嵌的 Jackpot 贏分
                        currentTotalWin = resultData.totalWin || 0;
                        currentSeqNo = resultData.gameSeqNo || "未知局號";
                        serverUserPoint = resultData.userPoint || 0;

                        // 驗證所有贏分細項橫向加總 (包含一般、免費、紅利與遊戲內 Jackpot)
                        const calculatedTotalWin = currentWinBase + currentWinFree + currentWinBonus + currentSpinJackpot;
                        if (calculatedTotalWin !== currentTotalWin) {
                            const errorMsg = `贏分加總異常！計算:${calculatedTotalWin} (${currentWinBase}+${currentWinFree}+${currentWinBonus}+${currentSpinJackpot}) 實際:${currentTotalWin}`;
                            originalLog(`%c[餘額驗證失敗] ${errorMsg}`, "color: red; font-weight: bold;");
                            alert(`局號: ${currentSeqNo}\n${errorMsg}`);
                            return;
                        }

                        shadowBalance += currentTotalWin; // 大帳本加贏分
                        expectedBalance = spinStartBalance - lastBet + currentTotalWin; // 該局獨立預期

                        const isBalanceAbnormal = expectedBalance !== serverUserPoint;

                        // 🌟 修改：不論有沒有中 Jackpot，所有欄位都固定輸出，沒中則顯示 0.00
                        const report = [
                            `1. SPIN前餘額	: ${(spinStartBalance/100).toFixed(2)}`,
                            `2. 總押分(投注)	: ${(lastBet/100).toFixed(2)}`,
                            `3. 一般遊戲贏分	: ${(currentWinBase/100).toFixed(2)}`,
                            `4. 免費遊戲贏分	: ${(currentWinFree/100).toFixed(2)}`,
                            `5. 紅利遊戲贏分	: ${(currentWinBonus/100).toFixed(2)}`,
                            `6. 遊戲內彩金贏分: ${(currentSpinJackpot/100).toFixed(2)}`,
                            `7. 本局總贏分	: ${(currentTotalWin/100).toFixed(2)}`,
                            `8. 伺服器餘額	: ${(serverUserPoint/100).toFixed(2)}`,
                            `9. 預期餘額		: ${(expectedBalance/100).toFixed(2)}`
                        ];

                        printFinalReport(`局號: ${currentSeqNo}`, report, isBalanceAbnormal);

                        if (isBalanceAbnormal) shadowBalance = serverUserPoint; // 斷層校正
                    }
                } catch (e) {
                    originalLog("%c[餘額驗證腳本錯誤] 解析 EV_SC_SPIN_RESULT 失敗", "color: red;", e);
                }
            }

            // 3. 監聽 EV_SC_JACKPOT_DRAW (隨機 Jackpot 幸運彩金封包)
            if (logString.includes("EV_SC_JACKPOT_DRAW")) {
                try {
                    const jsonMatch = logString.match(/result:\s*(\{.*?\})\s*$/, '');
                    const finalMatch = jsonMatch ? jsonMatch[1] : (logString.match(/(\{.*"type":"jackpot".*\})/) ? logString.match(/(\{.*"type":"jackpot".*\})/)[1] : null);

                    if (finalMatch) {
                        const jpData = JSON.parse(finalMatch);

                        const jpType = jpData.prizeType || "JACKPOT";
                        const jpPrize = jpData.prize || 0;
                        serverUserPoint = jpData.userPoint || 0;

                        spinStartBalance = shadowBalance; // 鎖定天降大獎前的基準
                        shadowBalance += jpPrize;        // 影子大帳本同步加上彩金
                        expectedBalance = spinStartBalance + jpPrize; // 預期餘額

                        const isBalanceAbnormal = expectedBalance !== serverUserPoint;

                        // 組裝隨機 Jackpot 的專屬報表
                        const jpReport = [
                            `1. 彩金前餘額	: ${(spinStartBalance/100).toFixed(2)}`,
                            `2. 獲得彩金種類	: ${jpType}`,
                            `3. 獲得彩金金額	: ${(jpPrize/100).toFixed(2)}`,
                            `4. 伺服器餘額	: ${(serverUserPoint/100).toFixed(2)}`,
                            `5. 預期餘額		: ${(expectedBalance/100).toFixed(2)}`
                        ];

                        printFinalReport(`[彩金 - ${jpType}]`, jpReport, isBalanceAbnormal);

                        if (isBalanceAbnormal) shadowBalance = serverUserPoint; // 斷層校正
                    }
                } catch (e) {
                    originalLog("%c[餘額驗證腳本錯誤] 解析 EV_SC_JACKPOT_DRAW 失敗", "color: red;", e);
                }
            }
        };
    }

    // 主動輪詢監聽機制
    const checkInterval = setInterval(() => {
        if (typeof window.enableLog !== 'undefined' && typeof window.getBalance === 'function') {
            clearInterval(checkInterval);
            init();
        }
    }, 500);

})();
