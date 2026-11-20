(function (globalScope) {
    'use strict';

    const V4_WINDOWS = [20, 30];
    const V5_MILD_WEIGHTS = { w5: 1.5, w4: 3.0, w3: 1.0, wd2: 2.5 };
    const V5_STRONG_WEIGHTS = { w5: 4.0, w4: 8.0, w3: 3.0, wd2: 6.0 };

    function calculateMatrix(data, type) {
        const matrix = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            if (i === 0) {
                matrix[i] = [null, null, null, null, null];
                continue;
            }
            const prev = data[i - 1].nums.map(Number);
            const curr = data[i].nums.map(Number);
            const row = [];
            if (type === 1) {
                for (let c = 0; c < 5; c++) row.push(curr.map(n => Math.abs(n - prev[c])));
            } else {
                const tails = prev.map(n => n % 10);
                let s = 0;
                for (let c = 0; c < 5; c++) {
                    s += tails[c];
                    row.push(curr.map(n => Math.abs(n - s)));
                }
            }
            matrix[i] = row;
        }
        return matrix;
    }

    function getModeHotCandidates(matrix, data, type, c, startIdx, endIdx, topK) {
        const counts = {};
        const seen = new Set();
        for (let i = startIdx; i < endIdx; i++) {
            const rowVals = matrix[i][c];
            if (!rowVals) continue;
            for (let idx = 0; idx < rowVals.length; idx++) {
                const v = rowVals[idx];
                if (seen.has(v)) counts[v] = (counts[v] || 0) + 1;
            }
            for (let idx = 0; idx < rowVals.length; idx++) {
                seen.add(rowVals[idx]);
            }
        }
        const hot = Object.keys(counts)
            .sort((a, b) => (counts[b] - counts[a]) || (Number(a) - Number(b)))
            .slice(0, topK)
            .map(Number);

        const lastNums = data[endIdx - 1].nums.map(Number);
        let base = 0;
        if (type === 1) {
            base = lastNums[c];
        } else {
            for (let k = 0; k <= c; k++) base += (lastNums[k] % 10);
        }

        const result = new Set();
        for (const d of hot) {
            const a = base + d;
            const b = Math.abs(base - d);
            if (a >= 1 && a <= 39) result.add(a);
            if (b >= 1 && b <= 39) result.add(b);
        }
        return result;
    }

    // 預先建置每一期各獎號「先前出現位置」索引（嚴格只包含 < idx 的歷史期）
    function buildPrevOccCache(draws) {
        const total = draws.length;
        const ballOcc = Array.from({ length: 40 }, () => []);
        const prevOccCache = new Array(total);
        for (let i = 0; i < total; i++) {
            const d = draws[i];
            const perPos = new Array(5);
            for (let pos = 0; pos < 5; pos++) {
                const ball = d[pos];
                const hist = ballOcc[ball];
                const len = hist.length;
                perPos[pos] = len > 5 ? hist.slice(len - 5) : hist.slice();
            }
            for (let pos = 0; pos < 5; pos++) {
                ballOcc[d[pos]].push(i);
            }
            prevOccCache[i] = perPos;
        }
        return prevOccCache;
    }

    function drawContains(draw, num) {
        for (let k = 0; k < 5; k++) {
            if (draw[k] === num) return true;
        }
        return false;
    }

    // 計算指定期數 targetIdx 的版路加權計數（僅使用 0 .. targetIdx-1 資料）
    function computeBanluCountsAt(draws, prevOccCache, targetIdx) {
        const c5 = new Int32Array(40);
        const c4 = new Int32Array(40);
        const c3 = new Int32Array(40);
        const d2 = new Int32Array(40);

        if (targetIdx < 2) return { c5, c4, c3, d2 };

        // 1. 條件觸發定位加減版路 (Lag 1 ~ 5，連準 3 / 4 / 5 次)
        for (let lag = 1; lag <= 5; lag++) {
            const trigIdx = targetIdx - lag;
            if (trigIdx < 0) continue;
            const trigDraw = draws[trigIdx];
            const trigPrevOcc = prevOccCache[trigIdx];

            for (let pos = 0; pos < 5; pos++) {
                const occ = trigPrevOcc[pos];
                const occLen = occ.length;
                if (occLen < 3) continue;

                const i1 = occ[occLen - 3];
                const i2 = occ[occLen - 2];
                const i3 = occ[occLen - 1];
                const i4 = occLen >= 4 ? occ[occLen - 4] : -1;
                const i5 = occLen >= 5 ? occ[occLen - 5] : -1;

                const d1 = draws[i1], t1 = draws[i1 + lag];
                const d2Draw = draws[i2], t2 = draws[i2 + lag];
                const d3Draw = draws[i3], t3 = draws[i3 + lag];

                for (let c = 0; c < 5; c++) {
                    const base1 = d1[c];
                    const base2 = d2Draw[c];
                    const base3 = d3Draw[c];
                    const baseNow = trigDraw[c];

                    for (let bi = 0; bi < 5; bi++) {
                        const delta = t1[bi] - base1;
                        const cand2 = base2 + delta;
                        if (cand2 < 1 || cand2 > 39 || !drawContains(t2, cand2)) continue;
                        const cand3 = base3 + delta;
                        if (cand3 < 1 || cand3 > 39 || !drawContains(t3, cand3)) continue;

                        const pNow = baseNow + delta;
                        if (pNow < 1 || pNow > 39) continue;

                        c3[pNow]++;
                        if (i4 >= 0) {
                            const cand4 = draws[i4][c] + delta;
                            if (cand4 >= 1 && cand4 <= 39 && drawContains(draws[i4 + lag], cand4)) {
                                c4[pNow]++;
                                if (i5 >= 0) {
                                    const cand5 = draws[i5][c] + delta;
                                    if (cand5 >= 1 && cand5 <= 39 && drawContains(draws[i5 + lag], cand5)) {
                                        c5[pNow]++;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. 隔 2 期直接定位加減版路 (Lag = 2，連準 3 期)
        if (targetIdx - 5 >= 0) {
            const i1 = targetIdx - 3;
            const i2 = targetIdx - 4;
            const i3 = targetIdx - 5;
            const d1 = draws[i1], t1 = draws[targetIdx - 1];
            const d2Draw = draws[i2], t2 = draws[targetIdx - 2];
            const d3Draw = draws[i3], t3 = draws[targetIdx - 3];
            const baseNowDraw = draws[targetIdx - 2];

            for (let c = 0; c < 5; c++) {
                for (let bi = 0; bi < 5; bi++) {
                    const delta = t1[bi] - d1[c];
                    const cand2 = d2Draw[c] + delta;
                    if (cand2 < 1 || cand2 > 39 || !drawContains(t2, cand2)) continue;
                    const cand3 = d3Draw[c] + delta;
                    if (cand3 < 1 || cand3 > 39 || !drawContains(t3, cand3)) continue;

                    const pNow = baseNowDraw[c] + delta;
                    if (pNow >= 1 && pNow <= 39) {
                        d2[pNow]++;
                    }
                }
            }
        }

        return { c5, c4, c3, d2 };
    }

    // 產出人類可讀的主動版路規則明細（供 NEXT 面板與歷史明細表顯示）
    function getBanluRulesAt(data, draws, prevOccCache, targetIdx) {
        const rules = [];
        if (targetIdx < 5) return rules;

        for (let lag = 1; lag <= 5; lag++) {
            const trigIdx = targetIdx - lag;
            if (trigIdx < 0) continue;
            const trigDraw = draws[trigIdx];
            const trigPeriod = data[trigIdx].period;
            const trigPrevOcc = prevOccCache[trigIdx];

            for (let pos = 0; pos < 5; pos++) {
                const occ = trigPrevOcc[pos];
                const occLen = occ.length;
                if (occLen < 3) continue;

                const triggerBall = trigDraw[pos];
                const i1 = occ[occLen - 3];
                const i2 = occ[occLen - 2];
                const i3 = occ[occLen - 1];
                const i4 = occLen >= 4 ? occ[occLen - 4] : -1;
                const i5 = occLen >= 5 ? occ[occLen - 5] : -1;

                const d1 = draws[i1], t1 = draws[i1 + lag];
                const d2Draw = draws[i2], t2 = draws[i2 + lag];
                const d3Draw = draws[i3], t3 = draws[i3 + lag];

                for (let c = 0; c < 5; c++) {
                    for (let bi = 0; bi < 5; bi++) {
                        const delta = t1[bi] - d1[c];
                        const cand2 = d2Draw[c] + delta;
                        if (cand2 < 1 || cand2 > 39 || !drawContains(t2, cand2)) continue;
                        const cand3 = d3Draw[c] + delta;
                        if (cand3 < 1 || cand3 > 39 || !drawContains(t3, cand3)) continue;

                        const pNow = trigDraw[c] + delta;
                        if (pNow < 1 || pNow > 39) continue;

                        let streak = 3;
                        if (i4 >= 0) {
                            const cand4 = draws[i4][c] + delta;
                            if (cand4 >= 1 && cand4 <= 39 && drawContains(draws[i4 + lag], cand4)) {
                                streak = 4;
                                if (i5 >= 0) {
                                    const cand5 = draws[i5][c] + delta;
                                    if (cand5 >= 1 && cand5 <= 39 && drawContains(draws[i5 + lag], cand5)) {
                                        streak = 5;
                                    }
                                }
                            }
                        }

                        rules.push({
                            kind: 'cond',
                            streak,
                            trigPeriod,
                            triggerBall,
                            lag,
                            colPos: c + 1,
                            baseVal: trigDraw[c],
                            delta,
                            pred: pNow
                        });
                    }
                }
            }
        }

        if (targetIdx - 5 >= 0) {
            const i1 = targetIdx - 3;
            const i2 = targetIdx - 4;
            const i3 = targetIdx - 5;
            const d1 = draws[i1], t1 = draws[targetIdx - 1];
            const d2Draw = draws[i2], t2 = draws[targetIdx - 2];
            const d3Draw = draws[i3], t3 = draws[targetIdx - 3];
            const baseNowDraw = draws[targetIdx - 2];
            const trigPeriod = data[targetIdx - 2].period;

            for (let c = 0; c < 5; c++) {
                for (let bi = 0; bi < 5; bi++) {
                    const delta = t1[bi] - d1[c];
                    const cand2 = d2Draw[c] + delta;
                    if (cand2 < 1 || cand2 > 39 || !drawContains(t2, cand2)) continue;
                    const cand3 = d3Draw[c] + delta;
                    if (cand3 < 1 || cand3 > 39 || !drawContains(t3, cand3)) continue;

                    const pNow = baseNowDraw[c] + delta;
                    if (pNow < 1 || pNow > 39) continue;

                    let streak = 3;
                    if (targetIdx - 6 >= 0) {
                        const cand4 = draws[targetIdx - 6][c] + delta;
                        if (cand4 >= 1 && cand4 <= 39 && drawContains(draws[targetIdx - 4], cand4)) {
                            streak = 4;
                        }
                    }

                    rules.push({
                        kind: 'direct2',
                        streak,
                        trigPeriod,
                        triggerBall: null,
                        lag: 2,
                        colPos: c + 1,
                        baseVal: baseNowDraw[c],
                        delta,
                        pred: pNow
                    });
                }
            }
        }

        rules.sort((a, b) => {
            const pa = (a.kind === 'direct2' ? 10 : a.streak);
            const pb = (b.kind === 'direct2' ? 10 : b.streak);
            if (pb !== pa) return pb - pa;
            if (b.streak !== a.streak) return b.streak - a.streak;
            return a.pred - b.pred;
        });

        return rules;
    }

    // 計算 V4 雙窗共振基礎分數 (0 .. targetIdx-1)
    function computeV4ScoresAt(data, draws, matrix1, matrix2, targetIdx) {
        const scores = new Float64Array(40);
        if (targetIdx < 2) return scores;

        for (let wIdx = 0; wIdx < V4_WINDOWS.length; wIdx++) {
            const startIdx = Math.max(1, targetIdx - V4_WINDOWS[wIdx]);
            const colHitCnt = new Int32Array(40);

            for (let c = 0; c < 5; c++) {
                const s1 = getModeHotCandidates(matrix1, data, 1, c, startIdx, targetIdx, 3);
                const s2 = getModeHotCandidates(matrix2, data, 2, c, startIdx, targetIdx, 3);
                const union = new Set([...s1, ...s2]);

                union.forEach(n => { colHitCnt[n]++; });
                s1.forEach(n => { scores[n] += 1.0; });
                s2.forEach(n => { scores[n] += 1.0; });
                s1.forEach(n => { if (s2.has(n)) scores[n] += 0.5; });
            }

            for (let n = 1; n <= 39; n++) {
                if (colHitCnt[n] >= 3) scores[n] += 2.0;
            }
        }

        const tail15 = new Int32Array(10);
        const tStart = Math.max(0, targetIdx - 15);
        for (let i = tStart; i < targetIdx; i++) {
            for (let c = 0; c < 5; c++) tail15[draws[i][c] % 10]++;
        }

        const prevTails = new Int32Array(10);
        const lastDraw = draws[targetIdx - 1];
        for (let c = 0; c < 5; c++) prevTails[lastDraw[c] % 10]++;

        const hot50 = new Int32Array(40);
        const hStart = Math.max(0, targetIdx - 50);
        for (let i = hStart; i < targetIdx; i++) {
            for (let c = 0; c < 5; c++) hot50[draws[i][c]]++;
        }

        for (let n = 1; n <= 39; n++) {
            const tail = n % 10;
            const tailCap = (tail === 0) ? 3.0 : 4.0;
            scores[n] += 0.2 * (tail15[tail] / tailCap);
            scores[n] += 0.2 * prevTails[tail];
            scores[n] += 0.08 * hot50[n];
        }

        return scores;
    }

    function combineV5Scores(v4Scores, banluCounts, weights) {
        const finalScores = new Float64Array(40);
        const { c5, c4, c3, d2 } = banluCounts;
        const { w5, w4, w3, wd2 } = weights;
        for (let n = 1; n <= 39; n++) {
            finalScores[n] = v4Scores[n]
                + w5 * Math.min(c5[n], 2)
                + w4 * Math.min(c4[n], 2)
                + w3 * Math.min(c3[n], 3)
                + wd2 * Math.min(d2[n], 2);
        }
        return finalScores;
    }

    function rankScores(scores) {
        const list = [];
        for (let n = 1; n <= 39; n++) {
            list.push({ num: n, score: scores[n] });
        }
        list.sort((a, b) => (b.score - a.score) || (a.num - b.num));
        return list;
    }

    function assignGroupsTo5Pillars(groups) {
        const cols = [[], [], [], [], []];
        if (!groups.length) return cols;
        if (groups.length === 5) {
            for (let i = 0; i < 5; i++) cols[i] = [...groups[i]].sort((a, b) => a - b);
            return cols;
        }

        const sortedGroups = groups
            .map(g => [...g].sort((a, b) => a - b))
            .sort((a, b) => {
                const ma = a.reduce((s, v) => s + v, 0) / a.length;
                const mb = b.reduce((s, v) => s + v, 0) / b.length;
                return ma - mb;
            });

        const means = sortedGroups.map(g => g.reduce((s, v) => s + v, 0) / g.length);
        const centers = [6.5, 13.5, 20.0, 26.5, 33.5];
        let bestAssign = null;
        let bestDist = Infinity;

        function choose(start, chosen) {
            if (chosen.length === sortedGroups.length) {
                let dist = 0;
                for (let i = 0; i < sortedGroups.length; i++) {
                    dist += Math.abs(means[i] - centers[chosen[i]]);
                }
                if (dist < bestDist) {
                    bestDist = dist;
                    bestAssign = [...chosen];
                }
                return;
            }
            for (let i = start; i < 5; i++) {
                chosen.push(i);
                choose(i + 1, chosen);
                chosen.pop();
            }
        }
        choose(0, []);
        for (let i = 0; i < sortedGroups.length; i++) {
            cols[bestAssign[i]] = sortedGroups[i];
        }
        return cols;
    }

    function rankedToPillarLayouts(ranked) {
        const top8 = ranked.slice(0, 8).map(x => x.num).sort((a, b) => a - b);
        const cols4x2 = assignGroupsTo5Pillars([
            [top8[0], top8[1]],
            [top8[2], top8[3]],
            [top8[4], top8[5]],
            [top8[6], top8[7]]
        ]);

        const top6 = ranked.slice(0, 6).map(x => x.num).sort((a, b) => a - b);
        const cols3x2 = assignGroupsTo5Pillars([
            [top6[0], top6[1]],
            [top6[2], top6[3]],
            [top6[4], top6[5]]
        ]);

        const top5 = ranked.slice(0, 5).map(x => x.num).sort((a, b) => a - b);
        const cols5x1 = top5.map(n => [n]);

        return { cols4x2, cols3x2, cols5x1 };
    }

    function buildAllV4V5Predictions(data, matrix1, matrix2) {
        const total = data.length;
        const draws = data.map(d => d.nums.map(Number));
        const prevOccCache = buildPrevOccCache(draws);

        const v5_4x2 = new Array(total + 1);
        const v5_3x2 = new Array(total + 1);
        const v5_5x1 = new Array(total + 1);
        const v4_4x2 = new Array(total + 1);

        const car_v5_mild = new Array(total + 1);
        const car_v5_strong = new Array(total + 1);
        const car_v4 = new Array(total + 1);
        const banluCountsByIdx = new Array(total + 1);

        for (let targetIdx = 0; targetIdx <= total; targetIdx++) {
            if (targetIdx < 2) {
                const empty = [[], [], [], [], []];
                v5_4x2[targetIdx] = empty;
                v5_3x2[targetIdx] = empty;
                v5_5x1[targetIdx] = empty;
                v4_4x2[targetIdx] = empty;
                car_v5_mild[targetIdx] = [];
                car_v5_strong[targetIdx] = [];
                car_v4[targetIdx] = [];
                banluCountsByIdx[targetIdx] = {
                    c5: new Int32Array(40),
                    c4: new Int32Array(40),
                    c3: new Int32Array(40),
                    d2: new Int32Array(40)
                };
                continue;
            }

            const v4Scores = computeV4ScoresAt(data, draws, matrix1, matrix2, targetIdx);
            const banluCounts = computeBanluCountsAt(draws, prevOccCache, targetIdx);
            banluCountsByIdx[targetIdx] = banluCounts;

            const v5MildScores = combineV5Scores(v4Scores, banluCounts, V5_MILD_WEIGHTS);
            const v5StrongScores = combineV5Scores(v4Scores, banluCounts, V5_STRONG_WEIGHTS);

            const v4Ranked = rankScores(v4Scores);
            const v5MildRanked = rankScores(v5MildScores);
            const v5StrongRanked = rankScores(v5StrongScores);

            const v5Layouts = rankedToPillarLayouts(v5MildRanked);
            v5_4x2[targetIdx] = v5Layouts.cols4x2;
            v5_3x2[targetIdx] = v5Layouts.cols3x2;
            v5_5x1[targetIdx] = v5Layouts.cols5x1;

            const v4Layouts = rankedToPillarLayouts(v4Ranked);
            v4_4x2[targetIdx] = v4Layouts.cols4x2;

            car_v5_mild[targetIdx] = v5MildRanked.slice(0, 4).map(x => ({
                num: x.num,
                score: x.score,
                v4Score: v4Scores[x.num],
                c5: banluCounts.c5[x.num],
                c4: banluCounts.c4[x.num],
                c3: banluCounts.c3[x.num],
                d2: banluCounts.d2[x.num]
            }));

            car_v5_strong[targetIdx] = v5StrongRanked.slice(0, 4).map(x => ({
                num: x.num,
                score: x.score,
                v4Score: v4Scores[x.num],
                c5: banluCounts.c5[x.num],
                c4: banluCounts.c4[x.num],
                c3: banluCounts.c3[x.num],
                d2: banluCounts.d2[x.num]
            }));

            car_v4[targetIdx] = v4Ranked.slice(0, 4).map(x => ({
                num: x.num,
                score: x.score,
                v4Score: x.score,
                c5: banluCounts.c5[x.num],
                c4: banluCounts.c4[x.num],
                c3: banluCounts.c3[x.num],
                d2: banluCounts.d2[x.num]
            }));
        }

        return {
            v5_4x2,
            v5_3x2,
            v5_5x1,
            v4_4x2,
            car_v5_mild,
            car_v5_strong,
            car_v4,
            banluCountsByIdx,
            getRulesAt: (idx) => getBanluRulesAt(data, draws, prevOccCache, idx)
        };
    }

    const api = {
        calculateMatrix,
        getModeHotCandidates,
        assignGroupsTo5Pillars,
        buildAllV4V5Predictions,
        V5_MILD_WEIGHTS,
        V5_STRONG_WEIGHTS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (globalScope) {
        globalScope.Lotto539Predictor = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
