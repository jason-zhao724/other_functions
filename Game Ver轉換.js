// ==UserScript==
// @name         Game Ver清單轉換工具 (移除清空確認)
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  窄版介面，輸入框提供灰字範例，點擊清空不再跳出確認視窗
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.right = "20px";
    panel.style.bottom = "20px";
    panel.style.width = "280px";
    panel.style.background = "#ffffff";
    panel.style.border = "1px solid #ccc";
    panel.style.borderRadius = "8px";
    panel.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    panel.style.padding = "12px";
    panel.style.zIndex = "999999";
    panel.style.fontSize = "12px";
    panel.style.fontFamily = "Arial, sans-serif";

    // 預設範例文字
    const placeholderText = "範例：\n22011 吠陀女神 ver. abc1234\n22012 飛凰騰達 ver. 1234abc";

    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="font-weight:bold;color:#333;">Game Ver 轉換</div>
            <div id="gm_close"
                 style="cursor:pointer;font-weight:bold;color:#aaa;padding:0 5px;">
                 ✕
            </div>
        </div>

        <textarea id="gm_input"
            placeholder="${placeholderText}"
            style="width:100%;height:110px;margin-bottom:10px;resize:vertical;box-sizing:border-box;border:1px solid #ddd;padding:8px;line-height:1.4;"></textarea>

        <div style="display:grid;grid-template-columns: 1fr 1fr;gap:8px;margin-bottom:10px;">
            <button id="gm_convert" style="cursor:pointer;padding:8px;background:#f5f5f5;border:1px solid #ccc;border-radius:4px;">轉換格式</button>
            <button id="gm_copy" style="cursor:pointer;padding:8px;background:#f5f5f5;border:1px solid #ccc;border-radius:4px;">複製結果</button>
            <button id="gm_download" style="cursor:pointer;padding:8px;background-color:#e3f2fd;border:1px solid #2196f3;border-radius:4px;color:#0d47a1;">下載 JSON</button>
            <button id="gm_clear" style="cursor:pointer;padding:8px;background:#f5f5f5;border:1px solid #ccc;border-radius:4px;">全部清空</button>
        </div>

        <textarea id="gm_output"
            placeholder="轉換後的 JSON 會顯示在此..."
            readonly
            style="width:100%;height:150px;resize:vertical;box-sizing:border-box;border:1px solid #ddd;padding:8px;background-color:#fcfcfc;color:#555;"></textarea>
    `;

    document.body.appendChild(panel);

    // ===== 關閉面板 =====
    document.getElementById("gm_close").addEventListener("click", () => panel.remove());

    // ===== 轉換邏輯 =====
    document.getElementById("gm_convert").addEventListener("click", function () {
        const input = document.getElementById("gm_input").value.trim();
        if (!input) {
            alert("請先貼上內容！");
            return;
        }

        const lines = input.split("\n");
        let blocks = [];

        lines.forEach(line => {
            const match = line.match(/^(\d+).*?ver\.\s*([a-zA-Z0-9._-]+)/i);
            if (match) {
                blocks.push({
                    "type": "game",
                    "product": match[1],
                    "version": match[2],
                    "checked": "true"
                });
            }
        });

        if (blocks.length === 0) {
            alert("找不到符合格式的內容 (需包含 ID 與 ver. xxx)");
            return;
        }

        document.getElementById("gm_output").value = JSON.stringify(blocks, null, 2);
    });

    // ===== 複製功能 =====
    document.getElementById("gm_copy").addEventListener("click", function () {
        const output = document.getElementById("gm_output");
        if (!output.value) return;
        output.select();
        document.execCommand("copy");

        const originalText = this.innerText;
        this.innerText = "已複製！";
        this.style.background = "#e8f5e9";
        setTimeout(() => {
            this.innerText = originalText;
            this.style.background = "#f5f5f5";
        }, 1000);
    });

    // ===== 下載功能 =====
    document.getElementById("gm_download").addEventListener("click", function () {
        const content = document.getElementById("gm_output").value;
        if (!content) return alert("請先轉換內容再下載");

        const blob = new Blob([content], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const now = new Date();
        const dateStr = now.getFullYear() +
                        String(now.getMonth() + 1).padStart(2, '0') +
                        String(now.getDate()).padStart(2, '0');

        a.href = url;
        a.download = `game_list_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // ===== 清空 (已移除確認彈窗) =====
    document.getElementById("gm_clear").addEventListener("click", function () {
        document.getElementById("gm_input").value = "";
        document.getElementById("gm_output").value = "";
    });

})();
