document.addEventListener('DOMContentLoaded', () => {
    const el = {
        passiveBadge: document.getElementById('passive-badge'),
        passiveList: document.getElementById('passive-list'),
        btnFinger: document.getElementById('btnFingerprint'),
        fingerResult: document.getElementById('fingerprint-result'),
        activeList: document.getElementById('active-list'),
        btnExploit: document.getElementById('btnExploit'),
        cmdInput: document.getElementById('cmdInput'),
        exploitStatus: document.getElementById('exploit-status'),
        exploitResult: document.getElementById('exploit-result'),
        rceOutput: document.getElementById('rce-output')
    };

    // helper: badge styling for passive state
    const setPassiveBadge = (state, label) => {
        const toneMap = {
            scanning: 'tone-warn',
            detected: 'tone-alert',
            safe: 'tone-ok',
            error: 'tone-err'
        };
        // Use new class .status-badge instead of .pixel-badge
        el.passiveBadge.className = `status-badge ${toneMap[state] || 'tone-warn'}`;
        el.passiveBadge.innerText = label;
    };

    // helper: button loading animation
    const setButtonLoading = (btn, isLoading, idleLabel, loadingLabel) => {
        btn.disabled = isLoading;
        btn.classList.toggle('is-loading', isLoading);
        btn.innerText = isLoading ? loadingLabel : idleLabel;
    };

    // helper: wrap chrome.tabs.sendMessage with timeout & error guard
    const sendMessageSafe = (tabId, payload, timeout = 10000) => {
        return new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                resolve({ __timeout: true });
            }, timeout);

            chrome.tabs.sendMessage(tabId, payload, (res) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);

                if (chrome.runtime.lastError) {
                    resolve({ __error: chrome.runtime.lastError.message });
                } else {
                    resolve(res);
                }
            });
        });
    };

    // 1. 获取当前 Tab
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const tabId = tabs[0].id;
        
        // --- 初始化：被动扫描 ---
        sendMessageSafe(tabId, {action: "get_passive"}).then((res) => {
            if(res && res.__error) {
                setPassiveBadge('error', 'NO SCRIPT');
                el.passiveList.innerHTML = `<li>${res.__error}</li>`;
                return;
            }
            if(!res) {
                setPassiveBadge('error', 'TIMEOUT');
                el.passiveList.innerHTML = "<li>Please refresh page</li>";
                return;
            }
            if(res.isRSC) {
                setPassiveBadge('detected', 'DETECTED');
            } else {
                setPassiveBadge('safe', 'SAFE');
            }
            
            el.passiveList.innerHTML = "";
            if(res.details.length === 0) el.passiveList.innerHTML = "<li>No patterns found</li>";
            res.details.forEach(d => {
                const li = document.createElement('li');
                li.innerText = d;
                li.style.color = "#c0392b";
                el.passiveList.appendChild(li);
            });
        });

        // --- 交互：主动指纹 ---
        el.btnFinger.addEventListener('click', () => {
            setButtonLoading(el.btnFinger, true, "Start Probe", "Scanning...");
            el.fingerResult.style.display = 'none';

            sendMessageSafe(tabId, {action: "run_fingerprint"}).then((res) => {
                setButtonLoading(el.btnFinger, false, "Start Probe", "Scanning...");
                el.fingerResult.style.display = 'block';
                el.activeList.innerHTML = "";

                if(res && res.__timeout) {
                    el.activeList.innerHTML = "<li style='color:#ff5f6d'>Timeout waiting for content script</li>";
                    return;
                }
                if(res && res.__error) {
                    el.activeList.innerHTML = `<li style='color:#ff5f6d'>${res.__error}</li>`;
                    return;
                }

                if(res && res.detected) {
                    res.details.forEach(d => {
                        const li = document.createElement('li');
                        li.innerText = d;
                        li.style.color = "#ff2fb3";
                        li.style.fontWeight = "bold";
                        el.activeList.appendChild(li);
                    });
                } else {
                    el.activeList.innerHTML = "<li style='color:#00f5d4'>No Active RSC Response</li>";
                }
            });
        });

        // --- 交互：RCE 利用 ---
        el.btnExploit.addEventListener('click', () => {
            const cmd = el.cmdInput.value || "whoami";
            setButtonLoading(el.btnExploit, true, "EXEC", "EXEC...");
            el.exploitStatus.style.display = 'block';
            el.exploitResult.style.display = 'none';
            el.rceOutput.className = 'console-out'; // 重置样式

            sendMessageSafe(tabId, {action: "run_exploit", cmd: cmd}).then((res) => {
                setButtonLoading(el.btnExploit, false, "EXEC", "EXEC...");
                el.exploitStatus.style.display = 'none';
                el.exploitResult.style.display = 'block';

                if(res && res.__timeout) {
                    el.rceOutput.style.color = "#ff5f6d";
                    el.rceOutput.innerText = "[-] No response from content script (timeout).";
                    return;
                }
                if(res && res.__error) {
                    el.rceOutput.style.color = "#ff5f6d";
                    el.rceOutput.innerText = `[-] Failed to reach page script: ${res.__error}`;
                    return;
                }

                if(res && res.success) {
                    el.rceOutput.style.color = "#5efcbf"; // neon success
                    let out = `[+] Command: ${cmd}\n[+] Output:\n${res.output}`;
                    if(res.waf) out += `\n\n[!] Warning: WAF Detected (${res.waf}) - Payload might be filtered, but response came through.`;
                    el.rceOutput.innerText = out;
                    // 成功后强制图标报警
                    chrome.runtime.sendMessage({ action: "update_badge" });
                } else {
                    el.rceOutput.style.color = "#ff5f6d"; // alert red
                    // Enhanced debug output
                    let debugInfo = `[-] ${res ? res.msg : "Unknown Error"}`;
                    
                    if(res && res.waf) {
                        debugInfo = `[!] BLOCKED BY WAF: ${res.waf}\n` + debugInfo;
                    }

                    if(res && res.httpStatus) {
                        debugInfo += `\n\n[DEBUG] HTTP Status: ${res.httpStatus} ${res.httpStatusText}`;
                    }
                    if(res && res.fullResponse) {
                        debugInfo += `\n\n[DEBUG] Server Response:\n${res.fullResponse}`;
                    }
                    el.rceOutput.innerText = debugInfo;
                }
            });
        });
    });
});