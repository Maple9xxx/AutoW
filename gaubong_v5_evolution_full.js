// ==UserScript==
// @name         GauBong v5 Evolution Full
// @namespace    https://gaubong.us/
// @version      5.0.0
// @description  Strategy learning engine: feature extraction, environment classifier, genome discovery, deterministic voting
// @author       Senior Dev
// @match        https://gaubong.us/*
// @match        https://www.gaubong.us/*
// @match        https://gaubong.net/*
// @match        https://www.gaubong.net/*
// @grant        none
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
            MIN_HISTORY       : 14,
            MIN_SUPPORT       : 8,
            MAX_STRATEGIES    : 240,
            EVOLVE_EVERY      : 50,
            ANTI_LOSS_STREAK  : 10,
        },

        HISTORY_KEY  : 'gb_v5_history',
        STRATEGY_KEY : 'gb_v5_strategies',
        AUDIT_KEY    : 'gb_v5_audit',
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
            const ctx = contextAt(history.length - 1);
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

            return {
                mode: ctx ? ctx.mode : 'WARMUP',
                features: ctx ? ctx.features : null,
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

        return {
            decide,
            learnRound,
            getDebug,
            getHistorySize,
            getStrategySize,
            wipeMemory,
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
        let maxRounds = 0, xuIndex = 0, tpPct = 0, slPct = 0;

        const setXu = i => { xuIndex = i; };
        const setMax = n => { maxRounds = n; };
        const setTP = p => { tpPct = Math.max(0, p); };
        const setSL = p => { slPct = Math.max(0, p); };
        const isRunning = () => running;

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
            const safeI = Math.min(xuIndex, xuOpts.length - 1);
            triggerSelect(xuEl, xuOpts[safeI].value);
            Panel.log(`Dat: ${xuOpts[safeI].text}`);

            await sleep(CFG.STEP_DELAY);
            if (!running) return;

            const thuEl = $(CFG.SEL.thu);
            if (!thuEl) { Panel.log('Khong tim thay select Thu.'); return; }
            const thuOpts = Array.from(thuEl.options);
            const n = thuOpts.length;
            const decision = V5.decide(n);
            const finalPick = Math.max(0, Math.min(n - 1, decision.picked));

            triggerSelect(thuEl, thuOpts[finalPick].value);
            Panel.updateDebug(V5.getDebug(n), thuOpts);
            Panel.log(`Pick ${thuOpts[finalPick].text} | ${decision.mode} | conf ${(decision.confidence * 100).toFixed(0)}% | S${decision.strategiesUsed.length}`);

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
            if (round?.order?.length) {
                Panel.showOrder(round.order.map(i => i + 1).join('>'));
                const outcome = V5.learnRound(round, decision);
                const hit = decision.picked === round.winner;
                const orderText = round.order.map(i => i + 1).join('>');
                Panel.log(`#${rounds}: ${orderText} | win #${round.winner + 1} | ${hit ? 'HIT' : 'MISS'} | +${outcome?.created || 0}`);
                Panel.updateDebug(V5.getDebug(n), thuOpts);
            } else {
                Panel.log(`Vong ${rounds}: loi doc ket qua.`);
            }

            const pnl = Tracker.recordResult();
            if (pnl && running) {
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
            Tracker.startSession();
            Panel.setStatus('run');
            Panel.log('V5 Evolution start.');
            Panel.log(`History ${V5.getHistorySize()} | Strategies ${V5.getStrategySize()}`);
            runRound();
        }

        function stop(auto = false) {
            running = false;
            clearTimeout(timer);
            Panel.setStatus('idle');
            if (!auto) Panel.log('Da dung.');
        }

        return { start, stop, isRunning, setXu, setMax, setTP, setSL };
    })();

    const Panel = (() => {
        let logs = [];
        let orderTimer = null;

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

        function hidePanel() {
            const panel = document.getElementById('dta-panel');
            const mini = document.getElementById('dta-mini');
            if (panel) panel.style.display = 'none';
            if (mini) mini.style.display = 'block';
        }

        function showPanel() {
            const panel = document.getElementById('dta-panel');
            const mini = document.getElementById('dta-mini');
            if (panel) panel.style.display = 'block';
            if (mini) mini.style.display = 'none';
        }

        function pct(v) {
            return `${Math.round((v || 0) * 100)}%`;
        }

        function updateDebug(debug, opts) {
            const el = document.getElementById('dta-debug');
            if (!el || !debug) return;
            const name = opts?.[debug.pick]?.text || `#${(debug.pick || 0) + 1}`;
            const top = debug.top.length ? debug.top.map(s => {
                const cls = s.disabled ? ' disabled' : '';
                return `<div class="dta-strat${cls}">
                    <span>#${s.id} ${s.class}</span>
                    <b>${pct(s.recent || s.wr)}</b>
                    <em>p${s.predict + 1}</em>
                </div>`;
            }).join('') : '<div class="dta-empty">Chua du strategy.</div>';

            const meta = Object.entries(debug.meta || {}).slice(0, 4).map(([k, v]) => {
                return `<span>${k}:${pct(v.wr)}</span>`;
            }).join('');

            el.innerHTML = `
                <div class="dta-mode">
                    <span>MODE</span><b>${debug.mode}</b>
                </div>
                <div class="dta-pick">
                    <span>Current pick</span><b>${name}</b><em>${pct(debug.confidence)}</em>
                </div>
                <div class="dta-mbar">
                    <span>Rounds ${debug.totalRounds}</span>
                    <span>Active ${debug.active}</span>
                    <span>Total ${debug.strategies}</span>
                </div>
                <div class="dta-meta">${meta || '<span>meta warmup</span>'}</div>
                <div class="dta-top">${top}</div>
            `;
        }

        function populateXu() {
            const xuEl = $(CFG.SEL.xu);
            const uiSel = document.getElementById('dta-xu-sel');
            if (!xuEl || !uiSel) return;
            const prev = uiSel.value;
            uiSel.innerHTML = '';
            Array.from(xuEl.options).forEach((o, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = o.text;
                uiSel.appendChild(opt);
            });
            if (prev && uiSel.querySelector(`option[value="${prev}"]`)) uiSel.value = prev;
        }

        function injectStyles() {
            if (document.getElementById('dta-style')) return;
            const s = document.createElement('style');
            s.id = 'dta-style';
            s.textContent = `
#dta-panel {
    position:fixed; bottom:76px; right:10px; width:306px;
    background:#111318; border:1px solid #d84f4f; border-radius:10px;
    padding:12px; font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;
    font-size:12px; color:#d7dbe5; z-index:2147483647;
    box-shadow:0 10px 34px rgba(0,0,0,.45); user-select:none; -webkit-user-select:none;
}
	#dta-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; cursor:move; touch-action:none; }
	#dta-title { font-size:14px; font-weight:800; color:#ff6666; }
	.dta-head-actions { display:flex; align-items:center; gap:6px; }
	.dta-badge { font-size:10px; font-weight:800; padding:3px 8px; border-radius:12px; border:1px solid #2d3340; color:#7b8495; background:#171a21; }
	.dta-badge.run { color:#48d18a; border-color:#247a4c; background:#0d2518; }
	#dta-hide { border:1px solid #343b49; border-radius:7px; background:#171a21; color:#9aa3b2; font-size:10px; font-weight:800; padding:3px 7px; cursor:pointer; }
	#dta-mini { display:none; position:fixed; bottom:76px; right:10px; z-index:2147483647; border:none; border-radius:8px; background:#d84f4f; color:#fff; font-size:12px; font-weight:900; padding:10px 12px; box-shadow:0 8px 24px rgba(0,0,0,.35); }
	.dta-label { display:block; font-size:10px; color:#7b8495; margin-bottom:4px; letter-spacing:.3px; text-transform:uppercase; }
.dta-select { width:100%; box-sizing:border-box; background:#090b10; color:#e7ebf3; border:1px solid #2d3340; border-radius:7px; padding:7px 9px; font-size:12px; margin-bottom:9px; outline:none; }
.dta-mgrid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:9px; }
.dta-mcell { display:flex; flex-direction:column; align-items:center; gap:3px; }
.dta-mcell label { font-size:9px; color:#7b8495; text-transform:uppercase; white-space:nowrap; }
.dta-minput { width:100%; box-sizing:border-box; background:#090b10; color:#e7ebf3; border:1px solid #2d3340; border-radius:7px; padding:5px 4px; font-size:11px; text-align:center; outline:none; }
.dta-btns { display:flex; gap:6px; margin-bottom:9px; }
#dta-start, #dta-stop, #dta-memreset { border-radius:8px; font-size:12px; font-weight:800; cursor:pointer; padding:8px 7px; }
#dta-start { flex:1; border:none; background:#d84f4f; color:#fff; }
#dta-start:disabled { opacity:.4; cursor:not-allowed; }
#dta-stop { flex:1; border:1px solid #343b49; background:#171a21; color:#7b8495; }
#dta-stop:not(:disabled) { color:#ff6666; border-color:#d84f4f; background:#271316; }
#dta-stop:disabled { opacity:.45; cursor:not-allowed; }
#dta-memreset { border:1px solid #343b49; background:#171a21; color:#7b8495; font-size:10px; }
#dta-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; background:#0a0c11; border:1px solid #222836; border-radius:8px; padding:7px 4px; margin-bottom:8px; }
.dta-sitem { display:flex; flex-direction:column; align-items:center; gap:2px; min-width:0; }
.dta-slabel { font-size:9px; color:#7b8495; }
.dta-sval { font-size:11px; font-weight:800; color:#d7dbe5; white-space:nowrap; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
#dta-rounds { color:#ff6666; }
.pnl-pos { color:#48d18a !important; }
.pnl-neg { color:#ff6666 !important; }
.pnl-neu { color:#9aa3b2 !important; }
#dta-debug { background:#0a0c11; border:1px solid #222836; border-radius:8px; padding:8px; margin-bottom:8px; }
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
.dta-top { display:flex; flex-direction:column; gap:4px; }
.dta-strat { display:grid; grid-template-columns:1fr 38px 28px; gap:5px; align-items:center; color:#aeb6c5; font-size:10px; }
.dta-strat span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.dta-strat b { color:#48d18a; text-align:right; }
.dta-strat em { color:#ffb84d; text-align:right; font-style:normal; }
.dta-strat.disabled { opacity:.42; }
.dta-empty { color:#7b8495; font-size:10px; text-align:center; padding:4px 0; }
#dta-log { background:#080a0f; border-radius:7px; padding:7px 9px; font-size:10px; color:#8e98aa; height:64px; overflow:hidden; white-space:pre-wrap; line-height:1.55; font-family:'Courier New',monospace; }
#dta-footer { margin-top:7px; text-align:center; font-size:9px; color:#596273; letter-spacing:.6px; }
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
	    <span id="dta-title">GauBong v5 Evolution</span>
	    <div class="dta-head-actions">
	        <button id="dta-hide" type="button">An</button>
	        <span id="dta-badge" class="dta-badge idle">IDLE</span>
	    </div>
	</div>
<label class="dta-label">Muc Xu dat cuoc</label>
<select id="dta-xu-sel" class="dta-select"><option>Dang tai...</option></select>
<div class="dta-mgrid">
    <div class="dta-mcell"><label>Vong</label><input id="dta-max" class="dta-minput" type="number" min="0" value="0" title="0 = vo han"></div>
    <div class="dta-mcell"><label>Lai +%</label><input id="dta-tp" class="dta-minput" type="number" min="0" step="0.1" value="0"></div>
    <div class="dta-mcell"><label>Lo -%</label><input id="dta-sl" class="dta-minput" type="number" min="0" step="0.1" value="0"></div>
</div>
<div class="dta-btns">
    <button id="dta-start">BAT DAU</button>
    <button id="dta-stop" disabled>DUNG</button>
    <button id="dta-memreset" title="Xoa history, strategy, audit">Mem</button>
</div>
	<div id="dta-stats">
	    <div class="dta-sitem"><span class="dta-slabel">Vong</span><span id="dta-rounds" class="dta-sval">0</span></div>
	    <div class="dta-sitem"><span class="dta-slabel">Xu</span><span id="dta-cur-xu" class="dta-sval">-</span></div>
	    <div class="dta-sitem"><span class="dta-slabel">Sess.</span><span id="dta-session-pnl" class="dta-sval pnl-neu">-</span></div>
	    <div class="dta-sitem"><span class="dta-slabel">W/L</span><span id="dta-wr" class="dta-sval">-</span></div>
	</div>
	<div id="dta-debug"><div class="dta-empty">Dang tai memory...</div></div>
	<div id="dta-order" class="dta-order"></div>
	<div id="dta-log">San sang...</div>
	<div id="dta-footer">V5 · Strategy Learning · Deterministic Vote</div>`;

            document.body.appendChild(panel);
            const mini = document.createElement('button');
            mini.id = 'dta-mini';
            mini.type = 'button';
            mini.textContent = 'UI';
            document.body.appendChild(mini);

            const fillXu = () => { populateXu(); if (!$(CFG.SEL.xu)) setTimeout(fillXu, 800); };
            setTimeout(fillXu, 800);

            setTimeout(() => {
                const thuEl = $(CFG.SEL.thu);
                if (thuEl) updateDebug(V5.getDebug(thuEl.options.length), Array.from(thuEl.options));
                else updateDebug(V5.getDebug(7), []);
            }, 1200);

            document.getElementById('dta-xu-sel').addEventListener('change', function () { Engine.setXu(+this.value); });
            document.getElementById('dta-max').addEventListener('change', function () { Engine.setMax(Math.max(0, +this.value || 0)); });
            document.getElementById('dta-tp').addEventListener('change', function () { Engine.setTP(Math.max(0, parseFloat(this.value) || 0)); });
            document.getElementById('dta-sl').addEventListener('change', function () { Engine.setSL(Math.max(0, parseFloat(this.value) || 0)); });

            document.getElementById('dta-start').addEventListener('click', () => {
                if (Engine.isRunning()) return;
                populateXu();
                Engine.setXu(+document.getElementById('dta-xu-sel').value || 0);
                Engine.setMax(Math.max(0, +document.getElementById('dta-max').value || 0));
                Engine.setTP(Math.max(0, parseFloat(document.getElementById('dta-tp').value) || 0));
                Engine.setSL(Math.max(0, parseFloat(document.getElementById('dta-sl').value) || 0));
                Engine.start();
            });
            document.getElementById('dta-stop').addEventListener('click', () => Engine.stop());
            document.getElementById('dta-hide').addEventListener('click', hidePanel);
            document.getElementById('dta-mini').addEventListener('click', showPanel);
            document.getElementById('dta-memreset').addEventListener('click', () => {
                if (Engine.isRunning()) { log('Dung engine truoc khi reset memory.'); return; }
                if (!confirm('Xoa toan bo gb_v5 history / strategies / audit?')) return;
                V5.wipeMemory();
                const thuEl = $(CFG.SEL.thu);
                updateDebug(V5.getDebug(thuEl ? thuEl.options.length : 7), thuEl ? Array.from(thuEl.options) : []);
                log('Memory v5 da xoa.');
            });

            makeDraggable(panel, document.getElementById('dta-header'));

            log(`History ${V5.getHistorySize()} | Strategies ${V5.getStrategySize()}`);
            log('Chon xu, vong/TP/SL, roi BAT DAU.');

            setInterval(() => {
                if (Engine.isRunning()) return;
                const el = document.querySelector(CFG.SEL.bal);
                const xuD = document.getElementById('dta-cur-xu');
                if (el && xuD) xuD.textContent = fmtXu(parseXu(el.textContent || el.innerText || ''));
            }, 2000);
        }

        return { create, log, showOrder, setStatus, updateRounds, updateDebug, renderPnL };
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
