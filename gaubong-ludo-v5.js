// ==UserScript==
// @name         GauBong Ludo Auto-Play PRO 🎲
// @namespace    http://tampermonkey.net/
// @version      5.0.0
// @description  Auto Ludo PRO v5. Wire aggressMode vào killBonus, recentPieces penalty in scoring, fix HS score âm.
// @author       AutoPlay Pro
// @match        https://gaubong.us/game/ludo*
// @icon         https://gaubong.us/favicon.ico
// @grant        GM_notification
// @grant        GM_log
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ================================================================
    // 📅 TIMELINE PHIÊN BẢN
    // ================================================================
    // v1.0 - 26/06 13:00 - Basic autoplay, chiến thuật đơn giản
    // v1.5 - 26/06 13:10 - Thêm capture logic, ưu tiên về đích
    // v2.0 - 26/06 13:30 - Safe zones (8 ô an toàn), threat assessment
    // v2.1 - 26/06 13:50 - Adaptive polling (1s/120ms), game end detection
    // v2.2 - 26/06 14:10 - Cân bằng quân, ưu tiên ra quân, tie-breaker adv
    // v2.2.1- 26/06 14:25 - Reload trang sau mỗi nước đi, poll 1s
    // v2.2.2- 26/06 14:45 - CHIẾN THUẬT CAO THỦ: dàn đều quân, kéo quân sau,
    //                       phạt spam 1 quân, ở yên ô an toàn khi có địch
    // v2.3.2- 26/06 15:00 - Ghi mốc time trong code
    // v3.0.0- 26/06 16:00 - BUG FIX + EXPERT UPGRADE (xem git log)
    // v4.0.0- 26/06 17:00 - BUG FIX CRITICAL + HUD v2 + EXPERT UPGRADE:
    //   🐛 FIX BUG #1: canFinish dùng d2f<=dice → OVERSHOOT HS (quân vượt đích)
    //      ROOT CAUSE: Ludo không cho đi quá đích (ko bounce). Phải d2f===dice.
    //   🐛 FIX BUG #2: location.reload() sau mỗi nước đi → loop reload vô tận
    //      + Xung đột với bonus turn detection (reload xảy ra TRƯỚC khi check bonus)
    //      FIX: Xóa reload, dùng soft-refresh (API poll tiếp theo xử lý state mới)
    //   🐛 FIX BUG #3: Bonus turn check sau reload → không bao giờ hoạt động
    //      FIX: Tích hợp bonus turn detect vào luồng chính, không reload
    //   🎯 NEW #1: "Endgame Blitz" - khi tất cả quân trong HS, bỏ delay, đi siêu nhanh
    //   🎯 NEW #2: "Auto-Next Game" - phát hiện game kết thúc, tự click Bắt Đầu lại
    //   🎯 NEW #3: HUD v2 - Draggable, Win Rate%, Streak, Last Decision Reason
    //   🎯 NEW #4: Aggression Toggle - Passive (mặc định) vs Blitz (luôn đánh)
    //   🎯 NEW #5: Stale State Guard - nếu API liên tiếp trả về cùng state → skip
    // v5.0.0- 26/06 - WIRE FIX + AI BRAIN UPGRADE:
    //   🐛 FIX #1: aggressMode toggle có nút nhưng KHÔNG wired vào killBonus
    //      FIX: Blitz mode → killBonus nhân đôi (300 → 600)
    //   🐛 FIX #2: recentPieces được track nhưng KHÔNG dùng trong scoring
    //      FIX: Phạt spam quân trực tiếp trong score loop
    //   🐛 FIX #3: HS scoring dùng score âm (depth*-10+1) → quân sắp về đích bị bỏ qua
    //      FIX: HS score = depth*safety (+10→+60), càng gần đích càng ưu tiên
    //   🎯 NEW #1: Safe landing bonus (+50) khi đáp vào ô an toàn
    //   🎯 NEW #2: Stale state guard implement thực sự (trước chỉ có comment)
    // ================================================================

    // ================================================================
    // CONSTANTS
    // ================================================================
    const PL = 52; // path length
    // Path map: coord -> index (0-51)
    const PM = {"1,7":0,"2,7":1,"3,7":2,"4,7":3,"5,7":4,"6,7":5,"7,6":6,"7,5":7,"7,4":8,"7,3":9,"7,2":10,"7,1":11,"8,1":12,"9,1":13,"9,2":14,"9,3":15,"9,4":16,"9,5":17,"9,6":18,"10,7":19,"11,7":20,"12,7":21,"13,7":22,"14,7":23,"15,7":24,"15,8":25,"15,9":26,"14,9":27,"13,9":28,"12,9":29,"11,9":30,"10,9":31,"9,10":32,"9,11":33,"9,12":34,"9,13":35,"9,14":36,"9,15":37,"8,15":38,"7,15":39,"7,14":40,"7,13":41,"7,12":42,"7,11":43,"7,10":44,"6,9":45,"5,9":46,"4,9":47,"3,9":48,"2,9":49,"1,9":50,"1,8":51};
    // Home stretch per player: 6 cells leading to center
    const HS = {1:["10,8","11,8","12,8","13,8","14,8","14,7"],2:["8,6","8,5","8,4","8,3","8,2","7,2"],3:["6,8","5,8","4,8","3,8","2,8","2,9"],4:["8,10","8,11","8,12","8,13","8,14","9,14"]};
    // Entrance position (star) on path for each player
    const EN = {1:25,2:12,3:51,4:38};
    // ================================================================
    // Ô AN TOÀN (Safe Zones) - v2.0 (26/06 13:30)
    // 8 cells on the board where pieces cannot be captured.
    // Gồm 4 ô entrance (sao) + 4 ô star ở giữa mỗi cạnh nhà.
    // Bất cứ quân nào đứng trong ô an toàn đều ko bị đá về.
    // ================================================================
    const SAFE_CELLS = [2, 12, 15, 25, 28, 38, 41, 51];
    // Index -> coord mapping for safe cells (for logging)
    const SAFE_COORDS = {2:"3,7",12:"8,1",15:"9,3",25:"15,8",28:"13,9",38:"8,15",41:"7,13",51:"1,8"};
    
    // Reverse map: coord -> index for all path cells
    const coordToIdx = {};
    for (const [c, i] of Object.entries(PM)) coordToIdx[c] = i;

    // ================================================================
    // STATE - Lưu LocalStorage liên tục
    // ================================================================
    const LS_KEY = 'gb_ludo_pro_state';
    function loadState() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) return JSON.parse(raw);
        } catch(e) {}
        return {};
    }
    function saveState() { try { localStorage.setItem(LS_KEY, JSON.stringify(ST)); } catch(e) {} }

    const ST = Object.assign({
        enabled: false,
        autoStarted: false,
        roomId: null,
        recentPieces: {},  // {pieceId: count} - theo dõi số lần dùng quân
        lastResetTime: 0,
        round: 0,
        wins: 0,
        losses: 0,
        lastResult: '',
        actionCount: 0,
        lastAction: '',
        // v4 new fields
        streak: 0,          // streak hiện tại (+win, -loss)
        bestStreak: 0,      // win streak cao nhất
        autoNextGame: true, // tự động join game tiếp theo
        aggressMode: false, // Blitz mode: luôn capture nếu có thể
        lastReason: '',     // lý do nước đi cuối
        lastStateHash: '',  // guard chống stale state loop
        staleCount: 0,      // đếm số lần state không đổi liên tiếp
    }, loadState());

    // Aliases for compatibility
    const S = ST;
    function sv() { saveState(); }
    function ld() { Object.assign(ST, loadState()); }
    
    // ================================================================
    // HELPERS
    // ================================================================
    function log(...a) { console.log(`[LudoPRO ${new Date().toLocaleTimeString('vi-VN')}]`, ...a); }
    function ntf(title, msg) { try { GM_notification({ title, text: msg, timeout: 4000 }); } catch(e) {} }

    function posFromCoord(c) { return PM[c] !== undefined ? PM[c] : -1; }
    function inHomeStretch(playerPos, coord) { return HS[String(playerPos)]?.includes(coord) || false; }
    function advancement(entrance, pos) { return pos < 0 ? -1 : (pos - entrance + PL) % PL; }
    
    // Khoảng cách từ entrance player -> pathPos -> còn lại -> HS -> finish
    function distToFinish(playerPos, pathPos, coord) {
        if (pathPos < 0) return 999;
        const hs = HS[String(playerPos)];
        if (hs && coord) {
            const hsIdx = hs.indexOf(coord);
            if (hsIdx >= 0) return 6 - hsIdx;
        }
        const adv = advancement(EN[playerPos], pathPos);
        return (PL - 1 - adv) + 6;
    }

    // Khoảng cách forward từ A đến B trên path (CCW)
    function forwardDist(fromPos, toPos) { return (toPos - fromPos + PL) % PL; }
    
    // Check if a path position is safe
    function isSafePos(pathPos) { return SAFE_CELLS.includes(pathPos); }
    
    // Check if a coord is in home stretch for a player
    function isHomeStretchPos(playerPos, coord) { 
        return HS[String(playerPos)]?.includes(coord) || false; 
    }

    // Lấy room id từ URL
    function ridU() {
        const m = location.href.match(/[?&]id=(\d+)/);
        return m ? m[1] : null;
    }

    // ================================================================
    // API HELPERS
    // ================================================================
    function csrf() {
        const m = document.cookie.match(/(?:^|;\s*)csrf_cookie_name=([^;]*)/);
        return m ? m[1] : '';
    }

    async function apiPost(path, data) {
        const body = Object.entries(data).map(([k,v]) => encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
        try {
            const r = await fetch(path, {
                method: 'POST',
                headers: {'Content-Type':'application/x-www-form-urlencoded','X-CSRF-Token': csrf()},
                body
            });
            const txt = await r.text();
            return txt.startsWith('{') ? JSON.parse(txt) : {error: txt};
        } catch(e) {
            return {error: e.message};
        }
    }

    async function apiGet(path) {
        try {
            const r = await fetch(path, {headers: {'X-CSRF-Token': csrf()}});
            const txt = await r.text();
            return txt.startsWith('{') ? JSON.parse(txt) : {error: txt};
        } catch(e) {
            return {error: e.message};
        }
    }

    // ================================================================
    // GAME STATE PARSING
    // ================================================================
    let lastRoomData = null;
    let myPos = null;
    let myUserId = null;

    function parseRoom(roomData) {
        if (!roomData) return null;
        lastRoomData = roomData;
        
        // Find my player position
        if (!myUserId && roomData.meta?.user?.id) {
            myUserId = roomData.meta.user.id;
        }
        if (!myUserId) return null;
        
        // Tìm vị trí của mình (1-4)
        let myPosition = null;
        const pi = roomData.playerInfo || {};
        for (const [pos, info] of Object.entries(pi)) {
            if (info && info.userId === myUserId) {
                myPosition = parseInt(pos);
                break;
            }
        }
        if (!myPosition) return null;
        myPos = myPosition;
        
        const myInfo = pi[String(myPosition)];
        if (!myInfo) return null;
        
        // Lấy danh sách quân của mình
        const nv = roomData.nhanvats || {};
        const myNhanvats = nv[String(myPosition)];
        const myVitri = myNhanvats?.vitri || {};
        
        // Lấy danh sách quân của đối thủ
        const opponents = {};
        for (const [pos, info] of Object.entries(pi)) {
            if (parseInt(pos) !== myPosition && info) {
                const oppNv = nv[String(pos)];
                const oppVitri = oppNv?.vitri || {};
                opponents[pos] = {
                    info,
                    vitri: oppVitri,
                    userId: info.userId,
                };
            }
        }
        
        return {
            myPosition,
            myInfo,
            myVitri,
            myNhanvats,
            opponents,
            nhanvats: nv,
            pi,
            chonnhanvat: roomData.chonnhanvat || {},
            dichuyen: roomData.dichuyen || null,
            room: roomData.room || {},
            shield: roomData.shield || {},
        };
    }

    // ================================================================
    // PHÂN TÍCH CHIẾN THUẬT
    // ================================================================

    // Lấy thông tin chi tiết về 1 quân
    function pieceInfo(myPos, pieceId, vitri) {
        const coord = vitri[String(pieceId)] || null;
        const pathPos = coord ? posFromCoord(coord) : -1;
        const hs = HS[String(myPos)];
        const inHS = hs ? hs.includes(coord) : false;
        const hsIdx = inHS ? hs.indexOf(coord) : -1;
        const adv = pathPos >= 0 ? advancement(EN[myPos], pathPos) : -1;
        const d2f = coord ? distToFinish(myPos, pathPos, coord) : 999;
        const safe = pathPos >= 0 ? isSafePos(pathPos) : false;
        const atHome = !coord;
        return {
            pieceId, coord, pathPos, inHS, hsIdx, adv, d2f, safe, atHome
        };
    }

    // Lấy tất cả quân địch trên bàn cùng pathPos
    function getEnemyPieces(parsed) {
        const enemies = [];
        for (const [opos, odata] of Object.entries(parsed.opponents)) {
            for (const [pid, coord] of Object.entries(odata.vitri)) {
                if (!coord) continue; // trong chuồng
                const pathPos = posFromCoord(coord);
                if (pathPos < 0) continue; // trong home stretch
                if (isHomeStretchPos(parseInt(opos), coord)) continue; // trong HS đối thủ
                enemies.push({
                    owner: parseInt(opos),
                    pieceId: pid,
                    coord,
                    pathPos,
                    safe: isSafePos(pathPos),
                });
            }
        }
        return enemies;
    }

    // Kiểm tra nếu đi quân p với xx=dice có capture được quân địch ko
    function canCapture(piece, dice, enemies) {
        if (piece.atHome || piece.inHS) return null;
        const newPos = (piece.pathPos + dice) % PL;
        for (const e of enemies) {
            if (e.pathPos === newPos && !e.safe) {
                return e; // capture được
            }
        }
        return null;
    }

    // Kiểm tra nếu đi quân p với xx=dice có rơi vào ô an toàn ko
    function willLandSafe(piece, dice) {
        if (piece.atHome || piece.inHS) return false;
        const newPos = (piece.pathPos + dice) % PL;
        return isSafePos(newPos);
    }

    // Tìm ô an toàn gần nhất phía trước (trong phạm vi dice bước)
    function nearestSafeForward(piece, dice) {
        if (piece.atHome || piece.inHS) return null;
        const results = [];
        for (const safePos of SAFE_CELLS) {
            const dist = forwardDist(piece.pathPos, safePos);
            if (dist > 0 && dist <= dice) {
                results.push({ safePos, dist });
            }
        }
        results.sort((a, b) => a.dist - b.dist);
        return results.length > 0 ? results[0] : null;
    }

    // Đánh giá nguy hiểm SAU KHI ĐI: địch nào CÓ THỂ capture mình?
    // Mình chỉ capture địch nếu forwardDist = dice, còn địch capture mình
    // nếu forwardDist từ địch đến vị trí mới của mình = 1-6 bước
    // Quan trọng: địch capture mình từ PHÍA SAU, ko phải phía trước
    function assessPathDanger(startPos, dice, enemies) {
        if (startPos < 0) return 0;
        const newPos = (startPos + dice) % PL;
        let dangerCount = 0;
        for (const e of enemies) {
            if (e.safe) continue; // Địch ở ô an toàn ko capture được
            // Khoảng cách từ địch đến vị trí mới
            const distFromEnemy = forwardDist(e.pathPos, newPos);
            if (distFromEnemy >= 1 && distFromEnemy <= 6) {
                // Địch ở phía SAU, có thể roll đúng số và capture mình
                dangerCount++;
            }
        }
        return dangerCount;
    }

    // Đánh giá mức độ nguy hiểm: có quân địch nào có thể capture quân này ko?
    // (địch ở phía sau, cách 1-6 bước)
    function threatAssessment(piece, enemies, myTurnOrder) {
        if (piece.atHome || piece.inHS || piece.safe) return 0;
        let maxThreat = 0;
        for (const e of enemies) {
            if (e.safe) continue; // quân địch ở ô an toàn ko capture được
            // Khoảng cách từ địch đến quân mình: forwardDist(e, p)
            const dist = forwardDist(e.pathPos, piece.pathPos);
            if (dist >= 1 && dist <= 6) {
                // Địch có thể capture mình nếu ra đúng số
                // Mức nguy hiểm càng cao nếu khoảng cách nhỏ
                const threat = (7 - dist); // 6->1, 1->6
                maxThreat = Math.max(maxThreat, threat);
            }
        }
        return maxThreat;
    }

    // ================================================================
    // CHỌN QUÂN - GitHub AI Bot Algorithm (Adapted for GauBong Ludo)
    // ================================================================
    // Source: github.com/suhasasumukh/AI-Ludo-Game → class Bot → pickToken()
    //
    // MAPPING (GitHub → GauBong):
    //   steps === -1         → pi.atHome === true       (quân trong chuồng)
    //   steps 0-51           → pi.pathPos 0-51          (quân trên đường chính)
    //   steps > 52           → pi.inHS === true          (quân trong Home Stretch)
    //   tokensInRange(t)     → forwardDist(e.pathPos, pi.pathPos) ∈ [1,6]
    //   checkKill(t)         → canCapture(pi, dice, enemies)
    //   hasTokensHome()      → Object.values(vitri).some(c => !c)
    //   stepsWalked          → tổng advancement các quân địch (proxy)
    //   sq6 / sq19 / sq32 / sq45 → EN[oppPos] (entrance star của từng màu)
    //
    // LOẠI TRỪ: block-với-2-quân-cạnh-nhau (mini game không cho phép)
    // THÊM: canFinish override (gaubong.us yêu cầu d2f === dice, không bounce)
    // ================================================================
    function chonQuanPro(pieces, myPos, dice, parsed) {
        if (!pieces || pieces.length === 0) return null;

        const vitri = parsed.myVitri || {};
        const enemies = getEnemyPieces(parsed);
        const opponents = parsed.opponents;

        // ── GitHub Bot constants ──────────────────────────────────────
        const safety = 10;
        // [v5 FIX #1] aggressMode WIRED: Blitz → killBonus x2 (300 → 600)
        const killBonus = ST.aggressMode ? 600 : 300;
        const baseDistanceBonus = safety * 10; // 100

        const hasTokensHome = Object.values(vitri).some(coord => !coord);

        // [v5] recentPieces: dùng để phạt spam cùng 1 quân
        if (!ST.recentPieces) ST.recentPieces = {};
        const recentPieces = ST.recentPieces;

        const info = pieces.map(p => pieceInfo(myPos, p, vitri));

        log(`[GH AI v5] xx=${dice} | ${info.length} quân | aggress=${ST.aggressMode} killBonus=${killBonus}`);
        for (const i of info) {
            log(`   Q${i.pieceId}: path=${i.pathPos} adv=${i.adv} inHS=${i.inHS} d2f=${i.d2f} safe=${i.safe} used=${recentPieces[String(i.pieceId)]||0}`);
        }

        // ── SCORING LOOP ──────────────────────────────────────────────
        let scored = info.map(pi => {
            let score = 0;
            const reasons = [];

            const sqSixBonus = pi.pathPos >= 0 ? (pi.pathPos * safety / 10) : 0;

            // ── OVERRIDE: Về đích ─────────────────────────────────────
            const canFinish = !pi.atHome && pi.d2f === dice;
            if (canFinish) {
                score = 10000;
                reasons.push('🏁 VỀ ĐÍCH! (x10000)');
                return { ...pi, score, reasons };
            }

            // ── STEP 1: Thoát hiểm (trước di chuyển) ─────────────────
            // Địch phía sau 1-6 bước → di chuyển = thoát nguy
            if (!pi.atHome && !pi.inHS && !pi.safe) {
                for (const e of enemies) {
                    if (e.safe) continue;
                    const dist = forwardDist(e.pathPos, pi.pathPos);
                    if (dist >= 1 && dist <= 6) {
                        const bonus = baseDistanceBonus + (7 - dist) * safety;
                        score += bonus;
                        reasons.push(`🚨 thoát dist=${dist}(+${bonus})`);
                    }
                }
            }

            // ── STEP 2: Nhường entrance ────────────────────────────────
            if (!pi.atHome && !pi.inHS && pi.pathPos === EN[myPos] && hasTokensHome) {
                score += safety;
                reasons.push('↗️ nhường entrance (+10)');
            }

            // ── STEP 3: Ra quân (dice=6) ───────────────────────────────
            if (pi.atHome && dice === 6) {
                score += baseDistanceBonus * 3; // +300
                reasons.push('🏠 ra quân (+300)');
            }

            // ── STEP 4: Sắp vào Home Stretch ──────────────────────────
            if (!pi.atHome && !pi.inHS && pi.adv >= 0 && pi.adv + dice >= PL) {
                score += baseDistanceBonus;
                reasons.push('🏁 sắp vào HS (+100)');
            }

            // ── STEP 5: Trong Home Stretch ─────────────────────────────
            // [v5 FIX #3] GitHub gốc dùng score âm (depth*-10+1) → quân gần đích
            // bị ignore. Sửa: score DƯƠNG, càng sâu trong HS = càng gần đích = điểm cao hơn.
            // depth 1→6 cho score +10→+60 (thấp hơn thoát hiểm nhưng ko bị bỏ qua)
            if (pi.inHS) {
                const depth = pi.hsIdx + 1; // 1 = mới vào, 6 = sát đích
                score = depth * safety;     // +10 đến +60
                reasons.push(`🏠 HS buoc${depth} score=${score}`);
            }

            // ── STEP 6: Đứng ở cửa đối thủ (trước move) ──────────────
            if (!pi.atHome && !pi.inHS && !pi.safe && pi.pathPos >= 0) {
                for (const [opos, odata] of Object.entries(opponents)) {
                    const oppPos = parseInt(opos);
                    const oppHasHome = Object.values(odata.vitri).some(c => !c);
                    if (pi.pathPos === EN[oppPos] && oppHasHome) {
                        const pen = baseDistanceBonus + sqSixBonus;
                        score -= pen;
                        reasons.push(`⚠️ đứng cửa P${oppPos}(-${Math.round(pen)})`);
                    }
                }
            }

            // ── STEPS 7-9: Simulate move ──────────────────────────────
            if (!pi.atHome && !pi.inHS && pi.pathPos >= 0) {
                const newPathPos = (pi.pathPos + dice) % PL;

                // STEP 7: Capture
                const captureTarget = canCapture(pi, dice, enemies);
                if (captureTarget) {
                    const oppPos = captureTarget.owner;
                    const oppData = opponents[String(oppPos)];
                    let victimTotalAdv = 0;
                    if (oppData) {
                        for (const coord of Object.values(oppData.vitri)) {
                            if (coord) {
                                const pp = posFromCoord(coord);
                                if (pp >= 0) victimTotalAdv += advancement(EN[oppPos], pp);
                            }
                        }
                    }
                    const capBonus = killBonus + victimTotalAdv / 10 + captureTarget.pathPos / 10 + 4;
                    score += capBonus;
                    // [v5] aggressMode: log rõ ràng hơn
                    reasons.push(`⚔️ capture P${oppPos}(+${Math.round(capBonus)})${ST.aggressMode?' 🔥BLITZ':''}`);
                }

                // STEP 8: Đi vào cửa đối thủ (sau move)
                if (!isSafePos(newPathPos)) {
                    for (const [opos, odata] of Object.entries(opponents)) {
                        const oppPos = parseInt(opos);
                        const oppHasHome = Object.values(odata.vitri).some(c => !c);
                        if (newPathPos === EN[oppPos] && oppHasHome) {
                            const pen = baseDistanceBonus + sqSixBonus;
                            score -= pen;
                            reasons.push(`⚠️ đi vào cửa P${oppPos}(-${Math.round(pen)})`);
                        }
                    }
                }

                // STEP 9: Địch rình vị trí mới (sau move)
                if (!isSafePos(newPathPos)) {
                    for (const e of enemies) {
                        if (e.safe) continue;
                        const dist = forwardDist(e.pathPos, newPathPos);
                        if (dist >= 1 && dist <= 6) {
                            const pen = baseDistanceBonus + (7 - dist) * safety;
                            score -= pen;
                            reasons.push(`👁️ địch rình mới dist=${dist}(-${pen})`);
                        }
                    }
                }

                // [v5 NEW] BONUS: đáp vào ô an toàn
                if (isSafePos(newPathPos) && !pi.safe) {
                    score += safety * 5; // +50
                    reasons.push('🛡️ đáp safe (+50)');
                }
            }

            // ── [v5 FIX #2] recentPieces penalty WIRED vào score ──────
            // Phạt nếu dùng quân này quá nhiều lần gần đây (> 3 lần)
            const usageCount = recentPieces[String(pi.pieceId)] || 0;
            if (usageCount > 3) {
                const spamPen = (usageCount - 3) * safety * 2; // -20 mỗi lần vượt 3
                score -= spamPen;
                reasons.push(`📊 spam -${spamPen}(dung ${usageCount}x)`);
            }

            return { ...pi, score, reasons };
        });

        // ── SORT: score cao nhất → ưu tiên ─────────────────────────────
        // Tie-breaker: quân tiến xa hơn được ưu tiên
        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (!a.atHome && !b.atHome) return (b.adv || 0) - (a.adv || 0);
            if (a.atHome) return 1;
            if (b.atHome) return -1;
            return 0;
        });

        const best = scored[0];

        // ── Cập nhật recentPieces + decay ─────────────────────────────
        recentPieces[String(best.pieceId)] = (recentPieces[String(best.pieceId)] || 0) + 1;
        if (recentPieces[String(best.pieceId)] > 8) {
            for (const k of Object.keys(recentPieces)) {
                recentPieces[k] = Math.max(0, recentPieces[k] - 1);
            }
        }
        sv();

        log(`[GH AI v5] → Q${best.pieceId} score=${best.score} | ${best.reasons.slice(0,3).join(' | ')}`);
        ST.lastReason = `[v5] ${best.reasons.slice(0,2).join(' | ')}`;
        return best.pieceId;
    }


    // ================================================================
    // GAME LOOP
    // ================================================================
    let loop = null;
    let busy = false;
    let tickCount = 0;
    let lastTickTime = 0;
    let lastStatus = -1;  // 0=waiting, 1=playing, 2=ended
    let lastMyTurn = false;
    
    // ================================================================
    // ⏱ THỜI GIAN CHỜ GIỮA CÁC HÀNH ĐỘNG (v2.3 - 26/06 15:00)
    // ================================================================
    // Mô phỏng người chơi thật: có độ trễ tự nhiên giữa roll, chọn quân, move
    // Mỗi bước đều có random variance để ko bị phát hiện là bot
    const TIMING = {
        // Sau khi phát hiện lượt → bắt đầu roll (giây)
        ROLL_DELAY_MIN: 0.5,
        ROLL_DELAY_MAX: 1.2,
        
        // Sau khi roll xong → chọn quân và di chuyển (giây)
        MOVE_DELAY_MIN: 0.5,
        MOVE_DELAY_MAX: 1.2,
        
        // Sau khi di chuyển xong → reload (giây)
        RELOAD_DELAY: 1.0,
        
        // Poll interval (giây)
        POLL_INTERVAL: 1.0,
        
        // Roll variance: thêm nhiễu để ko bị same time mỗi lần
        VARIANCE: 0.3,
    };
    
    // Hàm tạo delay ngẫu nhiên trong khoảng [min, max]
    function humanDelay(min, max) {
        const ms = (min + Math.random() * (max - min)) * 1000;
        return Math.round(ms);
    }
    
    // Hàm tạo delay với variance
    function humanDelayVariance(base) {
        const v = base + (Math.random() * 2 - 1) * TIMING.VARIANCE;
        return Math.round(Math.max(0.3, v) * 1000);
    }
    
    // TICK_MS giờ dùng TIMING.POLL_INTERVAL thay thế
    const TICK_MS = 1000;

    // Biến theo dõi game end (v2.1 - 26/06 13:50)
    // Fix: kiểm tra game end ở cả đầu và cuối tick
    let gameEndedAt = 0;

    async function tick() {
        if (!ST.enabled || busy) return;
        if (!ridU()) return;
        
        // Kiểm tra game kết thúc trước khi làm gì khác
        const roomId_ = ridU();
        if (roomId_) {
            try {
                const checkData = await apiGet('/api/game/ludo/room?id=' + roomId_);
                if (checkData && !checkData.error) {
                    const parsedCheck = parseRoom(checkData);
                    if (parsedCheck) {
                        // Check win
                        if (parsedCheck.myInfo?.win === 1) {
                            if (Date.now() - gameEndedAt > 5000) {
                                ST.wins++;
                                ST.streak = Math.max(0, ST.streak) + 1;
                                if (ST.streak > ST.bestStreak) ST.bestStreak = ST.streak;
                                ST.lastResult = `🏆 THẮNG! (streak ${ST.streak})`;
                                ST.round++;
                                log('🏆🏆🏆 THẮNG!');
                                ntf('Ludo Pro', `🏆 Thắng! Streak: ${ST.streak}`);
                                sv(); ui();
                                gameEndedAt = Date.now();
                                // [v4] Auto-next game
                                if (ST.autoNextGame) {
                                    log('🔄 Auto-next: chờ 3s rồi bắt đầu ván mới...');
                                    setTimeout(() => autoNextGame(), 3000);
                                }
                            }
                            return; // Game đã kết thúc, ko làm gì thêm
                        }
                        // Check game over (người khác thắng)
                        if (checkData.room?.status === 2 || 
                            (parsedCheck.myInfo && parsedCheck.myInfo.win === 0 && 
                             Object.values(parsedCheck.pi||{}).some(v => v && v.win === 1))) {
                            if (Date.now() - gameEndedAt > 5000) {
                                ST.losses++;
                                ST.streak = Math.min(0, ST.streak) - 1;
                                ST.lastResult = '💀 THUA';
                                ST.round++;
                                log('💀 Thua');
                                ntf('Ludo Pro', '💀 Thua');
                                sv(); ui();
                                gameEndedAt = Date.now();
                                if (ST.autoNextGame) {
                                    log('🔄 Auto-next: chờ 3s rồi bắt đầu ván mới...');
                                    setTimeout(() => autoNextGame(), 3000);
                                }
                            }
                            return;
                        }
                    }
                }
            } catch(e) {}
        }
        
        const now = Date.now();
        if (now - lastTickTime < TICK_MS) return;
        lastTickTime = now;
        tickCount++;

        try {
            const roomId = ridU();
            if (!roomId) return;

            // Lấy room data
            const data = await apiGet(`/api/game/ludo/room?id=${roomId}`);
            if (data.error) return;

            const parsed = parseRoom(data);
            if (!parsed) return;

            // [v5] Stale state guard — đúng chỗ: sau khi parsed có dữ liệu
            const stateHash = `${roomId}_${parsed.myInfo?.luotdanh}_${parsed.myInfo?.xucxac}_${JSON.stringify(parsed.chonnhanvat?.[String(parsed.myPosition)]||[])}`;
            if (stateHash === ST.lastStateHash) {
                ST.staleCount = (ST.staleCount || 0) + 1;
                if (ST.staleCount >= 3) {
                    log(`⏩ Stale x${ST.staleCount}, skip`);
                    busy = false;
                    return;
                }
            } else {
                ST.lastStateHash = stateHash;
                ST.staleCount = 0;
            }

            // Kiểm tra lượt của mình
            if (!parsed.myInfo?.luotdanh) return; // chưa đến lượt

            // CHƠI NGAY LẬP TỨC - không đợi timer
            // Timer không quan trọng, auto-play ngay khi tới lượt

            // === BẮT ĐẦU LƯỢT ===
            busy = true;
            const myPos = parsed.myPosition;
            
            // Đã có xúc xắc chưa?
            let dice = parsed.myInfo.xucxac;
            let hasRolled = dice > 0;
            
            // Bước 1: Nếu chưa có xx -> quay xúc xắc
            if (!hasRolled) {
                // ⏱ Chờ tự nhiên trước khi roll (giống người chơi suy nghĩ)
                await delay(humanDelay(TIMING.ROLL_DELAY_MIN, TIMING.ROLL_DELAY_MAX));
                log(`🎲 Quay xx... (chờ ${Math.round((TIMING.ROLL_DELAY_MIN+TIMING.ROLL_DELAY_MAX)/2)}s)`);
                const rollRes = await apiPost('/api/game/ludo/quayxucxac', {id: roomId, auto: '0'});
                if (rollRes.error) {
                    busy = false;
                    return;
                }
                // Lấy xx từ response
                dice = rollRes.xucxac;
                if (!dice) {
                    // Thử đọc lại room
                    const data2 = await apiGet(`/api/game/ludo/room?id=${roomId}`);
                    const p2 = parseRoom(data2);
                    if (p2) {
                        dice = p2.myInfo?.xucxac || 0;
                        // Cập nhật parsed
                        parsed.chonnhanvat = data2.chonnhanvat || {};
                    }
                }
                log(`🎲 xx=${dice}`);
                hasRolled = true;
                await delay(humanDelayVariance(0.5));
            }

            if (!dice || dice <= 0) {
                busy = false;
                return;
            }

            // Bước 2: Lấy danh sách quân có thể đi
            const canMove = parsed.chonnhanvat?.[String(myPos)] || [];
            if (canMove.length === 0) {
                // Có xx nhưng ko đi được
                ST.actionCount++;
                ST.lastAction = `⛔ xx=${dice} không đi được`;
                log(`⛔ xx=${dice} không có nước đi`);
                sv();
                busy = false;
                return;
            }

            // Bước 3: Chọn quân thông minh
            const chosen = chonQuanPro(canMove, myPos, dice, parsed);
            if (!chosen) {
                busy = false;
                return;
            }

            // Bước 4: Di chuyển
            // ⏱ Chờ tự nhiên trước khi move (giống người đang chọn quân)
            await delay(humanDelay(TIMING.MOVE_DELAY_MIN, TIMING.MOVE_DELAY_MAX));
            log(`♟️ Move quân ${chosen} (chờ ${Math.round((TIMING.MOVE_DELAY_MIN+TIMING.MOVE_DELAY_MAX)/2)}s)`);
            const moveRes = await apiPost('/api/game/ludo/dichuyen', {
                id: roomId,
                nhanvat_id: chosen,
                auto: '0'
            });
            
            if (moveRes.error) {
                log(`❌ Move lỗi: ${moveRes.error}`);
                busy = false;
                return;
            }

            // Ghi lại action
            ST.actionCount++;
            ST.lastAction = `🎲 ${dice} → ♟️${chosen}`;
            sv();
            ui();

            log(`✅ Move OK!`);

            // [v4 FIXED] KHÔNG reload trang nữa!
            // 🐛 BUG CŨ: location.reload() sau mỗi nước đi gây:
            //   1. Loop reload vô tận trên mobile (tốn pin, tốn data)
            //   2. Xung đột với bonus turn: reload xảy ra ngay khi setTimeout fires,
            //      nhưng code tiếp tục check bonus → check trên page đang load = sai
            //   3. Script mất state tạm (busy=false ko kịp ghi)
            // ✅ FIX: Dùng API poll thuần, state đã có trong localStorage, không cần reload.

            // Bước 5: Chờ server xử lý rồi check bonus turn
            // [v4] Endgame Blitz: nếu tất cả trong HS, giảm delay để đi nhanh
            const allInHS = Object.values(parsed.myVitri || {}).every(coord => {
                if (!coord) return true; // vẫn ở nhà
                return isHomeStretchPos(myPos, coord);
            });
            const bonusWaitMs = allInHS ? 300 : humanDelayVariance(0.8);
            await delay(bonusWaitMs);
            
            const data3 = await apiGet(`/api/game/ludo/room?id=${roomId}`);
            const p3 = parseRoom(data3);
            if (p3 && p3.myInfo?.luotdanh) {
                log(`🎯 Bonus turn! (6/capture/finish)`);
                busy = false;
                // Gọi tick ngay lập tức - không reload
                setTimeout(() => tick(), 100);
                return;
            }

            // Bước 6: Check game over
            if (p3?.myInfo?.win === 1) {
                ST.wins++;
                ST.lastResult = '🏆 THẮNG!';
                ST.round++;
                log(`🏆🏆🏆 THẮNG!`);
                ntf('Ludo Pro', '🏆 Thắng!');
                sv(); ui();
            } else if (p3?.room?.status === 2) {
                ST.losses++;
                ST.lastResult = '💀 THUA';
                ST.round++;
                log(`💀 Thua`);
                sv(); ui();
            }

            // Cập nhật trạng thái game cho adaptive polling
            const parsed_ = parseRoom(lastRoomData);
            if (parsed_) {
                lastStatus = parsed_.room?.status ?? lastStatus;
                lastMyTurn = !!(parsed_.myInfo?.luotdanh);
            }
            busy = false;

        } catch(e) {
            log(`❌ Lỗi: ${e.message}`);
            busy = false;
        }
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ================================================================
    // AUTO-NEXT GAME (v4.0 - 26/06 17:00)
    // Phát hiện game kết thúc → tự click nút Bắt Đầu hoặc navigate về lobby
    // ================================================================
    async function autoNextGame() {
        if (!ST.enabled || !ST.autoNextGame) return;
        log('🔄 Auto-next game đang tìm nút Bắt Đầu...');
        
        // Thử click nút "Bắt Đầu" trên trang hiện tại
        const btns = Array.from(document.querySelectorAll('button, a, div'))
            .filter(el => /bắt đầu|start|play|bắtđầu/i.test(el.textContent?.trim()));
        
        if (btns.length > 0) {
            log(`🔄 Tìm thấy ${btns.length} nút, click nút đầu tiên`);
            btns[0].click();
            await delay(1000);
            return;
        }
        
        // Thử API start game nếu có roomId
        const rId = ridU();
        if (rId) {
            const startRes = await apiPost('/api/game/ludo/batdau', { id: rId });
            if (!startRes.error) {
                log('🔄 Auto-start game API OK');
                return;
            }
            log(`🔄 Auto-start API lỗi: ${startRes.error}`);
        }
        
        // Fallback: navigate về lobby Ludo
        log('🔄 Không tìm thấy nút, navigate về lobby...');
        // Không tự navigate để tránh mất phòng
    }

    // ================================================================
    // START / STOP / RESET
    // ================================================================
    function go() {
        if (loop) return;
        log('▶️▶️▶️ BẮT ĐẦU');
        ntf('Ludo Pro', '🤖 Bắt đầu!');
        // Poll mỗi 1 giây (v2.2.1 - 26/06 14:25)
        // Fix: DOM ko kịp cập nhật nếu poll quá nhanh
        // Kết hợp với reload trang sau mỗi nước đi
        loop = // Nav watcher - 3s kiểm tra URL
    setInterval(() => {
            if (ST.enabled && !busy) tick();
        }, 1000);
        // Tick ngay lập tức
        setTimeout(() => { if (ST.enabled) tick(); }, 50);
        ui();
    }

    function stp() {
        if (loop) { clearInterval(loop); loop = null; }
        log('⏸️ DỪNG');
        ntf('Ludo Pro', '⏸️ Đã dừng!');
        busy = false;
        ui();
    }

    function rs() {
        stp();
        ST.enabled = false;
        ST.autoStarted = false;
        ST.roomId = null;
        ST.actionCount = 0;
        ST.lastAction = '';
        ST.round = 0;
        ST.wins = 0;
        ST.losses = 0;
        ST.lastResult = '';
        myPos = null;
        myUserId = null;
        lastRoomData = null;
        sv();
        ui();
        log('🔄 Reset sạch dữ liệu');
        ntf('Ludo Pro', '🔄 Reset!');
    }

    // ================================================================
    // UI
    // ================================================================
    function mkUI() {
        document.getElementById('gb-ludo-pro-panel')?.remove();
        const p = document.createElement('div');
        p.id = 'gb-ludo-pro-panel';
        p.style.cssText = `position:fixed;top:12px;right:12px;z-index:999999;
            background:linear-gradient(145deg,#0d1117,#161b22);
            border:1px solid #30363d;border-radius:14px;
            padding:14px 18px;color:#c9d1d9;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
            font-size:13px;min-width:240px;
            box-shadow:0 8px 32px rgba(0,0,0,.6);
            user-select:none;backdrop-filter:blur(8px);
            touch-action:none;cursor:grab;`;

        const wr = ST.wins + ST.losses > 0 
            ? Math.round(ST.wins / (ST.wins + ST.losses) * 100) : 0;
        const streakDisplay = ST.streak > 0 
            ? `<span style="color:#3fb950;">+${ST.streak}🔥</span>`
            : ST.streak < 0 
                ? `<span style="color:#f85149;">${ST.streak}💀</span>` 
                : `<span>0</span>`;

        p.innerHTML = `
            <div id="gb-drag-handle" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #21262d;cursor:grab;">
                <span style="font-weight:700;font-size:15px;color:#58a6ff;">🎲 Ludo PRO <span style="font-size:10px;color:#484f58;">v5</span></span>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:10px;color:#8b949e;">${wr}%WR</span>
                    <span id="gb-pro-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#484f58;"></span>
                </div>
            </div>
            <div style="margin-bottom:8px;font-size:12px;line-height:1.9;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span>Vòng: <b id="gb-pro-rnd">${ST.round}</b></span>
                    <span>🏆 <b id="gb-pro-w" style="color:#3fb950;">${ST.wins}</b></span>
                    <span>💀 <b id="gb-pro-l" style="color:#f85149;">${ST.losses}</b></span>
                    <span>Streak: <b id="gb-pro-streak">${ST.streak}</b></span>
                </div>
                <div style="margin-top:2px;font-size:11px;color:#8b949e;">
                    <span id="gb-pro-act">${ST.lastAction||'Đang chờ...'}</span>
                </div>
                <div id="gb-pro-reason" style="font-size:10px;color:#6e7681;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ST.lastReason||''}</div>
                <div id="gb-pro-rslt" style="color:#8b949e;font-style:italic;font-size:11px;">${ST.lastResult||''}</div>
            </div>
            <div style="display:flex;gap:6px;margin-bottom:6px;">
                <button id="gb-pro-aggress" title="Blitz Mode: luôn capture khi có thể" style="flex:1;padding:4px 0;border:1px solid ${ST.aggressMode?'#d29922':'#30363d'};border-radius:6px;background:${ST.aggressMode?'rgba(210,153,34,0.15)':'transparent'};color:${ST.aggressMode?'#d29922':'#8b949e'};font-size:11px;cursor:pointer;">
                    ${ST.aggressMode?'🔥 Blitz':'🧘 Passive'}
                </button>
                <button id="gb-pro-autonext" title="Tự động bắt đầu ván mới" style="flex:1;padding:4px 0;border:1px solid ${ST.autoNextGame?'#58a6ff':'#30363d'};border-radius:6px;background:${ST.autoNextGame?'rgba(88,166,255,0.1)':'transparent'};color:${ST.autoNextGame?'#58a6ff':'#8b949e'};font-size:11px;cursor:pointer;">
                    ${ST.autoNextGame?'🔄 AutoNext':'⏸ Manual'}
                </button>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
                <button id="gb-pro-btn" style="padding:8px 0;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;"></button>
                <button id="gb-pro-rst" style="padding:5px 0;border:1px solid #f85149;border-radius:8px;background:transparent;color:#f85149;font-size:12px;cursor:pointer;">🔄 Reset</button>
            </div>
        `;
        document.body.appendChild(p);

        // === DRAG SUPPORT (mobile + desktop) ===
        let dragging = false, dragOX = 0, dragOY = 0;
        const handle = document.getElementById('gb-drag-handle');
        
        function startDrag(clientX, clientY) {
            dragging = true;
            const rect = p.getBoundingClientRect();
            dragOX = clientX - rect.left;
            dragOY = clientY - rect.top;
            p.style.cursor = 'grabbing';
            p.style.right = 'auto';
        }
        function moveDrag(clientX, clientY) {
            if (!dragging) return;
            let x = clientX - dragOX;
            let y = clientY - dragOY;
            x = Math.max(0, Math.min(window.innerWidth - p.offsetWidth, x));
            y = Math.max(0, Math.min(window.innerHeight - p.offsetHeight, y));
            p.style.left = x + 'px';
            p.style.top = y + 'px';
        }
        function endDrag() { dragging = false; p.style.cursor = 'grab'; }
        
        handle.addEventListener('mousedown', e => startDrag(e.clientX, e.clientY));
        document.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY));
        document.addEventListener('mouseup', endDrag);
        handle.addEventListener('touchstart', e => { const t=e.touches[0]; startDrag(t.clientX, t.clientY); }, {passive:true});
        document.addEventListener('touchmove', e => { if(!dragging) return; const t=e.touches[0]; moveDrag(t.clientX, t.clientY); }, {passive:true});
        document.addEventListener('touchend', endDrag);

        // === BUTTONS ===
        const rstBtn = document.getElementById('gb-pro-rst');
        rstBtn.onmouseenter = function(){ this.style.background='rgba(248,81,73,0.1)'; };
        rstBtn.onmouseleave = function(){ this.style.background='transparent'; };
        rstBtn.onclick = function(){ if(confirm('⚠️ Xoá toàn bộ dữ liệu?')){ rs(); sB(); } };

        document.getElementById('gb-pro-aggress').onclick = function() {
            ST.aggressMode = !ST.aggressMode;
            sv();
            this.style.borderColor = ST.aggressMode ? '#d29922' : '#30363d';
            this.style.background = ST.aggressMode ? 'rgba(210,153,34,0.15)' : 'transparent';
            this.style.color = ST.aggressMode ? '#d29922' : '#8b949e';
            this.textContent = ST.aggressMode ? '🔥 Blitz' : '🧘 Passive';
            log(`🔥 AggressMode: ${ST.aggressMode}`);
        };
        
        document.getElementById('gb-pro-autonext').onclick = function() {
            ST.autoNextGame = !ST.autoNextGame;
            sv();
            this.style.borderColor = ST.autoNextGame ? '#58a6ff' : '#30363d';
            this.style.background = ST.autoNextGame ? 'rgba(88,166,255,0.1)' : 'transparent';
            this.style.color = ST.autoNextGame ? '#58a6ff' : '#8b949e';
            this.textContent = ST.autoNextGame ? '🔄 AutoNext' : '⏸ Manual';
            log(`🔄 AutoNext: ${ST.autoNextGame}`);
        };

        sB(); sD();
    }

    function sB() {
        const b = document.getElementById('gb-pro-btn');
        if (!b) return;
        if (ST.enabled) {
            b.textContent = '⏹ Dừng';
            b.style.cssText = 'padding:8px 0;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;background:linear-gradient(135deg,#da3633,#b62324);color:#fff;';
            b.onclick = () => { ST.enabled = false; sv(); stp(); sB(); sD(); };
        } else if (ST.autoStarted) {
            b.textContent = '▶️ Tiếp Tục';
            b.style.cssText = 'padding:8px 0;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;background:linear-gradient(135deg,#d29922,#bb8009);color:#fff;';
            b.onclick = () => { ST.enabled = true; sv(); go(); sB(); sD(); };
        } else {
            b.textContent = '▶️ Bắt Đầu';
            b.style.cssText = 'padding:8px 0;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;background:linear-gradient(135deg,#238636,#196c2e);color:#fff;';
            b.onclick = () => { ST.enabled = true; ST.autoStarted = true; sv(); go(); sB(); sD(); };
        }
    }

    function sD() {
        const d = document.getElementById('gb-pro-dot');
        if (!d) return;
        d.style.background = ST.enabled ? '#3fb950' : '#484f58';
        d.style.boxShadow = ST.enabled ? '0 0 8px #3fb950' : 'none';
    }

    function ui() {
        const r = document.getElementById('gb-pro-rnd');
        const w = document.getElementById('gb-pro-w');
        const l = document.getElementById('gb-pro-l');
        const rs = document.getElementById('gb-pro-rslt');
        const act = document.getElementById('gb-pro-act');
        const streak = document.getElementById('gb-pro-streak');
        const reason = document.getElementById('gb-pro-reason');
        if (r) r.textContent = ST.round;
        if (w) w.textContent = ST.wins;
        if (l) l.textContent = ST.losses;
        if (rs) rs.textContent = ST.lastResult || '';
        if (act) act.textContent = ST.lastAction || 'Đang chờ...';
        if (streak) {
            streak.textContent = ST.streak > 0 ? `+${ST.streak}🔥` : ST.streak < 0 ? `${ST.streak}💀` : '0';
            streak.style.color = ST.streak > 0 ? '#3fb950' : ST.streak < 0 ? '#f85149' : '#8b949e';
        }
        if (reason) reason.textContent = ST.lastReason || '';
        sB(); sD();
    }

    // ================================================================
    // NAV WATCHER - phát hiện chuyển phòng
    // ================================================================
    let prevUrl = location.href;
    // Nav watcher - 3s kiểm tra URL
    setInterval(() => {
        if (location.href !== prevUrl) {
            prevUrl = location.href;
            if (location.pathname.includes('/game/ludo/room') && ST.enabled && !loop) {
                ST.roomId = ridU();
                sv();
                log('🔄 Vào phòng mới');
                go();
            }
        }
    }, 2000);

    // ================================================================
    // BOOT
    // ================================================================
    function boot() {
        log('🎲 Ludo Auto-Play PRO v5.0 - aggressMode WIRED | recentPieces IN SCORE | HS fix | stale guard');
        log(`📋 Ô an toàn: ${SAFE_CELLS.map(i => `${i}(${SAFE_COORDS[i]||'?'})`).join(', ')}`);
        mkUI();
        if (ST.enabled && ridU()) {
            ST.roomId = ridU();
            sv();
            log('🔄 Khôi phục...');
            go();
        }
        if (!ST.autoStarted) {
            log('⏳ Chờ Bắt Đầu');
            ntf('Ludo Pro', '⚡ Nhấn Bắt Đầu để auto-play!');
        }
        log('✅ OK');
    }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', boot);
    else
        boot();

    // ================================================================
    // EXPORT
    // ================================================================
    window.LudoPro = {
        start() { ST.enabled = true; ST.autoStarted = true; sv(); sB(); sD(); go(); },
        stop() { ST.enabled = false; sv(); sB(); sD(); stp(); },
        reset: rs,
        state: ST,
        version: '5.0.0',
    };
})();
