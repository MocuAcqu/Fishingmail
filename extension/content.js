// 釣魚郵件關鍵字（比對信件標題）
let phishingKeywords = [
    "您的帳戶已鎖定", "請立即驗證", "請參閱下方公告連結",
    "您的密碼已過期", "請點擊此連結", "緊急通知", "重要安全警告"
];

// 可疑寄件人清單（比對寄件人 email）
let phishingSenders = [
    "suspicious@example.com",
    "no-reply@google.com"
];

const ANOMALY_TYPES = {
    KEYWORD_SUBJECT: {
        code: "KEYWORD_SUBJECT",
        title: "主旨包含可疑關鍵字",
        explanation: "郵件主旨中出現了常見的釣魚或詐騙用語，例如「緊急通知」、「帳戶已鎖定」、「立即驗證」等。",
        tip: "💡 提高警覺！詐騙者常用聳動的標題誘使您立即行動。請先冷靜查證郵件來源及內容真實性。"
    },
    SUSPICIOUS_SENDER: {
        code: "SUSPICIOUS_SENDER",
        title: "寄件人為已知可疑來源",
        explanation: "此寄件人的郵件地址已被標記為潛在的釣魚郵件發送者。",
        tip: "💡 小心！即使寄件人名稱看起來熟悉，也要仔細檢查其完整的郵件地址。詐騙者常模仿合法機構的郵件地址。"
    },
    URL_IN_SUBJECT: {
        code: "URL_IN_SUBJECT",
        title: "主旨包含可疑網址",
        explanation: "郵件主旨中直接包含了一個網址，這可能是誘騙您點擊的釣魚連結。",
        tip: "💡 警惕！正常郵件很少在主旨中直接放入重要連結。在點擊前，請確認網址的真實性。"
    },
    KEYWORD_CONTENT: {
        code: "KEYWORD_CONTENT",
        title: "內容包含可疑關鍵字",
        explanation: "郵件內容中偵測到與釣魚或詐騙相關的詞彙。",
        tip: "💡 仔細閱讀！檢查郵件內文是否有語法錯誤、不合邏輯的要求或過於誘人的獎勵。"
    },
    URL_IN_CONTENT: {
        code: "URL_IN_CONTENT",
        title: "內容包含可疑網址",
        explanation: "郵件內文中發現了已知的釣魚網址或指向可疑網站的連結。",
        tip: "💡 不要輕易點擊！將滑鼠懸停在連結上（不要點擊）以預覽實際網址。如果看起來可疑，絕對不要點擊。"
    },
    SUSPICIOUS_LINK_CONTENT: {
        code: "SUSPICIOUS_LINK_CONTENT",
        title: "內容連結指向可疑網域",
        explanation: "郵件內文中的超連結實際指向的網域與已知的釣魚網域相似或被列為可疑。",
        tip: "💡 檢查連結！確認連結文字與實際指向的網址是否相符。詐騙者常使用看似正常的文字隱藏惡意連結。"
    },
    HAS_ATTACHMENT: {
        code: "HAS_ATTACHMENT",
        title: "郵件包含附件",
        explanation: "郵件中帶有附件。惡意附件是散播病毒或勒索軟體的常見途徑。",
        tip: "💡 謹慎開啟附件！除非您完全信任寄件人且預期會收到此附件，否則請勿開啟。特別是 .exe, .zip, .scr, .js 等類型的檔案。"
    },
    MODEL_DETECTED_URL: {
        code: "MODEL_DETECTED_URL",
        title: "AI模型偵測到可疑URL",
        explanation: "我們的 AI 模型分析認為郵件中的某些 URL 具有釣魚網站的特徵。",
        tip: "💡 AI輔助判斷！雖然AI模型能提供警示，但最終判斷仍需您結合其他資訊。若有疑慮，請勿點擊。"
    },
    // 你可以繼續添加更多異常類型
};

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

    let suspiciousEmailsData = []; // <--- 改名並改變結構

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
        console.log(`🔍 第 ${currentPage} 頁找到 ${emailRows.length} 封郵件，開始檢查...`);
        emailsOnCurrentPage = emailRows.length;

        emailRows.forEach(row => {
            const titleSpan = row.querySelector("span.bog");
            const senderSpan = row.querySelector("span.zF") || row.querySelector("span.yP");

            if (!titleSpan || !senderSpan) return;

            let title = titleSpan.textContent.trim();
            let senderEmail = senderSpan.getAttribute("email") || "未知寄件人";
            let detectedAnomalies = []; // <--- 儲存這封郵件偵測到的異常

            // 判斷是否可疑
            let subjectKeywordsFound = phishingKeywords.filter(keyword => title.includes(keyword));
            if (subjectKeywordsFound.length > 0) {
                detectedAnomalies.push({
                    code: ANOMALY_TYPES.KEYWORD_SUBJECT.code,
                    detail: `關鍵字: ${subjectKeywordsFound.join(', ')}`
                });
            }

            let senderFound = phishingSenders.filter(suspicious => senderEmail.toLowerCase().includes(suspicious.toLowerCase()));
            if (senderFound.length > 0) {
                detectedAnomalies.push({
                    code: ANOMALY_TYPES.SUSPICIOUS_SENDER.code,
                    detail: `寄件人: ${senderFound.join(', ')}`
                });
            }

            let urlsInSubjectFound = phishingUrls.filter(url => title.includes(url));
            if (urlsInSubjectFound.length > 0) {
                detectedAnomalies.push({
                    code: ANOMALY_TYPES.URL_IN_SUBJECT.code,
                    detail: `網址: ${urlsInSubjectFound.join(', ')}`
                });
            }

            if (detectedAnomalies.length > 0) {
                row.style.backgroundColor = "rgba(255, 0, 0, 0.1)"; // 淡紅色背景
                row.style.borderLeft = "3px solid red";
                row.insertAdjacentHTML("beforeend", `<td style="color:red; font-weight:bold; padding-left:5px;">⚠️</td>`);

                suspiciousEmailsData.push({ // <--- 使用新的結構
                    title,
                    sender: senderEmail,
                    anomalies: detectedAnomalies // 儲存異常列表
                });
            }
            checkedEmails++;
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
            displaySuspiciousEmails(suspiciousEmailsData);
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
                    displaySuspiciousEmails(suspiciousEmailsData);
                    moveAndClickNewest();
                }
            }, 1500);
        } else {
            console.log("✅ 沒有更多頁了");
            displaySuspiciousEmails(suspiciousEmailsData);
            moveAndClickNewest();
        }
    }

    // 開始檢查當前頁面
    await checkEmailsOnPage();
    if (hasNextPage() && currentPage < maxPagesToCheck) {
        goToNextPage();
    } else {
        displaySuspiciousEmails(suspiciousEmailsData);
        moveAndClickNewest();
    }
}

function displaySuspiciousEmails(detectedEmails) { // <--- 參數改名
    console.log("🔍 偵測到可疑郵件資料：", detectedEmails);
    // chrome.storage.local.set({ suspiciousEmails: detectedEmails }... // Key 名稱不變，方便 popup.js
    chrome.storage.local.set({ suspiciousEmails: detectedEmails }, async () => {
        console.log("✅ 已儲存 suspiciousEmails (包含異常詳情)");
    });
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

async function scanCurrentEmail() {
    let analysisResult = {
        title: "",
        sender: "",
        preview: "",
        urls: [],
        attachments: [],
        detectedProblems: []
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
        chrome.storage.local.set({ singleEmailResult: { error: "無法取得信件資訊" ,
        // 可以額外加上一個通用錯誤的知識卡提示
        knowledgeTip: "請先點開一封您想要分析的郵件，然後再點擊「單封信分析」按鈕。"} });
        return;
    }

    analysisResult.title = titleElement.textContent.trim();
    analysisResult.sender = senderElement.getAttribute("email") || "未知寄件人";

    // 檢查標題
    const titleKeywordsFound = phishingKeywords.filter(k => analysisResult.title.includes(k));
    if (titleKeywordsFound.length > 0) {
        analysisResult.detectedProblems.push({
            code: ANOMALY_TYPES.KEYWORD_SUBJECT.code,
            detail: `關鍵字: ${titleKeywordsFound.join(', ')}`
        });
    }

    // 檢查寄件人
    const suspiciousSendersFound = phishingSenders.filter(s => analysisResult.sender.toLowerCase().includes(s.toLowerCase()));
    if (suspiciousSendersFound.length > 0) {
        analysisResult.detectedProblems.push({
            code: ANOMALY_TYPES.SUSPICIOUS_SENDER.code,
            detail: `寄件人: ${suspiciousSendersFound.join(', ')}`
        });
    }

    // 檢查標題中的釣魚網址
    const urlsInTitleFound = phishingUrls.filter(url => analysisResult.title.includes(url));
    if (urlsInTitleFound.length > 0) {
        analysisResult.detectedProblems.push({
            code: ANOMALY_TYPES.URL_IN_SUBJECT.code,
            detail: `網址: ${urlsInTitleFound.join(', ')}`
        });
    }
    

    // 檢查內文
    const contentElement = document.querySelector("div.a3s");

    if (contentElement) {
        analysisResult.preview = contentElement.innerText.slice(0, 300);

        const contentKeywordsFound = phishingKeywords.filter(k => analysisResult.preview.includes(k));
        if (contentKeywordsFound.length > 0) {
            analysisResult.detectedProblems.push({
                code: ANOMALY_TYPES.KEYWORD_CONTENT.code,
                detail: `內容關鍵字: ${contentKeywordsFound.join(', ')}`
            });
        }

        const urlsInContentFound = phishingUrls.filter(url => analysisResult.preview.includes(url));
        if (urlsInContentFound.length > 0) {
            analysisResult.detectedProblems.push({
                code: ANOMALY_TYPES.URL_IN_CONTENT.code,
                detail: `內容網址: ${urlsInContentFound.join(', ')}`
            });
        }

        const linkElements = contentElement.querySelectorAll("a[href]");
        let suspiciousLinksFound = [];
        for (let link of linkElements) {
            let href = link.getAttribute("href");
            // ... (處理 Gmail 包裝的網址) ...
            try {
                const url = new URL(href);
                if (url.hostname === "www.google.com" && url.searchParams.has("q")) {
                    href = url.searchParams.get("q");
                }
            } catch (e) { /* continue */ }

            try {
                const domain = new URL(href).hostname;
                if (phishingDomains.some(phishDomain => domain.includes(phishDomain))) {
                    suspiciousLinksFound.push(href);
                }
            } catch (e) { /* continue */ }
        }
        if (suspiciousLinksFound.length > 0) {
            analysisResult.detectedProblems.push({
                code: ANOMALY_TYPES.SUSPICIOUS_LINK_CONTENT.code,
                detail: `可疑連結: ${suspiciousLinksFound.join(', ')}`
            });
        }
        
    }


    // 檢查附件
    const attachments = document.querySelectorAll("div.aQH span.aZo");
    if (attachments.length > 0) {
        analysisResult.attachments = Array.from(attachments).map(el => el.textContent);
        analysisResult.detectedProblems.push({
            code: ANOMALY_TYPES.HAS_ATTACHMENT.code,
            detail: `附件: ${analysisResult.attachments.join(", ")}`
        });
    }


    //Autoencoder檢查
    const urlsForModel = [
        ...extractURLs(analysisResult.title),
        ...extractURLs(analysisResult.preview)
    ];
    if (urlsForModel.length > 0) { // 只有在提取到 URL 時才調用模型
        const modelResults = await checkURLsWithModel(urlsForModel);
        let abnormalUrlsFromModel = [];
        urlsForModel.forEach((url, idx) => {
            if (modelResults[idx]) { // modelResults[idx] is true if suspicious
                abnormalUrlsFromModel.push(url);
            }
        });

        if (abnormalUrlsFromModel.length > 0) {
            analysisResult.detectedProblems.push({
                code: ANOMALY_TYPES.MODEL_DETECTED_URL.code,
                detail: `模型偵測到的可疑URL: ${abnormalUrlsFromModel.join(', ')}`
            });
        }
    }
    
    // 如果沒有偵測到任何問題，可以添加一個「無異常」的標記，或者讓 detectedProblems 為空
    if (analysisResult.detectedProblems.length === 0) {
         analysisResult.noAnomalies = true; // 加一個標記
    }

    chrome.storage.local.set({ singleEmailResult: analysisResult });
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
  