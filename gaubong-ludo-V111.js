// ==UserScript==
// @name         GauBong Ludo Auto-Play PRO 🎲
// @namespace    http://tampermonkey.net/
// @version      8.2.0
// @description  Auto Ludo PRO v8. Phase-based scoring + depth + risk assessment + hard rules
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
    //   🐛 REMOVED: aggressMode (phase-based thay thế)
    //      FIX: Blitz mode → killBonus nhân đôi (300 → 600)
    //   🐛 FIX #2: recentPieces được track nhưng KHÔNG dùng trong scoring
    //      FIX: Phạt spam quân trực tiếp trong score loop
    //   🐛 FIX #3: HS scoring dùng score âm (depth*-10+1) → quân sắp về đích bị bỏ qua
    //      FIX: HS score = depth*safety (+10→+60), càng gần đích càng ưu tiên
    //   🎯 NEW #1: Safe landing bonus (+50) khi đáp vào ô an toàn
    //   🎯 NEW #2: Stale state guard implement thực sự (trước chỉ có comment)
    // v8.1.0- 27/06 - META FIX: Xuất quân bắt buộc + Sửa bug về đích
    //   🐛 FIX #1: Rule #1 về đích có risk-check SAI — về đích = quân rời bàn,
    //      không thể bị ăn sau đó. Logic cũ còn NGĂN về đích khi quân đang bị đe dọa
    //      (đúng ra đây là lúc VỀ ĐÍCH TỐT NHẤT). FIX: Luôn về đích khi d2f===dice.
    //   🐛 FIX #2: Xuất quân khi dice=6 chỉ là scoring bonus nhỏ (+5/10/20)
    //      → không đủ ưu tiên vs capture/rescue. Theo meta đúng: đổ 6 + còn quân
    //      trong chuồng → PHẢI xuất quân (không có ngoại lệ). Lợi ích kép:
    //      ô xuất phát an toàn tuyệt đối + ngay lập tức có lượt bonus.
    //      FIX: Thêm hard rule #2 "Xuất quân bắt buộc" vào chonQuanPro.
    //   🎯 Cập nhật scoreMove: deploy bonus từ 5/10/20 → 30 (uniform, mọi giai đoạn)
    //   🎯 Cập nhật phase weight: xuất quân +40 ở MỌI phase (cũ: chỉ early +20)
    // v8.2.0- 27/06 - PLAYER COUNT AWARE:
    //   🐛 FIX: findMainOpponent hardcode [1,2,3,4] → trong bàn 2 người có thể chọn
    //      sai đối thủ (slot trống thay vì người thật)
    //      FIX: Chỉ scan player có trong parsed.opponents (thực sự trong phòng)
    //   🐛 FIX: makeSearchState hardcode [1,2,3,4] → tạo state cho slot trống
    //      FIX: Chỉ tạo state cho myPos + opponents thực sự
    //   🎯 NEW: opponentCount trong parseRoom (1=1v1, 2=1v2, 3=1v3)
    //   🎯 NEW: scoreMove điều chỉnh theo số đối thủ:
    //      - 1v1: captureBonus=160, riskMult=0.5 (hung hăng tối đa)
    //      - 1v2: captureBonus=110, riskMult=0.8 (cân bằng)
    //      - 1v3: captureBonus=100, riskMult=1.0 (thận trọng, code cũ)
    //   🎯 NEW: Rule #3 capture trong 1v1 → luôn ăn (bỏ qua dangerAfter check,
    //      vì không có người thứ 3 phản đòn)
    //   🎯 NEW: Debug log hiển thị 1v1/1v2/1v3 trên mỗi lượt
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
        // Blitz mode: luôn capture nếu có thể
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
        
        // Đếm số đối thủ thực sự (không tính slot trống)
        const opponentCount = Object.keys(opponents).length; // 1=bàn 2 người, 2=bàn 3 người, 3=bàn 4 người

        return {
            myPosition,
            myInfo,
            myVitri,
            myNhanvats,
            opponents,
            opponentCount,
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

    // ================================================================
    // EXPECTIMINIMAX SEARCH v6 - Codex AI Upgrade
    // ================================================================
    // Thay thế greedy 1-step scorer bằng depth-limited Expectiminimax
    // với linear evaluator tại leaf nodes.
    // 
    // Cấu trúc cây:
    //   MAX node (lượt tôi, xx đã biết): chọn quân tối ưu hóa expected value
    //   Chance node (địch quay xx): average uniform 6 mặt xúc sắc
    //   MIN node (lượt địch): địch chọn nước đi tệ nhất cho tôi
    //   Leaf evaluator: V = 0.0025·Δprog + 0.20·Δfinish − 0.05·Δbase + 0.01·Δsafe
    // Depth 2 = 4 quân × 6 xx × 4 quân địch ≈ 96 lá — rất nhanh
    // ================================================================

    // Helper: xác định turn order (1→2→3→4→1)
    function nextPlayer(p) { return (p % 4) + 1; }

    // Tạo search state từ parsed data — chỉ bao gồm player thực sự trong phòng
    function makeSearchState(parsed, myPos) {
        const pieces = {};
        // Luôn thêm mình
        pieces[myPos] = {};
        for (const [pid, coord] of Object.entries(parsed.myVitri || {})) {
            pieces[myPos][pid] = coord || null;
        }
        // Chỉ thêm đối thủ thực sự (có trong opponents)
        for (const [pos, opp] of Object.entries(parsed.opponents)) {
            const p = parseInt(pos);
            pieces[p] = {};
            for (const [pid, coord] of Object.entries(opp.vitri || {})) {
                pieces[p][pid] = coord || null;
            }
        }
        return { pieces, myPos };
    }

    function cloneSearchState(state) {
        const p2 = {};
        for (const k of Object.keys(state.pieces)) {
            p2[k] = { ...state.pieces[k] };
        }
        return { pieces: p2, myPos: state.myPos };
    }

    // Lấy tất cả nước đi hợp lệ cho player với xx=dice
    function getValidMoves(state, player, dice) {
        const moves = [];
        const pcs = state.pieces[player];
        const entrancePos = EN[player];
        const hs = HS[String(player)];

        for (const [pid, coord] of Object.entries(pcs)) {
            if (coord === 'finished') continue;

            if (!coord) {
                // Ở nhà: chỉ ra khi xx=6
                if (dice === 6) {
                    const entranceCoord = Object.keys(PM).find(k => PM[k] === entrancePos);
                    if (entranceCoord) moves.push({ pid, from: null, to: entranceCoord, capture: false, finish: false });
                }
                continue;
            }

            const pathPos = posFromCoord(coord);

            if (pathPos >= 0) {
                // Trên đường chính
                const adv = advancement(entrancePos, pathPos);
                const advAfter = adv + dice;
                const newPathPos = (pathPos + dice) % PL;

                if (advAfter < PL) {
                    // Vẫn trên đường chính
                    const newCoord = Object.keys(PM).find(k => PM[k] === newPathPos);
                    if (newCoord) {
                        const capture = !isSafePos(newPathPos) && captureCheck(state, player, newPathPos);
                        moves.push({ pid, from: coord, to: newCoord, capture, finish: false });
                    }
                } else if (hs) {
                    // Vào home stretch
                    const hsSteps = advAfter - PL; // 0..5
                    if (hsSteps < hs.length) {
                        moves.push({ pid, from: coord, to: hs[hsSteps], capture: false, finish: false });
                    } else if (hsSteps === hs.length) {
                        // Về đích chính xác
                        moves.push({ pid, from: coord, to: 'finished', capture: false, finish: true });
                    }
                    // overshoot: không đi được
                }
            } else if (hs) {
                // Trong home stretch
                const hsIdx = hs.indexOf(coord);
                if (hsIdx >= 0) {
                    const targetIdx = hsIdx + dice;
                    if (targetIdx < hs.length) {
                        moves.push({ pid, from: coord, to: hs[targetIdx], capture: false, finish: false });
                    } else if (targetIdx === hs.length) {
                        moves.push({ pid, from: coord, to: 'finished', capture: false, finish: true });
                    }
                    // overshoot: không đi được
                }
            }
        }

        return moves;
    }

    // Kiểm tra xem có quân địch tại pathPos không (không safe)
    function captureCheck(state, attacker, pathPos) {
        if (isSafePos(pathPos)) return false;
        for (const [p, pcs] of Object.entries(state.pieces)) {
            if (parseInt(p) === attacker) continue;
            for (const pc of Object.values(pcs)) {
                if (!pc || pc === 'finished') continue;
                const pp = posFromCoord(pc);
                if (pp >= 0 && pp === pathPos) return true;
            }
        }
        return false;
    }

    // Áp dụng nước đi — mutate state, xử lý capture
    function applySearchMove(state, move) {
        const { pid, to } = move;
        for (const [p, pcs] of Object.entries(state.pieces)) {
            if (pid in pcs) {
                if (to === 'finished') {
                    pcs[pid] = 'finished';
                } else {
                    // Capture: quân địch về nhà
                    const targetPathPos = posFromCoord(to);
                    if (targetPathPos >= 0 && !isSafePos(targetPathPos)) {
                        for (const [op, opcs] of Object.entries(state.pieces)) {
                            if (op === p) continue;
                            for (const [opid, opc] of Object.entries(opcs)) {
                                if (opc === to) {
                                    opcs[opid] = null; // về chuồng
                                    break;
                                }
                            }
                        }
                    }
                    pcs[pid] = to;
                }
                break;
            }
        }
        return state;
    }

    // ================================================================
    // PHASE DETECTION
    // ================================================================
    function detectGamePhase(info, myPos, parsed) {
        const atHome = info.filter(i => i.atHome).length;
        const onBoard = info.filter(i => !i.atHome && !i.inHS).length;
        const inHS = info.filter(i => i.inHS).length;
        const totalOut = info.filter(i => !i.atHome).length;
        
        // Cuối game: có quân trong home stretch
        if (inHS >= 2 || (inHS >= 1 && totalOut >= 3)) return 'late';
        // Giữa game: đủ quân trên bàn
        if (totalOut >= 3 && onBoard >= 2) return 'mid';
        // Đầu game: còn nhiều quân ở nhà
        return 'early';
    }

    // ================================================================
    // RISK ASSESSMENT
    // ================================================================
    function assessCaptureRiskAfterMove(move, piece, enemies, myPos, parsed) {
        // Tính xem sau khi đi nước này, quân có bị địch ăn ở lượt sau ko
        if (move.to === 'finished' || piece.inHS) return 0;
        const targetPP = posFromCoord(move.to);
        if (targetPP < 0) return 0;
        if (isSafePos(targetPP)) return 0;
        
        // Đếm số kết quả xx (1-6) mà địch có thể ăn quân này
        let threatCount = 0;
        for (const e of enemies) {
            if (e.safe || e.pathPos < 0) continue;
            const dist = (targetPP - e.pathPos + PL) % PL;
            if (dist >= 1 && dist <= 6) threatCount++;
        }
        
        // Hệ số quan trọng theo giai đoạn
        const importance = piece.inHS ? 5 : piece.adv > 30 ? 4 : piece.adv > 15 ? 3 : 1;
        return threatCount * importance;
    }

    function assessAllPiecesRisk(myPos, enemies, parsed) {
        // Tổng rủi ro cho toàn bộ quân của mình
        let totalRisk = 0;
        const vitri = parsed.myVitri || {};
        for (const [pid, coord] of Object.entries(vitri)) {
            if (!coord || coord === 'finished') continue;
            const pp = posFromCoord(coord);
            if (pp < 0 || isSafePos(pp)) continue;
            
            let threatCount = 0;
            for (const e of enemies) {
                if (e.safe || e.pathPos < 0) continue;
                const dist = (pp - e.pathPos + PL) % PL;
                if (dist >= 1 && dist <= 6) threatCount++;
            }
            totalRisk += threatCount;
        }
        return totalRisk;
    }

    // ================================================================
    // SCORING SYSTEM — dựa trên spec "4 bước"
    // ================================================================
function scoreMove(move, piece, dice, myPos, parsed, enemies, phase) {
        let immediateScore = 0;
        const opp = parsed.opponentCount || 3;
        const captureBonus  = opp === 1 ? 160 : opp === 2 ? 110 : 100;
        const riskMult      = opp === 1 ? 0.5  : opp === 2 ? 0.8  : 1.0;
        
        if (move.finish) immediateScore += 120;
        if (move.capture) immediateScore += captureBonus;
        if (move.to && move.to !== 'finished') {
            const pp = posFromCoord(move.to);
            if (pp >= 0 && isSafePos(pp)) immediateScore += 40;
        }
        
        if (!piece.atHome && !piece.inHS) {
            const d2fBefore = piece.d2f;
            const newCoord = move.to;
            const newD2f = newCoord === 'finished' ? 0 : distToFinish(myPos, posFromCoord(newCoord), newCoord);
            const stepsCloser = d2fBefore - newD2f;
            if (stepsCloser > 0) {
                const nearFinishBonus = (d2fBefore <= 10) ? 35 : (d2fBefore <= 20) ? 25 : 15;
                immediateScore += Math.min(stepsCloser, 6) * nearFinishBonus / 6;
            }
        }
        
        if (piece.atHome && dice === 6) immediateScore += 30;
        
        // Leapfrog: kéo quân sau tạo mối đe dọa
        if (move._leapfrog) immediateScore += 25;
        
        // Da dang hoa: duy tri >=2 quan
        if (move._activePiecesAfter !== undefined) {
            if (move._activePiecesAfter >= 2) {
                immediateScore += 15;
            } else if (move._totalActive > 1 && move._activePiecesAfter <= 1) {
                immediateScore -= 50;
            }
        }
        
        // DIEM TRU
        const risk = assessCaptureRiskAfterMove(move, piece, enemies, myPos, parsed);
        if (risk > 0) {
            const disasterValue = piece.inHS ? 150 : Math.max(30, Math.min(100, (piece.adv || 0) * 2));
            let penalty = piece.inHS ? 150 : piece.adv > 30 ? 130 : Math.max(80, disasterValue);
            immediateScore -= penalty * riskMult;
        }
        
        
        // TRONG SO GIAI DOAN
        if (phase === 'early') {
            if (move.capture) immediateScore += opp === 1 ? 50 : 30;
            if (piece.atHome && dice === 6) immediateScore += 10;
            if (move._activePiecesAfter !== undefined && move._activePiecesAfter >= 2) {
                immediateScore += 10;
            }
        } else if (phase === 'mid') {
            if (move.capture) immediateScore += opp === 1 ? 35 : 20;
            if (risk > 0) immediateScore -= 40 * riskMult;
            if (move._spreadBonus) immediateScore += 20;
        } else if (phase === 'late') {
            if (move.finish) immediateScore += 60;
            if (piece.inHS && !move.finish) immediateScore += 15;
            if (!move.finish && !piece.inHS) immediateScore -= 25;
            if (move._sacrificialCapture) immediateScore += 80;
        }
        
        return immediateScore;
    }



    // ================================================================
    // DEPTH EVALUATION: ImmediateScore + ReplyRisk + NextTurnValue
    // ================================================================
function evaluateWithDepth(move, piece, dice, myPos, parsed, enemies, phase, extraInfo) {
        if (extraInfo) Object.assign(move, extraInfo);
        const immediateScore = scoreMove(move, piece, dice, myPos, parsed, enemies, phase);
        if (move.finish) return immediateScore;
        
        const searchState = makeSearchState(parsed, myPos);
        const allMoves = getValidMoves(searchState, myPos, dice);
        const thisMove = allMoves.find(m => m.pid === piece.pieceId);
        if (!thisMove) return immediateScore;
        
        const afterState = applySearchMove(cloneSearchState(searchState), thisMove);
        
        let replyRisk = 0;
        const maxDepth = (phase === 'early') ? 1 : (phase === 'mid') ? 2 : 2;
        
        for (let d = 1; d <= 6; d++) {
            const opp = findMainOpponent(afterState);
            const oppMoves = getValidMoves(afterState, opp, d);
            let worstLoss = 0;
            for (const om of oppMoves) {
                const oppAfter = applySearchMove(cloneSearchState(afterState), om);
                const myAfter = oppAfter.pieces[myPos] || {};
                const beforePieces = Object.values(afterState.pieces[myPos] || {}).filter(c => c && c !== 'finished').length;
                const afterPieces = Object.values(myAfter).filter(c => c && c !== 'finished').length;
                const lostPieces = beforePieces - afterPieces;
                if (lostPieces > 0) {
                    let pieceVal = 80;
                    for (const [pid, coord] of Object.entries(afterState.pieces[myPos] || {})) {
                        if (coord && coord !== 'finished' && !oppAfter.pieces[myPos][pid]) {
                            const pp = posFromCoord(coord);
                            const adv = pp >= 0 ? advancement(EN[myPos], pp) : 50;
                            pieceVal = Math.max(pieceVal, Math.min(150, Math.max(30, adv * 2)));
                        }
                    }
                    worstLoss = Math.max(worstLoss, lostPieces * pieceVal);
                }
            }
            replyRisk += worstLoss / 6;
        }
        
        let nextTurnValue = 0;
        if (maxDepth >= 2) {
            const diceWeights = {1:1, 2:1, 3:1, 4:1, 5:1, 6:1.5};
            for (let od = 1; od <= 6; od++) {
                const oppTemp = findMainOpponent(afterState);
                const oppTempMoves = getValidMoves(afterState, oppTemp, od);
                if (oppTempMoves.length > 0) {
                    const worstOpp = oppTempMoves.reduce((worst, om) => {
                        const sim = applySearchMove(cloneSearchState(afterState), om);
                        const myCount = Object.values(sim.pieces[myPos] || {}).filter(c => c && c !== 'finished').length;
                        return myCount < worst.count ? {count: myCount, move: om} : worst;
                    }, {count: Infinity, move: null});
                    if (worstOpp.move) {
                        const afterOpp = applySearchMove(cloneSearchState(afterState), worstOpp.move);
                        let optionsCount = 0;
                        for (let md = 1; md <= 6; md++) {
                            const myNextMoves = getValidMoves(afterOpp, myPos, md);
                            optionsCount += myNextMoves.length * (diceWeights[md] || 1);
                        }
                        const weightSum = Object.values(diceWeights).reduce((a,b)=>a+b, 0);
                        nextTurnValue += (optionsCount / weightSum) * 3;
                    }
                }
            }
            nextTurnValue = nextTurnValue / 6;
        }
        
        const total = immediateScore - 0.7 * replyRisk + 0.3 * nextTurnValue;
        return total;
    }



    // ================================================================
    // PRO AI: chonQuanPro — Phase-based scoring with depth
    // ================================================================
function chonQuanPro(pieces, myPos, dice, parsed) {
        if (!pieces || pieces.length === 0) return null;
        const vitri = parsed.myVitri || {};
        const enemies = getEnemyPieces(parsed);
        if (!ST.recentPieces) ST.recentPieces = {};
        const rp = ST.recentPieces;

        const info = pieces.map(p => pieceInfo(myPos, p, vitri));
        const phase = detectGamePhase(info, myPos, parsed);
        const oppCntLabel = {1:'1v1', 2:'1v2', 3:'1v3'}[parsed.opponentCount] || '?';
        const PL = 52;
        
        let debug = info.map(function(i) {
            var tag = i.atHome ? '\ud83c\udfe0' : (i.inHS ? '\ud83d\udee3\ufe0f@' + i.hsIdx : '\ud83d\udeb6@' + i.pathPos);
            var extra = i.safe ? '\ud83d\udd12' : '';
            var d2f = i.d2f < 999 ? ' d2f=' + i.d2f : '';
            return 'Q' + i.pieceId + '=' + tag + extra + d2f;
        }).join(' ');
        log('[PRO] ' + phase.toUpperCase() + ' ' + oppCntLabel + ' xx=' + dice + ' | ' + debug);

        // === HARD PRIORITY RULES ===
        
        // [RULE 1] Ve dich
        for (var pi_idx = 0; pi_idx < info.length; pi_idx++) {
            var pi = info[pi_idx];
            if (pi.d2f === dice) {
                log('[PRO] \ud83c\udfc1 Q' + pi.pieceId + ' ve dich!');
                trackPiece(rp, pi.pieceId);
                ST.lastReason = '\ud83c\udfc1 Q' + pi.pieceId + ' ve dich';
                return pi.pieceId;
            }
        }

        // [RULE 2] XUAT QUAN BAT BUOC khi dice=6
        if (dice === 6) {
            var homePieces = info.filter(function(p) { return p.atHome; });
            if (homePieces.length > 0) {
                var deployPiece = homePieces[0];
                log('[PRO] \ud83d\ude80 Q' + deployPiece.pieceId + ' XUAT QUAN bat buoc (' + homePieces.length + ' quan con trong chuong)');
                trackPiece(rp, deployPiece.pieceId);
                ST.lastReason = '\ud83d\ude80 Xuat Q' + deployPiece.pieceId + ' (' + homePieces.length + ' trong chuong)';
                return deployPiece.pieceId;
            }
        }

        // [RULE 3] HY SINH CUOI GAME: neu doi thu sap ve dich
        if (phase === 'late') {
            var oppAboutToWin = enemies.some(function(e) {
                if (e.safe || e.pathPos < 0) return false;
                var adv = advancement(EN[e.owner], e.pathPos);
                return (52 - adv) <= 12;
            });
            if (oppAboutToWin) {
                for (var pi_idx = 0; pi_idx < info.length; pi_idx++) {
                    var pi = info[pi_idx];
                    if (!pi.atHome && !pi.inHS) {
                        var cap = canCapture(pi, dice, enemies);
                        if (cap) {
                            log('[PRO] \ud83e\udd85 HY SINH: Q' + pi.pieceId + ' bat P' + cap.owner + ' (doi thu sap thang!)');
                            trackPiece(rp, pi.pieceId);
                            ST.lastReason = '\ud83e\udd85 Hy sinh Q' + pi.pieceId + ' bat P' + cap.owner;
                            return pi.pieceId;
                        }
                    }
                }
            }
        }

        // [RULE 4] AN QUAN CO KIEM SOAT
        var oppCount = parsed.opponentCount || 3;
        for (var pi_idx = 0; pi_idx < info.length; pi_idx++) {
            var pi = info[pi_idx];
            if (!pi.atHome && !pi.inHS) {
                var cap = canCapture(pi, dice, enemies);
                if (cap) {
                    var capAdv = advancement(EN[cap.owner], cap.pathPos);
                    var capIsValuable = capAdv > 20;
                    var newPos = (pi.pathPos + dice) % 52;
                    var safeAfter = isSafePos(newPos);
                    
                    if (oppCount === 1) {
                        log('[PRO] \u2694\ufe0f Q' + pi.pieceId + ' an P' + cap.owner + ' [1v1]');
                        trackPiece(rp, pi.pieceId);
                        ST.lastReason = '\u2694\ufe0f Q' + pi.pieceId + ' capture 1v1';
                        return pi.pieceId;
                    }
                    
                    if (capIsValuable || safeAfter) {
                        var dangerAfter = enemies.some(function(e) {
                            if (e.owner === cap.owner || e.pathPos < 0 || e.safe) return false;
                            var dist = (newPos - e.pathPos + 52) % 52;
                            return dist >= 1 && dist <= 6;
                        });
                        if (safeAfter || !dangerAfter) {
                            log('[PRO] \u2694\ufe0f Q' + pi.pieceId + ' an P' + cap.owner + ' (quan ' + (capIsValuable ? 'tien xa' : 'moi ra') + ', safe=' + safeAfter + ')');
                            trackPiece(rp, pi.pieceId);
                            ST.lastReason = '\u2694\ufe0f Q' + pi.pieceId + ' bat P' + cap.owner;
                            return pi.pieceId;
                        }
                    }
                }
            }
        }

        // [RULE 5] CUU QUAN DANG NGUY HIEM
        for (var pi_idx = 0; pi_idx < info.length; pi_idx++) {
            var pi = info[pi_idx];
            if (!pi.atHome && !pi.inHS && !pi.safe) {
                var isThreatened = enemies.some(function(e) {
                    if (e.pathPos < 0 || e.safe) return false;
                    var dist = (pi.pathPos - e.pathPos + 52) % 52;
                    return dist >= 1 && dist <= 6;
                });
                if (isThreatened) {
                    var newPos2 = (pi.pathPos + dice) % 52;
                    var willBeSafe = isSafePos(newPos2);
                    if (willBeSafe) {
                        log('[PRO] \ud83d\udee1\ufe0f Q' + pi.pieceId + ' thoat hiem!');
                        trackPiece(rp, pi.pieceId);
                        ST.lastReason = '\ud83d\udee1\ufe0f Q' + pi.pieceId + ' thoat';
                        return pi.pieceId;
                    }
                }
            }
        }

        // === SCORING-BASED SELECTION ===
        const searchState = makeSearchState(parsed, myPos);
        const allMoves = getValidMoves(searchState, myPos, dice);
        const totalActive = info.filter(function(i) { return !i.atHome; }).length;
        
        // Leapfrog detection
        var leapfrogSet = {};
        for (var pi_idx = 0; pi_idx < info.length; pi_idx++) {
            var pi = info[pi_idx];
            if (pi.atHome || pi.inHS || pi.pathPos < 0) continue;
            var behind = info.filter(function(pj) {
                return !pj.atHome && !pj.inHS && pj.pathPos >= 0 &&
                    pj.pieceId !== pi.pieceId &&
                    pj.adv > pi.adv &&
                    (pj.adv - pi.adv) < 25;
            });
            if (behind.length > 0) {
                var newPathPos = (pi.pathPos + dice) % 52;
                var canThreatenAfter = enemies.some(function(e) {
                    if (e.pathPos < 0 || e.safe) return false;
                    var dist = forwardDist(newPathPos, e.pathPos);
                    return dist >= 1 && dist <= 6;
                });
                if (canThreatenAfter) {
                    leapfrogSet[pi.pieceId] = true;
                }
            }
        }
        
        // Opponent about to win
        var oppCloseToWin = enemies.some(function(e) {
            if (e.safe || e.pathPos < 0) return false;
            var adv = advancement(EN[e.owner], e.pathPos);
            return (52 - adv) <= 12;
        });
        
        var candidates = [];
        for (var pi_idx = 0; pi_idx < info.length; pi_idx++) {
            var pi = info[pi_idx];
            var move = allMoves.find(function(m) { return m.pid === pi.pieceId; });
            if (!move) continue;
            
            var extraInfo = {};
            
            if (leapfrogSet[pi.pieceId]) extraInfo._leapfrog = true;
            
            var willFinish = move.finish;
            var activeAfter = totalActive - (willFinish ? 1 : 0);
            extraInfo._activePiecesAfter = activeAfter;
            extraInfo._totalActive = totalActive;
            
            if (phase === 'mid') {
                var spreadCount = info.filter(function(i) { return !i.atHome && i.pieceId !== pi.pieceId; }).length;
                if (spreadCount >= 1) extraInfo._spreadBonus = true;
            }
            
            if (phase === 'late' && oppCloseToWin && move.capture) {
                extraInfo._sacrificialCapture = true;
            }
            
            const totalScore = evaluateWithDepth(move, pi, dice, myPos, parsed, enemies, phase, extraInfo);
            
            var used = rp[String(pi.pieceId)] || 0;
            var spamPenalty = used * 12;
            
            var activeOthers = info.filter(function(i) { return !i.atHome && i.pieceId !== pi.pieceId; }).length;
            if (totalActive <= 1 && activeOthers === 0 && !willFinish) {
                spamPenalty += 30;
            }
            
            var finalScore = totalScore - spamPenalty;
            if (phase === 'late' && pi.inHS) finalScore += 50;
            if (pi.atHome && dice === 6) finalScore += 40;
            
            candidates.push({ pid: pi.pieceId, score: finalScore, adv: pi.adv || 0, safe: pi.safe, inHS: pi.inHS });
            log('   [PRO] Q' + pi.pieceId + ': total=' + totalScore.toFixed(2) + (used > 0 ? ' -spam=' + spamPenalty : '') + ' = ' + finalScore.toFixed(2));
        }
        
        if (candidates.length === 0) {
            log('[PRO] Khong co nuoc di hop le, fallback Q' + pieces[0]);
            trackPiece(rp, pieces[0]);
            ST.lastReason = '[PRO] fallback Q' + pieces[0];
            return pieces[0];
        }
        
        candidates.sort(function(a, b) {
            if (b.score !== a.score) return b.score - a.score;
            if (a.safe !== b.safe) return a.safe ? -1 : 1;
            return b.adv - a.adv;
        });
        var best = candidates[0];
        
        trackPiece(rp, best.pid);
        log('[PRO] -> Q' + best.pid + ' score=' + best.score.toFixed(2));
        ST.lastReason = '[PRO] Q' + best.pid + ' ' + best.score.toFixed(0) + 'd';
        return best.pid;
    }



    function trackPiece(rp, pid) {
        rp[String(pid)] = (rp[String(pid)] || 0) + 1;
        if (rp[String(pid)] > 6) {
            for (const k of Object.keys(rp)) rp[k] = Math.max(0, Math.floor(rp[k] * 0.6));
        }
        sv();
    }

    // Helper: tìm đối thủ nguy hiểm nhất — chỉ scan player THỰC SỰ trong phòng
    function findMainOpponent(state) {
        const myPos = state.myPos;
        // Lấy danh sách opponent thực sự (không phải slot trống)
        const activeOpponents = Object.keys(state.pieces)
            .map(Number)
            .filter(p => p !== myPos && Object.values(state.pieces[p]).some(c => c && c !== 'finished'));
        
        if (activeOpponents.length === 0) return nextPlayer(myPos);
        
        // Ưu tiên người chơi ngay sau mình (lượt tiếp theo)
        const nextP = nextPlayer(myPos);
        if (activeOpponents.includes(nextP)) return nextP;
        
        // Nếu không, chọn người có quân tiến xa nhất (nguy hiểm nhất)
        let bestOpp = null, bestAdv = -1;
        for (const p of activeOpponents) {
            let adv = 0;
            for (const coord of Object.values(state.pieces[p])) {
                if (coord && coord !== 'finished') {
                    const pp = posFromCoord(coord);
                    if (pp >= 0) adv += advancement(EN[p], pp);
                    else { const hs = HS[String(p)]; if (hs && hs.includes(coord)) adv += PL; }
                }
            }
            if (adv > bestAdv) { bestAdv = adv; bestOpp = p; }
        }
        return bestOpp || activeOpponents[0];
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
    let gameEndProcessed = false;

    async function tick() {
        if (!ST.enabled || busy) return;
        if (!ridU()) return;
        
        // Kiểm tra game kết thúc hoặc chưa bắt đầu
        const roomId_ = ridU();
        if (roomId_) {
            try {
                const checkData = await apiGet('/api/game/ludo/room?id=' + roomId_);
                if (checkData && !checkData.error) {
                    const parsedCheck = parseRoom(checkData);
                    if (parsedCheck) {
                        const pi = checkData.playerInfo || {};
                        const nv = checkData.nhanvats || {};
                        const myPos = parsedCheck.myPosition;
                        
                        // === GAME ENDED: call reset API, then auto-next ===
                        if (checkData.room?.status === 2 && !gameEndProcessed) {
                            gameEndProcessed = true;
                            gameEndedAt = Date.now();
                            
                            // Count win/loss based on actual game data
                            const myNv = nv[String(myPos)] || {};
                            const myVitri = myNv.vitri || {};
                            const myWin = (parsedCheck.myInfo?.win === 1 || parsedCheck.myInfo?.win === '1' || parsedCheck.myInfo?.win === true);
                            const myFinished = Object.values(myVitri).filter(c => c === 'finished').length >= 4;
                            const hasPlayed = Object.values(myVitri).some(c => c && c !== 'finished') || myFinished || myWin;
                            
                            if (hasPlayed) {
                                if (myWin || myFinished) {
                                    ST.wins++;
                                    ST.streak = Math.max(0, ST.streak) + 1;
                                    if (ST.streak > ST.bestStreak) ST.bestStreak = ST.streak;
                                    ST.lastResult = '🏆 THẮNG!';
                                    log('🏆 THẮNG!');
                                } else {
                                    ST.losses++;
                                    ST.streak = Math.min(0, ST.streak) - 1;
                                    ST.lastResult = '💀 THUA';
                                    log('💀 Thua');
                                }
                                ST.round++;
                            } else {
                                log('🔄 Room ended (cold), skip count');
                            }
                            sv(); ui();
                            
                            // Reset room for new game
                            log('🔄 Resetting room...');
                            await apiPost('/api/game/ludo/reset', { id: roomId_ });
                            await delay(2000);
                            if (ST.autoNextGame) {
                                log('🔄 Auto-next...');
                                setTimeout(() => autoNextGame(), 1000);
                            }
                            return;
                        }
                        
                        // === MID-GAME WIN (status=1 but we won) ===
                        if (checkData.room?.status === 1) {
                            const myNv = nv[String(myPos)] || {};
                            const myVitri = myNv.vitri || {};
                            const myWin = (parsedCheck.myInfo?.win === 1 || parsedCheck.myInfo?.win === '1')
                                || Object.values(myVitri).filter(c => c === 'finished').length >= 4;
                            if (myWin && !gameEndProcessed) {
                                gameEndProcessed = true;
                                gameEndedAt = Date.now();
                                ST.wins++; ST.streak = Math.max(0, ST.streak) + 1;
                                if (ST.streak > ST.bestStreak) ST.bestStreak = ST.streak;
                                ST.lastResult = '🏆 THẮNG!'; ST.round++;
                                log('🏆🏆🏆 THẮNG!'); sv(); ui();
                                if (ST.autoNextGame) setTimeout(() => autoNextGame(), 5000);
                                return;
                            }
                            const oppWon = Object.entries(nv)
                                .filter(([p]) => parseInt(p) !== myPos)
                                .some(([, nd]) => Object.values(nd?.vitri || {}).filter(c => c === 'finished').length >= 4);
                            if (oppWon && !gameEndProcessed) {
                                gameEndProcessed = true;
                                gameEndedAt = Date.now();
                                ST.losses++; ST.streak = Math.min(0, ST.streak) - 1;
                                ST.lastResult = '💀 THUA'; ST.round++;
                                log('💀 Thua'); sv(); ui();
                                if (ST.autoNextGame) setTimeout(() => autoNextGame(), 5000);
                                return;
                            }
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

            // === PRE-GAME ===
            if (data.room?.status === 0) {
                await handlePreGame(data);
                busy = false;
                return;
            }
            // === POST-GAME (fallback) ===
            if (data.room?.status === 2) {
                busy = false;
                return;
            }

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
            const fnv = (data3?.nhanvats || {})[String(myPos)];
            const ff = Object.values(fnv?.vitri || {}).filter(c => c === 'finished').length;
            const fw = (p3?.myInfo?.win === 1) || (p3?.myInfo?.win === '1') || ff >= 4;
            
            if (fw && !gameEndProcessed) {
                gameEndProcessed = true; gameEndedAt = Date.now();
                ST.wins++; ST.streak = Math.max(0, ST.streak) + 1;
                if (ST.streak > ST.bestStreak) ST.bestStreak = ST.streak;
                ST.lastResult = '🏆 THẮNG!'; ST.round++;
                log(`🏆🏆🏆 THẮNG!`); sv(); ui();
                if (ST.autoNextGame) { log('🔄 Auto-next...'); setTimeout(() => autoNextGame(), 5000); }
            } else if (!fw && (p3?.room?.status === 2 || (data3?.nhanvats && Object.entries(data3.nhanvats)
                .filter(([p]) => parseInt(p) !== myPos)
                .some(([, nd]) => Object.values(nd?.vitri || {}).filter(c => c === 'finished').length >= 4)))) {
                if (!gameEndProcessed) {
                    gameEndProcessed = true; gameEndedAt = Date.now();
                    ST.losses++; ST.streak = Math.min(0, ST.streak) - 1;
                    ST.lastResult = '💀 THUA'; ST.round++;
                    log(`💀 Thua`); sv(); ui();
                    if (ST.autoNextGame) { log('🔄 Auto-next...'); setTimeout(() => autoNextGame(), 5000); }
                }
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

    // ================================================================
    // PRE-GAME HANDLER
    // ================================================================
    async function handlePreGame(roomData) {
        if (!roomData || roomData.room?.status !== 0) return;
        const roomId = roomData.room?.id || ridU();
        if (!roomId) return;
        const pi = roomData.playerInfo || {};
        const ownerId = roomData.room?.userId;
        const iAmOwner = ownerId && myUserId && String(ownerId) === String(myUserId);
        
        // Reset flag when entering pre-game
        gameEndProcessed = false;
        
        let myPosition = null;
        for (const [pos, info] of Object.entries(pi)) {
            if (!info || typeof info !== 'object') continue;
            const uid = info.userId || info.id || info.user_id;
            if (uid && myUserId && String(uid) === String(myUserId)) { myPosition = parseInt(pos); break; }
        }
        
        if (!myPosition) {
            for (let pos = 1; pos <= 4; pos++) {
                if (!pi[String(pos)] || pi[String(pos)] === false) {
                    log('🎨 Join P' + pos);
                    await apiPost('/api/game/ludo/thamgia', { id: roomId, pid: pos });
                    await delay(800);
                    return;
                }
            }
            return;
        }
        
        if (!pi[String(myPosition)]?.ready) {
            log('✅ Ready P' + myPosition);
            await apiPost('/api/game/ludo/ready', { id: roomId, pid: myPosition });
            await delay(500);
            return;
        }
        
        if (iAmOwner) {
            const players = Object.values(pi).filter(p => p && typeof p === 'object' && p.userId);
            if (players.length >= 1 && players.every(p => p.ready)) {
                log('🎬 Start game!');
                const res = await apiPost('/api/game/ludo/start', { id: roomId });
                if (res.error) log('Start err: ' + (res.message || res.error));
                else log('Start OK!');
                await delay(500);
            }
        }
    }

    async function autoNextGame() {
        if (!ST.enabled || !ST.autoNextGame) return;
        log('🔄 Auto-next...');
        await delay(2000);
        const rId = ridU();
        if (!rId) return;
        
        // Reset room if needed (already done in first block, but just in case)
        const rd = await apiGet('/api/game/ludo/room?id=' + rId);
        if (rd.error) return;
        
        if (rd.room?.status === 0 || rd.room?.status === 1) {
            log('🔄 Status=' + rd.room?.status + ', tick handles');
            return;
        }
        
        if (rd.room?.status === 2) {
            // Reset to go back to pre-game
            log('🔄 Resetting room (from autoNext)...');
            await apiPost('/api/game/ludo/reset', { id: rId });
            await delay(2000);
        }
        
        // Fetch after reset
        const rd2 = await apiGet('/api/game/ludo/room?id=' + rId);
        if (rd2?.room?.status === 0) {
            // tick() will handle pre-game
            log('🔄 Room reset to 0, tick handles pre-game');
            return;
        }
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
        log('🎲 Ludo Auto-Play PRO v8.2 - Player count aware: 1v1/1v2/1v3 strategy');
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
        version: '8.2.0',
    };
})();
