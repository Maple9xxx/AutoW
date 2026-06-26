// ==UserScript==
// @name         GauBong Loto Auto-Play - Martingale 🎰
// @namespace    http://tampermonkey.net/
// @version      3.1.0
// @description  Tự động chơi Lô Tô Gaubong.us. Chiến thuật gấp thếp vừa phải dựa trên payout ratio. State lưu LocalStorage, reload không mất tiến trình.
// @author       AutoPlay
// @match        https://gaubong.us/game/loto/room*
// @match        https://gaubong.us/game/loto
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
    // CẤU HÌNH - Chỉnh sửa thoải mái
    // ============================================================
    const CFG = {
        GAME_TYPE: 1,               // 1=50 số, 2=90 số
        BASE_BET: 10_000_000,       // Bet cơ bản (ván đầu sau khi thắng)
        MULTIPLIER: 1.2,            // Hệ số nhân khi thua (X = P/(P-1), P=6 → X=1.2)
        MAX_BET: 200_000_000,
        MIN_BET: 1_000_000,
        MAX_BOTS: 5,
        DELAY: 1500,
        POLL_INTERVAL: 3000,
        AUTO_RESTART: true,
        NOTIFY: true,
        MAX_BALANCE_USAGE: 0.75,
    };

    // ============================================================
    // PERSISTENCE - localStorage keys
    // ============================================================
    const LS = {
        BOT_STATE:  'loto_botState',    // 'fresh' | 'running' | 'paused'
        GAME:       'loto_gameState',   // streak, profit, wins, losses, round, bet...
        CONFIG:     'loto_config',      // CFG fields (giữ qua Reset)
    };

    // 3-State Machine cho toàn bộ vòng đời bot
    const BOT = {
        FRESH:   'fresh',    // Lần đầu / sau Reset → chờ người dùng nhấn Bắt Đầu
        RUNNING: 'running',  // Đang chạy (kể cả sau reload)
        PAUSED:  'paused',   // Người dùng nhấn Dừng → chờ Tiếp Tục hoặc Bắt Đầu Mới
    };

    // ============================================================
    // RUNTIME STATE (in-memory, được sync với localStorage)
    // ============================================================
    const S = {
        // Bot control
        running: false,
        botState: BOT.FRESH,
        busy: false,
        action: '',
        startTime: null,

        // Game
        roomId: null,
        status: -1,
        bal: 0,
        initBal: 0,
        bots: 0,

        // Chiến thuật
        bet: CFG.BASE_BET,
        round: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        profit: 0,

        // Flow control
        ended: false,
        processedRound: 0,
        _lastResultTime: 0,
        forceIdle: false,
    };

    // ============================================================
    // UTILITIES
    // ============================================================
    function log(...a) {
        const t = new Date().toLocaleTimeString('vi-VN');
        console.log(`[Loto ${t}]`, ...a);
        try { GM_log(`[Loto ${t}]`, ...a); } catch(e) {}
    }

    function ntf(title, msg) {
        if (CFG.NOTIFY) {
            try { GM_notification({ title, text: msg, timeout: 6000 }); } catch(e) {}
        }
        log(`🔔 ${title}: ${msg}`);
    }

    function fmt(n) {
        return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function csrf() {
        const m = document.cookie.match(/(?:^|;\s*)csrf_cookie_name=([^;]*)/);
        return m ? m[1] : '';
    }

    // ============================================================
    // PERSISTENCE FUNCTIONS
    // Tách biệt rõ ràng: save/load/set/get/reset
    // ============================================================
    function saveGameState() {
        try {
            localStorage.setItem(LS.GAME, JSON.stringify({
                streak:           S.streak,
                profit:           S.profit,
                wins:             S.wins,
                losses:           S.losses,
                round:            S.round,
                bet:              S.bet,
                initBal:          S.initBal,
                startTime:        S.startTime,
                processedRound:   S.processedRound,
                _lastResultTime:  S._lastResultTime,
            }));
        } catch(e) {
            log('⚠️ Lỗi lưu game state:', e.message);
        }
    }

    function loadGameState() {
        try {
            const raw = localStorage.getItem(LS.GAME);
            if (!raw) return false;
            const g = JSON.parse(raw);
            if (typeof g.streak          === 'number') S.streak          = g.streak;
            if (typeof g.profit          === 'number') S.profit          = g.profit;
            if (typeof g.wins            === 'number') S.wins            = g.wins;
            if (typeof g.losses          === 'number') S.losses          = g.losses;
            if (typeof g.round           === 'number') S.round           = g.round;
            if (typeof g.bet             === 'number') S.bet             = g.bet;
            if (typeof g.initBal         === 'number') S.initBal         = g.initBal;
            if (typeof g.startTime       === 'number') S.startTime       = g.startTime;
            if (typeof g.processedRound  === 'number') S.processedRound  = g.processedRound;
            if (typeof g._lastResultTime === 'number') S._lastResultTime = g._lastResultTime;
            log(`↩️ Khôi phục state: round=${S.round} streak=${S.streak} profit=${fmt(S.profit)}`);
            return true;
        } catch(e) {
            log('⚠️ Lỗi load game state:', e.message);
            return false;
        }
    }

    function setBotState(state) {
        S.botState = state;
        localStorage.setItem(LS.BOT_STATE, state);
    }

    function getBotState() {
        return localStorage.getItem(LS.BOT_STATE) || BOT.FRESH;
    }

    function loadConfig() {
        try {
            // Ưu tiên localStorage, fallback về GM_getValue (backward compat)
            const raw = localStorage.getItem(LS.CONFIG)
                     || (typeof GM_getValue === 'function' ? GM_getValue('loto_config', '{}') : '{}');
            const cfg = JSON.parse(raw);
            if (cfg.BASE_BET)          CFG.BASE_BET          = cfg.BASE_BET;
            if (cfg.MULTIPLIER)        CFG.MULTIPLIER        = cfg.MULTIPLIER;
            if (cfg.MAX_BOTS)          CFG.MAX_BOTS          = cfg.MAX_BOTS;
            if (cfg.GAME_TYPE)         CFG.GAME_TYPE         = cfg.GAME_TYPE;
            if (cfg.MAX_BET)           CFG.MAX_BET           = cfg.MAX_BET;
            if (cfg.MIN_BET)           CFG.MIN_BET           = cfg.MIN_BET;
            if (cfg.MAX_BALANCE_USAGE) CFG.MAX_BALANCE_USAGE = cfg.MAX_BALANCE_USAGE;
            log('⚙️ Đã tải cấu hình');
        } catch(e) {}
    }

    function saveConfig() {
        const cfg = {
            BASE_BET: CFG.BASE_BET, MULTIPLIER: CFG.MULTIPLIER,
            MAX_BOTS: CFG.MAX_BOTS, GAME_TYPE: CFG.GAME_TYPE,
            MAX_BET: CFG.MAX_BET, MIN_BET: CFG.MIN_BET,
            MAX_BALANCE_USAGE: CFG.MAX_BALANCE_USAGE,
        };
        localStorage.setItem(LS.CONFIG, JSON.stringify(cfg));
        try { if (typeof GM_setValue === 'function') GM_setValue('loto_config', JSON.stringify(cfg)); } catch(e) {}
        log('⚙️ Đã lưu cấu hình');
    }

    // Reload an toàn: save state + đánh dấu running → reload
    // Sau khi reload, init() sẽ tự resume vì botState = 'running'
    function safeReload() {
        saveGameState();
        setBotState(BOT.RUNNING);
        log('🔄 safeReload: state đã lưu → reload...');
        location.reload();
    }

    // Reset hoàn toàn: xóa game state + bot state, GIỮ config
    function resetAll() {
        if (iv) { clearInterval(iv); iv = null; }
        localStorage.removeItem(LS.BOT_STATE);
        localStorage.removeItem(LS.GAME);

        S.wins = S.losses = S.round = S.profit = S.streak = 0;
        S.bet        = CFG.BASE_BET;
        S.initBal    = S.bal;
        S.startTime  = null;
        S.running    = false;
        S.processedRound   = 0;
        S._lastResultTime  = 0;
        S.action     = '🔄 Đã reset — chờ Bắt Đầu';

        setBotState(BOT.FRESH); // Ghi FRESH vào localStorage
        ui();
        log('🗑 RESET hoàn tất — chờ nhấn Bắt Đầu');
    }

    // ============================================================
    // BOT CONTROL — 3 hành động rõ ràng
    // ============================================================
    let iv = null;

    // startBot(fresh=true)  → Bắt Đầu Mới (reset stats)
    // startBot(fresh=false) → Tiếp Tục (giữ stats, resume sau reload)
    function startBot(fresh = false) {
        if (fresh) {
            S.wins = S.losses = S.round = S.profit = S.streak = 0;
            S.bet       = CFG.BASE_BET;
            S.initBal   = S.bal;
            S.startTime = Date.now();
            S.processedRound  = 0;
            S._lastResultTime = 0;
            log('▶️ Bắt đầu mới (fresh)');
        } else {
            S.startTime = S.startTime || Date.now();
            log(`▶️ Tiếp tục (resume) | round=${S.round} streak=${S.streak}`);
        }

        S.running = true;
        S.action  = '▶️ Đang chạy...';
        setBotState(BOT.RUNNING);
        saveGameState();

        if (iv) clearInterval(iv);
        iv = setInterval(loop, CFG.POLL_INTERVAL);
        loop(); // Kick ngay, không đợi interval đầu tiên

        ntf('▶️ Auto-Play', fresh ? 'Đã bắt đầu!' : 'Tiếp tục!');
        ui();
    }

    function stopBot() {
        S.running = false;
        S.action  = '⏸ Đã dừng — nhấn Tiếp Tục để chạy lại';
        setBotState(BOT.PAUSED);
        saveGameState();

        if (iv) { clearInterval(iv); iv = null; }

        log('⏸️ Dừng (user)');
        ntf('⏸️', 'Đã tạm dừng. Nhấn Tiếp Tục hoặc Bắt Đầu Mới.');
        ui();
    }

    // ============================================================
    // API
    // ============================================================
    async function api(endpoint, method = 'POST', data = {}) {
        const url = location.origin + endpoint;
        const body = Object.entries(data)
            .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
            .join('&');
        try {
            const r = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-CSRF-Token': csrf(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'include',
                body: method === 'POST' ? body : undefined,
            });
            if (!r.ok) return null;
            const txt = await r.text();
            if (txt.startsWith('<')) return null;
            return JSON.parse(txt);
        } catch(e) { return null; }
    }

    // ============================================================
    // ROOM INFO
    // ============================================================
    async function getRoom() {
        if (!S.roomId) {
            const m = location.href.match(/room\?id=(\d+)/);
            if (m) {
                S.roomId = m[1];
            } else {
                const link = document.querySelector('a[href*="/game/loto/room?id="]');
                if (link) {
                    const m2 = link.href.match(/room\?id=(\d+)/);
                    if (m2) S.roomId = m2[1];
                }
            }
            if (!S.roomId) return null;
        }
        const d = await api(`/api/game/loto/room?id=${S.roomId}`, 'GET');
        if (!d) return null;
        if (d.meta?.user?.coin) {
            S.bal = parseInt(d.meta.user.coin.replace(/\./g, ''));
            if (!S.initBal) S.initBal = S.bal;
        }
        S.status = parseInt(d.room?.status ?? -1);
        S.bots   = d.playerCountBot ?? 0;
        return d;
    }

    // ============================================================
    // CHIẾN THUẬT GẤP THẾP
    // ============================================================
    function calcBet() {
        const players     = (S.bots || 5) + 1;
        const payoutRatio = players;

        let bet = CFG.BASE_BET * Math.pow(CFG.MULTIPLIER, S.streak);
        bet = Math.round(Math.min(Math.max(bet, CFG.MIN_BET), CFG.MAX_BET));

        let totalNeeded = 0;
        for (let i = 0; i <= S.streak; i++) {
            totalNeeded += CFG.BASE_BET * Math.pow(CFG.MULTIPLIER, i);
        }
        totalNeeded = Math.round(totalNeeded);

        const maxSpend = S.bal * CFG.MAX_BALANCE_USAGE;

        if (totalNeeded > maxSpend) {
            log(`⚠️ Hết ngân sách cho streak ${S.streak+1} (cần ${fmt(totalNeeded)}, còn ${fmt(maxSpend)})`);
            log(`🔄 RESET streak về 0`);
            S.streak = 0;
            bet = Math.round(Math.min(Math.max(CFG.BASE_BET, CFG.MIN_BET), CFG.MAX_BET));
        }

        S.bet = bet;

        const winAmount           = payoutRatio * bet;
        const totalLossThisStreak = totalNeeded - bet;
        const netProfit           = winAmount - bet - totalLossThisStreak;

        log(`📐 Bet: ${fmt(bet)} | Streak: ${S.streak} | Players: ${players} | Payout: ${payoutRatio}:1`);
        log(`   Win → +${fmt(winAmount)} - vé ${fmt(bet)} - streak ${fmt(totalLossThisStreak)} = lãi +${fmt(netProfit)}`);

        return { bet, players, payoutRatio, totalNeeded, netProfit, winAmount };
    }

    // ============================================================
    // UI ACTIONS
    // ============================================================
    function clickContains(text) {
        for (const b of document.querySelectorAll('button')) {
            if (b.textContent.trim().includes(text) && !b.disabled) {
                b.click();
                log(`🖱️ "${b.textContent.trim()}"`);
                return true;
            }
        }
        return false;
    }

    async function addBots() {
        log('🤖 Thêm bot...');
        let added = S.bots;
        for (let i = 0; i < CFG.MAX_BOTS * 2; i++) {
            if (added >= CFG.MAX_BOTS || !S.roomId) break;
            const r = await api('/api/game/loto/muave/add_bot', 'POST', { id: S.roomId });
            if (r?.success) {
                added++;
                log(`  ✅ Bot ${added}/${CFG.MAX_BOTS}`);
                await sleep(500);
            } else {
                const d = await getRoom();
                if (d) added = d.playerCountBot || added;
                if (added >= CFG.MAX_BOTS) break;
                log(`  ⚠️ add_bot fail, thử lại...`);
                await sleep(1000);
            }
        }
        S.bots = added;
        log(`🤖 Bot: ${added}/${CFG.MAX_BOTS}`);
        return added;
    }

    async function configureGame() {
        if (!S.roomId) return;
        const r = await api('/api/game/loto/setting', 'POST', {
            id: S.roomId, type: CFG.GAME_TYPE, cuoc: S.bet,
        });
        log(r?.success ? '✅ Đã lưu cấu hình (API)' : '⚠️ Setting API không phản hồi');
    }

    async function startGame() {
        const info = calcBet();
        log(`▶️ Game #${S.round+1}... vé ${fmt(S.bet)} | dư ${fmt(S.bal)}`);
        if (!S.roomId) { log('❌ No room ID'); return false; }

        // Thử 1: muave (mua vé + bắt đầu)
        const r = await api('/api/game/loto/muave', 'POST', { id: S.roomId });
        if (r?.success) {
            S.round++; S.ended = false;
            log(`✅ Game #${S.round} START! (muave)`);
            ntf('🎮 Game #' + S.round, `Vé: ${fmt(S.bet)} | Lãi: +${fmt(info.netProfit)}`);
            return true;
        }

        // Thử 2: kiểm tra xem game đã chạy chưa
        const d = await api('/api/game/loto/room?id=' + S.roomId, 'GET');
        if (d?.room?.status === 1) {
            S.round++; S.ended = false;
            log(`✅ Game #${S.round} đã chạy từ trước`);
            return true;
        }

        // Thử 3: start API
        log('⚠️ muave thất bại, thử start API...');
        const r2 = await api('/api/game/loto/start', 'POST', {
            id: S.roomId, type: CFG.GAME_TYPE, cuoc: S.bet,
        });
        if (r2?.success) {
            S.round++; S.ended = false;
            log(`✅ Game #${S.round} START! (start API)`);
            ntf('🎮 Game #' + S.round, `Vé: ${fmt(S.bet)} | Lãi: +${fmt(info.netProfit)}`);
            return true;
        }

        // Thử 4: thêm bot rồi muave lại
        log('⚠️ Start thất bại, thêm bot và thử lại...');
        await addBots();
        await sleep(1000);
        const r3 = await api('/api/game/loto/muave', 'POST', { id: S.roomId });
        if (r3?.success) {
            S.round++; S.ended = false;
            log(`✅ Game #${S.round} START! (sau khi thêm bot)`);
            ntf('🎮 Game #' + S.round, `Vé: ${fmt(S.bet)} | Lãi: +${fmt(info.netProfit)}`);
            return true;
        }

        log('❌ Start thất bại hoàn toàn');
        return false;
    }

    async function continueGame() {
        log('🔄 Reset phòng...');
        if (!S.roomId) {
            const m = location.href.match(/room\?id=(\d+)/);
            if (m) { S.roomId = m[1]; }
            else {
                const link = document.querySelector('a[href*="/game/loto/room?id="]');
                if (link) { const m2 = link.href.match(/room\?id=(\d+)/); if (m2) S.roomId = m2[1]; }
            }
            if (!S.roomId) return false;
        }
        const r = await api('/api/game/loto/reset', 'POST', { id: S.roomId });
        if (r?.success) {
            log('✅ Đã reset phòng');
            S.status = 0; S.ended = false; S.forceIdle = true;
            await sleep(500);
            return true;
        }
        log('⚠️ Reset API fail, thử click nút "Tiếp tục"...');
        if (await clickContains('Tiếp tục')) {
            S.status = 0; S.ended = false; S.forceIdle = true;
            await sleep(2000);
            return true;
        }
        S.status = 0; S.ended = false; S.forceIdle = true;
        return false;
    }

    // ============================================================
    // KẾT QUẢ
    // ============================================================
    async function handleResult(d) {
        const kq = d.ketquas;
        if (!kq?.userWin) return false;

        const winners = Array.isArray(kq.userWin) ? kq.userWin : [kq.userWin];
        const prize   = parseInt(kq.coinUserWin) || 0;
        const myId    = d.meta?.user?.id;
        const won     = winners.some(w => w.userId == myId);

        log(`🏁 GAME #${S.round}`);
        log(`  👑 ${winners.map(w => w.account).join(', ')} thắng`);
        log(`  💰 Giải: ${fmt(prize)} | Bet: ${fmt(S.bet)}`);

        if (won) {
            S.wins++;
            const net = prize - S.bet;
            S.profit += net;
            let totalLosses = 0;
            for (let i = 0; i < S.streak; i++) {
                totalLosses += CFG.BASE_BET * Math.pow(CFG.MULTIPLIER, i);
            }
            const streakNet = prize - S.bet - Math.round(totalLosses);
            S.streak = 0;
            log(`  🎉 THẮNG! +${fmt(net)} (lãi chuỗi: +${fmt(streakNet)})`);
            ntf('🏆 THẮNG!', `+${fmt(net)} | Chuỗi: +${fmt(streakNet)}`);
        } else {
            S.losses++;
            S.streak++;
            S.profit -= S.bet;
            const nextBet = CFG.BASE_BET * Math.pow(CFG.MULTIPLIER, S.streak);
            log(`  😔 Thua -${fmt(S.bet)} (streak: ${S.streak})`);
            log(`  🎯 Bet tiếp: ${fmt(nextBet)}`);
            ntf('😔 Thua', `-${fmt(S.bet)} | Streak: ${S.streak}`);
        }

        await getRoom();
        log(`📊 T:${S.wins}/${S.round} | Lợi nhuận: ${fmt(S.profit)} | Dư: ${fmt(S.bal)}`);

        S.processedRound    = 2;
        S.ended             = true;
        S._lastResultTime   = Date.now();

        // Lưu ngay sau khi có kết quả quan trọng (bet vừa ảnh hưởng streak/profit)
        saveGameState();
        return true;
    }

    // ============================================================
    // MAIN LOOP
    // ============================================================
    async function loop() {
        if (!S.running) return;
        if (S.busy) return;
        S.busy = true;

        try {
            const d = await getRoom();
            if (!d) {
                S.action = '⏳ Chờ phòng...';
                return;
            }
            ui();

            // === STATUS 0: IDLE ===
            if (S.status === 0) {
                S.action = '⏸ Phòng trống';
                S.processedRound = 0;

                const uid       = d.meta?.user?.id;
                const hasTicket = d.playerInfo && d.playerInfo[String(uid)];

                if (!hasTicket) {
                    S.action = '🎫 Chuẩn bị...';
                    calcBet();
                    await configureGame();
                    await sleep(CFG.DELAY);
                    await addBots();
                    await sleep(CFG.DELAY);
                    const ok = await startGame();
                    if (ok) safeReload();
                } else {
                    S.action = '🤖 Thêm bot...';
                    if (d.playerCountBot < CFG.MAX_BOTS) {
                        await addBots();
                        await sleep(CFG.DELAY);
                    }
                    const ok = await startGame();
                    if (ok) safeReload();
                }
                return;
            }

            // === STATUS 1: PLAYING ===
            if (S.status === 1) {
                S.action = '🎮 Theo dõi...';

                if (d.ketquas?.userWin && S.processedRound !== 2) {
                    await handleResult(d);
                }
                if (S.processedRound === 2 && CFG.AUTO_RESTART) {
                    await continueGame();
                    safeReload();
                }
                if (d.ketquas) {
                    const drawn = d.ketquas.data?.length || 0;
                    S.action = `🎯 Đã quay ${drawn} số`;
                }
                return;
            }

            // === STATUS 2: ENDED ===
            if (S.status === 2) {
                if (S._lastResultTime && Date.now() - S._lastResultTime < 15000) {
                    S.action = '⏳ Chờ sau reset...';
                    return;
                }
                S.action = '🏁 Kết thúc';
                if (S.processedRound !== 2) {
                    if (d.ketquas?.userWin) {
                        await handleResult(d);
                    } else {
                        S.action = '🏁 Đợi kết quả...';
                    }
                }
                if (S.processedRound === 2 && CFG.AUTO_RESTART) {
                    await continueGame();
                    safeReload();
                }
                return;
            }

            S.action = `⚠️ Status lạ: ${S.status}`;

        } catch (e) {
            log('❌', e.message);
            S.action = '❌ ' + e.message;
        } finally {
            S.busy = false;
            // Lưu state sau mỗi tick (đảm bảo crash không mất nhiều hơn 1 tick)
            if (S.running) saveGameState();
            ui();
        }
    }

    // ============================================================
    // UI
    // ============================================================
    function createUI() {
        if (document.getElementById('loto-ui')) return;
        const el = document.createElement('div');
        el.id = 'loto-ui';
        el.innerHTML = `
<div style="position:fixed;bottom:10px;right:10px;z-index:99999;
background:linear-gradient(135deg,#1a1a2e,#16213e);
border:2px solid #e94560;border-radius:12px;padding:14px;
color:#fff;font-family:Segoe UI,Arial,sans-serif;font-size:13px;
min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,.5);
max-height:90vh;overflow-y:auto;">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:center;
  margin-bottom:10px;border-bottom:1px solid #e94560;padding-bottom:8px;">
    <div style="font-weight:bold;font-size:15px;color:#e94560;">
      🎰 Loto Martingale
      <button id="lt-config-btn" title="Cài đặt"
        style="background:transparent;color:#888;border:none;cursor:pointer;font-size:16px;margin-left:4px;">⚙️</button>
    </div>
    <button id="lt-close"
      style="background:transparent;color:#999;border:1px solid #555;
      padding:5px 8px;border-radius:6px;cursor:pointer;font-size:12px;">✕</button>
  </div>

  <!-- Stats -->
  <table style="width:100%;font-size:12px;border-collapse:collapse;">
    <tr><td style="padding:2px 0;">💰 Dư</td>
        <td id="lt-bal" style="color:#4CAF50;font-weight:bold;text-align:right;">0</td></tr>
    <tr><td style="padding:2px 0;">🎫 Bet</td>
        <td id="lt-bet" style="color:#FFC107;font-weight:bold;text-align:right;">0</td></tr>
    <tr><td style="padding:2px 0;">📈 Nhân</td>
        <td id="lt-mul" style="text-align:right;">x${CFG.MULTIPLIER}</td></tr>
    <tr><td style="padding:2px 0;">🏆 Lãi</td>
        <td id="lt-profit" style="font-weight:bold;text-align:right;">0</td></tr>
    <tr><td style="padding:2px 0;">📊 Tỉ lệ</td>
        <td id="lt-stats" style="text-align:right;">0/0 (0%)</td></tr>
    <tr><td style="padding:2px 0;">🔥 Streak</td>
        <td id="lt-streak" style="color:#FF9800;font-weight:bold;text-align:right;">0</td></tr>
    <tr><td style="padding:2px 0;">🤖 Bot</td>
        <td id="lt-bots" style="color:#64B5F6;text-align:right;">0/5</td></tr>
    <tr><td style="padding:2px 0;">📌 Status</td>
        <td id="lt-status" style="color:#FF9800;text-align:right;">Đang tải...</td></tr>
    <tr><td style="padding:2px 0;">🔄 Action</td>
        <td id="lt-action" style="color:#90CAF9;font-size:11px;text-align:right;">-</td></tr>
  </table>

  <!-- =============================================
       BUTTON AREA - 3-state machine
       FRESH:   [▶ BẮT ĐẦU]
       RUNNING: [⏸ DỪNG]
       PAUSED:  [▶ TIẾP TỤC] [🔄 BẮT ĐẦU MỚI]
       ============================================= -->
  <div id="lt-btn-area" style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">

    <!-- Hàng 1: Bắt Đầu (fresh) hoặc cặp Tiếp Tục + Bắt Đầu Mới (paused) -->
    <div style="display:flex;gap:6px;">
      <button id="lt-start-btn" style="
        flex:1;background:#4CAF50;color:#fff;border:none;
        padding:8px 10px;border-radius:6px;cursor:pointer;
        font-weight:bold;font-size:12px;display:none;">▶ BẮT ĐẦU</button>
      <button id="lt-resume-btn" style="
        flex:1;background:#2196F3;color:#fff;border:none;
        padding:8px 10px;border-radius:6px;cursor:pointer;
        font-weight:bold;font-size:12px;display:none;">▶ TIẾP TỤC</button>
    </div>

    <!-- Hàng 2: Dừng (chỉ hiện khi running) -->
    <button id="lt-stop-btn" style="
      width:100%;background:#e94560;color:#fff;border:none;
      padding:8px 10px;border-radius:6px;cursor:pointer;
      font-weight:bold;font-size:12px;display:none;">⏸ DỪNG</button>

  </div>

  <!-- Footer -->
  <div style="margin-top:8px;padding-top:6px;border-top:1px solid #333;
  font-size:11px;color:#888;display:flex;justify-content:space-between;align-items:center;">
    <span>⏱ <span id="lt-timer">00:00</span></span>
    <button id="lt-reset" style="background:transparent;border:1px solid #e94560;
    color:#e94560;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;">
      🗑 RESET</button>
  </div>

</div>`;

        document.body.appendChild(el);

        // Event listeners
        document.getElementById('lt-close').onclick      = () => el.style.display = 'none';
        document.getElementById('lt-config-btn').onclick = showConfig;
        document.getElementById('lt-start-btn').onclick  = () => startBot(true);   // fresh start
        document.getElementById('lt-resume-btn').onclick = () => startBot(false);  // resume
        document.getElementById('lt-stop-btn').onclick   = stopBot;
        document.getElementById('lt-reset').onclick      = () => {
            if (confirm('⚠️ RESET sẽ xóa toàn bộ tiến trình (streak, profit, round)!\nConfig sẽ được giữ lại.\n\nTiếp tục?')) {
                resetAll();
            }
        };

        ui();
    }

    function ui() {
        const $ = id => document.getElementById(id);
        if (!$('lt-bal')) return;

        // Update stats display
        $('lt-bal').textContent = fmt(S.bal);
        $('lt-bet').textContent = fmt(S.bet);
        $('lt-mul').textContent = `x${CFG.MULTIPLIER}`;

        const p = $('lt-profit');
        p.textContent  = (S.profit >= 0 ? '+' : '') + fmt(Math.abs(S.profit));
        p.style.color  = S.profit >= 0 ? '#4CAF50' : '#f44336';

        const wr = S.round > 0 ? (S.wins / S.round * 100).toFixed(1) + '%' : '0%';
        $('lt-stats').textContent  = `${S.wins}/${S.round} (${wr})`;
        $('lt-streak').textContent = S.streak;
        $('lt-bots').textContent   = `${S.bots}/${CFG.MAX_BOTS}`;

        const statusEmoji = {'-1':'⏳', 0:'⏸', 1:'🎮', 2:'🏁'};
        $('lt-status').textContent = statusEmoji[S.status] || '❓';
        $('lt-action').textContent = S.action;

        if (S.startTime) {
            const sec = Math.floor((Date.now() - S.startTime) / 1000);
            $('lt-timer').textContent =
                String(Math.floor(sec / 60)).padStart(2, '0') + ':' +
                String(sec % 60).padStart(2, '0');
        }

        // =============================================
        // BUTTON STATE MACHINE
        // =============================================
        const startBtn  = $('lt-start-btn');
        const resumeBtn = $('lt-resume-btn');
        const stopBtn   = $('lt-stop-btn');

        if (S.botState === BOT.RUNNING) {
            // Running → chỉ nút DỪNG
            startBtn.style.display  = 'none';
            resumeBtn.style.display = 'none';
            stopBtn.style.display   = 'block';

        } else if (S.botState === BOT.PAUSED) {
            // Paused → TIẾP TỤC (xanh) + BẮT ĐẦU MỚI (xanh lá)
            startBtn.style.display   = 'block';
            startBtn.textContent     = '🔄 BẮT ĐẦU MỚI';
            resumeBtn.style.display  = 'block';
            stopBtn.style.display    = 'none';

        } else {
            // Fresh → chỉ BẮT ĐẦU
            startBtn.style.display   = 'block';
            startBtn.textContent     = '▶ BẮT ĐẦU';
            resumeBtn.style.display  = 'none';
            stopBtn.style.display    = 'none';
        }
    }

    // Timer tick cho UI (chạy độc lập với game loop)
    setInterval(() => { if (S.startTime && S.running) ui(); }, 1000);

    // ============================================================
    // CONFIG UI
    // ============================================================
    function showConfig() {
        const old = document.getElementById('lt-config-modal');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'lt-config-modal';
        overlay.style.cssText = `
            position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,0.6);z-index:999999;
            display:flex;justify-content:center;align-items:center;
            font-family:Segoe UI,Arial,sans-serif;
        `;
        overlay.innerHTML = `
<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);
border:2px solid #e94560;border-radius:14px;padding:20px;
color:#fff;min-width:360px;max-width:420px;
box-shadow:0 8px 40px rgba(0,0,0,.6);">
  <div style="display:flex;justify-content:space-between;align-items:center;
  margin-bottom:14px;border-bottom:1px solid #e94560;padding-bottom:10px;">
    <div style="font-size:16px;font-weight:bold;color:#e94560;">⚙️ Cài đặt</div>
    <button id="lt-modal-close" style="background:transparent;color:#999;border:1px solid #555;
    border-radius:6px;cursor:pointer;padding:4px 10px;font-size:14px;">✕</button>
  </div>
  <table style="width:100%;font-size:13px;border-collapse:collapse;">
    <tr><td style="padding:5px 0;">🎫 Bet cơ bản</td>
        <td style="text-align:right;"><input id="cfg-basebet" type="number" value="${CFG.BASE_BET}"
        style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;text-align:right;font-size:13px;"></td></tr>
    <tr><td style="padding:5px 0;">📈 Hệ số nhân (X)</td>
        <td style="text-align:right;"><input id="cfg-multiplier" type="number" step="0.01" value="${CFG.MULTIPLIER}"
        style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;text-align:right;font-size:13px;"></td></tr>
    <tr><td style="padding:5px 0;">🤖 Số bot tối đa</td>
        <td style="text-align:right;"><input id="cfg-bots" type="number" min="0" max="5" value="${CFG.MAX_BOTS}"
        style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;text-align:right;font-size:13px;"></td></tr>
    <tr><td style="padding:5px 0;">🔢 Loại số</td>
        <td style="text-align:right;"><select id="cfg-gametype"
        style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;font-size:13px;">
          <option value="1" ${CFG.GAME_TYPE===1?'selected':''}>50 Số</option>
          <option value="2" ${CFG.GAME_TYPE===2?'selected':''}>90 Số</option>
        </select></td></tr>
    <tr><td style="padding:5px 0;">💰 Bet tối đa</td>
        <td style="text-align:right;"><input id="cfg-maxbet" type="number" value="${CFG.MAX_BET}"
        style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;text-align:right;font-size:13px;"></td></tr>
    <tr><td style="padding:5px 0;">🪙 Bet tối thiểu</td>
        <td style="text-align:right;"><input id="cfg-minbet" type="number" value="${CFG.MIN_BET}"
        style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;text-align:right;font-size:13px;"></td></tr>
    <tr><td style="padding:5px 0;">💳 Dùng tối đa % dư</td>
        <td style="text-align:right;"><input id="cfg-balusg" type="number" min="0" max="1" step="0.05" value="${CFG.MAX_BALANCE_USAGE}"
        style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;text-align:right;font-size:13px;"></td></tr>
  </table>
  <div style="margin-top:14px;padding-top:10px;border-top:1px solid #333;font-size:12px;color:#888;">
    <div>💡 X = P/(P-1) với P = số người. P=6 → X=1.2 → lãi = bet×5 mỗi khi thắng</div>
    <div style="margin-top:4px;color:#f44336;">⚠️ Config được GIỮ qua Reset (chỉ xóa tiến trình game)</div>
  </div>
  <div style="display:flex;gap:8px;margin-top:12px;">
    <button id="cfg-save" style="flex:1;background:#e94560;color:#fff;border:none;
    border-radius:6px;padding:8px;cursor:pointer;font-weight:bold;">💾 Lưu & Đóng</button>
    <button id="cfg-close" style="flex:1;background:#333;color:#888;border:1px solid #555;
    border-radius:6px;padding:8px;cursor:pointer;">Hủy</button>
  </div>
</div>`;
        document.body.appendChild(overlay);

        document.getElementById('lt-modal-close').onclick = () => overlay.remove();
        document.getElementById('cfg-close').onclick      = () => overlay.remove();

        document.getElementById('cfg-save').onclick = () => {
            const v = id => document.getElementById(id).value;
            CFG.BASE_BET          = Math.max(1_000_000,   Math.min(1_000_000_000, parseInt(v('cfg-basebet'))    || CFG.BASE_BET));
            CFG.MULTIPLIER        = Math.max(1.01,         Math.min(2.0,           parseFloat(v('cfg-multiplier'))|| CFG.MULTIPLIER));
            CFG.MAX_BOTS          = Math.max(0,            Math.min(5,             parseInt(v('cfg-bots'))       || CFG.MAX_BOTS));
            CFG.GAME_TYPE         = parseInt(v('cfg-gametype')) === 2 ? 2 : 1;
            CFG.MAX_BET           = Math.max(CFG.MIN_BET,  Math.min(1_000_000_000, parseInt(v('cfg-maxbet'))    || CFG.MAX_BET));
            CFG.MIN_BET           = Math.max(1_000_000,    Math.min(CFG.MAX_BET,   parseInt(v('cfg-minbet'))    || CFG.MIN_BET));
            CFG.MAX_BALANCE_USAGE = Math.max(0.1,          Math.min(0.95,          parseFloat(v('cfg-balusg'))  || CFG.MAX_BALANCE_USAGE));
            saveConfig();
            overlay.remove();
            ui();
            log(`⚙️ Config: base=${fmt(CFG.BASE_BET)} mult=${CFG.MULTIPLIER} bots=${CFG.MAX_BOTS}`);
        };
    }

    // ============================================================
    // INIT — Entry point duy nhất
    // ============================================================
    async function init() {
        log('🚀 Loto Martingale v3.1.0');

        // 1. Load config (giữ qua mọi reset/reload)
        loadConfig();

        // 2. Load game state từ localStorage
        loadGameState();

        // 3. Lấy bot state để quyết định hành động
        const botState = getBotState();
        S.botState = botState;
        log(`📌 Bot state: ${botState}`);

        // 4. Lấy thông tin phòng (có thể null nếu chưa vào room)
        const d = await getRoom();
        if (d) {
            log(`✅ Phòng #${S.roomId} | Dư: ${fmt(S.bal)}`);
        } else {
            log('⚠️ Chưa vào phòng (getRoom null) — UI vẫn hoạt động bình thường');
        }

        // 5. Tạo UI
        createUI();

        // 6. Xử lý theo bot state
        switch (botState) {
            case BOT.RUNNING:
                // Bot đang chạy trước khi reload → tự resume, không hỏi user
                log('↩️ Auto-resume sau safeReload...');
                S.running   = true;
                S.startTime = S.startTime || Date.now();
                S.action    = '↩️ Đang tiếp tục...';
                if (iv) clearInterval(iv);
                iv = setInterval(loop, CFG.POLL_INTERVAL);
                loop();
                break;

            case BOT.PAUSED:
                // User đã nhấn Dừng trước đó → không tự chạy, chờ user
                log('⏸️ Đang tạm dừng — chờ Tiếp Tục hoặc Bắt Đầu Mới');
                S.running = false;
                S.action  = '⏸ Đã dừng — nhấn Tiếp Tục';
                break;

            case BOT.FRESH:
            default:
                // Lần đầu hoặc sau reset → chờ user setup và nhấn Bắt Đầu
                log('⏳ Trạng thái mới — chờ nhấn Bắt Đầu');
                S.running = false;
                S.action  = '⏳ Chờ nhấn Bắt Đầu';
                break;
        }

        ui();
    }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init);
    else
        init();

    log('📜 Loaded! v3.1.0');
})();
