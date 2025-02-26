import { OffsetEdit, SingleOffsetEdit } from '../core/offsetEdit.js';
import { OffsetRange } from '../core/offsetRange.js';
export class OffsetEdits {
    constructor() {
        // static utils only!
    }
    static fromContentChanges(contentChanges) {
        const editsArr = contentChanges.map(c => new SingleOffsetEdit(OffsetRange.ofStartAndLength(c.rangeOffset, c.rangeLength), c.text));
        editsArr.reverse();
        const edits = new OffsetEdit(editsArr);
        return edits;
    }
}
