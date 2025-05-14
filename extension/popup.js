const POPUP_ANOMALY_EXPLANATIONS = {
    KEYWORD_SUBJECT: {
        title: "主旨包含可疑關鍵字",
        explanation: "郵件主旨中出現了常見的釣魚或詐騙用語。",
        tip: "💡 提高警覺！詐騙者常用聳動的標題誘使您立即行動。"
    },
    SUSPICIOUS_SENDER: {
        title: "寄件人為已知可疑來源",
        explanation: "此寄件人的郵件地址已被標記為潛在的釣魚郵件發送者。",
        tip: "💡 小心！仔細檢查其完整的郵件地址。"
    },
    URL_IN_SUBJECT: {
        title: "主旨包含可疑網址",
        explanation: "郵件主旨中直接包含了一個網址。",
        tip: "💡 警惕！正常郵件很少在主旨中直接放入重要連結。"
    },
    KEYWORD_CONTENT: {
        title: "內容包含可疑關鍵字",
        explanation: "郵件內容中偵測到與釣魚或詐騙相關的詞彙。",
        tip: "💡 仔細閱讀！檢查郵件內文是否有語法錯誤、不合邏輯的要求。"
    },
    URL_IN_CONTENT: {
        title: "內容包含可疑網址",
        explanation: "郵件內文中發現了已知的釣魚網址。",
        tip: "💡 不要輕易點擊！將滑鼠懸停在連結上預覽。"
    },
    SUSPICIOUS_LINK_CONTENT: {
        title: "內容連結指向可疑網域",
        explanation: "郵件內文中的超連結實際指向的網域可疑。",
        tip: "💡 檢查連結！確認連結文字與實際指向的網址是否相符。"
    },
    HAS_ATTACHMENT: {
        title: "郵件包含附件",
        explanation: "郵件中帶有附件。",
        tip: "💡 謹慎開啟附件！除非您完全信任寄件人。"
    },
    MODEL_DETECTED_URL: {
        title: "AI模型偵測到可疑URL",
        explanation: "AI 模型分析認為郵件中的某些 URL 具有釣魚網站的特徵。",
        tip: "💡 AI輔助判斷！若有疑慮，請勿點擊。"
    }
};

document.addEventListener("DOMContentLoaded", function () {
    
    const modeSelector = document.getElementById("modeSelector");
    const batchOptions = document.getElementById("batchOptions");
    const scanButton = document.getElementById("scanEmails");
    const batchResultSection = document.getElementById("batchResultSection");
    const singleResultSection = document.getElementById("singleResultSection");

    function updateUIVisibility(mode) {
        if (mode === "batch") {
            batchOptions.style.display = "block";
            batchResultSection.style.display = "block"; // 預設顯示批次結果區
            singleResultSection.style.display = "none"; // 隱藏單封信結果區
        } else if (mode === "single") {
            batchOptions.style.display = "none";
            batchResultSection.style.display = "none"; // 隱藏批次結果區
            singleResultSection.style.display = "block"; // 顯示單封信結果區
        }
    }

    // 初始 UI 設定
    updateUIVisibility(modeSelector.value);

    // 切換模式時，決定是否顯示「頁數輸入」
    modeSelector.addEventListener("change", () => {
        const mode = modeSelector.value;
        updateUIVisibility(mode);
        // 切換模式時，可以選擇清空之前的結果
        if (mode === "batch") {
            clearSingleResultDisplay();
        } else {
            clearBatchResultDisplay();
        }
        
    });

    // 預設顯示狀態
    //batchOptions.style.display = (modeSelector.value === "batch") ? "block" : "none";
    

    // 先清除儲存的數據，確保每次打開 popup 時 UI 先重置
    //chrome.storage.local.clear();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "getMaxPages" }, (response) => {
            if (chrome.runtime.lastError) {
                //console.error("❌ 無法取得最大頁數:", chrome.runtime.lastError.message);
                return;
            }
            if (response && response.success) {
                let input = document.getElementById("pagesToScan");
                input.max = response.maxPages;
                input.placeholder = `最多 ${response.maxPages} 頁`;
                input.title = `最多可偵測 ${response.maxPages} 頁的 Gmail 信件`;
            } else {
                console.warn("⚠️ Gmail 頁數讀取失敗", response?.message);
            }
        });
    });
    
    // 點擊開始分析按鈕
    scanButton.addEventListener("click", () => {
        const mode = modeSelector.value; // 在點擊時獲取當前模式
        // 清空上一次的結果，避免混淆
        if (mode === "batch") {
            clearSingleResultDisplay();
            batchResultSection.style.display = "block"; // 確保批次結果區可見
            singleResultSection.style.display = "none";
        } else if (mode === "single") {
            clearBatchResultDisplay();
            singleResultSection.style.display = "block"; // 確保單封信結果區可見
            batchResultSection.style.display = "none";
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0] || !tabs[0].id) {
                console.error("無法獲取當前分頁");
                // 可以在此處顯示一個錯誤訊息給用戶
                return;
            }
            // 確保先發送 getPhishingUrls
            chrome.tabs.sendMessage(tabs[0].id, { action: "getPhishingUrls" }, () => {
                if (chrome.runtime.lastError) {
                    // console.warn("Error sending getPhishingUrls:", chrome.runtime.lastError.message);
                    // 即使這裡出錯，後續的 scan 動作還是可能需要執行（content.js 中有等待機制）
                }

                if (mode === "batch") {
                    const limit = parseInt(document.getElementById("pagesToScan").value) || 2;
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "scanEmails",
                        limit: limit
                    });
                } else if (mode === "single") {
                    chrome.tabs.sendMessage(tabs[0].id, { action: "scanCurrentEmail" });
                }
            });
        });


    });
    
    // 顯示批次結果
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local") {
            if (changes.suspiciousEmails && modeSelector.value === "batch") { // 只在批次模式下更新批次結果
                updatePopupData(changes.suspiciousEmails.newValue);
            }
            if (changes.singleEmailResult && modeSelector.value === "single") { // 只在單封信模式下更新單封信結果
                displaySingleEmailResult(changes.singleEmailResult.newValue);
            }
        }

    });

    // 初始加載數據 (如果 popup 打開時數據已存在)
    chrome.storage.local.get(["suspiciousEmails", "singleEmailResult"], (data) => {
        // 根據當前選擇的模式來決定是否顯示已儲存的數據
        const currentMode = modeSelector.value;
        if (currentMode === "batch" && data.suspiciousEmails) {
            updatePopupData(data.suspiciousEmails);
            batchResultSection.style.display = 'block'; // 確保可見
        } else if (currentMode === "single" && data.singleEmailResult) {
            displaySingleEmailResult(data.singleEmailResult);
            singleResultSection.style.display = 'block'; // 確保可見
        }
    });

    // 清除顯示的輔助函式
    function clearBatchResultDisplay() {
        const emailList = document.getElementById("emailList");
        const countSpan = document.getElementById("count");
        if(emailList) emailList.innerHTML = "<li class='safe'>請開始偵測Gmail的信件</li>";
        if(countSpan) countSpan.textContent = "0";
        // 如果有其他批次結果相關的元素，也一併清除
    }

    function clearSingleResultDisplay() {
        const display = document.getElementById("singleResultSection"); // 改為操作新的容器 ID
        if(display) display.innerHTML = "<p>請點擊「開始分析」以查看單封郵件的分析結果。</p>"; // 預設提示
    }
});

// updatePopupData 函式應確保操作 #batchResultSection 內的元素
function updatePopupData(emails) {
    const batchResultContainer = document.getElementById("batchResultSection");
    if (!batchResultContainer) return; // 如果容器不存在，不執行

    const emailList = batchResultContainer.querySelector("#emailList"); // 從批次結果容器內查找
    const countSpan = batchResultContainer.querySelector("#count"); // 從批次結果容器內查找

    if (!emailList || !countSpan) return;

    emailList.innerHTML = "";

    if (!emails || emails.length === 0) {
        emailList.innerHTML = "<li class='safe'>太棒了！目前未偵測到明顯可疑郵件。</li>";
        countSpan.textContent = "0";
        return;
    }
    // ... (其餘 updatePopupData 邏輯不變)
    countSpan.textContent = emails.length;

    emails.forEach(email => {
        let li = document.createElement("li");
        li.classList.add("suspicious-email-item");

        let emailHeader = document.createElement("div");
        emailHeader.classList.add("email-header");
        emailHeader.innerHTML = `<strong>標題:</strong> ${email.title}<br><strong>寄件人:</strong> ${email.sender}`;
        li.appendChild(emailHeader);

        if (email.anomalies && email.anomalies.length > 0) {
            let reasonsDiv = document.createElement("div");
            reasonsDiv.classList.add("reasons-list");
            reasonsDiv.innerHTML = "<h4>偵測到的問題：</h4>";

            let ul = document.createElement("ul");
            email.anomalies.forEach(anomaly => {
                const explanation = POPUP_ANOMALY_EXPLANATIONS[anomaly.code];
                let reasonLi = document.createElement("li");
                reasonLi.classList.add("reason-item", `reason-${anomaly.code.toLowerCase()}`);
                reasonLi.innerHTML = `
                    <p class="reason-title"><strong>${explanation ? explanation.title : anomaly.code}</strong></p>
                    ${explanation && explanation.explanation ? `<p class="reason-explanation">${explanation.explanation}</p>` : ''}
                    <p class="reason-detail"><em>詳情: ${anomaly.detail}</em></p>
                    ${explanation && explanation.tip ? `<p class="reason-tip">${explanation.tip}</p>` : ''}
                `;
                ul.appendChild(reasonLi);
            });
            reasonsDiv.appendChild(ul);
            li.appendChild(reasonsDiv);
        }
        emailList.appendChild(li);
    });
}

// displaySingleEmailResult 函式應操作 #singleResultSection
function displaySingleEmailResult(result) {
    const displaySection = document.getElementById("singleResultSection"); // 直接使用新的 section ID
    if (!displaySection) return; // 如果容器不存在，不執行

    displaySection.innerHTML = ""; // 清空

    if (!result) { // 處理 result 為 null 或 undefined 的情況
        displaySection.innerHTML = "<p>分析結果尚未載入或為空。</p>";
        return;
    }


    if (result.error) {
        displaySection.innerHTML = `<p class='error'>❌ ${result.error}</p>`;
        if (result.knowledgeTip) {
            displaySection.innerHTML += `<div class="knowledge-card neutral-card"><p>${result.knowledgeTip}</p></div>`;
        }
        return;
    }

    // 為了確保單封信結果區有標題，可以在這裡加入
    let content = `<h2>📬 單封郵件分析結果</h2>`; // 添加一個標題

    content += `
        <div class="email-details">
            <p><strong>標題：</strong> ${result.title || "未能讀取"}</p>
            <p><strong>寄件人：</strong> ${result.sender || "未能讀取"}</p>
            <p><strong>內容預覽：</strong><br><span class="preview-text">${result.preview || "無"}</span></p>
            <p><strong>附件：</strong> ${(result.attachments && result.attachments.length > 0) ? result.attachments.join(", ") : "無"}</p>
        </div>
        <h3>📊 偵測結果分析</h3>
    `;
    // ... (其餘 displaySingleEmailResult 邏輯，產生 knowledge-card 等)
    if (result.noAnomalies) {
        content += `<div class="knowledge-card safe-card">✅ 太棒了！初步分析未發現明顯可疑跡象。但仍請保持警惕！</div>`;
    } else if (result.detectedProblems && result.detectedProblems.length > 0) {
        result.detectedProblems.forEach(problem => {
            const explanation = POPUP_ANOMALY_EXPLANATIONS[problem.code];
            content += `
                <div class="knowledge-card problem-card reason-${problem.code.toLowerCase()}">
                    <h4>${explanation ? explanation.title : problem.code}</h4>
                    ${explanation && explanation.explanation ? `<p>${explanation.explanation}</p>` : ''}
                    <p><em>具體資訊: ${problem.detail}</em></p>
                    ${explanation && explanation.tip ? `<p class="tip">${explanation.tip}</p>` : ''}
                </div>
            `;
        });
    } else {
         content += `<div class="knowledge-card neutral-card">ℹ️ 未執行完整偵測或無特定問題回報。</div>`;
    }
    displaySection.innerHTML = content;
}