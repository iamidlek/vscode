/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { OffsetRange } from '../core/offsetRange.js';
/**
 * This class represents a sequence of tokens.
 * Conceptually, each token has a length and a metadata number.
 * A token array might be used to annotate a string with metadata.
 * Use {@link TokenArrayBuilder} to efficiently create a token array.
 *
 * TODO: Make this class more efficient (e.g. by using a Int32Array).
*/
export class TokenArray {
    static create(tokenInfo) {
        return new TokenArray(tokenInfo);
    }
    constructor(_tokenInfo) {
        this._tokenInfo = _tokenInfo;
    }
    forEach(cb) {
        let lengthSum = 0;
        for (const tokenInfo of this._tokenInfo) {
            const range = new OffsetRange(lengthSum, lengthSum + tokenInfo.length);
            cb(range, tokenInfo);
            lengthSum += tokenInfo.length;
        }
    }
}
export class TokenInfo {
    constructor(length, metadata) {
        this.length = length;
        this.metadata = metadata;
    }
}
/**
 * TODO: Make this class more efficient (e.g. by using a Int32Array).
*/
export class TokenArrayBuilder {
    constructor() {
        this._tokens = [];
    }
    add(length, metadata) {
        this._tokens.push(new TokenInfo(length, metadata));
    }
    build() {
        return TokenArray.create(this._tokens);
    }
}
