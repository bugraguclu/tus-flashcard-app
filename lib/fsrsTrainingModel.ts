/** @license
 * BSD 3-Clause License
 *
 * Copyright (c) 2023, Open Spaced Repetition
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import type { FsrsTrainingItem } from './fsrsMemory';

/**
 * Scalar forward and analytic backward passes ported from fsrs-rs 6.6.2
 * src/analytic.rs (BSD-3-Clause), Copyright (c) 2023 Open Spaced Repetition.
 * https://github.com/open-spaced-repetition/fsrs-rs/blob/v6.6.2/src/analytic.rs
 * Forward intermediates are f32; derivatives and their accumulation are f64.
 * Anki's AGPL implementation is used only as an external behaviour oracle.
 */
const f = Math.fround;
const S_MIN = f(0.001);
const S_MAX = 36_500;
const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));
const passes = (x: number, low: number, high: number) => x >= low && x <= high ? 1 : 0;
const exp = (x: number) => f(Math.exp(x));
const pow = (x: number, y: number) => f(Math.pow(x, y));
const MIN_PROB = f(1e-7);
const MAX_PROB = f(1 - MIN_PROB);

export interface WeightedTrainingItem {
    item: FsrsTrainingItem & { cardId?: number };
    weight: number;
}
interface Curve { t: number; s: number; base: number; r: number }
interface State { s: number; d: number }
interface Step {
    input: State; s: number; d: number; days: number; rating: number; curve: Curve;
    rawS: number; rawD: number; initial: boolean;
    shortRaw: number; shortValue: number; shortActive: boolean;
    failureRaw: number; failureFloor: number; useFloor: boolean;
}

export class FsrsTrainingModel {
    private readonly decay: number;
    private readonly factor: number;
    private readonly factorDerivative: number;
    private readonly exp8: number;
    private readonly failureDivisor: number;
    private readonly easyD: number;

    constructor(private readonly w: ArrayLike<number>) {
        this.decay = -w[20];
        this.factor = f(exp(f(f(Math.log(f(0.9))) / this.decay)) - 1);
        const c = Math.log(0.9);
        this.factorDerivative = Math.exp(c / this.decay) * (-c / (this.decay * this.decay));
        this.exp8 = exp(w[8]);
        this.failureDivisor = exp(f(w[17] * w[18]));
        this.easyD = this.initialDifficulty(4);
    }

    private initialDifficulty(rating: number) {
        return f(f(this.w[4] - exp(f(this.w[5] * (rating - 1)))) + 1);
    }

    private curve(days: number, s: number): Curve {
        const t = Math.max(0, f(days));
        const base = f(f(f(t / s) * this.factor) + 1);
        return { t, s, base, r: pow(base, this.decay) };
    }

    private curveBackward(c: Curve, g: number, gradients: Float64Array): number {
        if (g === 0) return 0;
        const dr = c.r * (Math.log(c.base) + this.decay / c.base * (c.t / c.s * this.factorDerivative));
        gradients[20] += -g * dr;
        return g * c.r * this.decay / c.base * (-c.t * this.factor / (c.s * c.s));
    }

    private forward(input: State, days: number, rating: number, nth: number): [State, Step] {
        const w = this.w;
        const s = clamp(input.s, S_MIN, S_MAX);
        const d = clamp(input.d, 1, 10);
        const c: Step = {
            input, s, d, days: f(days), rating, curve: { t: 0, s, base: 1, r: 0 },
            rawS: s, rawD: d, initial: nth === 0 && input.s === 0,
            shortRaw: 0, shortValue: 0, shortActive: false, failureRaw: 0, failureFloor: 0, useFloor: false,
        };
        if (c.initial) {
            c.rawS = w[rating - 1];
            c.rawD = this.initialDifficulty(rating);
        } else {
            c.curve = this.curve(days, s);
            const r = c.curve.r;
            if (days === 0) {
                c.shortRaw = f(exp(f(w[17] * f(f(rating - 3) + w[18]))) * pow(s, -w[19]));
                c.shortActive = !(rating >= 2 && c.shortRaw < 1);
                c.shortValue = rating >= 2 ? Math.max(c.shortRaw, 1) : c.shortRaw;
                c.rawS = f(s * c.shortValue);
            } else if (rating === 1) {
                let raw = f(w[11] * pow(d, -w[12]));
                raw = f(raw * f(pow(f(s + 1), w[13]) - 1));
                c.failureRaw = f(raw * exp(f(f(1 - r) * w[14])));
                c.failureFloor = f(s / this.failureDivisor);
                c.useFloor = c.failureFloor < c.failureRaw;
                c.rawS = c.useFloor ? c.failureFloor : c.failureRaw;
            } else {
                let inc = f(this.exp8 * f(11 - d));
                inc = f(inc * pow(s, -w[9]));
                inc = f(inc * f(exp(f(f(1 - r) * w[10])) - 1));
                inc = f(inc * (rating === 2 ? w[15] : 1));
                inc = f(inc * (rating === 4 ? w[16] : 1));
                c.rawS = f(s * f(inc + 1));
            }
            const delta = f(-w[6] * f(rating - 3));
            const nextD = f(d + f(f(f(10 - d) * delta) / 9));
            c.rawD = f(f(w[7] * f(this.easyD - nextD)) + nextD);
        }
        return [{ s: clamp(c.rawS, S_MIN, S_MAX), d: clamp(c.rawD, 1, 10) }, c];
    }

    private backward(c: Step, outS: number, outD: number, extraR: number, g: Float64Array): [number, number] {
        const w = this.w;
        const gs = outS * passes(c.rawS, S_MIN, S_MAX);
        if (c.initial) {
            g[c.rating - 1] += gs;
            const gd = outD * passes(c.rawD, 1, 10);
            if (gd !== 0) {
                const offset = c.rating - 1;
                g[4] += gd;
                g[5] += gd * -offset * Math.exp(offset * w[5]);
            }
            return [0, 0];
        }
        const { s, d, rating } = c;
        const r = c.curve.r;
        let lastS = 0;
        let lastD = 0;
        let gr = extraR;
        if (c.days === 0) {
            lastS = gs * c.shortValue;
            if (c.shortActive && gs !== 0) {
                const rawGradient = gs * s;
                g[17] += rawGradient * c.shortRaw * f(f(rating - 3) + w[18]);
                g[18] += rawGradient * c.shortRaw * w[17];
                g[19] += rawGradient * c.shortRaw * -Math.log(s);
                lastS += rawGradient * c.shortRaw * (-w[19] / s);
            }
        } else if (rating === 1 && gs !== 0) {
            if (c.useFloor) {
                g[17] += gs * c.failureFloor * -w[18];
                g[18] += gs * c.failureFloor * -w[17];
                lastS = gs * (c.failureFloor / s);
            } else {
                const base = s + 1;
                const p = Math.pow(base, w[13]);
                const dp = Math.pow(d, -w[12]);
                const er = Math.exp((1 - r) * w[14]);
                g[11] += gs * c.failureRaw / w[11];
                g[12] += gs * c.failureRaw * -Math.log(d);
                g[13] += gs * w[11] * dp * er * p * Math.log(base);
                g[14] += gs * c.failureRaw * (1 - r);
                lastS = gs * w[11] * dp * er * w[13] * p / base;
                lastD = gs * c.failureRaw * (-w[12] / d);
                gr += gs * c.failureRaw * -w[14];
            }
        } else if (gs !== 0) {
            const a = Math.exp(w[8]);
            const b = 11 - d;
            const cs = Math.pow(s, -w[9]);
            const e = Math.exp((1 - r) * w[10]) - 1;
            const hp = rating === 2 ? w[15] : 1;
            const eb = rating === 4 ? w[16] : 1;
            const inc = a * b * cs * e * hp * eb;
            const gi = gs * s;
            lastS = gs * (inc + 1);
            lastS += gi * inc * (-w[9] / s);
            lastD = -(gi * a * cs * e * hp * eb);
            gr += gi * a * b * cs * hp * eb * (-w[10] * (e + 1));
            g[8] += gi * inc;
            g[9] += gi * inc * -Math.log(s);
            g[10] += gi * a * b * cs * hp * eb * ((1 - r) * (e + 1));
            if (rating === 2) g[15] += gi * a * b * cs * e * eb;
            if (rating === 4) g[16] += gi * a * b * cs * e * hp;
        }
        const gd = outD * passes(c.rawD, 1, 10);
        if (gd !== 0) {
            const delta = -w[6] * (rating - 3);
            const nextD = d + (10 - d) * delta / 9;
            g[7] += gd * (this.easyD - nextD);
            g[4] += gd * w[7];
            g[5] += gd * w[7] * -3 * Math.exp(3 * w[5]);
            const gn = gd * (1 - w[7]);
            g[6] += gn * (10 - d) * -(rating - 3) / 9;
            lastD += gn * (1 - delta / 9);
        }
        lastS += this.curveBackward(c.curve, gr, g);
        return [lastS * passes(c.input.s, S_MIN, S_MAX), lastD * passes(c.input.d, 1, 10)];
    }

    private bce(rRaw: number, rating: number, weight: number): [number, number] {
        if (weight === 0) return [0, 0];
        const r = clamp(rRaw, MIN_PROB, MAX_PROB);
        const label = rating > 1 ? 1 : 0;
        const loss = f(-f(f(label * f(Math.log(r))) + f((1 - label) * f(Math.log(f(1 - r))))) * weight);
        const gradient = f(-weight * f(f(label / r) - f((1 - label) / f(1 - r))));
        return [loss, rRaw > MIN_PROB && rRaw < MAX_PROB ? gradient : 0];
    }

    /** One prefix's raw prediction, also used by FSRS's unclamped evaluation loss. */
    predict(item: FsrsTrainingItem): number {
        let state: State = { s: 0, d: 0 };
        for (let index = 0; index < item.length - 1; index++) {
            const review = item.reviews[index];
            [state] = this.forward(state, review.deltaDays, review.rating, index);
        }
        return this.curve(item.reviews[item.length - 1].deltaDays, state.s).r;
    }

    /** A card's prefixes share one recurrence and one reverse traversal. */
    cardGradient(items: readonly WeightedTrainingItem[], gradients: Float64Array): void {
        const longest = items[items.length - 1].item;
        const targets = new Map(items.map((entry) => [entry.item.length - 1, entry]));
        const caches: Step[] = [];
        const extra: number[] = [];
        let state: State = { s: 0, d: 0 };
        let gs = 0;
        for (let index = 0; index < longest.length; index++) {
            const review = longest.reviews[index];
            const target = targets.get(index);
            if (index === longest.length - 1) {
                if (target && index !== 0) {
                    const curve = this.curve(review.deltaDays, clamp(state.s, S_MIN, S_MAX));
                    const [, gr] = this.bce(curve.r, review.rating, target.weight);
                    gs = this.curveBackward(curve, gr, gradients) * passes(state.s, S_MIN, S_MAX);
                }
                break;
            }
            const [next, cache] = this.forward(state, review.deltaDays, review.rating, index);
            caches.push(cache);
            extra.push(index && target ? this.bce(cache.curve.r, review.rating, target.weight)[1] : 0);
            state = next;
        }
        let gd = 0;
        for (let index = caches.length - 1; index >= 0; index--) {
            [gs, gd] = this.backward(caches[index], gs, gd, extra[index], gradients);
        }
    }
}
