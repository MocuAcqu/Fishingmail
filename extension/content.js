// 釣魚郵件關鍵字（比對信件標題）
let phishingKeywords = [
    "您的帳戶已鎖定", "請立即驗證", "請參閱下方公告連結",
    "您的密碼已過期", "請點擊此連結", "緊急通知", "重要安全警告"
];

// 可疑寄件人清單（比對寄件人 email）
let phishingSenders = [
    "jobbank@104.com.tw",
    "suspicious@example.com"
];

let phishingUrls = [];
let urlsLoaded = false;

let maxPagesToCheck = 2; // 預設掃描頁數為 2 頁
let currentPage = 1;     // 初始為第 1 頁


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.action === "getPhishingUrls") {
        fetch('http://127.0.0.1:5000/phishing-urls')
        .then(response => response.json())
        .then(data => {
            //console.log("🚀 原始 API 回傳資料：", data);  // ✅ 新增這行
            phishingUrls = data;            
            urlsLoaded = true; // ✅ 加上這一行才不會卡住 wait
        })
        .catch(error => console.error('無法載入釣魚網址資料：', error));
    }

    if (message.action === "scanCurrentEmail") {
        // 當用戶按下「開始分析」按鈕時：
        chrome.storage.local.remove("singleEmailResult", () => {
            // 然後才開始分析
            scanCurrentEmail();
            return;
        });

        //canCurrentEmail();
        //return;
    }    
    
    if (message.action === "scanEmails") {
        maxPagesToCheck = message.limit || 2;
        currentPage = 1; 
        console.log("🔧 偵測頁數設定為:", maxPagesToCheck); 
        
        // 等待 phishingUrls 載入
        let waitForUrls = async () => {
            let retries = 0;
            while (!urlsLoaded && retries < 10) {
                console.log("⏳ 等待釣魚網址載入...");
                await new Promise(res => setTimeout(res, 500));
                retries++;
            }
            if (!urlsLoaded) {
                console.warn("⚠️ 釣魚網址尚未載入，無法啟動分析");
                return;
            }
            
            detectPhishingEmails();
        };
        waitForUrls();
        return;
    }

    else if (message.action === "getMaxPages") {
        try {
            let amountElements = document.querySelectorAll("span.Dj span.ts");
            if (!amountElements.length) {
                sendResponse({ success: false, message: "無法取得信件總數" });
                return;
            }
            let totalText = amountElements[amountElements.length - 1].textContent.trim();
            let totalEmails = parseInt(totalText.replace(/,/g, ""), 10);
            if (isNaN(totalEmails)) {
                sendResponse({ success: false, message: "信件數無效" });
                return;
            }
            let maxPages = Math.ceil(totalEmails / 50);
            sendResponse({ success: true, maxPages });
        } catch (error) {
            sendResponse({ success: false, message: "發生錯誤：" + error.message });
        }
        return true; // ✅ 非同步回傳
    } else {
        // 🧯 若都沒符合，回傳一個基本的錯誤，避免通道被開啟卻沒回應
        sendResponse({ success: false, message: "未知的 action" });
        return false; // ❌ 不需再非同步了
    }
});


let checkedEmails = 0; // 已檢查信件數

// 偵測釣魚郵件函式
async function detectPhishingEmails() {
    console.log("⚙️ 偵測啟動，將偵測最多", maxPagesToCheck, "頁");

    let suspiciousEmails = [];

    // 📌 檢查信件總數
    let amountElements = document.querySelectorAll("span.Dj span.ts");
    if (!amountElements.length) {
        console.log("⚠️ 無法獲取信件總數，請檢查選擇器！");
        return;
    }
    let totalText = amountElements[amountElements.length - 1].textContent.trim();
    let totalEmails = parseInt(totalText.replace(/,/g, ""), 10);
    if (isNaN(totalEmails)) {
        console.log("⚠️ 獲取信件總數失敗，請確認 Gmail 介面是否變更！");
        return;
    }
    
    let emailsOnCurrentPage = 0; // 追蹤當前頁面檢查的信件數量

    // 針對當前頁面，檢查所有郵件（包含主旨與寄件人）
    async function checkEmailsOnPage() {

        const emailRows = document.querySelectorAll("tr.zA");
        //console.log(`🔍 當前頁面找到 ${emailRows.length} 封郵件，開始檢查...`);
        console.log(`🔍 第 ${currentPage} 頁找到 ${emailRows.length} 封郵件，開始檢查...`);
        emailsOnCurrentPage = emailRows.length;
        emailRows.forEach(row => {
            const titleSpan = row.querySelector("span.bog");
            const senderSpan = row.querySelector("span.zF") || row.querySelector("span.yP");
    
            if (!titleSpan || !senderSpan) return;
    
            let title = titleSpan.textContent.trim();
            let senderEmail = senderSpan.getAttribute("email") || "未知寄件人";
    
            console.log("📩 信件標題:", title, "| 寄件人:", senderEmail);
            // 假設 response 是你從 API 拿到的 phishing URL CSV 陣列（已經轉為陣列）
            

            // 判斷是否可疑
            let subjectSuspicious = phishingKeywords.some(keyword => title.includes(keyword));
            let senderSuspicious = phishingSenders.some(suspicious => senderEmail.toLowerCase().includes(suspicious.toLowerCase()));
            let urlSuspicious = phishingUrls.some(url => title.includes(url));
            //phishingDomains = phishingDomains.map(url => url.replace(/^https?:\/\//, ""));
            console.log("🔎 ", phishingUrls);
            console.log("🔎 是否有釣魚網址？", urlSuspicious);
            

            if (subjectSuspicious || senderSuspicious || urlSuspicious) {
                // 註記整行信件樣式
                row.style.color = "red";
                row.style.fontWeight = "bold";
                row.insertAdjacentHTML("beforeend", " ⚠️");
    
                // 儲存為物件（防止重複主旨漏記）
                suspiciousEmails.push({
                    title,
                    sender: senderEmail
                });
            }
            checkedEmails++; // 增加已檢查的信件數
        });
    }

    // 判斷是否存在「下一頁」按鈕
    function hasNextPage() {
        const nextPageButton = document.querySelector("div[aria-label='較舊']");
        return nextPageButton && !nextPageButton.hasAttribute("disabled");
    }

    // 點擊「下一頁」並偵測所有頁面
    async function goToNextPage() {
        if (currentPage >= maxPagesToCheck) {
            console.log(`✅ 已達到 ${maxPagesToCheck} 頁上限，停止偵測`);
            displaySuspiciousEmails(suspiciousEmails);
            moveAndClickNewest();
            return;
        }

        let nextPageButton = document.querySelector("div[aria-label='較舊']");
        if (nextPageButton && !nextPageButton.hasAttribute("aria-disabled")) {
            console.log("➡️ 點擊「下一頁」按鈕...");
            nextPageButton.dispatchEvent(new MouseEvent("mousedown"));
            nextPageButton.dispatchEvent(new MouseEvent("mouseup"));
            nextPageButton.click();

            // 等待頁面載入後，再檢查
            setTimeout(() => {
                currentPage++;
                checkEmailsOnPage();
                if (hasNextPage() && currentPage < maxPagesToCheck) {
                    goToNextPage();
                } else {
                    displaySuspiciousEmails(suspiciousEmails);
                    moveAndClickNewest();
                }
            }, 1500);
        } else {
            console.log("✅ 沒有更多頁了");
            displaySuspiciousEmails(suspiciousEmails);
            moveAndClickNewest();
        }
    }

    // 開始檢查當前頁面
    await checkEmailsOnPage();
    if (hasNextPage() && currentPage < maxPagesToCheck) {
        goToNextPage();
    } else {
        displaySuspiciousEmails(suspiciousEmails);
        moveAndClickNewest();
    }
}

function simulateMouseEvent(target, type) {
    const event = new MouseEvent(type, {
      view: window,
      bubbles: true,
      cancelable: true
    });
    target.dispatchEvent(event);
  }
  
  async function moveAndClickNewest() {

    const moreBtn = document.querySelector("div[aria-label='顯示更多郵件']");
    if (!moreBtn) return console.error("❌ 無法找到『顯示更多郵件』按鈕");
  
    console.log("🖱 正在展開選單...");
    simulateMouseEvent(moreBtn, "mouseover");
    simulateMouseEvent(moreBtn, "mousedown");
    simulateMouseEvent(moreBtn, "mouseup");
    moreBtn.click(); // 最後呼叫 click()
  
    // 等待下拉選單展開
    await new Promise(resolve => setTimeout(resolve, 300)); // 可視情況調整等待時間
  
    // 嘗試找到「最新」選項
    const newestBtn = Array.from(document.querySelectorAll("div[role='menuitem'] div"))
      .find(el => el.textContent.trim() === "最新");
  
    if (!newestBtn) return console.error("❌ 無法找到『最新』選項，可能尚未正確展開選單");
  
    console.log("🖱 正在點擊『最新』...");
    simulateMouseEvent(newestBtn, "mouseover");
    simulateMouseEvent(newestBtn, "mousedown");
    simulateMouseEvent(newestBtn, "mouseup");
    newestBtn.click();
  }
  

function displaySuspiciousEmails(suspiciousEmails) {
    console.log("🔍 偵測到可疑郵件：", suspiciousEmails);
    chrome.storage.local.set({ suspiciousEmails }, async () => {
        console.log("✅ 已儲存 suspiciousEmails");
        
    }); 
}

/*async function scanEmailContent(row, title, senderEmail) {
    row.click(); // 點進信件
    console.log("📬 已點開信件:", title);

    await new Promise(resolve => setTimeout(resolve, 1500)); // 等信件載入

    let contentElement = document.querySelector("div.a3s"); // Gmail 內文容器
    if (!contentElement) {
        console.warn("❗ 無法找到內文");
        return;
    }

    let contentText = contentElement.innerText || "";
    let contentSuspicious = phishingKeywords.some(keyword => contentText.includes(keyword));

    if (contentSuspicious) {
        console.log("⚠️ 內文含釣魚字詞:", contentText.slice(0, 80));
        suspiciousEmails.push({
            title,
            sender: senderEmail,
            preview: contentText.slice(0, 100)
        });
    }

     // 點返回箭頭
    let backButton = document.querySelector("div[title='返回收件匣']");
    if (backButton) {
        backButton.dispatchEvent(new MouseEvent("mousedown"));
        backButton.dispatchEvent(new MouseEvent("mouseup"));
        backButton.click();
        console.log("↩️ 返回信件列表");
    }

    await new Promise(resolve => setTimeout(resolve, 1000)); // 等返回完成
}*/

async function scanCurrentEmail() {
    let suspicious = {
        title: "",
        sender: "",
        preview: "",
        urls: [],
        attachments: [],
        problems: []
    };

    const phishingDomains = phishingUrls.map(url => {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return null;
        }
    }).filter(Boolean);
    
    // 取得標題、寄件人
    const titleElement = document.querySelector("h2.hP");
    const senderElement = document.querySelector("span.gD");

    if (!titleElement || !senderElement) {
        console.warn("❗ 無法取得標題或寄件人，請確認是否點入單封信建中");
        chrome.storage.local.set({ singleEmailResult: { error: "無法取得信件資訊" } });
        return;
    }

    suspicious.title = titleElement.textContent.trim();
    suspicious.sender = senderElement.getAttribute("email") || "未知寄件人";

    // 檢查標題與寄件人、釣魚網址
    if (phishingKeywords.some(k => suspicious.title.includes(k))) {
        suspicious.problems.push("標題含可疑關鍵字");
    }
    if (phishingSenders.some(s => suspicious.sender.toLowerCase().includes(s.toLowerCase()))) {
        suspicious.problems.push("寄件人為可疑來源");
    }

    
    if (phishingUrls.some(url => suspicious.title.includes(url))) {
        suspicious.problems.push("標題含釣魚網址");
    }
    

    // 檢查內文
    const contentElement = document.querySelector("div.a3s");

    if (contentElement) {
    suspicious.preview = contentElement.innerText.slice(0, 300);

        // 可疑關鍵字檢查
        if (phishingKeywords.some(k => suspicious.preview.includes(k))) {
            suspicious.problems.push("信件內容含可疑字詞");
        }

        if (phishingUrls.some(url => suspicious.preview.includes(url))) {
            suspicious.problems.push("信件內容含釣魚網址");
        }

        // ✅ 這裡才可以使用 contentElement
        const linkElements = contentElement.querySelectorAll("a[href]");
        for (let link of linkElements) {
            let href = link.getAttribute("href");
        
            try {
                // 處理 Gmail 包裝的網址（像是 https://www.google.com/url?q=https://phishy-site.com&...）
                const url = new URL(href);
                if (url.hostname === "www.google.com" && url.searchParams.has("q")) {
                    href = url.searchParams.get("q"); // 抽出原始網址
                }
            } catch (e) {
                continue;
            }
        
            try {
                const domain = new URL(href).hostname;
                if (phishingDomains.some(phishDomain => domain.includes(phishDomain))) {
                    suspicious.problems.push("內文含連結：" + href);
                    break;
                }
            } catch (e) {
                // 非法 URL 不處理
                continue;
            }
        }
        
    }


    // 檢查附件
    const attachments = document.querySelectorAll("div.aQH span.aZo");
    if (attachments.length > 0) {
        suspicious.attachments = Array.from(attachments).map(el => el.textContent);
        suspicious.problems.push("信件含有附件，請小心檢查");
    }


    //Autoencoder檢查
    const urls = [
        ...extractURLs(suspicious.title),
        ...extractURLs(suspicious.preview)
      ];
      const modelResults = await checkURLsWithModel(urls);
      
      let abnormalUrls = [];
      urls.forEach((url, idx) => {
        if (modelResults[idx]) {
          abnormalUrls.push(url);
        }
      });
      
      if (abnormalUrls.length > 0) {
        abnormalUrls.forEach(url => {
            suspicious.problems.push(`檢測到可疑 URL（來自模型預測）：${url}`);
        });
        isPhishing = true;
      }
      
    chrome.storage.local.set({ singleEmailResult: suspicious });
}

function extractURLs(text) {
    const urlRegex = /https?:\/\/[^\s]+/g;
    return text.match(urlRegex) || [];
  }
  
  async function checkURLsWithModel(urls) {
    try {
      const response = await fetch("http://127.0.0.1:5000/predict_url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ urls })
      });
  
      if (!response.ok) {
        throw new Error("模型 API 回傳錯誤");
      }
  
      const result = await response.json();
      return result.results;
    } catch (error) {
      console.error("模型檢測失敗：", error);
      return urls.map(() => false); // 回傳全部 false 代表未偵測到異常
    }
  }
  