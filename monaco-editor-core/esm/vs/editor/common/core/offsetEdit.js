/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BugIndicatingError } from '../../../base/common/errors.js';
import { OffsetRange } from './offsetRange.js';
/**
 * Describes an edit to a (0-based) string.
 * Use `TextEdit` to describe edits for a 1-based line/column text.
*/
export class OffsetEdit {
    static { this.empty = new OffsetEdit([]); }
    constructor(edits) {
        this.edits = edits;
        let lastEndEx = -1;
        for (const edit of edits) {
            if (!(edit.replaceRange.start >= lastEndEx)) {
                throw new BugIndicatingError(`Edits must be disjoint and sorted. Found ${edit} after ${lastEndEx}`);
            }
            lastEndEx = edit.replaceRange.endExclusive;
        }
    }
    toString() {
        const edits = this.edits.map(e => e.toString()).join(', ');
        return `[${edits}]`;
    }
    apply(str) {
        const resultText = [];
        let pos = 0;
        for (const edit of this.edits) {
            resultText.push(str.substring(pos, edit.replaceRange.start));
            resultText.push(edit.newText);
            pos = edit.replaceRange.endExclusive;
        }
        resultText.push(str.substring(pos));
        return resultText.join('');
    }
    getNewTextRanges() {
        const ranges = [];
        let offset = 0;
        for (const e of this.edits) {
            ranges.push(OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newText.length));
            offset += e.newText.length - e.replaceRange.length;
        }
        return ranges;
    }
    get isEmpty() {
        return this.edits.length === 0;
    }
    equals(other) {
        if (this.edits.length !== other.edits.length) {
            return false;
        }
        for (let i = 0; i < this.edits.length; i++) {
            if (!this.edits[i].equals(other.edits[i])) {
                return false;
            }
        }
        return true;
    }
}
export class SingleOffsetEdit {
    static insert(offset, text) {
        return new SingleOffsetEdit(OffsetRange.emptyAt(offset), text);
    }
    static replace(range, text) {
        return new SingleOffsetEdit(range, text);
    }
    constructor(replaceRange, newText) {
        this.replaceRange = replaceRange;
        this.newText = newText;
    }
    toString() {
        return `${this.replaceRange} -> "${this.newText}"`;
    }
    get isEmpty() {
        return this.newText.length === 0 && this.replaceRange.length === 0;
    }
    apply(str) {
        return str.substring(0, this.replaceRange.start) + this.newText + str.substring(this.replaceRange.endExclusive);
    }
    getRangeAfterApply() {
        return new OffsetRange(this.replaceRange.start, this.replaceRange.start + this.newText.length);
    }
    equals(other) {
        return this.replaceRange.equals(other.replaceRange) && this.newText === other.newText;
    }
}
export function applyEditsToRanges(sortedRanges, edits) {
    sortedRanges = sortedRanges.slice();
    // treat edits as deletion of the replace range and then as insertion that extends the first range
    const result = [];
    let offset = 0;
    for (const e of edits.edits) {
        while (true) {
            // ranges before the current edit
            const r = sortedRanges[0];
            if (!r || r.endExclusive >= e.replaceRange.start) {
                break;
            }
            sortedRanges.shift();
            result.push(r.delta(offset));
        }
        const intersecting = [];
        while (true) {
            const r = sortedRanges[0];
            if (!r || !r.intersectsOrTouches(e.replaceRange)) {
                break;
            }
            sortedRanges.shift();
            intersecting.push(r);
        }
        for (let i = intersecting.length - 1; i >= 0; i--) {
            let r = intersecting[i];
            const overlap = r.intersect(e.replaceRange).length;
            r = r.deltaEnd(-overlap + (i === 0 ? e.newText.length : 0));
            const rangeAheadOfReplaceRange = r.start - e.replaceRange.start;
            if (rangeAheadOfReplaceRange > 0) {
                r = r.delta(-rangeAheadOfReplaceRange);
            }
            if (i !== 0) {
                r = r.delta(e.newText.length);
            }
            // We already took our offset into account.
            // Because we add r back to the queue (which then adds offset again),
            // we have to remove it here.
            r = r.delta(-(e.newText.length - e.replaceRange.length));
            sortedRanges.unshift(r);
        }
        offset += e.newText.length - e.replaceRange.length;
    }
    while (true) {
        const r = sortedRanges[0];
        if (!r) {
            break;
        }
        sortedRanges.shift();
        result.push(r.delta(offset));
    }
    return result;
}
