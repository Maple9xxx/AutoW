// ==UserScript==
// @name         GauBong Loto Auto-Play - Martingale 🎰
// @namespace    http://tampermonkey.net/
// @version      3.1.0
// @description  Auto Lô Tô Gaubong.us - Quét tình huống định kỳ, gấp thếp thông minh
// @author       AutoPlay
// @match        https://gaubong.us/*
// @icon         https://gaubong.us/favicon.ico
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_log
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // CẤU HÌNH
    // ============================================================
    const CFG = {
        GAME_TYPE: 1,
        BASE_BET: 30_000_000,
        MULTIPLIER: 1.2,          // Tự động: X = P/(P-1), dùng min(CFG, optimal)
        MAX_BET: 500_000_000,
        MIN_BET: 1_000_000,
        MAX_BOTS: 5,
        SCAN_MS: 2000,            // Quét mỗi 2 giây
        AUTO_RESTART: true,
        NOTIFY: true,
        MAX_BALANCE_USAGE: 0.75,
    };

    // ============================================================
    // STATE
    // ============================================================
    const S = {
        running: false,
        roomId: null,
        status: -1,         // 0=idle, 1=playing, 2=ended
        bal: 0,
        initBal: 0,
        bots: 0,
        players: 0,
        round: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        profit: 0,
        action: '⏸ Đã dừng',
        lastAction: '',
        startTime: null,
        errorMsg: '',
        initDone: false,
        lock: false,        // Lock để tránh 2 scanner chạy overlap
        scannerId: null,
        lastBet: 0,
        hadTicket: false,
        processedRound: 0,  // 0=chưa xử lý, 1=đã start, 2=đã xử lý kết quả
    };

    // ============================================================
    // UTILITIES
    // ============================================================
    function log(...a) {
        const t = new Date().toLocaleTimeString('vi-VN');
        console.log(`[Loto ${t}]`, ...a);
        GM_log(`[Loto ${t}]`, ...a);
    }

    function ntf(title, msg) {
        if (CFG.NOTIFY) {
            try { GM_notification({ title, text: msg, timeout: 6000 }); } catch(e) {}
        }
        log(`🔔 ${title}: ${msg}`);
    }

    function fmt(n) { return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function csrf() {
        const m = document.cookie.match(/(?:^|;\s*)csrf_cookie_name=([^;]*)/);
        return m ? m[1] : '';
    }

    function $(id) { return document.getElementById(id); }

    // ============================================================
    // DOM READER - DOc tinh huong tu giao dien (quan trong!)
    // ============================================================
    function readGameDOM() {
        const state = {
            hasStartBtn: false,
            hasStopBtn: false,
            hasSpinText: false,
            hasCountdown: false,
            hasResultText: false,
            hasMyTicket: false,
            domStatus: -1,     // -1=unknown, 0=idle, 1=playing, 2=ended
            botElements: 0,
            debug: ''
        };
        try {
            const txt = document.body.textContent.toLowerCase();
            state.debug = 'bodyLen=' + txt.length;

            // Tim nut Bat dau / Start / Choi
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                const t = btn.textContent.trim().toLowerCase();
                if (t.includes('bat dau') || t === 'start' || t.includes('choi') || t.includes('new game'))
                    state.hasStartBtn = true;
                if (t.includes('dung') || t === 'stop' || t.includes('ket thuc'))
                    state.hasStopBtn = true;
            }
            state.debug += ' | startBtn=' + state.hasStartBtn + ' stopBtn=' + state.hasStopBtn;

            // Tu khoa trang thai
            if (txt.includes('dang quay') || txt.includes('quay so') || txt.includes('dang xo') || txt.includes('spinning'))
                state.hasSpinText = true;
            if (txt.includes('ket qua') || txt.includes('result') || txt.includes('kq'))
                state.hasResultText = true;
            // Dem nguoc: pattern so:phut hoac "con X giay"
            var timePattern = /\d+\s*:\s*\d{2}/;
            if (timePattern.test(txt) && (txt.includes('giay') || txt.includes('con') || txt.includes('timer') || txt.includes('time')))
                state.hasCountdown = true;

            // Bot elements
            const botEls = document.querySelectorAll('[class*="bot"], [id*="bot"]');
            state.botElements = botEls.length;

            // Tim ten minh trong player list
            const items = document.querySelectorAll('[class*="player"], [class*="member"], li, tr');
            for (const item of items) {
                if (item.textContent.includes('NoName007')) {
                    state.hasMyTicket = true;
                    break;
                }
            }

            // Suy luan trang thai tu DOM
            if (state.hasResultText)
                state.domStatus = 2;  // ket thuc
            else if (state.hasSpinText || state.hasStopBtn || state.hasCountdown)
                state.domStatus = 1;  // dang choi
            else if (state.hasStartBtn)
                state.domStatus = 0;  // san sang

        } catch(e) {
            state.debug += ' | ERR=' + e.message;
        }
        return state;
    }


    // ============================================================
    // API
    // ============================================================
    async function api(endpoint, method = 'POST', data = {}) {
        const url = location.origin + endpoint;
        const headers = {
            'X-CSRF-Token': csrf(),
            'X-Requested-With': 'XMLHttpRequest',
        };
        if (method === 'POST') {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        const body = method === 'POST'
            ? Object.entries(data).map(([k, v]) =>
                encodeURIComponent(k) + '=' + encodeURIComponent(v)
              ).join('&')
            : undefined;
        try {
            const r = await fetch(url, { method, headers, credentials: 'include', body });
            if (!r.ok) return null;
            const txt = await r.text();
            if (txt.startsWith('<')) return null;
            return JSON.parse(txt);
        } catch(e) { return null; }
    }

    // ============================================================
    // ROOM INFO
    // ============================================================
    async function extractRoomId() {
        // Try URL patterns
        const patterns = [
            /room\?id=(\d+)/, /room\/(\d+)/, /loto\?id=(\d+)/,
            /loto\/(\d+)/, /game\/(\d+)/, /\/(\d+)\/room/
        ];
        for (const pat of patterns) {
            const m = location.href.match(pat);
            if (m) return m[1];
        }

        // Try DOM links
        const links = document.querySelectorAll('a[href*="room"], a[href*="loto"]');
        for (const a of links) {
            const href = a.href || '';
            const m = href.match(/room\?id=(\d+)/) || href.match(/room\/(\d+)/)
                    || href.match(/loto\?id=(\d+)/) || href.match(/loto\/(\d+)/);
            if (m) return m[1];
        }

        // Try script tags
        for (const script of document.querySelectorAll('script')) {
            const txt = script.textContent || '';
            const m = txt.match(/"id"\s*:\s*"(\d+)"/);
            if (m) return m[1];
        }

        return null;
    }

    async function getRoom() {
        // Auto-detect room ID if not set
        if (!S.roomId) {
            S.roomId = await extractRoomId();
        }

        // If still no room ID, try API
        if (!S.roomId) {
            const d = await api('/api/game/loto/room', 'GET');
            if (d && d.room && d.room.id) {
                S.roomId = d.room.id;
            } else if (d && d.id) {
                S.roomId = d.id;
            }
        }

        if (!S.roomId) return null;

        const d = await api(`/api/game/loto/room?id=${S.roomId}`, 'GET');
        if (!d) return null;

        S.bal = parseInt(d.meta?.user?.coin) || 0;
        S.bots = d.playerCountBot || 0;
        S.players = d.playerCountAll || 0;
        S.status = d.room?.status ?? -1;

        // Detect if I have a ticket
        // hadTicket: chỉ set true nếu API trả về thông tin của mình (không phải bot cũ)
        S.hadTicket = false;
        if (d.playerInfo) {
            const keys = Object.keys(d.playerInfo);
            for (const k of keys) {
                const info = d.playerInfo[k];
                // Chỉ tính là có vé nếu is_bot === 0 (người thật)
                if (info && info.is_bot === 0) {
                    // Kiểm tra thêm user_id nếu có
                    if (info.user_id || info.userId || info.id) {
                        // So với user hiện tại - lấy từ cookie hoặc meta
                    }
                    S.hadTicket = true;
                    break;
                }
            }
        }
        // Nếu playerInfo trống hoặc chỉ có bot -> hadTicket vẫn là false

        return d;
    }

    // ============================================================
    // BET CALC
    // ============================================================
    function calcBet() {
        const P = Math.max(S.players, 2);
        const optimalX = P / (P - 1);
        const effectiveX = Math.min(optimalX, CFG.MULTIPLIER);

        let bet;
        if (S.streak <= 0) {
            bet = CFG.BASE_BET;
        } else {
            bet = CFG.BASE_BET * Math.pow(effectiveX, S.streak);
        }

        bet = Math.max(bet, CFG.MIN_BET);
        bet = Math.min(bet, CFG.MAX_BET);

        // Budget check
        const maxBudget = S.bal * CFG.MAX_BALANCE_USAGE;
        let totalNeeded = 0;
        for (let i = 0; i <= S.streak; i++) {
            totalNeeded += CFG.BASE_BET * Math.pow(effectiveX, i);
        }
        if (totalNeeded > maxBudget) {
            bet = Math.min(bet, maxBudget - (totalNeeded - bet));
            bet = Math.max(bet, CFG.MIN_BET);
        }

        return Math.floor(bet);
    }

    // ============================================================
    // GAME ACTIONS
    // ============================================================
    async function buyTicket() {
        const r = await api('/api/game/loto/muave', 'POST', { id: S.roomId });
        return r?.success;
    }

    async function addOneBot() {
        const r = await api('/api/game/loto/muave/add_bot', 'POST', { id: S.roomId });
        return r?.success;
    }

    async function setConfig(bet) {
        const r = await api('/api/game/loto/setting', 'POST', {
            id: S.roomId, type: CFG.GAME_TYPE, cuoc: bet
        });
        return r?.success;
    }

    async function startGame() {
        const bet = calcBet();
        const r = await api('/api/game/loto/start', 'POST', {
            id: S.roomId, type: CFG.GAME_TYPE, cuoc: bet
        });
        if (r?.success) {
            S.round++;
            S.lastBet = bet;
            S.startTime = S.startTime || Date.now();
            S.action = '🎮 Đã bắt đầu ván mới!';
            return true;
        }
        S.errorMsg = `⚠️ Start thất bại: ${r?.message || 'no response'}`;
        return false;
    }

    async function resetGame() {
        const r = await api('/api/game/loto/reset', 'POST', { id: S.roomId });
        return r?.success;
    }

    // ============================================================
    // GET RESULT
    // ============================================================
    function getResult(d) {
        if (!d || !d.playerInfo) return null;
        const keys = Object.keys(d.playerInfo);
        for (const k of keys) {
            const info = d.playerInfo[k];
            if (info && info.is_bot === 0) return info;
            if (k !== 'bot' && !String(k).includes('bot')) return info;
        }
        return null;
    }

    // ============================================================
    // SCANNER - Chạy mỗi 2s, đọc tình huống và quyết định hành động
    // ============================================================
    async function scanner() {
        // Chỉ chạy khi không có lock
        if (S.lock || !S.running) return;
        S.lock = true;

        try {
            // 0. Xoá lỗi cũ đầu mỗi lượt quét
            S.errorMsg = '';

            // 1. Đọc tình huống từ DOM (luôn làm, không phụ thuộc API)
            const dom = readGameDOM();
            log('📡 DOM: ' + (['?','IDLE','PLAYING','ENDED'][dom.domStatus+1] || '?') + ' | ' + dom.debug);

            // 2. Lưu trạng thái trước khi gọi API (tránh API ghi đè)
            const prevStatus = S.status;
            const prevProcessed = S.processedRound;

            // 3. Đọc từ API
            const d = await getRoom();
            if (!d) {
                // Fallback: dùng DOM để phán đoán nếu API lỗi
                if (dom.domStatus >= 0) {
                    S.status = dom.domStatus;
                    S.action = '📡 Dùng DOM (API lỗi)...';
                } else {
                    S.action = '⏳ Đợi dữ liệu phòng...';
                    S.lock = false; ui(); return;
                }
            }

            // QUAN TRỌNG: Không để API ghi đè status nếu đã xử lý kết thúc
            if (prevProcessed === 2 && prevStatus === 0) {
                S.status = 0;
                S.hadTicket = false;  // Reset luôn hadTicket vì API còn trả về dữ liệu cũ
                log('🔄 Giữ status=0 và reset hadTicket (đã xử lý kết thúc)');
            }
            // Nếu DOM thấy idle nhưng API nói khác, tin DOM
            if (dom.domStatus === 0 && S.status !== 0) {
                log('📡 DOM thấy idle, ghi đè status=' + S.status + ' -> 0');
                S.status = 0;
                S.hadTicket = false;
            }
            // Nếu DOM thấy kết thúc nhưng API nói đang chơi, force refresh
            if (dom.domStatus === 2 && S.status === 1) {
                log('📡 DOM thấy kết quả, chờ API cập nhật...');
                await sleep(500);
                const d2 = await getRoom();
                if (d2 && S.status === 2) {
                    log('✅ API đã cập nhật sang ended');
                }
            }

            const status = S.status;
            log(`📊 Status=${status} hadTicket=${S.hadTicket} bots=${S.bots} dom=${dom.domStatus}`);

            // 3. Xử lý theo tình huống
            switch (status) {
                // ============ IDLE ============
                case 0: {
                    await handleIdle(d, dom);
                    break;
                }

                // ============ PLAYING ============
                case 1: {
                    await handlePlaying(d, dom);
                    break;
                }

                // ============ ENDED ============
                case 2: {
                    await handleEnded(d, dom);
                    break;
                }

                default: {
                    S.action = `⏳ Trạng thái không xác định (API:${status} DOM:${dom.domStatus})`;
                    break;
                }
            }

        } catch(e) {
            S.errorMsg = `❌ Lỗi: ${e.message}`;
            log('❌ Scanner error:', e);
        }

        S.lock = false;
        ui();
    }

    // ============================================================
    // HANDLERS
    // ============================================================
    async function handleIdle(d, dom) {
        S.action = '⏳ Phòng trống, chuẩn bị ván mới...';
        S.processedRound = 0;

        // Step 1: Mua vé (luôn thử nếu hadTicket = false)
        // Nếu hadTicket = true nhưng API trả về cũ (từ ván trước), mua vé lại cũng ko sao
        let hasTicket = S.hadTicket;
        if (!hasTicket) {
            S.action = '🎫 Mua vé...';
            log('🎫 Mua vé...');
            const ok = await buyTicket();
            if (ok) {
                log('✅ Đã mua vé');
                S.hadTicket = true;
                hasTicket = true;
                await sleep(500);
                // Refresh để cập nhật
                await getRoom();
            } else {
                // Thử lại lần nữa
                log('⚠️ Mua vé lần 1 thất bại, thử lại...');
                await sleep(1000);
                const ok2 = await buyTicket();
                if (!ok2) {
                    S.errorMsg = '⚠️ Mua vé thất bại!';
                    return;
                }
                S.hadTicket = true;
                hasTicket = true;
                await sleep(500);
                await getRoom();
            }
        } else {
            log('⏩ Đã có vé, bỏ qua bước mua vé');
        }

        // Step 2: Thêm bot nếu cần
        if (S.bots < CFG.MAX_BOTS) {
            S.action = `🤖 Cần thêm bot (${S.bots}/${CFG.MAX_BOTS})...`;
            const toAdd = Math.min(CFG.MAX_BOTS - S.bots, 3);
            for (let i = 0; i < toAdd; i++) {
                const ok = await addOneBot();
                if (ok) {
                    log(`✅ Thêm bot #${S.bots + i + 1}`);
                    await sleep(600);
                } else {
                    log('⚠️ Thêm bot thất bại, dừng thêm');
                    break;
                }
            }
            await getRoom(); // refresh
        }

        // Step 3: Cần ít nhất bot hoặc người chơi khác
        if (S.bots < 1 && S.players < 2) {
            S.action = '⏳ Đợi người chơi hoặc bot...';
            return;
        }

        // Step 4: Cấu hình cược
        const bet = calcBet();
        S.action = `⚙️ Cấu hình: ${fmt(bet)}...`;
        const cfgOk = await setConfig(bet);
        if (!cfgOk) {
            S.errorMsg = '⚠️ Cấu hình thất bại!';
            return;
        }
        await sleep(400);

        // Step 5: Bắt đầu
        S.action = '▶️ Bắt đầu...';
        const started = await startGame();
        if (started) {
            S.processedRound = 1;
            S.action = '🎮 Đã bắt đầu!';
            log(`🎮 Ván #${S.round}, bet ${fmt(S.lastBet)}`);
        } else {
            S.errorMsg = '⚠️ Không thể bắt đầu ván';
        }
    }

    async function handlePlaying(d, dom) {
        S.action = '🎮 Đang chơi, chờ kết thúc...';

        // Kiểm tra DOM: nếu thấy kết quả nhưng API chưa cập nhật, force refresh API
        if (dom.domStatus === 2) {
            log('📋 DOM thấy kết quả, force refresh API...');
            await sleep(1000);
            const d2 = await getRoom();
            if (d2 && S.status === 2) {
                // Nếu API đã cập nhật, qua handler ended
                S.processedRound = 1;
                return; // tick tiếp theo sẽ vào case 2
            }
        }

        // Nếu có nút Start xuất hiện (ván kết thúc bất ngờ), xử lý luôn
        if (dom.domStatus === 0 && dom.hasStartBtn) {
            log('📋 DOM thấy nút Start - ván đã kết thúc, chuyển về idle');
            S.status = 0;
            S.hadTicket = false;
        }
    }

    async function handleEnded(d, dom) {
        S.action = '🏁 Ván kết thúc, xử lý kết quả...';

        // Chống xử lý trùng: nếu đã xử lý round này rồi thì bỏ qua
        if (S.processedRound === 2) {
            // Nếu DOM thấy idle, force về 0
            if (dom.domStatus === 0 || dom.hasStartBtn) {
                S.status = 0;
                S.hadTicket = false;
                S.processedRound = 0;
                S.action = '⏳ DOM thấy idle, reset...';
                log('🔄 DOM thấy idle, chuyển về trạng thái 0');
            }
            return;
        }
        S.processedRound = 2;

        // Lấy kết quả
        const result = getResult(d);
        if (result) {
            const prize = parseInt(result.prize) || 0;
            const won = prize > 0;

            if (won) {
                S.wins++;
                S.streak = 0;
                S.profit += prize - S.lastBet;
                log(`🎉 THẮNG! +${fmt(prize - S.lastBet)}`);
                ntf('🎉 THẮNG', `+${fmt(prize - S.lastBet)}`);
                S.action = '🎉 Thắng! Chuẩn bị reset...';
            } else {
                S.losses++;
                S.streak++;
                const loss = S.lastBet || calcBet();
                S.profit -= loss;
                log(`😞 THUA -${fmt(loss)} (streak: ${S.streak})`);
                S.action = '😞 Thua! Gấp thếp...';
            }
        } else {
            S.losses++;
            S.streak++;
            log('⚠️ Ko xđ kết quả, coi như thua');
        }

        ui();

        // Auto restart
        if (CFG.AUTO_RESTART && S.running) {
            S.action = '🔄 Reset phòng...';
            log('🔄 Reset phòng...');
            const resetOk = await resetGame();
            if (!resetOk) {
                log('⚠️ Reset thất bại, thử lại...');
                await sleep(2000);
                await resetGame();
            }
            await sleep(1500);

            // Refresh balance
            const balD = await api('/api/home', 'GET');
            if (balD?.meta?.user?.coin) {
                S.bal = parseInt(balD.meta.user.coin);
                log(`💰 Balance mới: ${fmt(S.bal)}`);
            }

            // QUAN TRỌNG: Reset state để vòng mới bắt đầu
            S.status = 0;
            S.hadTicket = false;
            S.processedRound = 0;
            S.action = '⏳ Sẵn sàng ván mới (đã reset)';
            log('🔄 Đã reset, sẵn sàng ván mới');

            // Kiểm tra thêm từ DOM
            const dom2 = readGameDOM();
            if (dom2.domStatus === 0) {
                log('📡 DOM xác nhận idle');
            }
        }
    }

    // ============================================================
    // TOGGLE
    // ============================================================
    function toggle() {
        S.running = !S.running;
        if (S.running) {
            log('▶️ Bật auto loto');
            S.errorMsg = '';
            S.startTime = S.startTime || Date.now();
            S.action = '⏳ Quét tình huống...';
            // Xoá interval cũ nếu có
            if (S.scannerId) { clearInterval(S.scannerId); }
            // Chạy ngay 1 lần
            scanner();
            // Chạy định kỳ
            S.scannerId = setInterval(scanner, CFG.SCAN_MS);
            log(`📡 Scanner bắt đầu (${CFG.SCAN_MS}ms)`);
        } else {
            log('⏸ Tắt auto loto');
            if (S.scannerId) { clearInterval(S.scannerId); S.scannerId = null; }
            S.action = '⏸ Đã dừng';
            ntf('⏸', 'Auto Loto đã tạm dừng');
        }
        ui();
    }

    // ============================================================
    // UI
    // ============================================================
    function statusText(s) {
        return ['⏳ Chờ', '🎮 Đang chơi', '🏁 Kết thúc'][s] || `❓(${s})`;
    }

    function createUI() {
        if ($('lt-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'lt-panel';
        panel.style.cssText = `
            position:fixed; top:10px; right:10px; z-index:999999;
            background:#1a1a2e; color:#eee; border:2px solid #e94560;
            border-radius:10px; padding:12px; width:280px;
            font-family:monospace; font-size:12px; box-shadow:0 4px 20px rgba(0,0,0,0.5);
        `;

        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <b style="color:#e94560; font-size:14px;">🎰 LOTO AUTO</b>
                <button id="lt-close-btn" style="background:none; border:none; color:#888; cursor:pointer; font-size:16px;">✕</button>
            </div>
            <div style="background:#16213e; border-radius:6px; padding:8px; margin-bottom:6px;">
                <div style="display:flex; justify-content:space-between;">
                    <span>Phòng:</span>
                    <b id="lt-room-id">-</b>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Trạng thái:</span>
                    <b id="lt-status">⏳ Đang tải...</b>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Hành động:</span>
                    <b id="lt-action" style="color:#4fc3f7;">-</b>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Dư:</span>
                    <b id="lt-bal" style="color:#ffd700;">0</b>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Bot / Người:</span>
                    <b id="lt-players">0 / 0</b>
                </div>
                <hr style="border-color:#333; margin:4px 0;">
                <div style="display:flex; justify-content:space-between;">
                    <span>Ván (T/L):</span>
                    <b id="lt-round">0 (0/0)</b>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Liên tiếp:</span>
                    <b id="lt-streak" style="color:#ff6b6b;">0</b>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Lãi:</span>
                    <b id="lt-profit" style="color:#4CAF50;">0</b>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Bet hiện tại:</span>
                    <b id="lt-bet" style="color:#ffd700;">0</b>
                </div>
            </div>
            <div id="lt-error" style="background:#5c1a1a; border-radius:4px; padding:4px 8px; margin-bottom:4px; color:#ff6b6b; display:none;"></div>
            <div style="display:flex; gap:4px;">
                <button id="lt-toggle-btn" style="flex:1; background:#4CAF50; color:white; border:none; border-radius:4px; padding:6px; cursor:pointer; font-weight:bold;">▶ CHẠY</button>
                <button id="lt-config-btn" style="background:#2196F3; color:white; border:none; border-radius:4px; padding:6px; cursor:pointer; font-size:11px;">⚙️ Config</button>
            </div>
            <div id="lt-config" style="display:none; margin-top:6px; background:#16213e; border-radius:6px; padding:8px;">
                <div style="margin-bottom:4px;">
                    <small>ID Phòng:</small>
                    <input id="lt-room-input" type="text" style="width:100%; background:#0f3460; color:white; border:1px solid #333; border-radius:3px; padding:2px 4px; font-size:11px;" placeholder="Nhập ID phòng">
                </div>
                <div style="margin-bottom:4px;">
                    <small>Bet cơ bản:</small>
                    <input id="lt-bet-input" type="number" style="width:100%; background:#0f3460; color:white; border:1px solid #333; border-radius:3px; padding:2px 4px; font-size:11px;" value="${CFG.BASE_BET}">
                </div>
                <div style="margin-bottom:4px;">
                    <small>Multiplier:</small>
                    <input id="lt-mult-input" type="number" step="0.001" style="width:100%; background:#0f3460; color:white; border:1px solid #333; border-radius:3px; padding:2px 4px; font-size:11px;" value="${CFG.MULTIPLIER}">
                </div>
                <button id="lt-force-btn" style="width:100%; background:#e94560; color:white; border:none; border-radius:4px; padding:4px; cursor:pointer; font-size:11px; margin-top:4px;">💪 Force Start (ID hiện tại)</button>
            </div>
        `;

        document.body.appendChild(panel);

        // Event handlers
        $('lt-close-btn').onclick = () => { panel.style.display = 'none'; };
        $('lt-toggle-btn').onclick = toggle;
        $('lt-config-btn').onclick = () => {
            const cfg = $('lt-config');
            cfg.style.display = cfg.style.display === 'none' ? 'block' : 'none';
        };
        $('lt-force-btn').onclick = () => {
            const rid = $('lt-room-input').value.trim();
            if (rid) {
                S.roomId = rid;
                log(`📌 Force room ID: ${rid}`);
                $('lt-config').style.display = 'none';
                S.errorMsg = '';
                if (!S.running) toggle();
            }
        };
        $('lt-bet-input').onchange = (e) => {
            const v = parseInt(e.target.value);
            if (v > 0) CFG.BASE_BET = v;
        };
        $('lt-mult-input').onchange = (e) => {
            const v = parseFloat(e.target.value);
            if (v > 1) CFG.MULTIPLIER = v;
        };
    }

    function ui() {
        if (!$('lt-panel')) return;
        const st = S.status;
        $('lt-room-id').textContent = S.roomId || '-';
        $('lt-status').textContent = st >= 0 ? statusText(st) : '⏳ Đang tải...';
        $('lt-action').textContent = S.action || '-';
        $('lt-bal').textContent = fmt(S.bal);
        $('lt-players').textContent = `${S.bots} / ${S.players}`;
        $('lt-round').textContent = `${S.round} (${S.wins}/${S.losses})`;
        $('lt-streak').textContent = S.streak;
        const profitColor = S.profit >= 0 ? '#4CAF50' : '#ff6b6b';
        $('lt-profit').textContent = fmt(S.profit);
        $('lt-profit').style.color = profitColor;
        $('lt-bet').textContent = fmt(S.lastBet || calcBet());

        const tb = $('lt-toggle-btn');
        if (tb) {
            tb.textContent = S.running ? '⏸ DỪNG' : '▶ CHẠY';
            tb.style.background = S.running ? '#e94560' : '#4CAF50';
        }

        const errEl = $('lt-error');
        if (errEl) {
            if (S.errorMsg) {
                errEl.textContent = S.errorMsg;
                errEl.style.display = 'block';
            } else {
                errEl.style.display = 'none';
            }
        }
    }

    // ============================================================
    // WATCH URL CHANGES
    // ============================================================
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            if (url.includes('/game/loto') || url.includes('/loto')) {
                log('🔄 Phát hiện vào phòng loto');
                S.roomId = null; // reset để auto-detect lại
                // Nếu đang chạy thì scanner sẽ tự phát hiện
                if (!S.running && S.initDone) {
                    setTimeout(() => { if (!S.running) toggle(); }, 2000);
                }
            }
        }
    }).observe(document, { subtree: true, childList: true });

    // ============================================================
    // INIT
    // ============================================================
    async function init() {
        log('🚀 Gaubong Loto Scanner v3.0.0');
        createUI();

        // Thử lấy phòng
        const d = await getRoom();
        if (d) {
            log(`✅ Phòng #${S.roomId} | Bal: ${fmt(S.bal)} | Bot: ${S.bots} | Người: ${S.players} | Status: ${S.status}`);

            // Tính toán multiplier tối ưu
            const P = Math.max(S.players, 2);
            const optimalX = P / (P - 1);
            log(`📐 P=${P}, Multiplier tối ưu: x${optimalX.toFixed(4)}`);

            // Dự tính ngân sách
            log('════════ DỰ TÍNH CHUỖI THUA ════════');
            const budget = S.bal * CFG.MAX_BALANCE_USAGE;
            let total = 0;
            const effectiveX = Math.min(CFG.MULTIPLIER, optimalX);
            for (let i = 0; i < 15; i++) {
                const bet = CFG.BASE_BET * Math.pow(effectiveX, i);
                total += bet;
                const win = bet * P;
                const net = win - total;
                log(`  Ván ${i+1}: bet ${fmt(bet)} | lũy kế ${fmt(total)} | lãi +${fmt(net)} ${total <= budget ? '✅' : '❌'}`);
                if (total > budget && i > 3) break;
            }

            // Phát hiện trạng thái
            if (S.status === 1) {
                S.action = '🎮 Giữa vòng, chờ kết thúc...';
            } else if (S.status === 2) {
                S.action = '🏁 Ván kết thúc, sẵn sàng...';
            } else {
                S.action = '⏳ Sẵn sàng bắt đầu...';
            }
        } else {
            S.action = '⌨️ Đợi vào phòng loto...';
            log('⚠️ Chưa tìm thấy phòng loto. Vào phòng và bật auto.');
        }

        S.initDone = true;
        ui();

        // Auto-start nếu tìm thấy phòng
        if (S.roomId) {
            log('⏳ Tự động bật sau 2s...');
            await sleep(2000);
            if (!S.running) toggle();
        }
    }

    // ============================================================
    // START
    // ============================================================
    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init);
    else
        init();

    log('📜 Loaded v3.1.0');
})();
