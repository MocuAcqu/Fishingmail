chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
        console.log("🌐 新網頁載入，重置偵測結果...");
        chrome.storage.local.set({ suspiciousEmails: [] }); // 清空儲存的可疑郵件
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getPhishingUrls") {
        console.log("📡 收到 getPhishingUrls，開始從 Flask API 載入網址");

        fetch("http://localhost:5000/phishing-urls")
            .then(response => response.json())
            .then(data => {
                console.log("✅ 成功取得 phishingUrls", data);
                chrome.storage.local.set({ phishingUrls: data.urls });
            })
            .catch(error => {
                console.error("❌ 無法取得 phishingUrls:", error);
            });
    }
});


  
