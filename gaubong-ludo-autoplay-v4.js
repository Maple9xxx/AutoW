// ==UserScript==
// @name         GauBong Ludo Auto-Play PRO 🎲
// @namespace    http://tampermonkey.net/
// @version      4.0.0
// @description  Auto Ludo PRO v4. Chiến thuật an toàn - P1 an toàn, P2 vào safe, P3 đá safe, P4 đá bừa.
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
    // v1.0 - 26/06 13:00 - Basic autoplay, chiến thuật đơn giản
    // v1.5 - 26/06 13:10 - Thêm capture logic, ưu tiên về đích
    // v2.0 - 26/06 13:30 - Safe zones (8 ô an toàn), threat assessment
    // v2.1 - 26/06 13:50 - Adaptive polling (1s/120ms), game end detection
    // v2.2 - 26/06 14:10 - Cân bằng quân, ưu tiên ra quân, tie-breaker adv
    // v2.2.1- 26/06 14:25 - Reload trang sau mỗi nước đi, poll 1s
    // v2.2.2- 26/06 14:45 - CHIẾN THUẬT CAO THỦ: dàn đều quân, kéo quân sau,
    //                       phạt spam 1 quân, ở yên ô an toàn khi có địch
    // v2.3.2- 26/06 15:00 - Ghi mốc time trong code
    // v3.0.0- 26/06 16:00 - BUG FIX + EXPERT UPGRADE (Legacy)
    // v4.0.0- 26/06 17:00 - CHIẾN THUẬT AN TOÀN TUYỆT ĐỐI:
    //   🎯 P1: An toàn - đưa quân đến ô an toàn, quân đầu dừng ở ô cuối gần HS
    //   🎯 P2: Đến ô an toàn (trong tầm dice)
    //   🎯 P3: Đá địch nếu hạ cánh an toàn
    //   🎯 P4: Đá địch dù ko an toàn
    //   🏁 KHÔNG VỘI VỀ ĐÍCH - kéo 4 quân về ô an toàn cuối rồi từ từ win
    //   🗑️ Loại bỏ: Quadrant Aggression, Rule of 7, Hunt-or-Run, Post-Capture Safety
    //   ✅ Giữ lại: canCapture, threatAssessment, assessPathDanger (đã đúng hướng)
    //
    // 🎯 TRIẾT LÝ v4.0: An toàn là trên hết. Nhóm quân lại rồi thắng.
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
    // Ô an toàn cuối cùng trước khi vào Home Stretch (v4.0)
    // Mỗi người chơi có 1 ô an toàn ngay trước khi vào HS, ưu tiên đưa quân đến đây
    const LAST_SAFE_BEFORE_HS = {1: 15, 2: 2, 3: 41, 4: 28};
    
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
    // CHỌN QUÂN - THUẬT TOÁN AI LUDO (adapted from suhasasumukh/AI-Ludo-Game)
    // ================================================================
    // 🧠 TRIẾT LÝ: Move Analyzer - phân tích từng nước đi
    //   - Thoát nguy hiểm: +điểm khi chạy khỏi tầm địch
    //   - Hạ cánh an toàn: +điểm khi vào ô safe
    //   - Đá địch: +300 + bonus (càng tiến xa càng quý)
    //   - Đi vào nguy hiểm: -điểm nếu địch rình sau lưng
    //   - Cửa chuồng địch: -điểm nếu đứng ở cửa chuồng đối thủ
    //   - HS (home stretch): điểm rất thấp (ko vội về, ưu tiên kéo quân khác)
    // ================================================================
    function chonQuanPro(pieces, myPos, dice, parsed) {
        if (!pieces || pieces.length === 0) return null;
        
        const vitri = parsed.myVitri || {};
        const enemies = getEnemyPieces(parsed);
        
        // === AI-Ludo constants ===
        const SAFETY = 10;
        const BASE_DISTANCE = SAFETY * 10;     // 100
        const KILL_BONUS = 300;
        const ESCAPE_BONUS = BASE_DISTANCE;    // 100 - thoát khỏi tầm địch
        const SAFE_CELL_BONUS = BASE_DISTANCE; // 100 - vào ô an toàn
        const ENTER_HS_BONUS = BASE_DISTANCE;  // 100 - vào đường về
        const EXIT_HOME_BONUS = BASE_DISTANCE * 3; // 300 - ra khỏi chuồng
        
        // Entrance positions (cửa chuồng) for start-square danger check
        const ENTRANCES = {1: 25, 2: 12, 3: 51, 4: 38};
        
        const scored = pieces.map(id => {
            const pi = pieceInfo(myPos, id, vitri);
            let score = 0;
            const reasons = [];
            
            if (pi.atHome) {
                // ═══════════════════════════════════════════════════
                // RA KHỎI CHUỒNG (chỉ khi xx=6)
                // ═══════════════════════════════════════════════════
                score += EXIT_HOME_BONUS;
                reasons.push('🏠 ra quân');
                
            } else if (pi.inHS) {
                // ═══════════════════════════════════════════════════
                // TRONG HOME STRETCH - điểm thấp, ko vội về
                // ═══════════════════════════════════════════════════
                if (pi.d2f <= dice) {
                    // Đủ xx để về đích
                    score += KILL_BONUS; // ưu tiên như đá địch
                    reasons.push('🏁 về đích');
                } else {
                    // Còn trong HS - điểm rất thấp để ưu tiên quân khác
                    score = pi.hsIdx * (-SAFETY) + 1;
                    reasons.push(`🏠 HS bước ${pi.hsIdx+1}`);
                }
                
            } else {
                // ═══════════════════════════════════════════════════
                // ĐANG TRÊN BÀN - phân tích đầy đủ
                // ═══════════════════════════════════════════════════
                
                // 1. Thoát nguy hiểm: nếu đang bị địch rình, thoát = tốt
                const currentThreat = threatAssessment(pi, enemies);
                if (currentThreat > 0) {
                    score += ESCAPE_BONUS;
                    score += (7 - currentThreat) * SAFETY;
                    reasons.push(`🏃 thoát nguy hiểm`);
                }
                
                // 2. Kiểm tra nếu đang đứng ở cửa chuồng đối thủ
                for (const [oppPos, enPos] of Object.entries(ENTRANCES)) {
                    if (parseInt(oppPos) !== myPos && pi.pathPos === enPos) {
                        const opp = parsed.opponents[oppPos];
                        if (opp) {
                            const hasTokensHome = Object.values(opp.vitri).some(c => !c);
                            if (hasTokensHome) {
                                const sqSixBonus = (dice * SAFETY / 10);
                                score -= BASE_DISTANCE + sqSixBonus;
                                reasons.push(`⚠️ đang đứng cửa chuồng địch`);
                            }
                        }
                    }
                }
                
                // 3. Mô phỏng nước đi: tính newPos
                const newPos = (pi.pathPos + dice) % 52;
                
                // 4. Thưởng vào ô an toàn
                if (isSafePos(newPos)) {
                    score += SAFE_CELL_BONUS;
                    reasons.push('🛡️ ô an toàn');
                }
                
                // 5. Kiểm tra đá địch (capture)
                const captureTarget = canCapture(pi, dice, enemies);
                if (captureTarget) {
                    // Điểm càng cao nếu địch càng tiến xa
                    const victimAdv = advancement(EN[captureTarget.owner], captureTarget.pathPos);
                    score += Math.max(0, victimAdv) + 4;
                    score += Math.floor(captureTarget.pathPos / 10);
                    score += KILL_BONUS;
                    
                    if (isSafePos(captureTarget.pathPos)) {
                        score += 50; // bonus thêm nếu an toàn sau đá
                        reasons.push('⚔️🛡️ đá + an toàn');
                    } else {
                        reasons.push('⚔️ đá địch');
                    }
                }
                
                // 6. Vào HS bonus
                if (pi.d2f <= dice && pi.d2f > 0) {
                    // Nếu đã capture (bước 5) thì d2f có thể khác
                    // Kiểm tra lại: nếu d2f > 0 và <= dice
                    score += ENTER_HS_BONUS;
                    reasons.push('🚀 vào HS');
                }
                
                // 7. Kiểm tra nếu hạ cánh ở cửa chuồng đối thủ
                for (const [oppPos, enPos] of Object.entries(ENTRANCES)) {
                    if (parseInt(oppPos) !== myPos && newPos === enPos) {
                        const opp = parsed.opponents[oppPos];
                        if (opp) {
                            const hasTokensHome = Object.values(opp.vitri).some(c => !c);
                            if (hasTokensHome) {
                                const sqSixBonus = (newPos * SAFETY / 10);
                                score -= BASE_DISTANCE + sqSixBonus;
                                reasons.push(`⚠️ đến cửa chuồng địch`);
                            }
                        }
                    }
                }
                
                // 8. Nguy hiểm tại vị trí mới (địch rình sau lưng)
                const futureDanger = assessPathDanger(pi.pathPos, dice, enemies);
                if (futureDanger > 0) {
                    score -= BASE_DISTANCE;
                    score -= (7 - futureDanger) * SAFETY;
                    reasons.push(`⚠️ ${futureDanger} địch rình`);
                }
                
                // 9. Tiến lên: bonus nhỏ cho advancement
                score += pi.adv;
            }
            
            // === PHẠT DÙNG QUÂN NHIỀU LẦN ===
            const timesUsed = (ST.recentPieces || {})[String(id)] || 0;
            if (timesUsed > 0) {
                score -= timesUsed * 10;
                reasons.push(`👎 đã dùng ${timesUsed}x`);
            }
            
            return { pieceId: id, score, reasons, ...pi };
        });
        
        // Sắp xếp: điểm cao nhất, nếu bằng thì ưu quân tiến xa hơn
        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (!a.atHome && !b.atHome) return (b.adv || 0) - (a.adv || 0);
            if (a.atHome) return 1;
            if (b.atHome) return -1;
            return 0;
        });
        
        const best = scored[0];
        
        // Track piece usage
        if (!ST.recentPieces) ST.recentPieces = {};
        ST.recentPieces[String(best.pieceId)] = (ST.recentPieces[String(best.pieceId)] || 0) + 1;
        if (ST.recentPieces[String(best.pieceId)] > 10) {
            for (const k of Object.keys(ST.recentPieces)) {
                ST.recentPieces[k] = Math.max(0, ST.recentPieces[k] - 1);
            }
        }
        sv();
        
        log(`✅ Chọn Q${best.pieceId} (score=${best.score}): ${best.reasons.join(' | ')}`);
        return best.pieceId;
    }    // GAME LOOP
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
                                ST.lastResult = '🏆 THẮNG!';
                                ST.round++;
                                log('🏆🏆🏆 THẮNG!');
                                ntf('Ludo Pro', '🏆 Thắng!');
                                sv(); ui();
                                gameEndedAt = Date.now();
                            }
                            return; // Game đã kết thúc, ko làm gì thêm
                        }
                        // Check game over (người khác thắng)
                        if (checkData.room?.status === 2 || 
                            (parsedCheck.myInfo && parsedCheck.myInfo.win === 0 && 
                             Object.values(parsedCheck.pi||{}).some(v => v && v.win === 1))) {
                            if (Date.now() - gameEndedAt > 5000) {
                                ST.losses++;
                                ST.lastResult = '💀 THUA';
                                ST.round++;
                                log('💀 Thua');
                                ntf('Ludo Pro', '💀 Thua');
                                sv(); ui();
                                gameEndedAt = Date.now();
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

            // Reload trang để DOM cập nhật (v2.2.1 - 26/06 14:25)
            // Reload 500ms sau move để API kịp xử lý, DOM refresh hoàn toàn
            // ⏱ Reload sau 1s để DOM cập nhật
            setTimeout(() => {
                if (ST.enabled) location.reload();
            }, TIMING.RELOAD_DELAY * 1000);
            
            // Bước 5: Kiểm tra bonus turn (nếu có)
            // ⏱ Chờ ngắn rồi đọc lại room check lượt
            await delay(humanDelayVariance(0.8));
            const data3 = await apiGet(`/api/game/ludo/room?id=${roomId}`);
            const p3 = parseRoom(data3);
            if (p3 && p3.myInfo?.luotdanh) {
                log(`🎯 Bonus turn! (6/capture/finish)`);
                busy = false;
                // Gọi tick ngay lập tức
                setTimeout(() => tick(), 50);
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
            font-size:13px;min-width:230px;
            box-shadow:0 8px 32px rgba(0,0,0,.6);
            user-select:none;backdrop-filter:blur(8px);`;

        p.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #21262d;">
                <span style="font-weight:700;font-size:15px;color:#58a6ff;">🎲 Ludo PRO</span>
                <span id="gb-pro-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#484f58;"></span>
            </div>
            <div style="margin-bottom:8px;font-size:12px;line-height:1.8;">
                <div style="display:flex;justify-content:space-between;">
                    <span>Vòng: <b id="gb-pro-rnd">${ST.round}</b></span>
                    <span>🏆 <b id="gb-pro-w" style="color:#3fb950;">${ST.wins}</b></span>
                    <span>💀 <b id="gb-pro-l" style="color:#f85149;">${ST.losses}</b></span>
                </div>
                <div style="margin-top:2px;font-size:11px;">
                    <span id="gb-pro-act" style="color:#8b949e;">${ST.lastAction||'Đang chờ...'}</span>
                </div>
                <div id="gb-pro-rslt" style="color:#8b949e;font-style:italic;font-size:11px;">${ST.lastResult||''}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
                <button id="gb-pro-btn" style="padding:8px 0;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;"></button>
                <button id="gb-pro-rst" style="padding:5px 0;border:1px solid #f85149;border-radius:8px;background:transparent;color:#f85149;font-size:12px;cursor:pointer;">🔄 Reset</button>
            </div>
        `;
        document.body.appendChild(p);
        document.getElementById('gb-pro-rst').onmouseenter = function(){ this.style.background='rgba(248,81,73,0.1)'; };
        document.getElementById('gb-pro-rst').onmouseleave = function(){ this.style.background='transparent'; };
        document.getElementById('gb-pro-rst').onclick = function(){ if(confirm('⚠️ Xoá toàn bộ dữ liệu?')){ rs(); sB(); } };
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
        if (r) r.textContent = ST.round;
        if (w) w.textContent = ST.wins;
        if (l) l.textContent = ST.losses;
        if (rs) rs.textContent = ST.lastResult || '';
        if (act) act.textContent = ST.lastAction || 'Đang chờ...';
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
        log('🎲 Ludo Auto-Play PRO v4.0 - Chiến thuật An Toàn Tuyệt Đối');
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
        version: '4.0.0',
    };
})();
