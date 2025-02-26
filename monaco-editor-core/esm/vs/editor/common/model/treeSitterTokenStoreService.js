/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
export const ITreeSitterTokenizationStoreService = createDecorator('treeSitterTokenizationStoreService');
class TreeSitterTokenizationStoreService {
    constructor() {
        this.tokens = new Map();
    }
    hasTokens(model, accurateForRange) {
        const tokens = this.tokens.get(model);
        if (!tokens) {
            return false;
        }
        if (!accurateForRange || (tokens.guessVersion === tokens.accurateVersion)) {
            return true;
        }
        return !tokens.store.rangeNeedsRefresh(model.getOffsetAt(accurateForRange.getStartPosition()), model.getOffsetAt(accurateForRange.getEndPosition()));
    }
    getTokens(model, line) {
        const tokens = this.tokens.get(model)?.store;
        if (!tokens) {
            return undefined;
        }
        const lineStartOffset = model.getOffsetAt({ lineNumber: line, column: 1 });
        const lineTokens = tokens.getTokensInRange(lineStartOffset, model.getOffsetAt({ lineNumber: line, column: model.getLineLength(line) }) + 1);
        const result = new Uint32Array(lineTokens.length * 2);
        for (let i = 0; i < lineTokens.length; i++) {
            result[i * 2] = lineTokens[i].startOffsetInclusive - lineStartOffset + lineTokens[i].length;
            result[i * 2 + 1] = lineTokens[i].token;
        }
        return result;
    }
    dispose() {
        for (const [, value] of this.tokens) {
            value.disposables.dispose();
        }
    }
}
registerSingleton(ITreeSitterTokenizationStoreService, TreeSitterTokenizationStoreService, 1 /* InstantiationType.Delayed */);
