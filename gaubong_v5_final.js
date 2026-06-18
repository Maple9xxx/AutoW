// ==UserScript==
// @name         GauBong v5 Evolution Full
// @namespace    https://gaubong.us/
// @version      5.3.0
// @description  AI-driven selector + AI Reasoning Journal (hien thi & luu lai cach AI phan tich qua tung vong) + UI HUD gon, cai dat tach rieng
// @author       Senior Dev
// @match        https://gaubong.us/*
// @match        https://www.gaubong.us/*
// @match        https://gaubong.net/*
// @match        https://www.gaubong.net/*
// @grant        GM_xmlhttpRequest
// @connect       api.openai.com
// @connect       api.freemodel.dev
// @connect       api.anthropic.com
// @connect       cc.freemodel.dev
// @connect       generativelanguage.googleapis.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const CFG = {
        SEL: {
            xu  : 'div#app > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > select:nth-of-type(1)',
            thu : 'div#app > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > select:nth-of-type(1)',
            btn : 'div#app > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > button:nth-of-type(1)',
            bal : 'div#app > div:nth-of-type(1) > header:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(3) > span:nth-of-type(1)',
            resultRows: [
                'div#app > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1)',
                'div#app > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1)',
                'div#app > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(1)',
                'div#app > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(4) > div:nth-of-type(1)',
                'div#app > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(5) > div:nth-of-type(1)',
                'div#app > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(6) > div:nth-of-type(1)',
                'div#app > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(7) > div:nth-of-type(1)',
            ],
        },


        AI: {
            STORAGE_KEY   : 'gb_v5_ai_settings',
            JOURNAL_KEY   : 'gb_v5_ai_journal',   // nhật ký các lần AI phân tích + kết quả thực tế (cho mục tiêu "huấn luyện" AI qua thời gian)
            JOURNAL_LIMIT : 200,                  // số bản ghi tối đa lưu trong localStorage
            JOURNAL_PROMPT_WINDOW: 8,             // số bản ghi gần nhất gửi lại cho AI tham khảo mỗi lần gọi
            REASON_MAX_LEN: 220,                  // cắt ngắn lý do để không phình prompt/localStorage
            DEFAULTS: {
                openai:     { model: 'gpt-4o', baseUrl: 'https://api.freemodel.dev/v1' },
                anthropic:  { model: 'claude-3-5-haiku-20241022', baseUrl: 'https://cc.freemodel.dev/v1' }, // free tier: claude-3-5-haiku-20241022 | T1+: claude-sonnet-4-5, claude-sonnet-4-6
                gemini:     { model: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
            },
            REQUEST_TIMEOUT: 45000,
        },
        SFX_KEY     : 'gb_v5_sfx_on',
        VIB_KEY     : 'gb_v5_vibrate_on',
        SESSION_KEY : 'gb_v5_session_cfg',
        STEP_DELAY    : 400,
        RESULT_WAIT   : 2500,
        RETRY_WINDOW  : 700,
        RETRY_INTERVAL: 200,
        SYSTEM_WAIT   : 2500,
        REST_WAIT     : 500,
        LOG_LIMIT     : 80,
        LOG_LINES     : 5,

        V5: {
            HISTORY_LIMIT     : 3000,
            AUDIT_LIMIT       : 700,
            BACKTEST_WINDOW   : 250,
            RECENT_WINDOW     : 40,
            DISCOVERY_WINDOW  : 600,
            MEMORY_WINDOW     : 18,
            MIN_HISTORY       : 14,
            MIN_SUPPORT       : 8,
            MAX_STRATEGIES    : 240,
            EVOLVE_EVERY      : 50,
            ANTI_LOSS_STREAK  : 10,
        },

        HISTORY_KEY  : 'gb_v5_history',
        STRATEGY_KEY : 'gb_v5_strategies',
        AUDIT_KEY    : 'gb_v5_audit',
        TIERS_KEY    : 'gb_v5_tiers',
    };

    function parseXu(text) {
        if (!text) return NaN;
        const n = parseInt(String(text).replace(/\./g, '').replace(/[^\d]/g, ''), 10);
        return isNaN(n) ? NaN : n;
    }

    function fmtXu(n, showSign = false) {
        const sign = showSign ? (n > 0 ? '+' : n < 0 ? '-' : '') : (n < 0 ? '-' : '');
        const abs  = Math.abs(n);
        if (abs >= 1_000_000_000) return sign + (abs / 1_000_000_000).toFixed(2) + 'B';
        if (abs >= 1_000_000)     return sign + (abs / 1_000_000).toFixed(2) + 'M';
        if (abs >= 1_000)         return sign + (abs / 1_000).toFixed(1) + 'K';
        return sign + abs.toLocaleString('vi-VN');
    }

    function fmtPct(n, d = 1) {
        return (n >= 0 ? '+' : '') + n.toFixed(d) + '%';
    }

    const $ = s => document.querySelector(s);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function normalizeText(s) {
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^\p{L}\p{N}\s#-]/gu, ' ').replace(/\s+/g, ' ').trim();
    }

    // Bat ky text nao co nguon goc tu API ben ngoai (ten model, "reason" cua AI...)
    // PHAI di qua ham nay truoc khi noi vao innerHTML, tranh injection neu API/proxy bi loi hoac bi gia mao.
    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function triggerSelect(el, value) {
        try {
            const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
            setter.call(el, value);
        } catch (_) { el.value = value; }
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const Store = (() => {
        function read(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            } catch (_) { return fallback; }
        }

        function write(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
        }

        function wipe() {
            [CFG.HISTORY_KEY, CFG.STRATEGY_KEY, CFG.AUDIT_KEY].forEach(k => {
                try { localStorage.removeItem(k); } catch (_) {}
            });
        }

        return { read, write, wipe };
    })();

    // ── AI Journal ───────────────────────────────────────────────────────────
    // Day la "tri nho" rieng cua tung lan goi AI thuc su (khac voi V5 - bo may
    // thong ke noi bo). Moi vong: luu lai pick + ly do (reason) AI dua ra, sau
    // do cap nhat ket qua thuc te (hit/miss). Lan goi AI tiep theo se duoc cho
    // xem lai mot vai ban ghi gan nhat de "tu phan tinh" truoc khi chon tiep.
    //
    // Luu y ky thuat (xem Tech Warning trong phan tra loi): voi mot tro choi co
    // ket qua sinh ngau nhien tu server, nhat ky nay giup AI nhat quan & tu giai
    // thich hon, nhung KHONG bien doi do ngau nhien cua ket qua thanh thu co the
    // doan truoc duoc.
    const AIJournal = (() => {
        const KEY = CFG.AI.JOURNAL_KEY;
        let entries = Store.read(KEY, []);
        entries = Array.isArray(entries) ? entries.slice(-CFG.AI.JOURNAL_LIMIT) : [];

        function persist() {
            Store.write(KEY, entries.slice(-CFG.AI.JOURNAL_LIMIT));
        }

        function add(entry) {
            entries.push(Object.assign({
                round: null, ts: Date.now(), provider: '', model: '',
                pick: null, pickLabel: '', confidence: null, reason: '',
                actual: null, actualLabel: '', hit: null,
            }, entry));
            if (entries.length > CFG.AI.JOURNAL_LIMIT) entries = entries.slice(-CFG.AI.JOURNAL_LIMIT);
            persist();
            return entries[entries.length - 1];
        }

        function recordOutcome(round, actual, actualLabel, hit) {
            for (let i = entries.length - 1; i >= 0; i--) {
                if (entries[i].round === round) {
                    entries[i].actual = actual;
                    entries[i].actualLabel = actualLabel;
                    entries[i].hit = hit;
                    persist();
                    return entries[i];
                }
            }
            return null;
        }

        function getRecent(limit = CFG.AI.JOURNAL_PROMPT_WINDOW) {
            return entries.slice(-Math.max(0, limit));
        }

        function stats(limit = 0) {
            const rows = limit > 0 ? entries.slice(-limit) : entries;
            const judged = rows.filter(r => r.hit !== null);
            const hits = judged.filter(r => r.hit).length;
            return {
                total: judged.length,
                hits,
                misses: judged.length - hits,
                accuracy: judged.length ? Number((hits / judged.length).toFixed(3)) : 0,
            };
        }

        function wipe() {
            entries = [];
            try { localStorage.removeItem(KEY); } catch (_) {}
        }

        return { add, recordOutcome, getRecent, stats, wipe };
    })();


    const V5 = (() => {
        const C = CFG.V5;
        let history    = Store.read(CFG.HISTORY_KEY, []);
        let strategies = Store.read(CFG.STRATEGY_KEY, []);
        let audit      = Store.read(CFG.AUDIT_KEY, []);
        let nextId     = strategies.reduce((m, s) => Math.max(m, Number(s.id) || 0), 0) + 1;
        let lastDecision = null;
        let meta = {};

        history = Array.isArray(history) ? history.slice(-C.HISTORY_LIMIT) : [];
        strategies = Array.isArray(strategies) ? strategies : [];
        audit = Array.isArray(audit) ? audit.slice(-C.AUDIT_LIMIT) : [];

        function saveHistory() {
            Store.write(CFG.HISTORY_KEY, history.slice(-C.HISTORY_LIMIT));
        }

        function saveStrategies() {
            Store.write(CFG.STRATEGY_KEY, strategies);
        }

        function saveAudit() {
            Store.write(CFG.AUDIT_KEY, audit.slice(-C.AUDIT_LIMIT));
        }

        function wipeMemory() {
            history = [];
            strategies = [];
            audit = [];
            meta = {};
            nextId = 1;
            lastDecision = null;
            Store.wipe();
        }

        function posMap(order) {
            const m = {};
            order.forEach((id, pos) => { m[id] = pos; });
            return m;
        }

        function clamp01(v) {
            return Math.max(0, Math.min(1, v));
        }

        function bucket(v, cuts) {
            for (let i = 0; i < cuts.length; i++) {
                if (v <= cuts[i]) return i;
            }
            return cuts.length;
        }

        function extractFeatures(prev, cur) {
            const n = Math.max(prev.order.length, cur.order.length, 1);
            const p0 = posMap(prev.order);
            const p1 = posMap(cur.order);
            const displacements = [];
            let sameDirection = 0;
            let known = 0;

            for (let id = 0; id < n; id++) {
                if (p0[id] == null || p1[id] == null) continue;
                const d = p1[id] - p0[id];
                displacements.push(Math.abs(d));
                if (d === 0) sameDirection++;
                known++;
            }

            const avgDisplacement = displacements.length
                ? displacements.reduce((s, v) => s + v, 0) / displacements.length : 0;

            const top2Prev = prev.order.slice(0, 2);
            const top2Cur  = cur.order.slice(0, 2);
            const top3Prev = prev.order.slice(0, 3);
            const top3Cur  = cur.order.slice(0, 3);
            const overlap = (a, b) => a.filter(x => b.includes(x)).length;

            let inversions = 0, pairs = 0;
            for (let a = 0; a < n; a++) {
                for (let b = a + 1; b < n; b++) {
                    const ia = cur.order[a], ib = cur.order[b];
                    if (p0[ia] == null || p0[ib] == null) continue;
                    if (p0[ia] > p0[ib]) inversions++;
                    pairs++;
                }
            }

            const mean = avgDisplacement;
            const variance = displacements.length
                ? displacements.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / displacements.length : 0;
            const maxDisp = Math.max(1, n - 1);
            const prevWinnerPos = p0[cur.winner] == null ? null : p0[cur.winner];
            const curWinnerPos = p1[cur.winner] == null ? null : p1[cur.winner];

            const bottomJump = cur.order.filter(id => {
                return p0[id] != null && p0[id] >= Math.max(3, n - 3) && p1[id] <= 2;
            });

            return {
                winnerRepeated : prev.winner === cur.winner,
                winnerMoved    : prevWinnerPos == null || curWinnerPos == null ? 0 : curWinnerPos - prevWinnerPos,
                winnerMoveDir  : prevWinnerPos == null || curWinnerPos == null ? 'flat'
                    : curWinnerPos < prevWinnerPos ? 'up' : curWinnerPos > prevWinnerPos ? 'down' : 'flat',
                top3Overlap    : overlap(top3Prev, top3Cur),
                top2Stable     : top2Prev.length === 2 && top2Prev[0] === top2Cur[0] && top2Prev[1] === top2Cur[1],
                top2SetStable  : overlap(top2Prev, top2Cur) === 2,
                swapped12      : top2Prev.length === 2 && top2Prev[0] === top2Cur[1] && top2Prev[1] === top2Cur[0],
                swapped13      : top3Prev.length === 3 && top3Prev[0] === top3Cur[2] && top3Prev[2] === top3Cur[0],
                avgDisplacement: Number(avgDisplacement.toFixed(3)),
                reversalScore  : pairs ? Number((inversions / pairs).toFixed(3)) : 0,
                continuityScore: known ? Number((sameDirection / known).toFixed(3)) : 0,
                bottomJump,
                bottomJumpCount: bottomJump.length,
                entropy        : Number(clamp01(Math.sqrt(variance) / maxDisp).toFixed(3)),
            };
        }

        function classifyMode(features, idx = history.length - 1) {
            const recent = history.slice(Math.max(0, idx - 4), idx + 1);
            const repeatRun = recent.length >= 3 && recent.slice(-3).every(r => r.winner === recent[recent.length - 1].winner);

            if (repeatRun || (features.winnerRepeated && features.top3Overlap >= 2 && features.avgDisplacement <= 1.4)) return 'REPEAT';
            if (features.reversalScore >= 0.72 && features.avgDisplacement >= 2.0) return 'MIRROR';
            if (features.avgDisplacement >= 2.8 || features.entropy >= 0.68) return 'CHAOTIC';
            if ((features.swapped12 || features.swapped13 || features.winnerMoveDir === 'down') && features.top3Overlap >= 2) return 'REVERSAL';
            if (features.avgDisplacement <= 1.15 && features.top3Overlap >= 2 && features.continuityScore >= 0.42) return 'STABLE';
            return 'TRANSITIONAL';
        }

        function contextAt(i) {
            if (i <= 0 || i >= history.length) return null;
            const features = extractFeatures(history[i - 1], history[i]);
            const mode = classifyMode(features, i);
            return { features, mode, roundIndex: i };
        }

        function conditionValue(ctx, key) {
            if (key === 'mode') return ctx.mode;
            if (key === 'avgBand') return bucket(ctx.features.avgDisplacement, [0.8, 1.5, 2.3, 3.2]);
            if (key === 'reversalBand') return bucket(ctx.features.reversalScore, [0.25, 0.45, 0.65, 0.8]);
            if (key === 'continuityBand') return bucket(ctx.features.continuityScore, [0.2, 0.4, 0.6, 0.8]);
            if (key === 'entropyBand') return bucket(ctx.features.entropy, [0.18, 0.35, 0.55, 0.72]);
            return ctx.features[key];
        }

        function matchCondition(ctx, c) {
            const v = conditionValue(ctx, c.key);
            if (c.op === 'eq')  return v === c.value;
            if (c.op === 'gte') return Number(v) >= Number(c.value);
            if (c.op === 'lte') return Number(v) <= Number(c.value);
            return false;
        }

        function matchesStrategy(ctx, s) {
            return s.conditions.every(c => matchCondition(ctx, c));
        }

        function conditionKey(c) {
            return `${c.key}:${c.op}:${String(c.value)}`;
        }

        function strategyKey(conditions, predict) {
            return conditions.map(conditionKey).sort().join('|') + `=>${predict}`;
        }

        function dedupeConditions(conditions) {
            const seen = new Set();
            return conditions.filter(c => {
                const k = conditionKey(c);
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            }).sort((a, b) => conditionKey(a).localeCompare(conditionKey(b)));
        }

        function inferClass(conditions) {
            const keys = conditions.map(conditionKey).join('|');
            if (keys.includes('mode:eq:REPEAT') || keys.includes('winnerRepeated:eq:true') || keys.includes('top2Stable:eq:true')) return 'continuation';
            if (keys.includes('REVERSAL') || keys.includes('swapped') || keys.includes('winnerMoveDir:eq:down')) return 'reversal';
            if (keys.includes('MIRROR') || keys.includes('reversalBand')) return 'mirror';
            if (keys.includes('CHAOTIC') || keys.includes('entropyBand')) return 'chaotic';
            if (keys.includes('TRANSITIONAL')) return 'transitional';
            return 'structural';
        }

        function atomsFromContext(ctx) {
            const f = ctx.features;
            const atoms = [
                { key: 'mode', op: 'eq', value: ctx.mode },
                { key: 'winnerRepeated', op: 'eq', value: !!f.winnerRepeated },
                { key: 'winnerMoveDir', op: 'eq', value: f.winnerMoveDir },
                f.top3Overlap >= 2
                    ? { key: 'top3Overlap', op: 'gte', value: Math.min(3, f.top3Overlap) }
                    : { key: 'top3Overlap', op: 'eq', value: Math.max(0, f.top3Overlap) },
                { key: 'top2Stable', op: 'eq', value: !!f.top2Stable },
                { key: 'top2SetStable', op: 'eq', value: !!f.top2SetStable },
                { key: 'swapped12', op: 'eq', value: !!f.swapped12 },
                { key: 'swapped13', op: 'eq', value: !!f.swapped13 },
                { key: 'avgBand', op: 'eq', value: conditionValue(ctx, 'avgBand') },
                { key: 'reversalBand', op: 'eq', value: conditionValue(ctx, 'reversalBand') },
                { key: 'continuityBand', op: 'eq', value: conditionValue(ctx, 'continuityBand') },
                { key: 'entropyBand', op: 'eq', value: conditionValue(ctx, 'entropyBand') },
            ];
            if (f.bottomJumpCount > 0) {
                atoms.push({ key: 'bottomJumpCount', op: 'gte', value: Math.min(2, f.bottomJumpCount) });
            }
            return atoms;
        }

        function discoverStrategies() {
            if (history.length < C.MIN_HISTORY) return 0;

            const start = Math.max(1, history.length - C.DISCOVERY_WINDOW);
            const rows = [];
            for (let i = start; i < history.length - 1; i++) {
                const ctx = contextAt(i);
                if (!ctx) continue;
                rows.push({ ctx, target: history[i + 1].winner });
            }

            const buckets = new Map();
            rows.forEach(row => {
                const atoms = atomsFromContext(row.ctx);
                const combos = [];
                atoms.forEach(a => combos.push([a]));

                const modeAtom = atoms[0];
                atoms.slice(1).forEach(a => combos.push([modeAtom, a]));

                for (let i = 1; i < atoms.length; i++) {
                    for (let j = i + 1; j < atoms.length; j++) {
                        const ki = atoms[i].key, kj = atoms[j].key;
                        if ((ki.includes('Band') && kj.includes('Band')) || ki === kj) continue;
                        combos.push([atoms[i], atoms[j]]);
                    }
                }

                combos.forEach(raw => {
                    const conditions = dedupeConditions(raw);
                    const sig = conditions.map(conditionKey).join('|');
                    if (!buckets.has(sig)) buckets.set(sig, { conditions, counts: {}, total: 0 });
                    const b = buckets.get(sig);
                    b.total++;
                    b.counts[row.target] = (b.counts[row.target] || 0) + 1;
                });
            });

            const existing = new Set(strategies.map(s => strategyKey(s.conditions, s.predict)));
            let created = 0;

            Array.from(buckets.values())
                .filter(b => b.total >= C.MIN_SUPPORT)
                .map(b => {
                    const best = Object.entries(b.counts)
                        .sort((a, b2) => b2[1] - a[1] || Number(a[0]) - Number(b2[0]))[0];
                    return {
                        conditions: b.conditions,
                        predict: Number(best[0]),
                        support: b.total,
                        rate: best[1] / b.total,
                    };
                })
                .filter(c => c.rate >= 0.38 || (c.support >= 18 && c.rate >= 0.30))
                .sort((a, b) => (b.rate * Math.min(40, b.support)) - (a.rate * Math.min(40, a.support)))
                .slice(0, 80)
                .forEach(c => {
                    const key = strategyKey(c.conditions, c.predict);
                    if (existing.has(key)) return;
                    strategies.push({
                        id: nextId++,
                        class: inferClass(c.conditions),
                        conditions: c.conditions,
                        predict: c.predict,
                        wins: 0,
                        losses: 0,
                        recentWins: 0,
                        recentLosses: 0,
                        age: 0,
                        confidence: 0,
                        disabled: false,
                        disabledReason: '',
                        lossStreak: 0,
                        context: {},
                        discoveredAt: history.length,
                    });
                    existing.add(key);
                    created++;
                });

            return created;
        }

        function recordPerf(perf, s, ctx, actual, recent) {
            const p = perf.get(s.id);
            const hit = s.predict === actual;
            if (hit) p.wins++; else p.losses++;
            if (recent) {
                if (hit) p.recentWins++; else p.recentLosses++;
                p.recentSeq.push(hit);
            }
            if (!p.context[ctx.mode]) p.context[ctx.mode] = { wins: 0, total: 0 };
            p.context[ctx.mode].total++;
            if (hit) p.context[ctx.mode].wins++;
        }

        function rebuildMeta() {
            const byClass = {};
            strategies.forEach(s => {
                const total = s.recentWins + s.recentLosses;
                if (total < 5) return;
                if (!byClass[s.class]) byClass[s.class] = { wins: 0, total: 0 };
                byClass[s.class].wins += s.recentWins;
                byClass[s.class].total += total;
            });

            meta = {};
            Object.entries(byClass).forEach(([cls, r]) => {
                const wr = r.total ? r.wins / r.total : 0;
                meta[cls] = {
                    wr,
                    total: r.total,
                    multiplier: r.total >= 12 ? Math.max(0.55, Math.min(1.45, 0.45 + wr * 1.35)) : 1,
                };
            });
        }

        function backtestStrategies() {
            if (!strategies.length || history.length < C.MIN_HISTORY) {
                rebuildMeta();
                return;
            }

            const start = Math.max(1, history.length - C.BACKTEST_WINDOW);
            const recentStart = Math.max(1, history.length - C.RECENT_WINDOW);
            const perf = new Map();
            strategies.forEach(s => {
                perf.set(s.id, {
                    wins: 0, losses: 0,
                    recentWins: 0, recentLosses: 0,
                    recentSeq: [],
                    context: {},
                });
            });

            for (let i = start; i < history.length - 1; i++) {
                const ctx = contextAt(i);
                if (!ctx) continue;
                const actual = history[i + 1].winner;
                const recent = i >= recentStart;
                strategies.forEach(s => {
                    if (matchesStrategy(ctx, s)) recordPerf(perf, s, ctx, actual, recent);
                });
            }

            const currentCtx = contextAt(history.length - 1);
            strategies.forEach(s => {
                const p = perf.get(s.id);
                const total = p.wins + p.losses;
                const recentTotal = p.recentWins + p.recentLosses;
                const wr = total ? p.wins / total : 0;
                const recentWR = recentTotal ? p.recentWins / recentTotal : wr;
                const support = Math.min(1, total / 32);
                const modeStats = currentCtx && p.context[currentCtx.mode] ? p.context[currentCtx.mode] : null;
                const modeWR = modeStats && modeStats.total ? modeStats.wins / modeStats.total : recentWR;

                s.wins = p.wins;
                s.losses = p.losses;
                s.recentWins = p.recentWins;
                s.recentLosses = p.recentLosses;
                s.context = {};
                Object.entries(p.context).forEach(([mode, r]) => {
                    s.context[mode.toLowerCase()] = r.total ? Number((r.wins / r.total).toFixed(3)) : 0;
                    s.context[`${mode.toLowerCase()}N`] = r.total;
                });
                s.age = Math.max(0, history.length - (s.discoveredAt || 0));

                let confidence = (wr * 0.36) + (recentWR * 0.48) + (support * 0.16);
                if (total < C.MIN_SUPPORT) confidence *= 0.45;
                if (recentTotal >= 12 && recentWR < 0.40) confidence *= 0.40;
                if (modeStats && modeStats.total >= 8 && modeWR < 0.36) confidence *= 0.55;

                let streak = 0;
                for (let i = p.recentSeq.length - 1; i >= 0; i--) {
                    if (p.recentSeq[i]) break;
                    streak++;
                }
                s.lossStreak = streak;
                s.disabled = total >= C.MIN_SUPPORT && (streak >= C.ANTI_LOSS_STREAK || (recentTotal >= 18 && recentWR < 0.24));
                s.disabledReason = s.disabled ? (streak >= C.ANTI_LOSS_STREAK ? 'loss_streak' : 'recent_cold') : '';
                s.confidence = Number(clamp01(confidence).toFixed(4));
            });

            rebuildMeta();
        }

        function mutateCondition(c) {
            const copy = Object.assign({}, c);
            if (copy.op === 'gte' && typeof copy.value === 'number') copy.value = Math.max(0, copy.value - 1);
            else if (copy.key.endsWith('Band') && typeof copy.value === 'number') copy.value = Math.max(0, copy.value - 1);
            else if (copy.op === 'eq' && typeof copy.value === 'boolean') copy.value = !copy.value;
            return copy;
        }

        function evolveStrategies() {
            if (!strategies.length || history.length < C.MIN_HISTORY) return;

            strategies = strategies
                .filter(s => {
                    const total = s.wins + s.losses;
                    const recentTotal = s.recentWins + s.recentLosses;
                    const wr = total ? s.wins / total : 0;
                    const recentWR = recentTotal ? s.recentWins / recentTotal : wr;
                    if (total >= 20 && recentTotal >= 12 && wr < 0.22 && recentWR < 0.22) return false;
                    return true;
                })
                .sort((a, b) => b.confidence - a.confidence || a.id - b.id)
                .slice(0, C.MAX_STRATEGIES);

            const existing = new Set(strategies.map(s => strategyKey(s.conditions, s.predict)));
            const elites = strategies
                .filter(s => !s.disabled && (s.recentWins + s.recentLosses) >= 8 && s.confidence >= 0.58)
                .slice(0, 8);

            elites.forEach(s => {
                if (strategies.length >= C.MAX_STRATEGIES) return;
                const conditions = dedupeConditions(s.conditions.map((c, i) => i === s.conditions.length - 1 ? mutateCondition(c) : Object.assign({}, c)));
                const key = strategyKey(conditions, s.predict);
                if (existing.has(key)) return;
                strategies.push({
                    id: nextId++,
                    class: s.class,
                    conditions,
                    predict: s.predict,
                    wins: 0,
                    losses: 0,
                    recentWins: 0,
                    recentLosses: 0,
                    age: 0,
                    confidence: Math.max(0.1, s.confidence * 0.72),
                    disabled: false,
                    disabledReason: '',
                    lossStreak: 0,
                    context: {},
                    discoveredAt: history.length,
                    parent: s.id,
                });
                existing.add(key);
            });
        }

        function contextMultiplier(s, mode) {
            const key = mode.toLowerCase();
            const n = s.context?.[`${key}N`] || 0;
            const wr = s.context?.[key];
            if (!n || wr == null) return 1;
            if (n >= 8 && wr < 0.34) return 0;
            return Math.max(0.55, Math.min(1.35, 0.65 + wr));
        }

        function decide(n) {
            const ctx = contextAt(history.length - 1);
            const votes = {};
            const used = [];
            const fallback = history.length ? history[history.length - 1].order[0] : 0;

            if (ctx) {
                strategies.forEach(s => {
                    if (s.disabled || s.predict == null || s.predict < 0 || s.predict >= n) return;
                    if (!matchesStrategy(ctx, s)) return;
                    const ctxMult = contextMultiplier(s, ctx.mode);
                    if (ctxMult <= 0) return;
                    const classMult = meta[s.class]?.multiplier || 1;
                    const score = Number((s.confidence * ctxMult * classMult).toFixed(5));
                    if (score <= 0) return;
                    votes[s.predict] = (votes[s.predict] || 0) + score;
                    used.push({ id: s.id, class: s.class, predict: s.predict, score, confidence: s.confidence });
                });
            }

            let pick = fallback;
            let best = -1;
            Object.keys(votes).map(Number).sort((a, b) => a - b).forEach(id => {
                if (votes[id] > best) {
                    best = votes[id];
                    pick = id;
                }
            });

            const confidence = best > 0 ? Math.min(0.99, best / (best + 1.4)) : 0;
            lastDecision = {
                round: history.length + 1,
                ts: Date.now(),
                mode: ctx ? ctx.mode : 'WARMUP',
                picked: pick,
                confidence: Number(confidence.toFixed(3)),
                votes: Object.fromEntries(Object.entries(votes).map(([k, v]) => [k, Number(v.toFixed(4))])),
                strategiesUsed: used.sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 12),
                features: ctx ? ctx.features : null,
                fallback: best <= 0,
            };
            return lastDecision;
        }

        function learnRound(round, decision = lastDecision) {
            if (!round || !Array.isArray(round.order) || typeof round.winner !== 'number') return null;
            history.push({
                ts: round.ts || Date.now(),
                order: round.order.map(Number),
                winner: Number(round.winner),
            });
            if (history.length > C.HISTORY_LIMIT) history = history.slice(-C.HISTORY_LIMIT);

            if (decision) {
                const entry = {
                    round: history.length,
                    ts: Date.now(),
                    mode: decision.mode,
                    picked: decision.picked,
                    actual: round.winner,
                    strategiesUsed: decision.strategiesUsed.map(s => s.id),
                    confidence: decision.confidence,
                    success: decision.picked === round.winner,
                    votes: decision.votes,
                };
                audit.push(entry);
                if (audit.length > C.AUDIT_LIMIT) audit = audit.slice(-C.AUDIT_LIMIT);
                saveAudit();
            }
            lastDecision = null;

            const created = discoverStrategies();
            backtestStrategies();
            if (history.length > 0 && history.length % C.EVOLVE_EVERY === 0) evolveStrategies();
            saveHistory();
            saveStrategies();
            return { created, totalStrategies: strategies.length };
        }

        function getDebug(n) {
            const current = lastDecision || decide(n || 7);
            const top = strategies
                .slice()
                .sort((a, b) => b.confidence - a.confidence || a.id - b.id)
                .slice(0, 6)
                .map(s => ({
                    id: s.id,
                    class: s.class,
                    wr: s.wins + s.losses ? s.wins / (s.wins + s.losses) : 0,
                    recent: s.recentWins + s.recentLosses ? s.recentWins / (s.recentWins + s.recentLosses) : 0,
                    confidence: s.confidence,
                    disabled: !!s.disabled,
                    predict: s.predict,
                }));
            const memory = getMemorySnapshot(C.MEMORY_WINDOW);

            return {
                memory,
                totalRounds: history.length,
                strategies: strategies.length,
                active: current.strategiesUsed.length,
                pick: current.picked,
                confidence: current.confidence,
                fallback: current.fallback,
                top,
                meta,
                audit: audit.slice(-1)[0] || null,
            };
        }

        function getHistorySize() { return history.length; }
        function getStrategySize() { return strategies.length; }

        function conditionLabel(c) {
            const value = typeof c.value === 'boolean' ? (c.value ? 'T' : 'F') : c.value;
            return `${c.key}${c.op}${value}`;
        }

        function summarizeAudit(limit = 24) {
            const rows = audit.slice(-Math.max(0, limit));
            const total = rows.length;
            const hits = rows.filter(r => r.success).length;
            const avgConfidence = total ? rows.reduce((s, r) => s + (Number(r.confidence) || 0), 0) / total : 0;
            let streak = 0;
            for (let i = rows.length - 1; i >= 0; i--) {
                if (!rows[i].success) break;
                streak++;
            }
            const mistakes = rows.filter(r => !r.success).slice(-5).map(r => ({
                round: r.round,
                picked: Number.isFinite(Number(r.picked)) ? Number(r.picked) + 1 : null,
                actual: Number.isFinite(Number(r.actual)) ? Number(r.actual) + 1 : null,
                confidence: Number((Number(r.confidence) || 0).toFixed(3)),
            }));
            return {
                total,
                hits,
                misses: total - hits,
                accuracy: total ? Number((hits / total).toFixed(3)) : 0,
                avgConfidence: Number(avgConfidence.toFixed(3)),
                streak,
                mistakes,
            };
        }

        function getRecentRounds(limit = 8) {
            return history.slice(-Math.max(0, limit)).map(r => ({
                ts: r.ts,
                order: Array.isArray(r.order) ? r.order.slice() : [],
                winner: r.winner,
            }));
        }

        function getMemorySnapshot(limit = C.MEMORY_WINDOW) {
            const recent = history.slice(-Math.max(0, limit)).map((r, idx, arr) => ({
                round: history.length - arr.length + idx + 1,
                order: Array.isArray(r.order) ? r.order.map(v => v + 1) : [],
                winner: Number.isInteger(r.winner) ? r.winner + 1 : null,
            }));
            const auditAll = summarizeAudit(audit.length || 0);
            const auditRecent = summarizeAudit(limit);
            const topSignals = strategies
                .slice()
                .sort((a, b) => b.confidence - a.confidence || (b.wins + b.losses) - (a.wins + a.losses) || a.id - b.id)
                .slice(0, 6)
                .map(s => ({
                    id: s.id,
                    class: s.class,
                    predict: Number.isInteger(s.predict) ? s.predict + 1 : null,
                    confidence: Number(s.confidence.toFixed(4)),
                    support: s.wins + s.losses,
                    recentWR: s.recentWins + s.recentLosses ? Number((s.recentWins / (s.recentWins + s.recentLosses)).toFixed(3)) : 0,
                    disabled: !!s.disabled,
                    conditions: s.conditions.slice(0, 5).map(conditionLabel),
                }));
            return {
                version: 2,
                totalRounds: history.length,
                totalStrategies: strategies.length,
                totalAudit: auditAll.total,
                lifetimeAccuracy: auditAll.accuracy,
                recentAccuracy: auditRecent.accuracy,
                avgConfidence: auditRecent.avgConfidence,
                streak: auditRecent.streak,
                mistakes: auditRecent.mistakes,
                recentRounds: recent,
                topSignals,
                guidance: auditAll.total >= C.MIN_HISTORY
                    ? 'Exploit high-support signals with strong recent accuracy. Prefer stable patterns over fresh guesses.'
                    : 'Warmup state. Lean on compact history and keep exploration broad.',
            };
        }

        return {
            decide,
            learnRound,
            getDebug,
            getHistorySize,
            getStrategySize,
            getRecentRounds,
            getMemorySnapshot,
            wipeMemory,
        };
    })();


    const AI = (() => {
        const KEY = CFG.AI.STORAGE_KEY;

        const fallbackState = () => ({
            enabled: true,
            provider: 'openai',
            openai:    { key: '', model: CFG.AI.DEFAULTS.openai.model, baseUrl: CFG.AI.DEFAULTS.openai.baseUrl },
            anthropic: { key: '', model: CFG.AI.DEFAULTS.anthropic.model, baseUrl: CFG.AI.DEFAULTS.anthropic.baseUrl, authMode: 'native' },
            gemini:    { key: '', model: CFG.AI.DEFAULTS.gemini.model, baseUrl: CFG.AI.DEFAULTS.gemini.baseUrl },
            lastOk: false,
            lastError: '',
            lastLatency: 0,
            lastRaw: '',
        });

        let state = Object.assign(fallbackState(), (() => {
            try {
                const raw = localStorage.getItem(KEY);
                if (!raw) return {};
                const parsed = JSON.parse(raw);
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (_) {
                return {};
            }
        })());

        function persist() {
            try {
                localStorage.setItem(KEY, JSON.stringify({
                    enabled: !!state.enabled,
                    provider: state.provider,
                    openai: state.openai,
                    anthropic: state.anthropic,
                    gemini: state.gemini,
                    lastOk: !!state.lastOk,
                    lastError: state.lastError || '',
                    lastLatency: Number(state.lastLatency) || 0,
                    lastRaw: state.lastRaw || '',
                }));
            } catch (_) {}
        }

        function sanitizeProvider(provider) {
            return ['openai', 'anthropic', 'gemini'].includes(provider) ? provider : 'openai';
        }

        function currentProvider() {
            return sanitizeProvider(state.provider);
        }

        function normalizeBaseUrl(provider, baseUrl) {
            const def = String(CFG.AI.DEFAULTS[provider]?.baseUrl || '').trim();
            let url = String(baseUrl || def).trim();
            if (!url) return def;
            url = url.replace(/\/+$/, '');
            if (provider === 'openai' || provider === 'anthropic') {
                if (!/\/v1$/.test(url)) url += '/v1';
            }
            return url;
        }

        function currentConfig() {
            const provider = currentProvider();
            const cfg = state[provider] || {};
            return {
                provider,
                key: String(cfg.key || '').trim(),
                model: String(cfg.model || CFG.AI.DEFAULTS[provider].model).trim(),
                baseUrl: normalizeBaseUrl(provider, cfg.baseUrl),
                authMode: String(cfg.authMode || 'native'), // 'native'=x-api-key (Anthropic.com, cc.freemodel.dev) | 'bearer'=Authorization Bearer (OpenRouter, LiteLLM proxy)
            };
        }

        function setEnabled(v) {
            state.enabled = !!v;
            persist();
        }

        function setProvider(provider) {
            state.provider = sanitizeProvider(provider);
            persist();
        }

        function setKey(key) {
            const provider = currentProvider();
            state[provider] = state[provider] || {};
            state[provider].key = String(key || '');
            persist();
        }

        function setModel(model) {
            const provider = currentProvider();
            state[provider] = state[provider] || {};
            state[provider].model = String(model || '').trim() || CFG.AI.DEFAULTS[provider].model;
            persist();
        }

        function setBaseUrl(baseUrl) {
            const provider = currentProvider();
            state[provider] = state[provider] || {};
            state[provider].baseUrl = String(baseUrl || '').trim() || CFG.AI.DEFAULTS[provider].baseUrl;
            persist();
        }

        function setAuthMode(mode) {
            const provider = currentProvider();
            state[provider] = state[provider] || {};
            state[provider].authMode = ['native', 'bearer'].includes(mode) ? mode : 'native';
            persist();
        }

        function setRuntime(ok, error, latency, raw) {
            state.lastOk = !!ok;
            state.lastError = error ? String(error) : '';
            state.lastLatency = Number(latency) || 0;
            state.lastRaw = raw ? String(raw) : '';
            persist();
        }

        function cloneState() {
            return JSON.parse(JSON.stringify(state));
        }

        function gmRequest({ method = 'GET', url, headers = {}, data = null, timeout = CFG.AI.REQUEST_TIMEOUT }) {
            return new Promise((resolve, reject) => {
                if (typeof GM_xmlhttpRequest !== 'function') {
                    reject(new Error('GM_xmlhttpRequest unavailable'));
                    return;
                }
                GM_xmlhttpRequest({
                    method,
                    url,
                    headers,
                    data,
                    timeout,
                    responseType: 'text',
                    onload: res => {
                        const ok = res.status >= 200 && res.status < 300;
                        if (!ok) {
                            // Lay body error de debug
                            let errBody = '';
                            try { errBody = (res.responseText || '').slice(0, 300); } catch(_) {}
                            reject(new Error(`HTTP ${res.status}: ${errBody}`));
                            return;
                        }
                        resolve(res.responseText || '');
                    },
                    onerror: res => {
                        // onerror on mobile co the fire thay cho onload khi bi block o network/extension level
                        // status 403 = Tampermonkey sandbox block, khong phai HTTP 403 tu server
                        let errBody = '';
                        try { errBody = (res.responseText || res.response || '').slice(0, 200); } catch(_) {}
                        const msg = `Network error${res?.status ? ' '+res.status : ''}${errBody ? ': '+errBody : ''}`;
                        reject(new Error(msg));
                    },
                    ontimeout: () => reject(new Error('Request timeout')),
                });
            });
        }

        function stripCodeFences(text) {
            const raw = String(text || '').trim();
            const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
            return fenced ? fenced[1].trim() : raw;
        }

        function extractJson(text) {
            const raw = stripCodeFences(text);
            try {
                return JSON.parse(raw);
            } catch (_) {}
            const first = raw.indexOf('{');
            const last = raw.lastIndexOf('}');
            if (first >= 0 && last > first) {
                try { return JSON.parse(raw.slice(first, last + 1)); } catch (_) {}
            }
            const firstArr = raw.indexOf('[');
            const lastArr = raw.lastIndexOf(']');
            if (firstArr >= 0 && lastArr > firstArr) {
                try { return JSON.parse(raw.slice(firstArr, lastArr + 1)); } catch (_) {}
            }
            return null;
        }

        function normalizePick(text, n) {
            const json = extractJson(text);
            let pick = null;
            let confidence = null;
            let reason = '';
            if (json && typeof json === 'object') {
                pick = Number(json.pick ?? json.choice ?? json.selected ?? json.index ?? json.winner);
                confidence = Number(json.confidence ?? json.conf ?? NaN);
                reason = String(json.reason ?? json.note ?? json.explanation ?? '');
            }
            if (!Number.isInteger(pick)) {
                const m = String(text || '').match(/\b([1-7])\b/);
                if (m) pick = Number(m[1]);
            }
            if (!Number.isInteger(pick) || pick < 1 || pick > n) return null;
            return {
                pick,
                confidence: Number.isFinite(confidence) ? confidence : null,
                reason,
                raw: String(text || ''),
            };
        }

        function buildPrompt({ n, options, memory, journal }) {
            const lines = [];
            lines.push('Ban la mot bo phan quyet dinh co bo nho dai han. Khong duoc dua ra mode co dinh.');
            lines.push('Hay su dung bo nho ben duoi nhu kinh nghiem da hoc de chon lua chon co ky vong loi ich dai han tot nhat.');
            lines.push('Tra ve DUY NHAT JSON hop le, khong markdown, khong giai thich ngoai JSON.');
            lines.push('Schema: {"pick":1,"confidence":0.0,"reason":"ngan gon"}');
            lines.push(`Quy tac: pick phai la so nguyen tu 1 den ${n}.`);
            lines.push('Danh sach lua chon:');
            options.forEach((opt, idx) => {
                lines.push(`${idx + 1}. ${opt}`);
            });
            if (memory) {
                lines.push('Bo nho dai han (memory snapshot):');
                lines.push(JSON.stringify(memory));
            }
            if (Array.isArray(journal) && journal.length) {
                lines.push('Nhat ky cac lan ban (AI) da phan tich gan day va ket qua thuc te (true = ban da doan dung, false = sai). Hay tu xem lai de dieu chinh, KHONG lap lai cung mot kieu suy luan da sai nhieu lan:');
                lines.push(JSON.stringify(journal.map(j => ({
                    round: j.round, picked: j.pickLabel || j.pick, reason: j.reason,
                    actual: j.actualLabel || j.actual, correct: j.hit,
                }))));
            }
            return lines.join('\n');
        }

        async function callOpenAI({ key, model, baseUrl, prompt }) {
            const payload = {
                model,
                messages: [
                    { role: 'system', content: 'Use long-term memory to improve over time. Do not rely on fixed modes. Choose exactly one option and return JSON only.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0,
                max_tokens: 120,
                stream: false,
            };
            const url = `${String(baseUrl || CFG.AI.DEFAULTS.openai.baseUrl).replace(/\/+$/, '')}/chat/completions`;
            const raw = await gmRequest({
                method: 'POST',
                url,
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                data: JSON.stringify(payload),
            });
            const json = JSON.parse(raw);
            const text = String(json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text || json.output_text || '').trim()
                || (Array.isArray(json.output)
                    ? json.output.map(item => {
                        if (Array.isArray(item?.content)) return item.content.map(c => c?.text || '').join('');
                        return item?.text || '';
                    }).join('\n')
                    : '');
            return { text, raw };
        }

        async function callAnthropic({ key, model, baseUrl, prompt, authMode }) {
            const payload = {
                model,
                max_tokens: 120,
                temperature: 0,
                system: 'Use long-term memory to improve over time. Do not rely on fixed modes. Choose exactly one option and return JSON only.',
                messages: [{ role: 'user', content: prompt }],
            };
            const url = `${String(baseUrl || CFG.AI.DEFAULTS.anthropic.baseUrl).replace(/\/+$/, '')}/messages`;

            // authMode 'native'  → x-api-key + anthropic-version
            //   (dùng cho: api.anthropic.com, cc.freemodel.dev, và bất kỳ proxy nào dùng Anthropic format)
            // authMode 'bearer'  → Authorization: Bearer
            //   (dùng cho: OpenRouter, LiteLLM, generic OpenAI-compat proxy)
            // Fallback auto-detect: nếu authMode không được set, kiểm tra domain
            const effectiveMode = authMode === 'bearer' ? 'bearer'
                : authMode === 'native' ? 'native'
                : /api\.anthropic\.com/i.test(url) ? 'native' : 'bearer';
            const headers = { 'content-type': 'application/json' };
            // anthropic-version luon duoc gui voi moi Anthropic-format endpoint
            // (du dung x-api-key hay Bearer - mot so proxy can header nay)
            headers['anthropic-version'] = '2023-06-01';
            if (effectiveMode === 'native') {
                headers['x-api-key'] = key;
            } else {
                headers['Authorization'] = `Bearer ${key}`;
            }

            const raw = await gmRequest({
                method: 'POST',
                url,
                headers,
                data: JSON.stringify(payload),
            });
            const json = JSON.parse(raw);
            // Ket qua: ho tro ca Anthropic format va OpenAI-compat format tu proxy
            let text = '';
            if (Array.isArray(json.content)) {
                text = json.content.map(c => c?.text || '').join('\n').trim();
            } else if (json?.choices?.[0]?.message?.content) {
                text = String(json.choices[0].message.content).trim();
            }
            return { text, raw };
        }

        async function callGemini({ key, model, prompt }) {
            const payload = {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0,
                    topP: 1,
                    topK: 1,
                    maxOutputTokens: 120,
                    responseMimeType: 'application/json',
                },
            };
            const raw = await gmRequest({
                method: 'POST',
                url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
                headers: { 'content-type': 'application/json' },
                data: JSON.stringify(payload),
            });
            const json = JSON.parse(raw);
            const text = Array.isArray(json.candidates)
                ? json.candidates.map(c => c?.content?.parts?.map(p => p?.text || '').join('') || '').join('\n').trim()
                : '';
            return { text, raw };
        }

        async function runProvider(prompt) {
            const cfg = currentConfig();
            if (!state.enabled) throw new Error('AI mode is disabled');
            if (!cfg.key) throw new Error(`Missing ${cfg.provider} API key`);
            if (!cfg.model) throw new Error(`Missing ${cfg.provider} model`);
            const provider = cfg.provider;
            const call = provider === 'openai' ? callOpenAI
                : provider === 'anthropic' ? callAnthropic
                : callGemini;
            return { cfg, ...(await call({ ...cfg, prompt })) };
        }

        async function choose({ n, options, memory, round }) {
            const start = performance.now();
            try {
                const journalCtx = AIJournal.getRecent(CFG.AI.JOURNAL_PROMPT_WINDOW);
                const prompt = buildPrompt({ n, options, memory, journal: journalCtx });
                const { cfg, text, raw } = await runProvider(prompt);
                const parsed = normalizePick(text, n);
                if (!parsed) throw new Error(`AI returned an invalid choice: ${String(text || raw).slice(0, 180)}`);
                const latency = Math.round(performance.now() - start);
                setRuntime(true, '', latency, raw);
                const reasonShort = String(parsed.reason || '').slice(0, CFG.AI.REASON_MAX_LEN);
                AIJournal.add({
                    round: round ?? null,
                    provider: cfg.provider,
                    model: cfg.model,
                    pick: parsed.pick - 1,
                    pickLabel: options[parsed.pick - 1] || '',
                    confidence: parsed.confidence,
                    reason: reasonShort,
                });
                return {
                    picked: parsed.pick - 1,
                    provider: cfg.provider,
                    model: cfg.model,
                    confidence: parsed.confidence,
                    reason: reasonShort,
                    rawText: text,
                    latencyMs: latency,
                    ok: true,
                    mode: `${cfg.provider.toUpperCase()}_MEMORY_AI`,
                    strategiesUsed: [],
                    votes: {},
                    memory,
                    round: round ?? null,
                };
            } catch (err) {
                const latency = Math.round(performance.now() - start);
                setRuntime(false, err?.message || 'AI error', latency, '');
                throw err;
            }
        }

        async function testConnection() {
            const start = performance.now();
            const cfg = currentConfig();
            try {
                const prompt = buildPrompt({
                    n: 7,
                    options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
                    memory: V5.getMemorySnapshot(6),
                });
                const { text, raw } = await runProvider(prompt);
                const parsed = normalizePick(text, 7);
                const latency = Math.round(performance.now() - start);
                setRuntime(true, '', latency, raw);
                return {
                    ok: !!parsed,
                    provider: cfg.provider,
                    model: cfg.model,
                    latencyMs: latency,
                    rawText: text,
                };
            } catch (err) {
                const latency = Math.round(performance.now() - start);
                setRuntime(false, err?.message || 'AI test failed', latency, '');
                throw err;
            }
        }

        return {
            getState: cloneState,
            getCurrentConfig: currentConfig,
            setEnabled,
            setProvider,
            setKey,
            setModel,
            setBaseUrl,
            setAuthMode,
            choose,
            testConnection,
        };
    })();


    const Tracker = (() => {
        let sessionStart = NaN, prevXu = NaN;
        let wins = 0, losses = 0, draws = 0;

        function readXu() {
            const el = document.querySelector(CFG.SEL.bal);
            if (!el) return NaN;
            return parseXu(el.textContent || el.innerText || '');
        }

        function startSession() {
            const xu = readXu();
            sessionStart = isNaN(xu) ? 0 : xu;
            prevXu = sessionStart;
            wins = losses = draws = 0;
            Panel.renderPnL({ currentXu: sessionStart, sessionDelta: 0, sessionPct: 0, wins, losses, draws });
        }

        function snapshotBefore() {
            const xu = readXu();
            if (!isNaN(xu)) prevXu = xu;
        }

        function recordResult() {
            const currentXu = readXu();
            if (isNaN(currentXu)) return null;
            const roundDelta = isNaN(prevXu) ? 0 : currentXu - prevXu;
            const roundPct = (!isNaN(prevXu) && prevXu > 0) ? (roundDelta / prevXu) * 100 : 0;
            const sessionDelta = isNaN(sessionStart) ? 0 : currentXu - sessionStart;
            const sessionPct = (!isNaN(sessionStart) && sessionStart > 0) ? (sessionDelta / sessionStart) * 100 : 0;

            if      (roundDelta > 0) wins++;
            else if (roundDelta < 0) losses++;
            else                     draws++;
            prevXu = currentXu;

            Panel.renderPnL({ currentXu, sessionDelta, sessionPct, wins, losses, draws });
            const icon = roundDelta > 0 ? 'UP' : roundDelta < 0 ? 'DOWN' : 'FLAT';
            Panel.log(`${icon} ${fmtXu(roundDelta, true)} (${fmtPct(roundPct)}) | S:${fmtPct(sessionPct)} | ${wins}W${losses}L`);
            return { roundDelta, roundPct, sessionDelta, sessionPct, currentXu };
        }

        return { startSession, snapshotBefore, recordResult };
    })();

    // ── Feedback (SFX + Vibration) ──────────────────────────────────────────
    // Tao tieng "ding" thang / "thut" thua hoan toan bang Web Audio API (khong
    // tai file -> nhe, khong cache). AudioContext can mot user-gesture de mo
    // (Sfx.unlock() duoc goi trong nut BAT DAU). Ca hai co the bat/tat rieng va
    // duoc nho qua localStorage.
    const Sfx = (() => {
        let ctx = null;
        function ensureCtx() {
            try {
                if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
                else if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            } catch (_) { ctx = null; }
            return ctx;
        }
        function isEnabled() {
            try { return localStorage.getItem(CFG.SFX_KEY) !== '0'; } catch (_) { return true; }
        }
        function setEnabled(v) {
            try { localStorage.setItem(CFG.SFX_KEY, v ? '1' : '0'); } catch (_) {}
        }
        function beep(f0, f1, dur, type, vol) {
            if (!isEnabled()) return;
            const c = ensureCtx();
            if (!c) return;
            try {
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(f0, c.currentTime);
                osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), c.currentTime + dur);
                gain.gain.setValueAtTime(vol, c.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0008, c.currentTime + dur);
                osc.connect(gain).connect(c.destination);
                osc.start();
                osc.stop(c.currentTime + dur + 0.03);
            } catch (_) {}
        }
        return {
            unlock: ensureCtx,
            win : () => beep(440, 880, 0.22, 'triangle', 0.05),
            lose: () => beep(300, 120, 0.26, 'sawtooth', 0.04),
            isEnabled, setEnabled,
        };
    })();

    const Vib = (() => {
        function isEnabled() {
            try { return localStorage.getItem(CFG.VIB_KEY) !== '0'; } catch (_) { return true; }
        }
        function setEnabled(v) {
            try { localStorage.setItem(CFG.VIB_KEY, v ? '1' : '0'); } catch (_) {}
        }
        function fire(pattern) {
            try { if (isEnabled() && navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
        }
        return {
            win : () => fire(35),
            lose: () => fire([30, 60, 30]),
            isEnabled, setEnabled,
        };
    })();

    const Feedback = {
        fire(hit) {
            if (hit) { Sfx.win(); Vib.win(); }
            else { Sfx.lose(); Vib.lose(); }
        },
        unlock() { Sfx.unlock(); },
    };


    function normalizeRound(order, winner, n) {
        const seen = new Set();
        const clean = [];
        order.forEach(id => {
            const v = Number(id);
            if (Number.isInteger(v) && v >= 0 && v < n && !seen.has(v)) {
                clean.push(v);
                seen.add(v);
            }
        });
        for (let i = 0; i < n; i++) {
            if (!seen.has(i)) clean.push(i);
        }
        const safeWinner = Number.isInteger(winner) && winner >= 0 && winner < n ? winner : clean[0];
        return { ts: Date.now(), order: clean.slice(0, n), winner: safeWinner };
    }

    function overlaps(aTop, aBottom, bTop, bBottom) {
        return Math.max(aTop, bTop) < Math.min(aBottom, bBottom);
    }

    function readLaneX(rowEl) {
        const rowRect = rowEl.getBoundingClientRect();
        if (rowRect.width <= 0 || rowRect.height <= 0) return null;

        const candidates = Array.from(rowEl.querySelectorAll('*')).map(el => {
            const r = el.getBoundingClientRect();
            return { el, r };
        }).filter(({ el, r }) => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
            if (r.width < 8 || r.height < 8 || r.width > 140 || r.height > 140) return false;
            if (!overlaps(r.top, r.bottom, rowRect.top, rowRect.bottom)) return false;
            if (r.right < rowRect.left || r.left > rowRect.right) return false;
            return true;
        });

        if (!candidates.length) return null;

        candidates.sort((a, b) => {
            const ax = a.r.left + a.r.width / 2;
            const bx = b.r.left + b.r.width / 2;
            return bx - ax || (a.r.width * a.r.height) - (b.r.width * b.r.height);
        });

        const best = candidates[0].r;
        return Number((best.left + best.width / 2).toFixed(2));
    }

    function readRoundByTrack(thuOpts) {
        const n = thuOpts.length;
        const lanes = CFG.SEL.resultRows.slice(0, n).map((sel, idx) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const x = readLaneX(el);
            return x == null ? null : { idx, x };
        }).filter(Boolean);

        if (lanes.length < n) return null;

        lanes.sort((a, b) => b.x - a.x || a.idx - b.idx);
        const order = lanes.map(l => l.idx);
        return normalizeRound(order, order[0], n);
    }

    async function readRoundWithRetry(thuOpts, totalWait = 5000, interval = 250) {
        const tries = Math.max(1, Math.ceil(totalWait / interval));
        let last = null;
        for (let i = 0; i < tries; i++) {
            last = readRoundByTrack(thuOpts);
            if (last?.order?.length === thuOpts.length && Number.isInteger(last.winner)) return last;
            await sleep(interval);
        }
        return last;
    }

    const Engine = (() => {
        let running = false, timer = null, rounds = 0;
        let maxRounds = 0, tpPct = 0, slPct = 0;

        // ── Tiered xu state ──────────────────────────────────────────────────
        // xuTiers: [{xuOptIndex: number, maxLosses: number}, ...]
        // Tier 0 = base (cheapest). On ANY win → reset to tier 0.
        // On consecutive losses >= tier.maxLosses → advance to next tier.
        // If already at last tier, stay there and keep betting.
        let xuTiers       = [];   // set by setXuTiers()
        let currentTierIdx = 0;  // which tier we're currently on
        let tierLossCount  = 0;  // consecutive losses at currentTierIdx

        function setXuTiers(tiers) {
            xuTiers       = Array.isArray(tiers) ? tiers.filter(t => t && t.maxLosses >= 1) : [];
            currentTierIdx = 0;
            tierLossCount  = 0;
        }

        const setMax = n => { maxRounds = n; };
        const setTP  = p => { tpPct = Math.max(0, p); };
        const setSL  = p => { slPct = Math.max(0, p); };
        const isRunning = () => running;

        function getCurrentXuOptIndex() {
            if (!xuTiers.length) return 0;
            const idx = Math.min(currentTierIdx, xuTiers.length - 1);
            return xuTiers[idx]?.xuOptIndex ?? 0;
        }

        // Called after every round result to advance / reset tiers
        function onRoundResult(isWin) {
            if (!xuTiers.length) return;
            if (isWin) {
                if (currentTierIdx > 0) {
                    Panel.log(`★ THANG → Quay ve Moc 1`);
                    currentTierIdx = 0;
                }
                tierLossCount = 0;
            } else {
                tierLossCount++;
                const tier = xuTiers[currentTierIdx];
                const maxL = tier?.maxLosses ?? 999;
                if (tierLossCount >= maxL && currentTierIdx < xuTiers.length - 1) {
                    currentTierIdx++;
                    tierLossCount = 0;
                    Panel.log(`✗ Thua ${maxL} lan → Chuyen Moc ${currentTierIdx + 1}`);
                }
            }
            Panel.updateTierStatus(currentTierIdx, tierLossCount, xuTiers);
        }

        async function runRound() {
            if (!running) return;
            if (maxRounds > 0 && rounds >= maxRounds) {
                Panel.log(`Du ${maxRounds} vong - tu dung.`);
                stop(true);
                return;
            }

            Tracker.snapshotBefore();

            const xuEl = $(CFG.SEL.xu);
            if (!xuEl) { Panel.log('Khong tim thay select Xu.'); return; }
            const xuOpts = Array.from(xuEl.options);
            const safeI = Math.min(getCurrentXuOptIndex(), xuOpts.length - 1);
            triggerSelect(xuEl, xuOpts[safeI].value);
            const tierLabel = xuTiers.length
                ? ` [Moc ${currentTierIdx + 1}/${xuTiers.length} · Thua ${tierLossCount}/${xuTiers[currentTierIdx]?.maxLosses ?? '?'}]`
                : '';
            Panel.log(`Dat: ${xuOpts[safeI].text}${tierLabel}`);

            await sleep(CFG.STEP_DELAY);
            if (!running) return;

            const thuEl = $(CFG.SEL.thu);
            if (!thuEl) { Panel.log('Khong tim thay select Thu.'); return; }
            const thuOpts = Array.from(thuEl.options);
            const n = thuOpts.length;

            Panel.log('Dang goi AI...');
            let aiDecision;
            const roundId = V5.getHistorySize() + 1; // dong bo voi V5 history de khop nhat ky
            try {
                aiDecision = await AI.choose({
                    n,
                    options: thuOpts.map(o => o.text),
                    memory: V5.getMemorySnapshot(12),
                    round: roundId,
                });
            } catch (err) {
                Panel.log(`AI loi: ${err?.message || err}`);
                stop(true);
                return;
            }

            const finalPick = Math.max(0, Math.min(n - 1, aiDecision.picked));
            triggerSelect(thuEl, thuOpts[finalPick].value);
            Panel.updateDebug(V5.getDebug(n), thuOpts);
            Panel.updateAIAnalysis({
                status: 'pending',
                provider: aiDecision.provider,
                model: aiDecision.model,
                pickLabel: thuOpts[finalPick].text,
                confidence: aiDecision.confidence,
                reason: aiDecision.reason,
                latencyMs: aiDecision.latencyMs,
            }, AIJournal.getRecent(6));
            const memInfo = aiDecision.memory ? ` | mem ${Math.round((aiDecision.memory.recentAccuracy || 0) * 100)}%/${aiDecision.memory.streak || 0}` : '';
            Panel.log(`AI ${aiDecision.provider}/${aiDecision.model}${memInfo} | ${thuOpts[finalPick].text} | ${aiDecision.latencyMs}ms`);

            await sleep(CFG.STEP_DELAY);
            if (!running) return;

            const btnEl = $(CFG.SEL.btn);
            if (!btnEl) { Panel.log('Khong tim thay nut dat.'); return; }
            btnEl.click();
            rounds++;
            Panel.updateRounds(rounds, maxRounds);

            await sleep(CFG.RESULT_WAIT);
            if (!running) return;

            const round = await readRoundWithRetry(thuOpts, CFG.RETRY_WINDOW, CFG.RETRY_INTERVAL);
            let hit = null;
            if (round?.order?.length) {
                Panel.showOrder(round.order.map(i => i + 1).join('>'));
                const outcome = V5.learnRound(round, aiDecision);
                hit = aiDecision.picked === round.winner;
                AIJournal.recordOutcome(roundId, round.winner, thuOpts[round.winner]?.text || `#${round.winner + 1}`, hit);
                const orderText = round.order.map(i => i + 1).join('>');
                const mem = V5.getMemorySnapshot(12);
                Panel.log(`#${rounds}: ${orderText} | win #${round.winner + 1} | ${hit ? 'HIT' : 'MISS'} | mem ${Math.round((mem.recentAccuracy || 0) * 100)}% | +${outcome?.created || 0}`);
                Panel.updateDebug(V5.getDebug(n), thuOpts);
                Panel.updateAIAnalysis({
                    status: hit ? 'hit' : 'miss',
                    provider: aiDecision.provider,
                    model: aiDecision.model,
                    pickLabel: thuOpts[finalPick].text,
                    confidence: aiDecision.confidence,
                    reason: aiDecision.reason,
                    actualLabel: thuOpts[round.winner]?.text || `#${round.winner + 1}`,
                    latencyMs: aiDecision.latencyMs,
                }, AIJournal.getRecent(6));
                Feedback.fire(hit);
            } else {
                Panel.log(`Vong ${rounds}: loi doc ket qua.`);
            }

            const pnl = Tracker.recordResult();
            if (pnl && running) {
                // ── Tier progression ──
                onRoundResult(pnl.roundDelta > 0);

                if (tpPct > 0 && pnl.sessionPct >= tpPct) {
                    Panel.log(`Lai +${pnl.sessionPct.toFixed(2)}% - tu dung.`);
                    stop(true);
                    return;
                }
                if (slPct > 0 && pnl.sessionPct <= -slPct) {
                    Panel.log(`Lo ${Math.abs(pnl.sessionPct).toFixed(2)}% - tu dung.`);
                    stop(true);
                    return;
                }
            }

            await sleep(CFG.SYSTEM_WAIT);
            if (!running) return;
            if (running) timer = setTimeout(runRound, CFG.REST_WAIT);
        }

        function start() {
            if (running) return;
            running = true;
            rounds = 0;
            currentTierIdx = 0;
            tierLossCount  = 0;
            Feedback.unlock();
            Tracker.startSession();
            Panel.setStatus('run');
            Panel.log('V5 Evolution start.');
            Panel.log(`History ${V5.getHistorySize()} | Strategies ${V5.getStrategySize()}`);
            Panel.updateTierStatus(0, 0, xuTiers);
            runRound();
        }

        function stop(auto = false) {
            running = false;
            clearTimeout(timer);
            Panel.setStatus('idle');
            if (!auto) Panel.log('Da dung.');
        }

        return { start, stop, isRunning, setXuTiers, setMax, setTP, setSL };
    })();

    const Panel = (() => {
        let logs = [];
        let orderTimer = null;
        let xuOptions = []; // [{value: number, text: string}] – shared across tier rows

        function log(msg) {
            const t = new Date().toLocaleTimeString('vi-VN');
            logs.unshift(`[${t}] ${msg}`);
            if (logs.length > CFG.LOG_LIMIT) logs.pop();
            const el = document.getElementById('dta-log');
            if (el) el.textContent = logs.slice(0, CFG.LOG_LINES).join('\n');
        }

        function showOrder(text, holdMs = 1200) {
            const el = document.getElementById('dta-order');
            if (!el) return;
            clearTimeout(orderTimer);
            el.textContent = text;
            el.classList.add('show');
            orderTimer = setTimeout(() => {
                el.textContent = '';
                el.classList.remove('show');
            }, holdMs);
        }

        function updateRounds(n, max) {
            const el = document.getElementById('dta-rounds');
            if (el) el.textContent = max > 0 ? `${n}/${max}` : String(n);
        }

        function renderPnL({ currentXu, sessionDelta, wins, losses }) {
            const xu = document.getElementById('dta-cur-xu');
            const pnl = document.getElementById('dta-session-pnl');
            const wr = document.getElementById('dta-wr');
            if (xu) xu.textContent = fmtXu(currentXu);
            if (pnl) {
                pnl.textContent = fmtXu(sessionDelta, true);
                pnl.className = `dta-sval ${sessionDelta > 0 ? 'pnl-pos' : sessionDelta < 0 ? 'pnl-neg' : 'pnl-neu'}`;
            }
            if (wr) wr.textContent = `${wins}W${losses}L`;
        }

        function updateAIStatus(info) {
            const el = document.getElementById('dta-ai-status');
            if (!el || !info) return;
            const ok = !!info.lastOk;
            const cfg = AI.getCurrentConfig();
            // Compact: provider + model + latency/error, không hiện full URL (đã có ở input)
            const label = cfg.provider === 'anthropic' ? 'CLAUDE' : cfg.provider.toUpperCase();
            if (ok) {
                el.textContent = `✓ ${label} · ${cfg.model} · ${info.lastLatency || 0}ms`;
            } else if (info.lastError) {
                const errStr = String(info.lastError);
                // Hint: Network error 403 tren mobile thuong la Tampermonkey block, khong phai server
                const isNetErr403 = /network error.*403/i.test(errStr);
                const hint = (isNetErr403 && cfg.provider === 'anthropic')
                    ? ' → Thu dung OpenAI format + claude model'
                    : '';
                el.textContent = `✗ ${errStr.slice(0, 55)}${hint}`;
            } else {
                el.textContent = `${label} · ${cfg.model}`;
            }
            el.className = `dta-ai-status ${ok ? 'ok' : info.lastError ? 'err' : ''}`;
        }

        function setStatus(state) {
            const badge = document.getElementById('dta-badge');
            const sBtn = document.getElementById('dta-start');
            const xBtn = document.getElementById('dta-stop');
            if (!badge) return;
            if (state === 'run') {
                badge.textContent = 'RUN';
                badge.className = 'dta-badge run';
                if (sBtn) sBtn.disabled = true;
                if (xBtn) xBtn.disabled = false;
            } else {
                badge.textContent = 'IDLE';
                badge.className = 'dta-badge idle';
                if (sBtn) sBtn.disabled = false;
                if (xBtn) xBtn.disabled = true;
            }
        }

        function pct(v) {
            return `${Math.round((v || 0) * 100)}%`;
        }

        function updateDebug(debug, opts) {
            const el = document.getElementById('dta-debug');
            if (!el || !debug) return;
            const name = escapeHtml(opts?.[debug.pick]?.text || `#${(debug.pick || 0) + 1}`);
            const mem = debug.memory || {};
            const top = debug.top.length ? debug.top.map(s => {
                const cls = s.disabled ? ' disabled' : '';
                return `<div class="dta-strat${cls}">
                    <span>#${s.id} ${escapeHtml(s.class)}</span>
                    <b>${pct(s.recent || s.wr)}</b>
                    <em>p${s.predict + 1}</em>
                </div>`;
            }).join('') : '<div class="dta-empty">Chua du strategy.</div>';

            const meta = [
                `All ${pct(mem.lifetimeAccuracy || 0)}`,
                `Rec ${pct(mem.recentAccuracy || 0)}`,
                `Conf ${pct(mem.avgConfidence || 0)}`,
                `Streak ${mem.streak || 0}`,
            ].map(v => `<span>${v}</span>`).join('');

            const memoryNote = mem.guidance ? `<div class="dta-note">${escapeHtml(mem.guidance)}</div>` : '';

            el.innerHTML = `
                <div class="dta-mode">
                    <span>PATTERN ENGINE</span><b>${mem.totalRounds >= 14 ? 'LEARNING' : 'WARMUP'}</b>
                </div>
                <div class="dta-pick">
                    <span>Goi y noi bo</span><b>${name}</b><em>${pct(debug.confidence)}</em>
                </div>
                <div class="dta-mbar">
                    <span>Rounds ${mem.totalRounds || debug.totalRounds || 0}</span>
                    <span>Active ${debug.active}</span>
                    <span>Total ${debug.strategies}</span>
                </div>
                <div class="dta-meta">${meta}</div>
                ${memoryNote}
                <div class="dta-top">${top}</div>
                <div class="dta-disclaimer">Thong ke noi bo (heuristic), khong phai ket qua tu AI. Khong dung de dam bao thang/thua.</div>
            `;
        }

        // ── AI Analysis card (hien thi CACH AI THUC SU phan tich mỗi vong) ─────
        function aiStatusMeta(status) {
            if (status === 'hit')  return { label: 'TRUNG', cls: 'hit' };
            if (status === 'miss') return { label: 'SAI',   cls: 'miss' };
            if (status === 'pending') return { label: 'DANG CHO KET QUA', cls: 'pending' };
            return { label: 'CHUA CO PHAN TICH', cls: 'pending' };
        }

        function updateAIAnalysis(cur, journalRecent) {
            const card = document.getElementById('dta-ai-analysis');
            const feed = document.getElementById('dta-ai-feed');
            if (!card) return;
            const st = aiStatusMeta(cur?.status);
            const confPct = Math.round((Number(cur?.confidence) || 0) * 100);
            const ring = `conic-gradient(#ffb84d ${confPct}%, #1c212c ${confPct}%)`;
            const reasonText = cur
                ? (cur.reason || 'AI khong tra ve ly do (kiem tra lai prompt/model).')
                : 'Chua co lan phan tich nao. Bam BAT DAU de xem AI chon va giai thich tai sao.';
            card.innerHTML = `
                <div class="aia-top">
                    <div class="aia-ring" style="background:${ring}"><span>${confPct}%</span></div>
                    <div class="aia-main">
                        <div class="aia-row1">
                            <span class="aia-tag">${escapeHtml((cur?.provider || '').toUpperCase())}</span>
                            <span class="aia-model">${escapeHtml(cur?.model || '')}</span>
                            <span class="aia-status ${st.cls}">${st.label}</span>
                        </div>
                        <div class="aia-pick">${escapeHtml(cur?.pickLabel || '-')}</div>
                        ${cur?.actualLabel ? `<div class="aia-actual">Thuc te: ${escapeHtml(cur.actualLabel)}</div>` : ''}
                    </div>
                </div>
                <div class="aia-reason">${escapeHtml(reasonText)}</div>
                <div class="aia-meta">${cur?.latencyMs ? `<span>${cur.latencyMs}ms</span>` : ''}</div>
            `;
            if (feed) {
                const rows = (journalRecent || []).slice().reverse();
                feed.innerHTML = rows.length ? rows.map(j => {
                    const dot = j.hit === true ? 'hit' : j.hit === false ? 'miss' : 'pending';
                    return `<div class="aia-feed-row">
                        <span class="aia-dot ${dot}"></span>
                        <span class="aia-feed-pick">#${j.round ?? '?'} ${escapeHtml(j.pickLabel || '')}</span>
                        <span class="aia-feed-reason">${escapeHtml((j.reason || '').slice(0, 60))}</span>
                    </div>`;
                }).join('') : '<div class="dta-empty">Chua co lich su AI.</div>';
            }
        }



        function populateXu() {
            const xuEl = $(CFG.SEL.xu);
            if (!xuEl) return;
            // Build shared option list
            xuOptions = Array.from(xuEl.options).map((o, i) => ({ value: i, text: o.text }));
            // Refresh every existing tier row's <select>
            document.querySelectorAll('.dta-tier-xu').forEach(sel => {
                const prev = sel.value;
                sel.innerHTML = xuOptions.map(o => `<option value="${o.value}">${o.text}</option>`).join('');
                if (prev !== '' && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
            });
        }

        // ── Tier persistence ──────────────────────────────────────────────────
        function saveTiers() {
            try { localStorage.setItem(CFG.TIERS_KEY, JSON.stringify(readTiers())); } catch (_) {}
        }

        function loadTiers() {
            try { const r = localStorage.getItem(CFG.TIERS_KEY); return r ? JSON.parse(r) : null; }
            catch (_) { return null; }
        }

        // ── Session config persistence (Vong/Lai/Lo) ────────────────────────────
        // Truoc day 3 o nay khong duoc luu nen moi lan tai lai trang phai nhap lai.
        function saveSessionCfg() {
            const max = document.getElementById('dta-max');
            const tp  = document.getElementById('dta-tp');
            const sl  = document.getElementById('dta-sl');
            try {
                localStorage.setItem(CFG.SESSION_KEY, JSON.stringify({
                    max: max ? +max.value || 0 : 0,
                    tp : tp  ? parseFloat(tp.value)  || 0 : 0,
                    sl : sl  ? parseFloat(sl.value)  || 0 : 0,
                }));
            } catch (_) {}
        }

        function loadSessionCfg() {
            try {
                const raw = localStorage.getItem(CFG.SESSION_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch (_) { return null; }
        }

        // ── Tier DOM helpers ──────────────────────────────────────────────────
        function readTiers() {
            return Array.from(document.querySelectorAll('.dta-tier-row')).map(row => ({
                xuOptIndex: parseInt(row.querySelector('.dta-tier-xu')?.value ?? '0', 10) || 0,
                maxLosses : Math.max(1, parseInt(row.querySelector('.dta-tier-n')?.value  ?? '18', 10) || 18),
            }));
        }

        function updateTierLabels() {
            document.querySelectorAll('.dta-tier-row').forEach((row, i) => {
                const num = row.querySelector('.dta-tier-num');
                if (num) num.textContent = String(i + 1);
            });
        }

        function addTierRow(xuOptIndex = 0, maxLosses = 18) {
            const listEl = document.getElementById('dta-tier-list');
            if (!listEl) return;

            const row = document.createElement('div');
            row.className = 'dta-tier-row';

            const numBadge = document.createElement('span');
            numBadge.className = 'dta-tier-num';
            numBadge.textContent = String(listEl.children.length + 1);

            const xuSel = document.createElement('select');
            xuSel.className = 'dta-tier-xu';
            if (xuOptions.length) {
                xuOptions.forEach(o => {
                    const opt = document.createElement('option');
                    opt.value = String(o.value);
                    opt.textContent = o.text;
                    xuSel.appendChild(opt);
                });
            } else {
                const opt = document.createElement('option');
                opt.value = '0';
                opt.textContent = 'Dang tai...';
                xuSel.appendChild(opt);
            }
            xuSel.value = String(xuOptIndex);
            xuSel.addEventListener('change', saveTiers);

            const nInput = document.createElement('input');
            nInput.type  = 'number';
            nInput.className = 'dta-tier-n';
            nInput.min   = '1';
            nInput.max   = '999';
            nInput.value = String(maxLosses);
            nInput.title = 'So lan thua lien tiep toi da o moc nay';
            nInput.addEventListener('change', () => {
                nInput.value = Math.max(1, parseInt(nInput.value, 10) || 18);
                saveTiers();
            });

            const delBtn = document.createElement('button');
            delBtn.type  = 'button';
            delBtn.className = 'dta-tier-del';
            delBtn.title = 'Xoa moc nay';
            delBtn.textContent = '×';
            delBtn.addEventListener('click', () => {
                if (document.querySelectorAll('.dta-tier-row').length <= 1) {
                    log('Can it nhat 1 moc xu.');
                    return;
                }
                row.remove();
                updateTierLabels();
                saveTiers();
            });

            row.appendChild(numBadge);
            row.appendChild(xuSel);
            row.appendChild(nInput);
            row.appendChild(delBtn);
            listEl.appendChild(row);
            updateTierLabels();
        }

        // Called by Engine after every round result
        function updateTierStatus(currentTierIdx, tierLossCount, tiers) {
            const el = document.getElementById('dta-tier-status');
            if (!el) return;
            if (!tiers || !tiers.length) {
                el.innerHTML = '<span style="color:#596273">Chua thiet lap moc xu.</span>';
                return;
            }
            const safeIdx = Math.min(currentTierIdx, tiers.length - 1);
            const tier    = tiers[safeIdx];
            const xuText  = xuOptions[tier.xuOptIndex]?.text || `Moc ${safeIdx + 1}`;
            const maxL    = tier.maxLosses;
            const filled  = Math.min(tierLossCount, maxL);
            const dotsN   = Math.min(maxL, 20);
            const dotsFill = Math.round((filled / maxL) * dotsN);
            const dots = Array.from({ length: dotsN }, (_, i) =>
                `<span class="tier-dot${i < dotsFill ? ' lit' : ''}"></span>`
            ).join('');
            const badges = tiers.map((_, i) =>
                `<span class="tier-badge${i === safeIdx ? ' cur' : ''}">${i + 1}</span>`
            ).join('<span style="color:#596273">›</span>');

            el.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
                    <div>${badges}</div>
                    <div style="text-align:right;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                        <b style="color:#ffd36a">${xuText}</b>
                        <span style="color:${tierLossCount >= maxL ? '#ff4444' : tierLossCount > 0 ? '#ff9966' : '#48d18a'}">
                            ${tierLossCount}/${maxL}
                        </span>
                    </div>
                </div>
                <div class="tier-dot-bar">${dots}</div>
            `;
        }

        function injectStyles() {
            if (document.getElementById('dta-style')) return;
            const s = document.createElement('style');
            s.id = 'dta-style';
            s.textContent = `
#dta-panel {
    position:fixed; bottom:76px; right:10px; width:312px;
    background:#111318; border:1px solid #d84f4f; border-radius:12px;
    padding:12px; font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;
    font-size:12px; color:#d7dbe5; z-index:2147483000;
    box-shadow:0 10px 34px rgba(0,0,0,.45); user-select:none; -webkit-user-select:none;
}
#dta-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; cursor:move; touch-action:none; }
#dta-header-right { display:flex; align-items:center; gap:5px; pointer-events:auto; }
#dta-title { font-size:14px; font-weight:800; color:#ff6666; }
.dta-badge { font-size:10px; font-weight:800; padding:3px 8px; border-radius:12px; border:1px solid #2d3340; color:#7b8495; background:#171a21; }
.dta-badge.run { color:#48d18a; border-color:#247a4c; background:#0d2518; animation:dtaPulse 1.6s ease-in-out infinite; }
@keyframes dtaPulse { 0%,100% { box-shadow:0 0 0 0 rgba(72,209,138,.45); } 50% { box-shadow:0 0 0 4px rgba(72,209,138,0); } }
#dta-gear, #dta-toggle { background:none; border:1px solid #2d3340; border-radius:6px; color:#9aa3b2; cursor:pointer; font-size:13px; padding:2px 7px; line-height:1.5; touch-action:manipulation; }
#dta-gear:active, #dta-toggle:active { background:#222836; color:#e7ebf3; }
#dta-panel.collapsed #dta-body { display:none; }
#dta-panel.collapsed { padding-bottom:8px; }
.dta-label { display:block; font-size:10px; color:#7b8495; margin-bottom:4px; letter-spacing:.3px; text-transform:uppercase; }
.dta-select { width:100%; box-sizing:border-box; background:#090b10; color:#e7ebf3; border:1px solid #2d3340; border-radius:7px; padding:7px 9px; font-size:12px; margin-bottom:9px; outline:none; }
.dta-mgrid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:9px; }
.dta-mcell { display:flex; flex-direction:column; align-items:center; gap:3px; }
.dta-mcell label { font-size:9px; color:#7b8495; text-transform:uppercase; white-space:nowrap; }
.dta-minput { width:100%; box-sizing:border-box; background:#090b10; color:#e7ebf3; border:1px solid #2d3340; border-radius:7px; padding:5px 4px; font-size:11px; text-align:center; outline:none; }
.dta-btns { display:flex; gap:6px; margin-bottom:9px; }
#dta-start, #dta-stop { border-radius:8px; font-size:13px; font-weight:800; cursor:pointer; padding:10px 7px; touch-action:manipulation; }
#dta-start { flex:1; border:none; background:linear-gradient(180deg,#e9605f,#cf3f3f); color:#fff; box-shadow:0 4px 14px rgba(216,79,79,.4); }
#dta-start:disabled { opacity:.4; cursor:not-allowed; box-shadow:none; }
#dta-start:not(:disabled):active { transform:translateY(1px); }
#dta-stop { flex:1; border:1px solid #343b49; background:#171a21; color:#7b8495; }
#dta-stop:not(:disabled) { color:#ff6666; border-color:#d84f4f; background:#271316; }
#dta-stop:disabled { opacity:.45; cursor:not-allowed; }
#dta-memreset { border:1px solid #343b49; background:#171a21; color:#7b8495; font-size:11px; border-radius:8px; padding:8px 7px; cursor:pointer; width:100%; touch-action:manipulation; }
#dta-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; background:#0a0c11; border:1px solid #222836; border-radius:8px; padding:7px 4px; margin-bottom:8px; }
.dta-sitem { display:flex; flex-direction:column; align-items:center; gap:2px; min-width:0; }
.dta-slabel { font-size:9px; color:#7b8495; }
.dta-sval { font-size:11px; font-weight:800; color:#d7dbe5; white-space:nowrap; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
.dta-ai { display:flex; flex-direction:column; gap:6px; }
.dta-ai-row { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
.dta-ai-input, .dta-ai-select { width:100%; box-sizing:border-box; background:#090b10; color:#e7ebf3; border:1px solid #2d3340; border-radius:7px; padding:7px 8px; font-size:11px; outline:none; }
.dta-ai-test-row { display:flex; align-items:center; gap:6px; }
#dta-ai-test { border-radius:8px; font-size:11px; font-weight:800; cursor:pointer; padding:8px 12px; border:1px solid #343b49; background:#171a21; color:#e7ebf3; flex-shrink:0; touch-action:manipulation; }
#dta-ai-status { flex:1; min-width:0; font-size:10px; color:#8e98aa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#dta-ai-status.ok { color:#48d18a; }
#dta-ai-status.err { color:#ff6666; }
#dta-rounds { color:#ff6666; }
.pnl-pos { color:#48d18a !important; }
.pnl-neg { color:#ff6666 !important; }
.pnl-neu { color:#9aa3b2 !important; }
/* ── AI Analysis card (cach AI THUC SU phan tich) ──────────────────────── */
#dta-ai-analysis-wrap { background:#0a0c11; border:1px solid #2a3344; border-radius:10px; padding:9px; margin-bottom:8px; }
.dta-section-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; }
.dta-section-head span { font-size:10px; color:#7b8495; text-transform:uppercase; letter-spacing:.4px; font-weight:700; }
.aia-top { display:flex; align-items:center; gap:9px; margin-bottom:7px; }
.aia-ring { width:42px; height:42px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; position:relative; }
.aia-ring::before { content:''; position:absolute; inset:3px; border-radius:50%; background:#0a0c11; }
.aia-ring span { position:relative; font-size:10px; font-weight:800; color:#ffd36a; }
.aia-main { flex:1; min-width:0; }
.aia-row1 { display:flex; align-items:center; gap:5px; margin-bottom:2px; flex-wrap:wrap; }
.aia-tag { font-size:9px; font-weight:800; color:#7fb2ff; background:#10192c; border-radius:4px; padding:1px 5px; }
.aia-model { font-size:9px; color:#7b8495; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:110px; }
.aia-status { margin-left:auto; font-size:9px; font-weight:800; padding:1px 6px; border-radius:4px; }
.aia-status.pending { color:#ffb84d; background:#241b0a; }
.aia-status.hit { color:#48d18a; background:#0d2518; }
.aia-status.miss { color:#ff6666; background:#2a1212; }
.aia-pick { font-size:13px; font-weight:800; color:#e7ebf3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.aia-actual { font-size:10px; color:#8e98aa; margin-top:1px; }
.aia-reason { font-size:11px; color:#c3c9d6; line-height:1.45; background:#0d111a; border-radius:7px; padding:7px 8px; min-height:18px; }
.aia-meta { display:flex; justify-content:flex-end; margin-top:4px; font-size:9px; color:#596273; }
#dta-ai-feed { display:flex; flex-direction:column; gap:5px; margin-top:8px; max-height:108px; overflow-y:auto; }
.aia-feed-row { display:grid; grid-template-columns:8px 64px 1fr; gap:6px; align-items:center; font-size:10px; color:#9aa3b2; }
.aia-dot { width:6px; height:6px; border-radius:50%; background:#596273; }
.aia-dot.hit { background:#48d18a; }
.aia-dot.miss { background:#ff6666; }
.aia-feed-pick { color:#c3c9d6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:700; }
.aia-feed-reason { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
/* ── Pattern Engine (heuristic noi bo, thu gon mac dinh) ───────────────── */
#dta-debug-wrap { margin-bottom:8px; }
#dta-debug-toggle { width:100%; display:flex; align-items:center; justify-content:space-between; background:#0a0c11; border:1px solid #222836; border-radius:8px; padding:7px 9px; color:#7b8495; font-size:10px; text-transform:uppercase; font-weight:700; cursor:pointer; touch-action:manipulation; }
#dta-debug-toggle .car { transition:transform .15s ease; }
#dta-debug-wrap.open #dta-debug-toggle .car { transform:rotate(180deg); }
#dta-debug { background:#0a0c11; border:1px solid #222836; border-top:none; border-radius:0 0 8px 8px; padding:8px; display:none; }
#dta-debug-wrap.open #dta-debug { display:block; }
#dta-debug-wrap.open #dta-debug-toggle { border-radius:8px 8px 0 0; }
.dta-mode, .dta-pick, .dta-mbar, .dta-meta { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:6px; }
.dta-mode span, .dta-pick span { color:#7b8495; font-size:10px; text-transform:uppercase; }
.dta-mode b { color:#ffb84d; font-size:13px; }
.dta-pick b { flex:1; min-width:0; color:#e7ebf3; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right; }
.dta-pick em { color:#48d18a; font-style:normal; font-weight:800; }
.dta-mbar { color:#7b8495; font-size:10px; background:#11151d; border-radius:5px; padding:4px 5px; }
.dta-order { min-height:18px; margin:0 0 8px; padding:4px 6px; border-radius:5px; background:#121722; color:#ffd36a; font-size:10px; font-weight:800; letter-spacing:.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:0; transition:opacity .15s ease; }
.dta-order.show { opacity:1; }
.dta-meta { flex-wrap:wrap; justify-content:flex-start; color:#8791a3; font-size:10px; }
.dta-meta span { background:#151a23; border-radius:4px; padding:2px 4px; }
.dta-note { font-size:10px; color:#93a0b4; line-height:1.35; margin:-1px 0 6px; }
.dta-disclaimer { font-size:9px; color:#596273; line-height:1.35; margin-top:6px; border-top:1px dashed #1e2430; padding-top:5px; }
.dta-top { display:flex; flex-direction:column; gap:4px; }
.dta-strat { display:grid; grid-template-columns:1fr 38px 28px; gap:5px; align-items:center; color:#aeb6c5; font-size:10px; }
.dta-strat span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.dta-strat b { color:#48d18a; text-align:right; }
.dta-strat em { color:#ffb84d; text-align:right; font-style:normal; }
.dta-strat.disabled { opacity:.42; }
.dta-empty { color:#7b8495; font-size:10px; text-align:center; padding:4px 0; }
#dta-log-wrap { margin-bottom:0; }
#dta-log { background:#080a0f; border-radius:7px; padding:7px 9px; font-size:10px; color:#8e98aa; height:56px; overflow:hidden; white-space:pre-wrap; line-height:1.55; font-family:'Courier New',monospace; }
#dta-footer { margin-top:7px; text-align:center; font-size:9px; color:#596273; letter-spacing:.6px; }
/* ── Tier builder ───────────────────────────────────────────── */
#dta-tier-list { display:flex; flex-direction:column; gap:4px; margin-bottom:5px; }
.dta-tier-row { display:grid; grid-template-columns:14px 1fr 46px 22px; gap:4px; align-items:center; }
.dta-tier-num { font-size:9px; color:#596273; font-weight:800; text-align:center; line-height:1; }
.dta-tier-xu { width:100%; box-sizing:border-box; background:#090b10; color:#e7ebf3; border:1px solid #2d3340; border-radius:6px; padding:5px 7px; font-size:11px; outline:none; }
.dta-tier-n { width:100%; box-sizing:border-box; background:#090b10; color:#e7ebf3; border:1px solid #2d3340; border-radius:6px; padding:5px 3px; font-size:11px; text-align:center; outline:none; }
.dta-tier-del { background:#140808; border:1px solid #3d1a1a; border-radius:5px; color:#cc4444; cursor:pointer; font-size:14px; line-height:1; padding:0; width:22px; height:26px; touch-action:manipulation; display:flex; align-items:center; justify-content:center; }
.dta-tier-del:active { background:#2a0e0e; }
#dta-add-tier { width:100%; background:#0d1018; border:1px dashed #2a3040; color:#7b8495; border-radius:7px; padding:5px; font-size:11px; cursor:pointer; margin-bottom:7px; touch-action:manipulation; }
#dta-add-tier:active { background:#141b28; color:#d7dbe5; }
#dta-tier-status { font-size:10px; color:#d7dbe5; background:#0a0c11; border:1px solid #222836; border-radius:7px; padding:6px 8px; margin-bottom:8px; line-height:1.4; min-height:36px; }
.tier-badge { display:inline-block; padding:1px 5px; border-radius:4px; font-size:9px; font-weight:800; color:#596273; background:#111520; }
.tier-badge.cur { color:#ffd36a; background:#1e1a08; border:1px solid #4a4010; }
.tier-dot-bar { display:flex; gap:2px; flex-wrap:wrap; margin-top:4px; }
.tier-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#1e2435; flex-shrink:0; }
.tier-dot.lit { background:#ff6666; }
/* ── Settings bottom-sheet ──────────────────────────────────────────────
   Dat o document.body (khong nam trong #dta-panel) de luon can giua man
   hinh du panel chinh dang bi keo di dau. Dung overlay mau (khong dung
   backdrop-filter:blur) de tranh ton GPU tren mobile. */
#dta-settings-overlay {
    position:fixed; inset:0; z-index:2147483646; display:flex; align-items:flex-end; justify-content:center;
    background:rgba(0,0,0,0); pointer-events:none; transition:background .18s ease;
}
#dta-settings-overlay.open { background:rgba(0,0,0,.55); pointer-events:auto; }
#dta-settings-sheet {
    width:100%; max-width:420px; max-height:82vh; overflow-y:auto;
    background:#13151b; border:1px solid #2a3344; border-bottom:none;
    border-radius:16px 16px 0 0; padding:14px 14px calc(14px + env(safe-area-inset-bottom,0px));
    transform:translateY(100%); transition:transform .22s ease;
    font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif; font-size:12px; color:#d7dbe5;
    box-shadow:0 -12px 30px rgba(0,0,0,.5);
}
#dta-settings-overlay.open #dta-settings-sheet { transform:translateY(0); }
#dta-settings-handle { width:36px; height:4px; background:#2d3340; border-radius:3px; margin:0 auto 10px; }
#dta-settings-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
#dta-settings-head b { font-size:14px; color:#ff6666; }
#dta-settings-close { background:#171a21; border:1px solid #2d3340; color:#9aa3b2; border-radius:8px; padding:5px 11px; font-size:12px; cursor:pointer; touch-action:manipulation; }
.dta-set-block { background:#0a0c11; border:1px solid #222836; border-radius:10px; padding:10px; margin-bottom:10px; }
.dta-set-title { font-size:10px; color:#7b8495; text-transform:uppercase; letter-spacing:.4px; font-weight:700; margin-bottom:8px; }
.dta-toggle-row { display:flex; align-items:center; justify-content:space-between; padding:6px 0; }
.dta-toggle-row span { font-size:12px; color:#d7dbe5; }
.dta-switch { position:relative; width:38px; height:22px; border-radius:11px; background:#2d3340; cursor:pointer; flex-shrink:0; touch-action:manipulation; }
.dta-switch::after { content:''; position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%; background:#9aa3b2; transition:left .15s ease, background .15s ease; }
.dta-switch.on { background:#247a4c; }
.dta-switch.on::after { left:18px; background:#48d18a; }
#dta-settings-save { width:100%; border:none; background:#d84f4f; color:#fff; font-weight:800; font-size:13px; border-radius:9px; padding:11px; cursor:pointer; touch-action:manipulation; margin-top:2px; }
#dta-journal-clear { width:100%; border:1px solid #343b49; background:#171a21; color:#7b8495; font-size:11px; border-radius:8px; padding:7px; cursor:pointer; touch-action:manipulation; margin-top:6px; }
            `;
            document.head.appendChild(s);
        }

        function makeDraggable(el, handle) {
            let ox = 0, oy = 0, sx = 0, sy = 0;
            const start = e => {
                const ev = e.touches ? e.touches[0] : e;
                const r = el.getBoundingClientRect();
                sx = ev.clientX; sy = ev.clientY; ox = r.left; oy = r.top;
                el.style.right = 'auto'; el.style.bottom = 'auto';
                el.style.left = ox + 'px'; el.style.top = oy + 'px';
                document.addEventListener('mousemove', move, { passive: true });
                document.addEventListener('touchmove', move, { passive: true });
                document.addEventListener('mouseup', end);
                document.addEventListener('touchend', end);
            };
            const move = e => {
                const ev = e.touches ? e.touches[0] : e;
                el.style.left = (ox + ev.clientX - sx) + 'px';
                el.style.top = (oy + ev.clientY - sy) + 'px';
            };
            const end = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('touchmove', move);
                document.removeEventListener('mouseup', end);
                document.removeEventListener('touchend', end);
            };
            handle.addEventListener('mousedown', start);
            handle.addEventListener('touchstart', start, { passive: true });
        }

        function create() {
            if (document.getElementById('dta-panel')) return;
            injectStyles();

            const panel = document.createElement('div');
            panel.id = 'dta-panel';
            panel.innerHTML = `
<div id="dta-header">
    <span id="dta-title">GauBong v5 AI</span>
    <div id="dta-header-right">
        <span id="dta-badge" class="dta-badge idle">IDLE</span>
        <button id="dta-gear" type="button" title="Cai dat">⚙</button>
        <button id="dta-toggle" type="button" title="Ẩn / Hiện">▼</button>
    </div>
</div>
<div id="dta-body">
    <div id="dta-tier-status"><span style="color:#596273">Dang tai moc xu...</span></div>
    <div class="dta-btns">
        <button id="dta-start">BAT DAU</button>
        <button id="dta-stop" disabled>DUNG</button>
    </div>
    <div id="dta-stats">
        <div class="dta-sitem"><span class="dta-slabel">Vong</span><span id="dta-rounds" class="dta-sval">0</span></div>
        <div class="dta-sitem"><span class="dta-slabel">Xu</span><span id="dta-cur-xu" class="dta-sval">-</span></div>
        <div class="dta-sitem"><span class="dta-slabel">Sess.</span><span id="dta-session-pnl" class="dta-sval pnl-neu">-</span></div>
        <div class="dta-sitem"><span class="dta-slabel">W/L</span><span id="dta-wr" class="dta-sval">-</span></div>
    </div>
    <div id="dta-ai-analysis-wrap">
        <div class="dta-section-head"><span>AI Analysis</span></div>
        <div id="dta-ai-analysis"></div>
        <div id="dta-ai-feed"></div>
    </div>
    <div id="dta-order" class="dta-order"></div>
    <div id="dta-debug-wrap">
        <button id="dta-debug-toggle" type="button"><span>Pattern Engine · chi tiet thong ke</span><span class="car">▾</span></button>
        <div id="dta-debug"><div class="dta-empty">Dang tai memory...</div></div>
    </div>
    <div id="dta-log-wrap"><div id="dta-log">San sang...</div></div>
    <div id="dta-footer">V5 · AI Reasoning Journal · Pattern Engine</div>
</div>`;

            document.body.appendChild(panel);

            // ── Settings bottom-sheet (rieng biet, luon o giua man hinh) ───────
            const overlay = document.createElement('div');
            overlay.id = 'dta-settings-overlay';
            overlay.innerHTML = `
<div id="dta-settings-sheet">
    <div id="dta-settings-handle"></div>
    <div id="dta-settings-head"><b>Cai dat</b><button id="dta-settings-close" type="button">Dong</button></div>

    <div class="dta-set-block">
        <div class="dta-set-title">AI Provider</div>
        <div class="dta-ai">
            <div class="dta-ai-row">
                <select id="dta-ai-provider" class="dta-ai-select">
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Claude</option>
                    <option value="gemini">Google Gemini</option>
                </select>
                <input id="dta-ai-model" class="dta-ai-input" type="text" placeholder="Model">
            </div>
            <div class="dta-ai-row">
                <input id="dta-ai-base" class="dta-ai-input" type="text" placeholder="Base URL">
                <input id="dta-ai-key" class="dta-ai-input" type="password" placeholder="API key">
            </div>
            <div class="dta-ai-row" id="dta-ai-authmode-row" style="display:none">
                <select id="dta-ai-authmode" class="dta-ai-select" style="width:100%;font-size:12px">
                    <option value="native">🔑 Native x-api-key — api.anthropic.com, cc.freemodel.dev</option>
                    <option value="bearer">🔗 Bearer Token — OpenRouter, LiteLLM, proxy khac</option>
                </select>
            </div>
            <div class="dta-ai-test-row">
                <button id="dta-ai-test" type="button">TEST</button>
                <div id="dta-ai-status" class="dta-ai-status">AI chua kiem tra</div>
            </div>
        </div>
    </div>

    <div class="dta-set-block">
        <div class="dta-set-title">Moc Xu dat cuoc <span style="font-weight:400;text-transform:none;color:#596273">(thua lien tiep → moc tiep theo · thang bat ky → ve Moc 1)</span></div>
        <div id="dta-tier-list"></div>
        <button id="dta-add-tier" type="button">+ Them moc</button>
    </div>

    <div class="dta-set-block">
        <div class="dta-set-title">Gioi han vong choi</div>
        <div class="dta-mgrid">
            <div class="dta-mcell"><label>Vong</label><input id="dta-max" class="dta-minput" type="number" min="0" value="0" title="0 = vo han"></div>
            <div class="dta-mcell"><label>Lai +%</label><input id="dta-tp" class="dta-minput" type="number" min="0" step="0.1" value="0"></div>
            <div class="dta-mcell"><label>Lo -%</label><input id="dta-sl" class="dta-minput" type="number" min="0" step="0.1" value="0"></div>
        </div>
    </div>

    <div class="dta-set-block">
        <div class="dta-set-title">Trai nghiem</div>
        <div class="dta-toggle-row"><span>Am thanh khi co ket qua</span><div id="dta-sfx-switch" class="dta-switch" role="button"></div></div>
        <div class="dta-toggle-row"><span>Rung khi co ket qua</span><div id="dta-vib-switch" class="dta-switch" role="button"></div></div>
    </div>

    <div class="dta-set-block">
        <div class="dta-set-title">Du lieu da luu</div>
        <button id="dta-memreset" type="button" title="Xoa history, strategy, audit cua Pattern Engine">Xoa Pattern Engine memory</button>
        <button id="dta-journal-clear" type="button">Xoa nhat ky AI Analysis</button>
    </div>

    <button id="dta-settings-save" type="button">Luu &amp; Dong</button>
</div>`;
            document.body.appendChild(overlay);

            const openSettings  = () => overlay.classList.add('open');
            const closeSettings = () => overlay.classList.remove('open');
            document.getElementById('dta-gear').addEventListener('click', openSettings);
            document.getElementById('dta-settings-close').addEventListener('click', closeSettings);
            document.getElementById('dta-settings-save').addEventListener('click', closeSettings);
            overlay.addEventListener('click', e => { if (e.target === overlay) closeSettings(); });

            const fillXu = () => {
                populateXu();
                if (!$(CFG.SEL.xu)) { setTimeout(fillXu, 800); return; }
                // xu loaded – restore saved tier config or add default
                const listEl = document.getElementById('dta-tier-list');
                if (listEl && !listEl.children.length) {
                    const saved = loadTiers();
                    if (saved && saved.length) {
                        saved.forEach(t => addTierRow(t.xuOptIndex, t.maxLosses));
                    } else {
                        addTierRow(0, 18); // sensible default
                    }
                }
                updateTierStatus(0, 0, readTiers());
            };
            setTimeout(fillXu, 800);

            setTimeout(() => {
                const thuEl = $(CFG.SEL.thu);
                if (thuEl) updateDebug(V5.getDebug(thuEl.options.length), Array.from(thuEl.options));
                else updateDebug(V5.getDebug(7), []);
            }, 1200);

            updateAIAnalysis(null, AIJournal.getRecent(6));

            const aiState = AI.getState();
            const aiProviderEl = document.getElementById('dta-ai-provider');
            const aiModelEl = document.getElementById('dta-ai-model');
            const aiBaseEl = document.getElementById('dta-ai-base');
            const aiKeyEl = document.getElementById('dta-ai-key');
            const aiStatusEl = document.getElementById('dta-ai-status');
            const aiAuthModeEl = document.getElementById('dta-ai-authmode');
            const aiAuthModeRowEl = document.getElementById('dta-ai-authmode-row');

            // Hien/an auth mode row theo provider
            function updateAuthModeVisibility(provider) {
                if (aiAuthModeRowEl) {
                    aiAuthModeRowEl.style.display = (provider === 'anthropic') ? '' : 'none';
                }
            }

            if (aiProviderEl) aiProviderEl.value = aiState.provider || 'openai';
            if (aiModelEl) aiModelEl.value = (aiState[aiProviderEl?.value || 'openai']?.model) || CFG.AI.DEFAULTS[aiProviderEl?.value || 'openai'].model;
            if (aiBaseEl) aiBaseEl.value = (aiState[aiProviderEl?.value || 'openai']?.baseUrl) || CFG.AI.DEFAULTS[aiProviderEl?.value || 'openai'].baseUrl || '';
            if (aiKeyEl) aiKeyEl.value = (aiState[aiProviderEl?.value || 'openai']?.key) || '';
            if (aiAuthModeEl) aiAuthModeEl.value = (aiState.anthropic?.authMode) || 'native';
            updateAuthModeVisibility(aiState.provider || 'openai');
            if (aiStatusEl) updateAIStatus(AI.getState());

            function syncAIForm() {
                const provider = aiProviderEl ? aiProviderEl.value : 'openai';
                const s = AI.getState();
                if (aiModelEl) aiModelEl.value = (s[provider]?.model) || CFG.AI.DEFAULTS[provider].model;
                if (aiBaseEl) aiBaseEl.value = (s[provider]?.baseUrl) || CFG.AI.DEFAULTS[provider].baseUrl || '';
                if (aiKeyEl) aiKeyEl.value = (s[provider]?.key) || '';
                if (aiAuthModeEl) aiAuthModeEl.value = (s.anthropic?.authMode) || 'native';
                updateAuthModeVisibility(provider);
                if (aiStatusEl) updateAIStatus(AI.getState());
            }

            document.getElementById('dta-ai-provider').addEventListener('change', function () {
                AI.setProvider(this.value);
                syncAIForm();
            });
            document.getElementById('dta-ai-model').addEventListener('change', function () {
                AI.setModel(this.value);
                updateAIStatus(AI.getState());
            });
            document.getElementById('dta-ai-base').addEventListener('change', function () {
                AI.setBaseUrl(this.value);
                updateAIStatus(AI.getState());
            });
            document.getElementById('dta-ai-key').addEventListener('change', function () {
                AI.setKey(this.value);
                updateAIStatus(AI.getState());
            });
            if (aiAuthModeEl) {
                aiAuthModeEl.addEventListener('change', function () {
                    AI.setAuthMode(this.value);
                    updateAIStatus(AI.getState());
                });
            }
            document.getElementById('dta-ai-test').addEventListener('click', async () => {
                const btn = document.getElementById('dta-ai-test');
                if (btn) btn.disabled = true;
                Panel.log('Dang test ket noi AI...');
                try {
                    const res = await AI.testConnection();
                    Panel.log(`AI OK ${res.provider}/${res.model} | ${res.latencyMs}ms`);
                    updateAIStatus(AI.getState());
                } catch (err) {
                    Panel.log(`AI test loi: ${err?.message || err}`);
                    updateAIStatus(AI.getState());
                } finally {
                    if (btn) btn.disabled = false;
                }
            });

            document.getElementById('dta-add-tier').addEventListener('click', () => {
                addTierRow(0, 18);
                saveTiers();
            });

            // ── Vong/Lai/Lo: luu lai de khong phai nhap lai moi lan tai trang ──
            const savedSession = loadSessionCfg();
            const maxEl = document.getElementById('dta-max');
            const tpEl  = document.getElementById('dta-tp');
            const slEl  = document.getElementById('dta-sl');
            if (savedSession) {
                if (maxEl) maxEl.value = savedSession.max || 0;
                if (tpEl)  tpEl.value  = savedSession.tp  || 0;
                if (slEl)  slEl.value  = savedSession.sl  || 0;
                Engine.setMax(Math.max(0, savedSession.max || 0));
                Engine.setTP(Math.max(0, savedSession.tp || 0));
                Engine.setSL(Math.max(0, savedSession.sl || 0));
            }
            maxEl.addEventListener('change', function () { Engine.setMax(Math.max(0, +this.value || 0)); saveSessionCfg(); });
            tpEl.addEventListener('change', function () { Engine.setTP(Math.max(0, parseFloat(this.value) || 0)); saveSessionCfg(); });
            slEl.addEventListener('change', function () { Engine.setSL(Math.max(0, parseFloat(this.value) || 0)); saveSessionCfg(); });

            // ── Toggle SFX / Vibrate ─────────────────────────────────────────
            function wireSwitch(id, getEnabled, setEnabled) {
                const el = document.getElementById(id);
                if (!el) return;
                const sync = () => el.classList.toggle('on', getEnabled());
                sync();
                el.addEventListener('click', () => { setEnabled(!getEnabled()); sync(); });
            }
            wireSwitch('dta-sfx-switch', Sfx.isEnabled, Sfx.setEnabled);
            wireSwitch('dta-vib-switch', Vib.isEnabled, Vib.setEnabled);

            document.getElementById('dta-start').addEventListener('click', () => {
                if (Engine.isRunning()) return;
                const tiers = readTiers();
                if (!tiers.length) { log('Chua co moc xu! Mo Cai dat (⚙) de them moc.'); return; }
                Engine.setXuTiers(tiers);
                Engine.setMax(Math.max(0, +maxEl.value || 0));
                Engine.setTP(Math.max(0, parseFloat(tpEl.value) || 0));
                Engine.setSL(Math.max(0, parseFloat(slEl.value) || 0));
                Engine.start();
            });
            document.getElementById('dta-stop').addEventListener('click', () => Engine.stop());
            document.getElementById('dta-memreset').addEventListener('click', () => {
                if (Engine.isRunning()) { log('Dung engine truoc khi reset memory.'); return; }
                if (!confirm('Xoa toan bo gb_v5 memory / strategies / audit cua Pattern Engine?')) return;
                V5.wipeMemory();
                const thuEl = $(CFG.SEL.thu);
                updateDebug(V5.getDebug(thuEl ? thuEl.options.length : 7), thuEl ? Array.from(thuEl.options) : []);
                log('Memory Pattern Engine da xoa.');
            });
            document.getElementById('dta-journal-clear').addEventListener('click', () => {
                if (!confirm('Xoa nhat ky AI Analysis da luu (lich su phan tich + ket qua thuc te)?')) return;
                AIJournal.wipe();
                const feed = document.getElementById('dta-ai-feed');
                if (feed) feed.innerHTML = '<div class="dta-empty">Chua co lich su AI.</div>';
                log('Da xoa nhat ky AI Analysis.');
            });

            makeDraggable(panel, document.getElementById('dta-header'));

            document.getElementById('dta-toggle').addEventListener('click', function (e) {
                e.stopPropagation();
                const p = document.getElementById('dta-panel');
                const collapsed = p.classList.toggle('collapsed');
                this.textContent = collapsed ? '▲' : '▼';
            });

            document.getElementById('dta-debug-toggle').addEventListener('click', () => {
                document.getElementById('dta-debug-wrap').classList.toggle('open');
            });

            log(`History ${V5.getHistorySize()} | Strategies ${V5.getStrategySize()}`);
            updateAIStatus(AI.getState());
            log('Mo ⚙ de cau hinh AI/moc xu, roi BAT DAU.');

            setInterval(() => {
                if (Engine.isRunning()) return;
                const el = document.querySelector(CFG.SEL.bal);
                const xuD = document.getElementById('dta-cur-xu');
                if (el && xuD) xuD.textContent = fmtXu(parseXu(el.textContent || el.innerText || ''));
            }, 2000);
        }

        return {
            create, log, showOrder, setStatus, updateRounds, updateDebug,
            updateAIAnalysis, renderPnL, updateTierStatus,
        };
    })();

    function init() {
        if (!document.body) { setTimeout(init, 300); return; }
        let tries = 0;
        const poll = setInterval(() => {
            if (document.getElementById('app') || ++tries > 40) {
                clearInterval(poll);
                Panel.create();
            }
        }, 400);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 600);
})();
