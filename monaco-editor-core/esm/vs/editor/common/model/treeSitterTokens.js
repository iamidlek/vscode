/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { TreeSitterTokenizationRegistry } from '../languages.js';
import { LineTokens } from '../tokens/lineTokens.js';
import { AbstractTokens } from './tokens.js';
import { MutableDisposable } from '../../../base/common/lifecycle.js';
import { ITreeSitterTokenizationStoreService } from './treeSitterTokenStoreService.js';
import { Range } from '../core/range.js';
import { Emitter } from '../../../base/common/event.js';
let TreeSitterTokens = class TreeSitterTokens extends AbstractTokens {
    constructor(languageIdCodec, textModel, languageId, _tokenStore) {
        super(languageIdCodec, textModel, languageId);
        this._tokenStore = _tokenStore;
        this._tokenizationSupport = null;
        this._backgroundTokenizationState = 1 /* BackgroundTokenizationState.InProgress */;
        this._onDidChangeBackgroundTokenizationState = this._register(new Emitter());
        this.onDidChangeBackgroundTokenizationState = this._onDidChangeBackgroundTokenizationState.event;
        this._tokensChangedListener = this._register(new MutableDisposable());
        this._firstTokenizationCompleteListener = this._register(new MutableDisposable());
        this._initialize();
    }
    _initialize() {
        const newLanguage = this.getLanguageId();
        if (!this._tokenizationSupport || this._lastLanguageId !== newLanguage) {
            this._lastLanguageId = newLanguage;
            this._tokenizationSupport = TreeSitterTokenizationRegistry.get(newLanguage);
            this._tokensChangedListener.value = this._tokenizationSupport?.onDidChangeTokens((e) => {
                if (e.textModel === this._textModel) {
                    this._onDidChangeTokens.fire(e.changes);
                }
            });
            this._firstTokenizationCompleteListener.value = this._tokenizationSupport?.onDidCompleteFirstTokenization(e => {
                if (e.textModel === this._textModel) {
                    this._backgroundTokenizationState = 2 /* BackgroundTokenizationState.Completed */;
                    this._onDidChangeBackgroundTokenizationState.fire();
                    this._firstTokenizationCompleteListener.clear();
                }
            });
        }
    }
    getLineTokens(lineNumber) {
        const content = this._textModel.getLineContent(lineNumber);
        if (this._tokenizationSupport) {
            const rawTokens = this._tokenStore.getTokens(this._textModel, lineNumber);
            if (rawTokens) {
                return new LineTokens(rawTokens, content, this._languageIdCodec);
            }
        }
        return LineTokens.createEmpty(content, this._languageIdCodec);
    }
    resetTokenization(fireTokenChangeEvent = true) {
        if (fireTokenChangeEvent) {
            this._onDidChangeTokens.fire({
                semanticTokensApplied: false,
                ranges: [
                    {
                        fromLineNumber: 1,
                        toLineNumber: this._textModel.getLineCount(),
                    },
                ],
            });
        }
        this._initialize();
    }
    handleDidChangeAttached() {
        // TODO @alexr00 implement for background tokenization
    }
    handleDidChangeContent(e) {
        if (e.isFlush) {
            // Don't fire the event, as the view might not have got the text change event yet
            this.resetTokenization(false);
        }
    }
    forceTokenization(lineNumber) {
        if (this._tokenizationSupport) {
            this._tokenizationSupport.tokenizeEncoded(lineNumber, this._textModel);
        }
    }
    hasAccurateTokensForLine(lineNumber) {
        return this._tokenStore.hasTokens(this._textModel, new Range(lineNumber, 1, lineNumber, this._textModel.getLineMaxColumn(lineNumber)));
    }
    isCheapToTokenize(lineNumber) {
        // TODO @alexr00 determine what makes it cheap to tokenize?
        return true;
    }
    getTokenTypeIfInsertingCharacter(lineNumber, column, character) {
        // TODO @alexr00 implement once we have custom parsing and don't just feed in the whole text model value
        return 0 /* StandardTokenType.Other */;
    }
    tokenizeLinesAt(lineNumber, lines) {
        // TODO @alexr00 understand what this is for and implement
        return null;
    }
    get hasTokens() {
        return this._tokenStore.hasTokens(this._textModel);
    }
};
TreeSitterTokens = __decorate([
    __param(3, ITreeSitterTokenizationStoreService)
], TreeSitterTokens);
export { TreeSitterTokens };
