// ==UserScript==
// @name         Haunted Room - Auto Farm 24/7
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Tự động farm stage + nâng cấp. Kéo được, thu gọn được. Fix init cho Android.
// @author       Codex
// @match        https://hauntedroomvnh5.joynetgame.com/*
// @icon         https://hauntedroomvnh5.joynetgame.com/favicon.ico
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const CFG = { DW: 768, DH: 1280, FARM_STAGE: 'highest', MAX_RUNS: 99999, UPGRADE_EVERY: 5 };

    let state = 'init', runs = 0, paused = false, logs = [], ui = null, uiVisible = true, ready = false;

    // ======================== LOG ========================
    function log(...args) {
        const m = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`;
        logs.unshift(m); if (logs.length > 50) logs.length = 50;
        console.log('%c[HauntedBot]', 'color:#0f0;font-weight:bold', ...args);
        if (document.getElementById('h-log')) {
            document.getElementById('h-log').innerHTML = logs.slice(0, 12).map(x => `<div>${x}</div>`).join('');
        }
    }
    const err = (...args) => log('❌', ...args);
    function setStatus(s) { state = s; const el = document.getElementById('h-status'); if (el) el.textContent = stateIcon() + ' ' + state; }
    function stateIcon() { if (paused) return '⏸'; switch(state){case'battle':return'⚔️';case'lobby':return'🏠';case'collect':return'🎁';case'upgrade':return'⬆️';case'stage':return'🗺️';default:return'🔄';} }

    // ======================== UI ========================
    function createUI() {
        if (document.getElementById('haunted-ui')) return;
        ui = document.createElement('div');
        ui.id = 'haunted-ui';
        ui.innerHTML = `
        <style>
        #haunted-ui{position:fixed;z-index:99999;font:11px monospace;color:#0f0;
          background:rgba(0,0,0,0.85);padding:0;border-radius:8px;min-width:180px;
          box-shadow:0 0 10px rgba(0,255,0,0.2);user-select:none;
          top:4px;right:4px;overflow:hidden;max-width:90vw}
        #haunted-ui *{pointer-events:auto;box-sizing:border-box}
        #haunted-ui .bar{background:#1a3a1a;padding:4px 8px;cursor:grab;display:flex;
          align-items:center;justify-content:space-between;border-bottom:1px solid #0f03;font-size:12px}
        #haunted-ui .bar:active{cursor:grabbing}
        #haunted-ui .bar button{background:transparent;color:#0f0;border:1px solid #0f0;
          border-radius:4px;padding:1px 6px;cursor:pointer;font-size:11px;margin-left:3px}
        #haunted-ui .bar button:hover{background:#0f0;color:#000}
        #haunted-ui .body{padding:4px 8px 6px}
        #haunted-ui .info{color:#afa;margin-bottom:2px;font-size:10px}
        #haunted-ui .btns{margin:3px 0;display:flex;gap:3px;flex-wrap:wrap}
        #haunted-ui .btns button{background:#333;color:#0f0;border:1px solid #0f0;
          border-radius:4px;padding:2px 8px;cursor:pointer;font-size:10px}
        #haunted-ui .btns button:hover{background:#0f0;color:#000}
        #haunted-ui .log{color:#888;font-size:9px;max-height:80px;overflow-y:auto;background:rgba(0,0,0,0.3);border-radius:4px;padding:2px 4px;margin-top:2px}
        #haunted-ui .log div{padding:1px 0;word-break:break-all}
        #haunted-ui.minimized .body{display:none}
        #haunted-ui.minimized{border-radius:8px;min-width:auto}
        </style>
        <div class="bar" id="h-bar">
          <span id="h-status" style="font-weight:bold">🔄 init</span>
          <span style="font-size:10px;color:#888" id="h-runs">#0</span>
          <span><button id="h-toggle">➖</button><button id="h-dump">🔍</button></span>
        </div>
        <div class="body">
          <div class="info" id="h-info">Khởi tạo...</div>
          <div class="btns">
            <button id="h-pause">⏸ Pause</button>
            <button id="h-clear">🗑</button>
          </div>
          <div class="log" id="h-log"></div>
        </div>`;
        document.body.appendChild(ui);

        // Drag
        let drag = false, dx, dy;
        const bar = document.getElementById('h-bar');
        bar.onmousedown = e => { drag = true; dx = e.clientX - ui.offsetLeft; dy = e.clientY - ui.offsetTop; };
        document.onmousemove = e => { if (drag) { ui.style.left = (e.clientX - dx) + 'px'; ui.style.top = (e.clientY - dy) + 'px'; ui.style.right = 'auto'; } };
        document.onmouseup = () => { drag = false; };

        document.getElementById('h-toggle').onclick = () => { uiVisible = !uiVisible; ui.classList.toggle('minimized', !uiVisible); document.getElementById('h-toggle').textContent = uiVisible ? '➖' : '➕'; };
        document.getElementById('h-pause').onclick = () => { paused = !paused; document.getElementById('h-pause').textContent = paused ? '▶ Resume' : '⏸ Pause'; log(paused ? 'Paused' : 'Resumed'); };
        document.getElementById('h-dump').onclick = dumpScene;
        document.getElementById('h-clear').onclick = () => { logs.length = 0; document.getElementById('h-log').innerHTML = ''; };

        log('✅ UI loaded');
        document.getElementById('h-info').textContent = '⏳ Đang chờ game...';
    }

    // ======================== COCOS ========================
    function findN(name, root) {
        root = root || (cc && cc.director && cc.director.getScene());
        if (!root) return null;
        if (root.name === name) return root;
        if (root.children) for (const c of root.children) { const f = findN(name, c); if (f) return f; }
        return null;
    }

    function clickNode(node) {
        if (!node) return false;
        try {
            const wp = node.convertToWorldSpaceAR(cc.v2(0, 0));
            const touch = new cc.Touch(wp.x, wp.y); touch.setTouchInfo(1, wp.x, wp.y);
            const ev = new cc.Event.EventTouch([touch], false); ev.touch = touch;
            node.dispatchEvent(ev); return true;
        } catch(e) { return false; }
    }

    function clickName(name) { const n = findN(name); return n && n.active !== false ? clickNode(n) : false; }
    const delay = ms => new Promise(r => setTimeout(r, ms));

    function dumpScene() {
        if (typeof cc === 'undefined') return err('CC not ready');
        const scene = cc.director.getScene();
        if (!scene) return err('No scene');
        const items = [];
        (function walk(n, d) {
            if (!n || d > 5) return;
            const lbl = n.getComponent && n.getComponent('cc.Label');
            const txt = lbl && lbl.string || '';
            if (txt || d <= 1) {
                const wp = n.convertToWorldSpaceAR && n.convertToWorldSpaceAR(cc.v2(0, 0));
                items.push({n: n.name, d, t: txt.slice(0, 40), wx: wp && Math.round(wp.x), wy: wp && Math.round(wp.y), a: n.active});
            }
            if (n.children) n.children.forEach(c => walk(c, d + 1));
        })(scene, 0);
        console.clear();
        console.log('=== HAUNTED SCENE DUMP ===');
        console.log(JSON.stringify(items, null, 2));
        log(`Dump ${items.length} nodes. Check Console (F12)`);
    }

    // ======================== GAME FLOW ========================
    async function waitForCC() {
        const info = document.getElementById('h-info');
        // Wait for canvas
        for (let i = 0; i < 60; i++) {
            if (document.querySelector('#GameCanvas')) break;
            if (info) info.textContent = `⏳ Chờ canvas... ${i}s`;
            await delay(1000);
        }
        // Wait for cc
        for (let i = 0; i < 60; i++) {
            if (typeof cc !== 'undefined' && cc.director && cc.director.getScene()) {
                log(`CC engine ready (${i+1}s)`);
                return true;
            }
            if (info) info.textContent = `⏳ Chờ game engine... ${i}s`;
            await delay(1000);
        }
        err('Game engine không load');
        if (info) info.textContent = '❌ Game không load, refresh đi';
        return false;
    }

    async function waitLoginDone() {
        const info = document.getElementById('h-info');
        setStatus('wait_login');
        if (info) info.textContent = '⏳ Đăng nhập thủ công (Khách → Vào game → kéo CAPTCHA)';

        // Check if already logged in
        if (!findN('loginView') || !findN('loginView').active) {
            log('✅ Đã đăng nhập rồi!');
            return true;
        }

        // Try to click age gate + start if they're accessible
        // Note: if SDK iframe is covering canvas, these won't work
        if (clickName('btn_age')) log('Clicked age gate');
        if (clickName('gp_start')) log('Clicked start');

        for (let i = 0; i < 120; i++) {
            await delay(1000);
            if (!findN('loginView') || !findN('loginView').active) {
                log('✅ Login detected!');
                if (info) info.textContent = '✅ Đã login!';
                await delay(2000);
                return true;
            }
            if (i % 15 === 0) log(`Waiting login... (${i}s)`);
            if (i === 5 && info) info.textContent = '📌 Đăng nhập thủ công: chọn Khách → Vào game';
            if (i === 30 && info) info.textContent = '📌 Vẫn chờ login... Nếu bị CAPTCHA thì kéo slider';
            if (i === 60 && info) info.textContent = '📌 Lâu quá? Refresh trang và thử lại';
        }
        err('Login timeout');
        if (info) info.textContent = '⛔ Timeout. Refresh trang nhé';
        return false;
    }

    async function waitLobby() {
        const info = document.getElementById('h-info');
        setStatus('loading');
        if (info) info.textContent = '⏳ Vào sảnh chính...';

        for (let i = 0; i < 60; i++) {
            await delay(1000);
            const main = cc.find && cc.find('Canvas/ViewRoot/Main');
            if (main && main.active) {
                // Main view exists with content
                if (main.children && main.children.length > 0) {
                    log('✅ Lobby ready!');
                    if (info) info.textContent = '✅ Trong sảnh, bắt đầu farm!';
                    return true;
                }
            }
            // Also check if there's any other view with content
            const vr = cc.find && cc.find('Canvas/ViewRoot');
            if (vr && vr.children) {
                for (const v of vr.children) {
                    if (v.active && v.children && v.children.length > 0 &&
                        !['GM','HangupView','FullScreen','SideCover'].includes(v.name)) {
                        log(`View active: ${v.name}`);
                        if (info) info.textContent = `✅ Trong game (${v.name})`;
                        return true;
                    }
                }
            }
            if (i === 10) log('Chờ sảnh...');
        }
        log('⚠️ Không thấy sảnh rõ ràng, thử click...');
        return true; // Try anyway
    }

    async function navigateStage(num) {
        log(`Stage ${num}...`); setStatus('stage');
        document.getElementById('h-info').textContent = `🗺️ Stage ${num}...`;
        for (const btn of ['btn_stage','btn_battle','btn_fight','btn_mission']) { if (clickName(btn)) { await delay(3000); break; } }
        for (const btn of [`btn_${num}`,`level_${num}`,`stage_${num}`,`lv${num}`]) { if (clickName(btn)) { await delay(2000); return true; } }
        // Fallback clicks
        for (const [x, y] of [[384, 640], [384, 400], [384, 200], [384, 500]]) { await delay(1500); clickC(x, y); }
        return false;
    }

    function clickC(wx, wy) {
        const c = document.querySelector('#GameCanvas'); if (!c) return;
        const sx = wx * (c.clientWidth / CFG.DW), sy = c.clientHeight - wy * (c.clientHeight / CFG.DH);
        c.dispatchEvent(new MouseEvent('click', {clientX: sx, clientY: sy, bubbles: true, cancelable: true}));
    }

    async function startBattle() {
        document.getElementById('h-info').textContent = '⚔️ Bắt đầu chiến đấu...';
        for (const btn of ['btn_start','btn_begin','btn_battle','btn_go','btn_fight']) { if (clickName(btn)) { await delay(5000); return true; } }
        for (const y of [180, 150, 120, 200, 250]) { clickC(384, y); await delay(2000); }
        return false;
    }

    async function autoBattle() {
        log('⚔️ Chiến đấu!'); setStatus('battle');
        document.getElementById('h-info').textContent = '⚔️ Đang đánh...';
        await delay(5000);

        // Click auto/speed buttons
        const battle = cc.find && cc.find('Canvas/ViewRoot/Battle');
        if (battle && battle.children) {
            (function walk(n) {
                if (!n || !n.active) return;
                const lbl = n.getComponent && n.getComponent('cc.Label');
                const txt = (lbl && lbl.string || '').toLowerCase();
                if (txt.includes('auto') || n.name.toLowerCase().includes('auto') || txt.includes('speed') || txt.includes('x2')) {
                    clickNode(n);
                }
                if (n.children) n.children.forEach(walk);
            })(battle);
        }

        const start = Date.now();
        while (Date.now() - start < 300000) {
            await delay(3000);
            const r = checkResult();
            if (r) { log(`Result: ${r}`); return r; }
            const s = Math.floor((Date.now() - start) / 1000);
            if (s % 30 === 0) { setStatus(`battle ${s}s`); document.getElementById('h-info').textContent = `⚔️ Đánh ${s}s`; }
        }
        return 'timeout';
    }

    function checkResult() {
        if (typeof cc === 'undefined') return null;
        for (const n of ['ResultView','VictoryView','DefeatView','RewardView','BattleResult']) { const node = findN(n); if (node && node.active) return n; }
        const pt = cc.find && cc.find('Canvas/ViewRoot/PopTip');
        if (pt && pt.active && pt.children && pt.children.some(c => c.active)) return 'popup';
        const b = cc.find && cc.find('Canvas/ViewRoot/Battle');
        if (b && b.active) {
            const ac = (b.children || []).filter(c => c.active && !['TouchEffectView','BackGroundView'].includes(c.name));
            if (ac.length === 0) return 'battle_end';
        }
        return null;
    }

    async function collectRewards() {
        log('Nhận thưởng...'); setStatus('collect');
        document.getElementById('h-info').textContent = '🎁 Nhận thưởng...';
        const btns = ['btn_claim','btn_get','btn_receive','btn_confirm','btn_ok','btn_continue','btn_next','btn_exit','btn_back','btn_close','btn_skip','btn_collect','btn_reward'];
        for (let i = 0; i < 25; i++) {
            await delay(2000); let done = true;
            for (const b of btns) { if (clickName(b)) { done = false; await delay(800); break; } }
            if (done) {
                const pt = cc.find && cc.find('Canvas/ViewRoot/PopTip');
                if (pt && pt.active && pt.children) { for (const c of pt.children) { if (c.active && c.children) for (const btn of c.children) if (btn.active && clickNode(btn)) { done = false; await delay(800); break; } if (!done) break; } }
            }
            if (done) break;
        }
        await delay(3000);
    }

    async function autoUpgrade() {
        log('Nâng cấp...'); setStatus('upgrade');
        document.getElementById('h-info').textContent = '⬆️ Nâng cấp...';
        for (const btn of ['btn_upgrade','btn_enhance','btn_levelup','btn_evolve','btn_skill']) {
            if (clickName(btn)) {
                await delay(3000);
                for (let i = 0; i < 15; i++) { if (!clickName('btn_confirm') && !clickName('btn_upgrade') && !clickName('btn_ok')) break; await delay(800); }
                for (const b of ['btn_back','btn_close','btn_exit']) { if (clickName(b)) { await delay(2000); break; } }
                break;
            }
        }
    }

    async function farmLoop() {
        log('='.repeat(20) + ' BẮT ĐẦU FARM ' + '='.repeat(20));
        document.getElementById('h-info').textContent = '🏁 Bắt đầu auto farm!';

        while (runs < CFG.MAX_RUNS) {
            if (paused) { await delay(2000); continue; }
            runs++;
            document.getElementById('h-runs').textContent = `#${runs}`;
            log(`\n=== RUN #${runs} ===`);

            await navigateStage(CFG.FARM_STAGE === 'highest' ? runs : CFG.FARM_STAGE);
            await startBattle();
            const result = await autoBattle();
            if (result !== 'timeout') await collectRewards();
            if (runs % CFG.UPGRADE_EVERY === 0) await autoUpgrade();
            await delay(3000);
        }
        log('🏁 DONE');
        document.getElementById('h-info').textContent = '✅ Hoàn tất!';
    }

    // ======================== INIT ========================
    async function init() {
        console.log('%c🏚️ Haunted Room Auto-Farm v1.2.0', 'font-size:18px;color:#0f0;font-weight:bold');
        console.log('Made by Codex');
        if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));

        // Wait for body
        for (let i = 0; i < 30; i++) { if (document.body) break; await delay(200); }

        createUI();
        const info = document.getElementById('h-info');

        // Step 1: Wait for CC engine
        const ccReady = await waitForCC();
        if (!ccReady) return;

        // Step 2: Wait login
        info.textContent = '⏳ Đợi đăng nhập...';
        const logged = await waitLoginDone();
        if (!logged) return;

        // Step 3: Dump scene to help debug
        await delay(3000);
        log('Dump scene sau login:');
        dumpScene();

        // Step 4: Lobby
        const lobby = await waitLobby();
        if (!lobby) {
            // Try clicking random spots to get unstuck
            log('Thử click để vào sảnh...');
            for (let i = 0; i < 5; i++) { clickC(384, 640); await delay(2000); }
        }

        // Step 5: Farm
        await delay(3000);
        await farmLoop();
    }

    // Start on load
    if (document.readyState === 'complete') { init(); }
    else { window.addEventListener('load', init); }
})();
          
