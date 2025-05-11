document.addEventListener("DOMContentLoaded", function () {
    
    const modeSelector = document.getElementById("modeSelector");
    const batchOptions = document.getElementById("batchOptions");
    const scanButton = document.getElementById("scanEmails");
 
    // 切換模式時，決定是否顯示「頁數輸入」
    modeSelector.addEventListener("change", () => {
        const mode = modeSelector.value;
        batchOptions.style.display = (modeSelector.value === "batch") ? "block" : "none";
        
    });

    // 預設顯示狀態
    batchOptions.style.display = (modeSelector.value === "batch") ? "block" : "none";
    

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
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: "getPhishingUrls" });

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
        


        const mode = modeSelector.value;


    });
    
    // 顯示批次結果
    chrome.storage.onChanged.addListener((changes, areaName) => {
        
        if (areaName === "local" && changes.suspiciousEmails) {
            updatePopupData();
        }

        if (areaName === "local" && changes.singleEmailResult) {
            const result = changes.singleEmailResult.newValue;
            const display = document.getElementById("singleResult");

            if (result.error) {
                display.innerHTML = `<p class='error'>❌ ${result.error}</p>`;
            } else {
                display.innerHTML = `
                    <p><strong>標題：</strong> ${result.title}</p>
                    <p><strong>寄件人：</strong> ${result.sender}</p>
                    <p><strong>內容預覽：</strong><br>${result.preview}</p>
                    <p><strong>附件：</strong> ${result.attachments.join(", ") || "無"}</p>
                    <p><strong>偵測結果：</strong><br>${result.problems.length ? result.problems.map(p => "⚠️ " + p).join("<br>") : "✅ 無異常"}</p>
                `;
            }
        }
    });
});

function updatePopupData() {
    chrome.storage.local.get("suspiciousEmails", function (data) {

        let emailList = document.getElementById("emailList");
        let count = document.getElementById("count");
        let emails = data.suspiciousEmails || [];

        emailList.innerHTML = ""; // 清空列表

        if (emails.length === 0) {
            //emailList.innerHTML = "<li class='safe'>請開始偵測Gmail的信件</li>";
            emailList.innerHTML = "<li class='safe'>請開始偵測Gmail的信件</li>";
            count.textContent = "0";
            return;
        }

        // 顯示異常信件數量
        count.textContent = emails.length;
        
        // 統計標題出現次數
        let emailCounts = {};

        emails.forEach(item => {
            let key = `${item.title} | ${item.sender}`;
            emailCounts[key] = (emailCounts[key] || 0) + 1;
        });

        for (let key in emailCounts) {
            let li = document.createElement("li");
            li.textContent = `${key} (${emailCounts[key]} 封)`;
            emailList.appendChild(li);
        }
        

    });

}

