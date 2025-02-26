/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
class ListNode {
    get children() { return this._children; }
    get length() { return this._length; }
    constructor(height) {
        this.height = height;
        this._children = [];
        this._length = 0;
    }
    dispose() {
        this._children.splice(0, this._children.length);
    }
}
export var TokenQuality;
(function (TokenQuality) {
    TokenQuality[TokenQuality["None"] = 0] = "None";
    TokenQuality[TokenQuality["ViewportGuess"] = 1] = "ViewportGuess";
    TokenQuality[TokenQuality["EditGuess"] = 2] = "EditGuess";
    TokenQuality[TokenQuality["Accurate"] = 3] = "Accurate";
})(TokenQuality || (TokenQuality = {}));
function isLeaf(node) {
    return node.token !== undefined;
}
export class TokenStore {
    constructor(_textModel) {
        this._textModel = _textModel;
        this._root = this.createEmptyRoot();
    }
    createEmptyRoot() {
        return {
            length: this._textModel.getValueLength(),
            token: 0,
            height: 0,
            tokenQuality: TokenQuality.None
        };
    }
    /**
     *
     * @param startOffsetInclusive
     * @param endOffsetExclusive
     * @param visitor Return true from visitor to exit early
     * @returns
     */
    traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, visitor) {
        const stack = [{ node: this._root, offset: 0 }];
        while (stack.length > 0) {
            const { node, offset } = stack.pop();
            const nodeEnd = offset + node.length;
            // Skip nodes that are completely before or after the range
            if (nodeEnd <= startOffsetInclusive || offset >= endOffsetExclusive) {
                continue;
            }
            if (visitor(node, offset)) {
                return;
            }
            if (!isLeaf(node)) {
                // Push children in reverse order to process them left-to-right when popping
                let childOffset = offset + node.length;
                for (let i = node.children.length - 1; i >= 0; i--) {
                    childOffset -= node.children[i].length;
                    stack.push({ node: node.children[i], offset: childOffset });
                }
            }
        }
    }
    getTokensInRange(startOffsetInclusive, endOffsetExclusive) {
        const result = [];
        this.traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, (node, offset) => {
            if (isLeaf(node)) {
                let clippedLength = node.length;
                let clippedOffset = offset;
                if ((offset < startOffsetInclusive) && (offset + node.length > endOffsetExclusive)) {
                    clippedOffset = startOffsetInclusive;
                    clippedLength = endOffsetExclusive - startOffsetInclusive;
                }
                else if (offset < startOffsetInclusive) {
                    clippedLength -= (startOffsetInclusive - offset);
                    clippedOffset = startOffsetInclusive;
                }
                else if (offset + node.length > endOffsetExclusive) {
                    clippedLength -= (offset + node.length - endOffsetExclusive);
                }
                result.push({ token: node.token, startOffsetInclusive: clippedOffset, length: clippedLength });
            }
            return false;
        });
        return result;
    }
    rangeNeedsRefresh(startOffsetInclusive, endOffsetExclusive) {
        let needsRefresh = false;
        this.traverseInOrderInRange(startOffsetInclusive, endOffsetExclusive, (node) => {
            if (isLeaf(node) && (node.tokenQuality !== TokenQuality.Accurate)) {
                needsRefresh = true;
            }
            return false;
        });
        return needsRefresh;
    }
    dispose() {
        const stack = [[this._root, false]];
        while (stack.length > 0) {
            const [node, visited] = stack.pop();
            if (isLeaf(node)) {
                node.parent = undefined;
            }
            else if (!visited) {
                stack.push([node, true]);
                for (let i = node.children.length - 1; i >= 0; i--) {
                    stack.push([node.children[i], false]);
                }
            }
            else {
                node.dispose();
                node.parent = undefined;
            }
        }
        this._root = undefined;
    }
}
