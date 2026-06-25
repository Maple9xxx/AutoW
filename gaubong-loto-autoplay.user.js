// ==UserScript==
// @name         GauBong Loto Auto-Play - Martingale 🎰
// @namespace    http://tampermonkey.net/
// @version      2.1.1
// @description  Tự động chơi Lô Tô Gaubong.us. Chiến thuật gấp thếp vừa phải dựa trên payout ratio. Luôn có lãi khi thắng.
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
        // Loại game: 1=50 số, 2=90 số
        GAME_TYPE: 1,

        // === CHIẾN THUẬT GẤP THẾP ===
        // Tiền cược cơ bản (ván đầu tiên sau khi thắng)
        BASE_BET: 10_000_000,           // 10 triệu xu

        // Hệ số nhân khi thua - công thức: X = P/(P-1) với P = số người chơi
        // Với 5 bot + bạn = 6 người: X = 6/5 = 1.2
        // Đây là multiplier tối ưu: lợi nhuận LUÔN = BASE_BET * (P-1) bất kể streak
        // Ví dụ: BASE_BET=10M, P=6 → lãi luôn = 10M*5 = 50M mỗi khi thắng
        MULTIPLIER: 1.2,

        // Giới hạn trên của vé (tránh bet quá lớn)
        MAX_BET: 200_000_000,           // 200 triệu

        // Giới hạn dưới của vé
        MIN_BET: 1_000_000,             // 1 triệu

        // === BOT ===
        MAX_BOTS: 5,

        // === AUTO ===
        DELAY: 1500,                    // ms chờ giữa các thao tác
        POLL_INTERVAL: 3000,            // ms kiểm tra game
        AUTO_RESTART: true,
        NOTIFY: true,

        // === AN TOÀN ===
        MAX_BALANCE_USAGE: 0.75,        // chỉ dùng tối đa 75% số dư cho gấp thếp
    };

    // ============================================================
    // STATE
    // ============================================================
    const S = {
        running: false,
        roomId: null,
        status: -1,
        stuckTicks: 0,      // dem so tick ko doi trang thai
        _lastStatus: -2,    // status lan truoc de so sanh
        _lastStatusTime: 0,
        bal: 0,
        initBal: 0,
        bet: CFG.BASE_BET,
        bots: 0,
        round: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        profit: 0,
        busy: false,
        ended: false,
        processedRound: 0,  // 0=chua xu ly, 1=dang choi, 2=da xu ly ket qua
        forceIdle: false,   // dang o trang thai reset, cho tick moi
        domStatus: -1,      // trang thai tu DOM
        action: '',
        startTime: null,
        betHistory: [],       // lưu các bet trong chuỗi thua
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

    function fmt(n) { return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function csrf() {
        const m = document.cookie.match(/(?:^|;\s*)csrf_cookie_name=([^;]*)/);
        return m ? m[1] : '';
    }

    // ============================================================
    // DOM READER - Doc tinh huong tu giao dien (tranh bi kep)
    // ============================================================
    function readGameDOM() {
        const r = { startBtn: false, stopBtn: false, hasResult: false, hasCountdown: false, status: -1 };
        try {
            // Dùng text gốc, ko lowercase vì mất dấu tiếng Việt
            const txt = document.body.textContent;
            for (const b of document.querySelectorAll('button')) {
                const t = b.textContent.trim();
                // Kiểm tra cả có dấu và ko dấu
                if (t.includes('Bắt đầu') || t.includes('Bat dau') || t === 'Start' || t.includes('Chơi') || t.includes('New Game') || t.includes('NEW GAME'))
                    r.startBtn = true;
                if (t.includes('Dừng') || t.includes('Dung') || t === 'Stop' || t.includes('Kết thúc') || t.includes('Ket thuc') || t.includes('Tiếp tục') || t.includes('Tiep tuc'))
                    r.stopBtn = true;
            }
            // Text từ body - kiểm tra nhiều pattern
            const tl = txt.toLowerCase();
            if (txt.includes('Kết quả') || txt.includes('Ket qua') || tl.includes('result') || tl.includes('kq') || txt.includes('KẾT QUẢ'))
                r.hasResult = true;
            if (txt.includes('Đang quay') || txt.includes('Dang quay') || tl.includes('spinning') || txt.includes('Đang xổ') || txt.includes('Dang xo'))
                r.hasCountdown = true;
            if (r.hasResult) r.status = 2;
            else if (r.hasCountdown || r.stopBtn) r.status = 1;
            else if (r.startBtn) r.status = 0;
            // Debug log
            if (r.status >= 0) console.log('[Loto DOM] status=' + r.status + ' start=' + r.startBtn + ' stop=' + r.stopBtn + ' result=' + r.hasResult);
        } catch(e) {}
        return r;
    }

    // ============================================================
    // API
    // ============================================================
    async function api(endpoint, method = 'POST', data = {}) {
        const url = location.origin + endpoint;
        const body = Object.entries(data).map(([k, v]) =>
            encodeURIComponent(k) + '=' + encodeURIComponent(v)
        ).join('&');
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
            if (m) S.roomId = m[1];
            else {
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
        S.bots = d.playerCountBot ?? 0;
        // KHONG set S.ended o day - de loop handler decide
        // Neu set som, loop se bo qua handleResult vi !S.ended = false
        return d;
    }

    // ============================================================
    // CHIẾN THUẬT GẤP THẾP (tính toán dựa trên payout)
    // ============================================================
    function calcBet() {
        // Số người chơi hiện tại
        const players = (S.bots || 5) + 1;  // bots + mình
        const payoutRatio = players;          // payout = players × bet

        // Bet hiện tại dựa trên streak
        let bet = CFG.BASE_BET * Math.pow(CFG.MULTIPLIER, S.streak);
        bet = Math.round(bet);
        bet = Math.min(bet, CFG.MAX_BET);
        bet = Math.max(bet, CFG.MIN_BET);

        // Kiểm tra ngân sách: tổng tất cả bet trong chuỗi này
        let totalNeeded = 0;
        for (let i = 0; i <= S.streak; i++) {
            totalNeeded += CFG.BASE_BET * Math.pow(CFG.MULTIPLIER, i);
        }
        totalNeeded = Math.round(totalNeeded);

        const maxSpend = S.bal * CFG.MAX_BALANCE_USAGE;

        if (totalNeeded > maxSpend) {
            // Không đủ tiền cho bet tiếp theo → reset streak
            log(`⚠️ Hết ngân sách cho chuỗi ${S.streak + 1} (cần ${fmt(totalNeeded)}, chỉ còn ${fmt(maxSpend)})`);
            log(`🔄 RESET chuỗi thua về 0`);
            S.streak = 0;
            bet = CFG.BASE_BET;
            bet = Math.min(bet, CFG.MAX_BET);
            bet = Math.max(bet, CFG.MIN_BET);
        }

        S.bet = bet;

        // Tính lợi nhuận kỳ vọng
        const winAmount = payoutRatio * bet;
        const totalLossThisStreak = totalNeeded - bet; // tổng thua trước bet này
        const netProfit = winAmount - bet - totalLossThisStreak;

        log(`📐 Bet: ${fmt(bet)} | Streak: ${S.streak} | Players: ${players} | Payout: ${payoutRatio}:1`);
        log(`   Nếu win: +${fmt(winAmount)} - ${fmt(bet)} vé - ${fmt(totalLossThisStreak)} streak`);
        log(`   Lãi ròng: ${fmt(netProfit)}`);

        return { bet, players, payoutRatio, totalNeeded, netProfit, winAmount };
    }

    // ============================================================
    // UI ACTIONS - Click nút trên trang
    // ============================================================
    function clickText(text) {
        for (const b of document.querySelectorAll('button')) {
            if (b.textContent.trim() === text && !b.disabled) {
                b.click();
                log(`🖱️ "${text}"`);
                return true;
            }
        }
        return false;
    }

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
            if (added >= CFG.MAX_BOTS) break;
            if (!S.roomId) break;
            const r = await api('/api/game/loto/muave/add_bot', 'POST', { id: S.roomId });
            if (r?.success) {
                added++;
                log(`  ✅ Bot ${added}/${CFG.MAX_BOTS}`);
                await sleep(500);
                continue;
            }
            // Maybe already have enough bots, refresh to check
            const d = await getRoom();
            if (d) added = d.playerCountBot || added;
            if (added >= CFG.MAX_BOTS) break;
            log(`  ⚠️ add_bot API fail, thử lại...`);
            await sleep(1000);
        }
        S.bots = added;
        log(`🤖 Bot: ${added}/${CFG.MAX_BOTS}`);
        return added;
    }

    async function configureGame() {
        log('⚙️ Cấu hình game...');
        if (S.roomId) {
            const r = await api('/api/game/loto/setting', 'POST', {
                id: S.roomId, type: CFG.GAME_TYPE, cuoc: S.bet
            });
            if (r?.success) log('✅ Đã lưu cấu hình (API)');
            else log('⚠️ Setting API không phản hồi');
        }
    }

    async function buyTicket() {
        if (!S.roomId) return false;
        log('🎫 Mua vé...');
        const r = await api('/api/game/loto/muave', 'POST', { id: S.roomId });
        if (r?.success) {
            log('✅ Đã mua vé + bắt đầu game!');
            return true;
        }
        // If game already started, that's OK
        if (r === null) {
            log('⚠️ Mua vé API không phản hồi (có thể game đã bắt đầu)');
            return false;
        }
        log('⚠️ Mua vé không thành công');
        return false;
    }

    async function startGame() {
        const info = calcBet();
        log(`▶️ Bắt đầu #${S.round+1}... vé ${fmt(S.bet)} | dư ${fmt(S.bal)}`);

        if (!S.roomId) { log('❌ No room ID'); return false; }

        // Bước 1: Mua vé (muave) - API này vừa mua vé vừa tự động bắt đầu game
        log('🎫 Mua vé...');
        const r = await api('/api/game/loto/muave', 'POST', { id: S.roomId });
        if (r?.success) {
            S.round++;
            S.ended = false;
            log(`✅ Game #${S.round} START! (muave: mua vé + bắt đầu)`);
            ntf('🎮 Game #' + S.round, `Vé: ${fmt(S.bet)} | Lãi: +${fmt(info.netProfit)}`);
            return true;
        }

        // Bước 2: Nếu muave thất bại (có thể do game đã bắt đầu từ trước)
        // Kiểm tra trạng thái phòng
        const tmpId = S.roomId;
        const d = await api('/api/game/loto/room?id=' + tmpId, 'GET');
        if (d?.room?.status === 1) {
            S.round++;
            S.ended = false;
            log(`✅ Game #${S.round} da bat dau tu truoc`);
            return true;
        }

        // Bước 3: Thử start API
        log('⚠️ Muave khong mua duoc vé, thu start API...');
        const r2 = await api('/api/game/loto/start', 'POST', {
            id: S.roomId, type: CFG.GAME_TYPE, cuoc: S.bet
        });
        if (r2?.success) {
            S.round++;
            S.ended = false;
            log(`✅ Game #${S.round} START! (start API)`);
            ntf('🎮 Game #' + S.round, `Vé: ${fmt(S.bet)} | Lãi: +${fmt(info.netProfit)}`);
            return true;
        }

        // Bước 4: Thêm bot và thử lại
        log('⚠️ Start that bai, them bot va thu lai...');
        await addBots();
        await sleep(1000);
        const r3 = await api('/api/game/loto/muave', 'POST', { id: S.roomId });
        if (r3?.success) {
            S.round++;
            S.ended = false;
            log(`✅ Game #${S.round} START! (sau khi them bot)`);
            ntf('🎮 Game #' + S.round, `Vé: ${fmt(S.bet)} | Lãi: +${fmt(info.netProfit)}`);
            return true;
        }

        log('❌ Start that bai hoan toan');
        return false;
    }

    async function continueGame() {
        log('🔄 Reset phòng...');
        if (!S.roomId) {
            // Thu lay roomId tu DOM/URL
            const m = location.href.match(/room\?id=(\d+)/);
            if (m) S.roomId = m[1];
            else {
                const link = document.querySelector('a[href*="/game/loto/room?id="]');
                if (link) {
                    const m2 = link.href.match(/room\?id=(\d+)/);
                    if (m2) S.roomId = m2[1];
                }
            }
            if (!S.roomId) return false;
        }
        const r = await api('/api/game/loto/reset', 'POST', { id: S.roomId });
        if (r?.success) {
            log('✅ Đã reset phòng');
            S.status = 0;
            S.ended = false;
            S.forceIdle = true;
            await sleep(500);
            return true;
        }
        log('⚠️ Reset API fail, thử click nút "Tiếp tục"...');
        const ok = await clickContains('Tiếp tục');
        if (ok) {
            S.status = 0;
            S.ended = false;
            S.forceIdle = true;
            await sleep(2000);
            return true;
        }
        // Reset bang tay
        S.status = 0;
        S.ended = false;
        S.forceIdle = true;
        return false;
    }

    // ============================================================
    // KẾT QUẢ
    // ============================================================
    async function handleResult(d) {
        const kq = d.ketquas;
        if (!kq?.userWin) return false;

        const winners = Array.isArray(kq.userWin) ? kq.userWin : [kq.userWin];
        const prize = parseInt(kq.coinUserWin) || 0;
        const myId = d.meta?.user?.id;
        const won = winners.some(w => w.userId == myId);

        const players = (S.bots || 5) + 1;

        log(`🏁 GAME #${S.round}`);
        log(`  👑 ${winners.map(w => w.account).join(', ')} thắng`);
        log(`  💰 Giải: ${fmt(prize)} | Bet: ${fmt(S.bet)}`);

        if (won) {
            S.wins++;
            const net = prize - S.bet;
            S.profit += net;
            // Tính lại lợi nhuận chuỗi
            let totalLosses = 0;
            for (let i = 0; i < S.streak; i++) {
                totalLosses += CFG.BASE_BET * Math.pow(CFG.MULTIPLIER, i);
            }
            const streakNet = prize - S.bet - Math.round(totalLosses);
            S.streak = 0;
            log(`  🎉 BẠN THẮNG! +${fmt(net)} (lãi chuỗi: +${fmt(streakNet)})`);
            log(`  📊 Streak reset → 0, bet về ${fmt(CFG.BASE_BET)}`);
            ntf('🏆 THẮNG!', `+${fmt(net)} | Chuỗi: +${fmt(streakNet)}`);
        } else {
            S.losses++;
            S.streak++;
            S.profit -= S.bet;
            log(`  😔 Thua -${fmt(S.bet)} (streak: ${S.streak})`);
            const nextBet = CFG.BASE_BET * Math.pow(CFG.MULTIPLIER, S.streak);
            log(`  🎯 Bet tiếp: ${fmt(nextBet)}`);
            ntf('😔 Thua', `-${fmt(S.bet)} | Streak: ${S.streak}`);
        }

        await getRoom();

        // In tổng kết
        log(`📊 T:${S.wins}/${S.round} | Lợi nhuận: ${fmt(S.profit)} | Dư: ${fmt(S.bal)}`);

        // Vẽ mini chart
        const winRate = S.round > 0 ? (S.wins / S.round * 100).toFixed(1) : '-';
        log(`📈 Tỉ lệ thắng: ${winRate}%`);

        S.processedRound = 2;
        S.ended = true;
        return true;
    }

    // ============================================================
    // MAIN LOOP
    // ============================================================
    async function loop() {
        if (S.busy) return;
        S.busy = true;

        try {
            // 1. Doc API (bo qua DOM vi Vue ko refresh)
            const d = await getRoom();
            if (!d) {
                S.action = '⏳ Chờ phòng...';
                await sleep(CFG.POLL_INTERVAL);
                return;
            }
            ui();

            // 2. Dem tick de phat hien ket (neu qua 7 tick ~20s thi reload)
            S._tickCount = (S._tickCount || 0) + 1;
            if (S._tickCount > 7) {
                log('⚠️ Qua 7 tick, reload de dong bo Vue...');
                try { GM_setValue('loto_session', JSON.stringify({streak: S.streak, profit: S.profit, wins: S.wins, losses: S.losses, round: S.round, bet: S.bet, initBal: S.initBal})); } catch(e) {}
                location.reload();
                return;
            }

            // === STATUS 2: Game ended ===
            if (S.status === 2) {
                S.action = '🏁 Kết thúc';

                if (S.processedRound !== 2 && d.ketquas?.userWin) {
                    const res = await handleResult(d);
                    if (res && CFG.AUTO_RESTART) {
                        await continueGame();
                        S.processedRound = 2;
                        try { GM_setValue('loto_session', JSON.stringify({streak: S.streak, profit: S.profit, wins: S.wins, losses: S.losses, round: S.round, bet: S.bet, initBal: S.initBal})); } catch(e) {}
                        log('🔄 Reload page...');
                        location.reload();
                    }
                } else {
                    // Chua co ket qua, cho tick sau
                    S.action = '🏁 Đợi kết quả...';
                }
                return;
            }

            // === STATUS 1: Playing ===
            if (S.status === 1) {
                S.action = '🎮 Theo dõi...';

                if (d.ketquas?.userWin && S.processedRound !== 2) {
                    const res = await handleResult(d);
                    if (res && CFG.AUTO_RESTART) {
                        await continueGame();
                        S.processedRound = 2;
                        try { GM_setValue('loto_session', JSON.stringify({streak: S.streak, profit: S.profit, wins: S.wins, losses: S.losses, round: S.round, bet: S.bet, initBal: S.initBal})); } catch(e) {}
                        log('🔄 Reload page...');
                        location.reload();
                    }
                    return;
                }
                const kq = d.ketquas;
                if (kq) {
                    const drawn = kq.data?.length || 0;
                    S.action = `🎯 ${drawn} số`;
                }
                return;
            }

            // === STATUS 0: Idle ===
            if (S.status === 0) {
                S.action = '⏸ Phòng trống';
                S.processedRound = 0;

                const uid = d.meta?.user?.id;
                const hasTicket = d.playerInfo && d.playerInfo[String(uid)];

                if (!hasTicket) {
                    S.action = '🎫 Chuẩn bị...';
                    calcBet();
                    await configureGame();
                    await sleep(CFG.DELAY);
                    await addBots();
                    await sleep(CFG.DELAY);
                    if (!await startGame()) {
                        log('⚠️ Start that bai, tick sau thu lai');
                    } else {
                        S._tickCount = 0;
                    }
                } else {
                    S.action = '🤖 Thêm bot...';
                    if (d.playerCountBot < CFG.MAX_BOTS) {
                        await addBots();
                        await sleep(CFG.DELAY);
                    }
                    if (!await startGame()) {
                        log('⚠️ Start that bai, tick sau thu lai');
                    } else {
                        S._tickCount = 0;
                    }
                }
                return;
            }

            S.action = `⚠️ Lạ: ${S.status}`;

        } catch (e) {
            log('❌', e.message);
            S.action = '❌ ' + e.message;
        } finally {
            S.busy = false;
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
<div style="display:flex;justify-content:space-between;align-items:center;
margin-bottom:10px;border-bottom:1px solid #e94560;padding-bottom:8px;">
<div style="font-weight:bold;font-size:15px;color:#e94560;">🎰 Loto Martingale
<button id="lt-config-btn" title="Cài đặt" style="background:transparent;color:#888;border:none;cursor:pointer;font-size:16px;margin-left:4px;">⚙️</button>
</div>
<div>
<button id="lt-toggle" style="background:#4CAF50;color:#fff;border:none;
padding:5px 14px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">▶ CHẠY</button>
<button id="lt-close" style="background:transparent;color:#999;border:1px solid #555;
padding:5px 8px;border-radius:6px;cursor:pointer;margin-left:4px;font-size:12px;">✕</button>
</div></div>
<table style="width:100%;font-size:12px;">
<tr><td>💰 Dư</td><td id="lt-bal" style="color:#4CAF50;font-weight:bold;text-align:right;">0</td></tr>
<tr><td>🎫 Bet</td><td id="lt-bet" style="color:#FFC107;font-weight:bold;text-align:right;">0</td></tr>
<tr><td>📈 Nhân</td><td id="lt-mul" style="text-align:right;">x${CFG.MULTIPLIER}</td></tr>
<tr><td>🏆 Lãi</td><td id="lt-profit" style="font-weight:bold;text-align:right;">0</td></tr>
<tr><td>📊 Tỉ lệ</td><td id="lt-stats" style="text-align:right;">0/0 (0%)</td></tr>
<tr><td>🔥 Streak</td><td id="lt-streak" style="color:#FF9800;font-weight:bold;text-align:right;">0</td></tr>
<tr><td>🤖 Bot</td><td id="lt-bots" style="color:#64B5F6;text-align:right;">0/5</td></tr>
<tr><td>📌</td><td id="lt-status" style="color:#FF9800;text-align:right;">Đang tải...</td></tr>
<tr><td>🔄</td><td id="lt-action" style="color:#90CAF9;font-size:11px;text-align:right;">-</td></tr>
</table>
<div style="margin-top:8px;padding-top:6px;border-top:1px solid #333;font-size:11px;color:#888;">
<span id="lt-timer">00:00</span>
<button id="lt-reset" style="background:transparent;border:1px solid #555;color:#888;
padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;float:right;">🔄 Reset</button>
</div></div>`;
        document.body.appendChild(el);
        document.getElementById('lt-toggle').onclick = toggle;
        document.getElementById('lt-close').onclick = () => el.style.display = 'none';
        document.getElementById('lt-config-btn').onclick = showConfig;
        document.getElementById('lt-reset').onclick = () => {
            S.wins = S.losses = S.round = S.profit = S.streak = 0;
            S.initBal = S.bal;
            ui();
        };
        ui();
    }


    // ============================================================
    // CONFIG UI
    // ============================================================
    function loadConfig() {
        try {
            const saved = (typeof GM_getValue === 'function' ? GM_getValue('loto_config', '{}') : '{}');
            const cfg = JSON.parse(saved);
            if (cfg.BASE_BET) CFG.BASE_BET = cfg.BASE_BET;
            if (cfg.MULTIPLIER) CFG.MULTIPLIER = cfg.MULTIPLIER;
            if (cfg.MAX_BOTS) CFG.MAX_BOTS = cfg.MAX_BOTS;
            if (cfg.GAME_TYPE) CFG.GAME_TYPE = cfg.GAME_TYPE;
            if (cfg.MAX_BET) CFG.MAX_BET = cfg.MAX_BET;
            if (cfg.MIN_BET) CFG.MIN_BET = cfg.MIN_BET;
            if (cfg.MAX_BALANCE_USAGE) CFG.MAX_BALANCE_USAGE = cfg.MAX_BALANCE_USAGE;
            log('⚙️ Đã tải cấu hình từ storage');
        } catch(e) {}
    }

    function saveConfig() {
        if (typeof GM_setValue !== 'function') return;
        const cfg = {
            BASE_BET: CFG.BASE_BET,
            MULTIPLIER: CFG.MULTIPLIER,
            MAX_BOTS: CFG.MAX_BOTS,
            GAME_TYPE: CFG.GAME_TYPE,
            MAX_BET: CFG.MAX_BET,
            MIN_BET: CFG.MIN_BET,
            MAX_BALANCE_USAGE: CFG.MAX_BALANCE_USAGE,
        };
        GM_setValue('loto_config', JSON.stringify(cfg));
        log('⚙️ Đã lưu cấu hình');
    }

    function showConfig() {
        // Remove old modal if exists
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
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid #e94560;padding-bottom:10px;">
<div style="font-size:16px;font-weight:bold;color:#e94560;">⚙️ Cài đặt</div>
<button id="lt-modal-close" style="background:transparent;color:#999;border:1px solid #555;border-radius:6px;cursor:pointer;padding:4px 10px;font-size:14px;">✕</button>
</div>
<table style="width:100%;font-size:13px;border-collapse:collapse;">
<tr><td style="padding:5px 0;">🎫 Bet cơ bản</td>
<td style="text-align:right;"><input id="cfg-basebet" type="number" value="${CFG.BASE_BET}" style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;text-align:right;font-size:13px;"></td></tr>
<tr><td style="padding:5px 0;">📈 Hệ số nhân (X)</td>
<td style="text-align:right;"><input id="cfg-multiplier" type="number" step="0.01" value="${CFG.MULTIPLIER}" style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;text-align:right;font-size:13px;"></td></tr>
<tr><td style="padding:5px 0;">🤖 Số bot tối đa</td>
<td style="text-align:right;"><input id="cfg-bots" type="number" min="0" max="5" value="${CFG.MAX_BOTS}" style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;text-align:right;font-size:13px;"></td></tr>
<tr><td style="padding:5px 0;">🔢 Loại số</td>
<td style="text-align:right;">
<select id="cfg-gametype" style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;font-size:13px;">
<option value="1" ${CFG.GAME_TYPE===1?'selected':''}>50 Số</option>
<option value="2" ${CFG.GAME_TYPE===2?'selected':''}>90 Số</option>
</select></td></tr>
<tr><td style="padding:5px 0;">💰 Giới hạn vé tối đa</td>
<td style="text-align:right;"><input id="cfg-maxbet" type="number" value="${CFG.MAX_BET}" style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;text-align:right;font-size:13px;"></td></tr>
<tr><td style="padding:5px 0;">🪙 Giới hạn vé tối thiểu</td>
<td style="text-align:right;"><input id="cfg-minbet" type="number" value="${CFG.MIN_BET}" style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;text-align:right;font-size:13px;"></td></tr>
<tr><td style="padding:5px 0;">💳 Dùng tối đa % dư</td>
<td style="text-align:right;"><input id="cfg-balusg" type="number" min="0" max="1" step="0.05" value="${CFG.MAX_BALANCE_USAGE}" style="width:130px;background:#0f0f23;border:1px solid #333;color:#fff;border-radius:4px;padding:4px 8px;text-align:right;font-size:13px;"></td></tr>
</table>
<div style="margin-top:14px;padding-top:10px;border-top:1px solid #333;font-size:12px;color:#888;">
<div>💡 X = ${CFG.MULTIPLIER} → với 6 người: lãi luôn = bet × 5</div>
<div>⚠️ X phải &lt; P/(P-1) để có lãi. P=6 → X&lt;1.2</div>
</div>
<div style="display:flex;gap:8px;margin-top:12px;">
<button id="cfg-save" style="flex:1;background:#e94560;color:#fff;border:none;border-radius:6px;padding:8px;cursor:pointer;font-weight:bold;">💾 Lưu & Đóng</button>
<button id="cfg-close" style="flex:1;background:#333;color:#888;border:1px solid #555;border-radius:6px;padding:8px;cursor:pointer;">Hủy</button>
</div>
</div>`;
        document.body.appendChild(overlay);

        document.getElementById('lt-modal-close').onclick = () => overlay.remove();
        document.getElementById('cfg-close').onclick = () => overlay.remove();

        document.getElementById('cfg-save').onclick = () => {
            const basebet = parseInt(document.getElementById('cfg-basebet').value) || CFG.BASE_BET;
            const mult = parseFloat(document.getElementById('cfg-multiplier').value) || CFG.MULTIPLIER;
            const bots = parseInt(document.getElementById('cfg-bots').value) || CFG.MAX_BOTS;
            const gametype = parseInt(document.getElementById('cfg-gametype').value) || CFG.GAME_TYPE;
            const maxbet = parseInt(document.getElementById('cfg-maxbet').value) || CFG.MAX_BET;
            const minbet = parseInt(document.getElementById('cfg-minbet').value) || CFG.MIN_BET;
            const balusg = parseFloat(document.getElementById('cfg-balusg').value) || CFG.MAX_BALANCE_USAGE;

            CFG.BASE_BET = Math.max(1000000, Math.min(1000000000, basebet));
            CFG.MULTIPLIER = Math.max(1.01, Math.min(2.0, mult));
            CFG.MAX_BOTS = Math.max(0, Math.min(5, bots));
            CFG.GAME_TYPE = gametype === 2 ? 2 : 1;
            CFG.MAX_BET = Math.max(CFG.MIN_BET, Math.min(1000000000, maxbet));
            CFG.MIN_BET = Math.max(1000000, Math.min(CFG.MAX_BET, minbet));
            CFG.MAX_BALANCE_USAGE = Math.max(0.1, Math.min(0.95, balusg));

            saveConfig();
            log(`⚙️ Cấu hình mới: base=${CFG.BASE_BET} mult=${CFG.MULTIPLIER} bots=${CFG.MAX_BOTS} type=${CFG.GAME_TYPE}`);
            overlay.remove();
            ui();
        };
    }

    function ui() {
        const $ = id => document.getElementById(id);
        if (!$('lt-bal')) return;
        $('lt-bal').textContent = fmt(S.bal);
        $('lt-bet').textContent = fmt(S.bet);
        const p = $('lt-profit');
        p.textContent = (S.profit >= 0 ? '+' : '') + fmt(Math.abs(S.profit));
        p.style.color = S.profit >= 0 ? '#4CAF50' : '#f44336';
        const wr = S.round > 0 ? (S.wins / S.round * 100).toFixed(1) + '%' : '0%';
        $('lt-stats').textContent = `${S.wins}/${S.round} (${wr})`;
        $('lt-streak').textContent = S.streak;
        $('lt-bots').textContent = `${S.bots}/5`;
        const st = {'-1':'⏳','0':'⏸','1':'🎮','2':'🏁'};
        $('lt-status').textContent = st[S.status] || '❓';
        $('lt-action').textContent = S.action;
        if (S.startTime) {
            const sec = Math.floor((Date.now() - S.startTime) / 1000);
            $('lt-timer').textContent =
                String(Math.floor(sec / 60)).padStart(2, '0') + ':' +
                String(sec % 60).padStart(2, '0');
        }
        const tb = $('lt-toggle');
        if (tb) {
            tb.textContent = S.running ? '⏸ DỪNG' : '▶ CHẠY';
            tb.style.background = S.running ? '#e94560' : '#4CAF50';
        }
    }

    // ============================================================
    // CONTROL
    // ============================================================
    let iv = null;

    function toggle() {
        S.running = !S.running;
        log(S.running ? '▶️ BẬT' : '⏸️ TẮT');
        if (S.running) {
            S.startTime = Date.now();
            iv = setInterval(loop, CFG.POLL_INTERVAL);
            loop();
            ntf('▶️ Auto-Play', 'Đã bắt đầu!');
        } else {
            if (iv) { clearInterval(iv); iv = null; }
            S.action = '⏸ Đã dừng';
            ntf('⏸️', 'Đã tạm dừng.');
        }
        ui();
    }

    // ============================================================
    // INIT
    // ============================================================
    async function init() {
        log('🚀 Loto Martingale v2.1.1');

        // Tính payout tối thiểu
        const minPayout = 6; // mình + 5 bot
        const maxMul = minPayout / (minPayout - 1);
        log(`📐 Payout tối thiểu: ${minPayout}:1`);
        log(`📐 Multiplier tối đa cho P=${minPayout}: x${maxMul.toFixed(4)}`);
        log(`📐 Multiplier đang dùng: x${CFG.MULTIPLIER} (an toàn)`);

        // Verify
        if (CFG.MULTIPLIER >= maxMul) {
            log(`⚠️ CẢNH BÁO: Multiplier ${CFG.MULTIPLIER} >= ${maxMul.toFixed(4)}`);
            log(`⚠️ Có thể không có lãi nếu thua nhiều ván!`);
            log(`ℹ️ Giảm MULTIPLIER xuống dưới ${maxMul.toFixed(4)}`);
        } else {
            log(`✅ Multiplier ${CFG.MULTIPLIER} < ${maxMul.toFixed(4)} → luôn có lãi ✓`);
        }

        // Lấy thông tin phòng
        const d = await getRoom();
        if (!d) {
            log('❌ Không vào được phòng. Đăng nhập + vào game/loto/room trước.');
            // Khoi phuc state neu co
        try {
            const saved = GM_getValue('loto_session', '{}');
            const sess = JSON.parse(saved);
        if (sess.streak !== undefined) S.streak = sess.streak;
        if (sess.profit !== undefined) S.profit = sess.profit;
        if (sess.wins !== undefined) S.wins = sess.wins;
        if (sess.losses !== undefined) S.losses = sess.losses;
        if (sess.round !== undefined) S.round = sess.round;
        if (sess.bet !== undefined) S.bet = sess.bet;
        if (sess.initBal !== undefined) S.initBal = sess.initBal;
        } catch(e) {}
        loadConfig();
        createUI();
            return;
        }

        log(`✅ Phòng #${S.roomId}`);
        log(`💰 Dư: ${fmt(S.bal)} | Bet base: ${fmt(CFG.BASE_BET)}`);

        loadConfig();
        createUI();

        // Dự tính
        log('');
        log('════════ DỰ TÍNH CHUỖI THUA ════════');
        let bal = S.bal * CFG.MAX_BALANCE_USAGE;
        log(`  Ngân sách: ${fmt(bal)} (${CFG.MAX_BALANCE_USAGE*100}% của ${fmt(S.bal)})`);
        let total = 0;
        for (let i = 0; i < 15; i++) {
            const bet = CFG.BASE_BET * Math.pow(CFG.MULTIPLIER, i);
            total += bet;
            const win = 6 * bet;
            const net = win - bet - (total - bet);
            const enough = total <= bal;
            log(`  Ván ${i+1}: bet ${fmt(bet)} | lũy kế ${fmt(total)} | win ${fmt(win)} | lãi +${fmt(net)} ${enough ? '✅' : '❌'}`);
            if (!enough && i > 3) {
                log(`  ... hết ngân sách ở ván ${i+2}`);
                log(`  => Có thể chịu ${i} ván thua liên tiếp`);
                break;
            }
        }
        log('═════════════════════════════════════');
        log('');
        log('⏳ Tự bật sau 3s...');

        setTimeout(() => { if (!S.running) toggle(); }, 3000);
        ui();
    }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', init);
    else
        init();

    log('📜 Loaded!');
})();
