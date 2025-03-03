/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../../../../base/common/assert.js';
import { AsyncIterableObject, DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { SetMap } from '../../../../../base/common/map.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { SingleOffsetEdit } from '../../../../common/core/offsetEdit.js';
import { OffsetRange } from '../../../../common/core/offsetRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { SingleTextEdit } from '../../../../common/core/textEdit.js';
import { InlineCompletionTriggerKind } from '../../../../common/languages.js';
import { fixBracketsInLine } from '../../../../common/model/bracketPairsTextModelPart/fixBrackets.js';
import { TextModelText } from '../../../../common/model/textModelText.js';
import { SnippetParser, Text } from '../../../snippet/browser/snippetParser.js';
import { getReadonlyEmptyArray } from '../utils.js';
export async function provideInlineCompletions(registry, positionOrRange, model, context, baseToken = CancellationToken.None, languageConfigurationService) {
    const requestUuid = generateUuid();
    const tokenSource = new CancellationTokenSource(baseToken);
    const token = tokenSource.token;
    const contextWithUuid = { ...context, requestUuid: requestUuid };
    const defaultReplaceRange = positionOrRange instanceof Position ? getDefaultRange(positionOrRange, model) : positionOrRange;
    const providers = registry.all(model);
    const multiMap = new SetMap();
    for (const provider of providers) {
        if (provider.groupId) {
            multiMap.add(provider.groupId, provider);
        }
    }
    function getPreferredProviders(provider) {
        if (!provider.yieldsToGroupIds) {
            return [];
        }
        const result = [];
        for (const groupId of provider.yieldsToGroupIds || []) {
            const providers = multiMap.get(groupId);
            for (const p of providers) {
                result.push(p);
            }
        }
        return result;
    }
    const states = new Map();
    const seen = new Set();
    function findPreferredProviderCircle(provider, stack) {
        stack = [...stack, provider];
        if (seen.has(provider)) {
            return stack;
        }
        seen.add(provider);
        try {
            const preferred = getPreferredProviders(provider);
            for (const p of preferred) {
                const c = findPreferredProviderCircle(p, stack);
                if (c) {
                    return c;
                }
            }
        }
        finally {
            seen.delete(provider);
        }
        return undefined;
    }
    function queryProviderOrPreferredProvider(provider) {
        const state = states.get(provider);
        if (state) {
            return state;
        }
        const circle = findPreferredProviderCircle(provider, []);
        if (circle) {
            onUnexpectedExternalError(new Error(`Inline completions: cyclic yield-to dependency detected.`
                + ` Path: ${circle.map(s => s.toString ? s.toString() : ('' + s)).join(' -> ')}`));
        }
        const deferredPromise = new DeferredPromise();
        states.set(provider, deferredPromise.p);
        (async () => {
            if (!circle) {
                const preferred = getPreferredProviders(provider);
                for (const p of preferred) {
                    const result = await queryProviderOrPreferredProvider(p);
                    if (result && result.inlineCompletions.items.length > 0) {
                        // Skip provider
                        return undefined;
                    }
                }
            }
            return query(provider);
        })().then(c => deferredPromise.complete(c), e => deferredPromise.error(e));
        return deferredPromise.p;
    }
    async function query(provider) {
        let result;
        try {
            if (positionOrRange instanceof Position) {
                result = await provider.provideInlineCompletions(model, positionOrRange, contextWithUuid, token);
            }
            else {
                result = await provider.provideInlineEditsForRange?.(model, positionOrRange, contextWithUuid, token);
            }
        }
        catch (e) {
            onUnexpectedExternalError(e);
            return undefined;
        }
        if (!result) {
            return undefined;
        }
        const list = new InlineCompletionList(result, provider);
        runWhenCancelled(token, () => list.removeRef());
        return list;
    }
    const inlineCompletionLists = AsyncIterableObject.fromPromisesResolveOrder(providers.map(queryProviderOrPreferredProvider));
    if (token.isCancellationRequested) {
        tokenSource.dispose(true);
        // result has been disposed before we could call addRef! So we have to discard everything.
        return new InlineCompletionProviderResult([], new Set(), []);
    }
    const result = await addRefAndCreateResult(contextWithUuid, inlineCompletionLists, defaultReplaceRange, model, languageConfigurationService);
    tokenSource.dispose(true); // This disposes results that are not referenced.
    return result;
}
/** If the token does not leak, this will not leak either. */
function runWhenCancelled(token, callback) {
    if (token.isCancellationRequested) {
        callback();
        return Disposable.None;
    }
    else {
        const listener = token.onCancellationRequested(() => {
            listener.dispose();
            callback();
        });
        return { dispose: () => listener.dispose() };
    }
}
// TODO: check cancellation token!
async function addRefAndCreateResult(context, inlineCompletionLists, defaultReplaceRange, model, languageConfigurationService) {
    // for deduplication
    const itemsByHash = new Map();
    let shouldStop = false;
    const lists = [];
    for await (const completions of inlineCompletionLists) {
        if (!completions) {
            continue;
        }
        completions.addRef();
        lists.push(completions);
        for (const item of completions.inlineCompletions.items) {
            if (!context.includeInlineEdits && item.isInlineEdit) {
                continue;
            }
            if (!context.includeInlineCompletions && !item.isInlineEdit) {
                continue;
            }
            const inlineCompletionItem = InlineCompletionItem.from(item, completions, defaultReplaceRange, model, languageConfigurationService);
            itemsByHash.set(inlineCompletionItem.hash(), inlineCompletionItem);
            // Stop after first visible inline completion
            if (!item.isInlineEdit && context.triggerKind === InlineCompletionTriggerKind.Automatic) {
                const minifiedEdit = inlineCompletionItem.toSingleTextEdit().removeCommonPrefix(new TextModelText(model));
                if (!minifiedEdit.isEmpty) {
                    shouldStop = true;
                }
            }
        }
        if (shouldStop) {
            break;
        }
    }
    return new InlineCompletionProviderResult(Array.from(itemsByHash.values()), new Set(itemsByHash.keys()), lists);
}
export class InlineCompletionProviderResult {
    constructor(
    /**
     * Free of duplicates.
     */
    completions, hashs, providerResults) {
        this.completions = completions;
        this.hashs = hashs;
        this.providerResults = providerResults;
    }
    has(item) {
        return this.hashs.has(item.hash());
    }
    dispose() {
        for (const result of this.providerResults) {
            result.removeRef();
        }
    }
}
/**
 * A ref counted pointer to the computed `InlineCompletions` and the `InlineCompletionsProvider` that
 * computed them.
 */
export class InlineCompletionList {
    constructor(inlineCompletions, provider) {
        this.inlineCompletions = inlineCompletions;
        this.provider = provider;
        this.refCount = 1;
    }
    addRef() {
        this.refCount++;
    }
    removeRef() {
        this.refCount--;
        if (this.refCount === 0) {
            this.provider.freeInlineCompletions(this.inlineCompletions);
        }
    }
}
export class InlineCompletionItem {
    static from(inlineCompletion, source, defaultReplaceRange, textModel, languageConfigurationService) {
        let insertText;
        let snippetInfo;
        let range = inlineCompletion.range ? Range.lift(inlineCompletion.range) : defaultReplaceRange;
        if (typeof inlineCompletion.insertText === 'string') {
            insertText = inlineCompletion.insertText;
            if (languageConfigurationService && inlineCompletion.completeBracketPairs) {
                insertText = closeBrackets(insertText, range.getStartPosition(), textModel, languageConfigurationService);
                // Modify range depending on if brackets are added or removed
                const diff = insertText.length - inlineCompletion.insertText.length;
                if (diff !== 0) {
                    range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + diff);
                }
            }
            snippetInfo = undefined;
        }
        else if ('snippet' in inlineCompletion.insertText) {
            const preBracketCompletionLength = inlineCompletion.insertText.snippet.length;
            if (languageConfigurationService && inlineCompletion.completeBracketPairs) {
                inlineCompletion.insertText.snippet = closeBrackets(inlineCompletion.insertText.snippet, range.getStartPosition(), textModel, languageConfigurationService);
                // Modify range depending on if brackets are added or removed
                const diff = inlineCompletion.insertText.snippet.length - preBracketCompletionLength;
                if (diff !== 0) {
                    range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + diff);
                }
            }
            const snippet = new SnippetParser().parse(inlineCompletion.insertText.snippet);
            if (snippet.children.length === 1 && snippet.children[0] instanceof Text) {
                insertText = snippet.children[0].value;
                snippetInfo = undefined;
            }
            else {
                insertText = snippet.toString();
                snippetInfo = {
                    snippet: inlineCompletion.insertText.snippet,
                    range: range
                };
            }
        }
        else {
            assertNever(inlineCompletion.insertText);
        }
        return new InlineCompletionItem(insertText, inlineCompletion.command, inlineCompletion.shownCommand, inlineCompletion.action, range, insertText, snippetInfo, Range.lift(inlineCompletion.showRange) ?? undefined, inlineCompletion.additionalTextEdits || getReadonlyEmptyArray(), inlineCompletion, source);
    }
    static { this.ID = 1; }
    constructor(filterText, command, 
    /** @deprecated. Use handleItemDidShow */
    shownCommand, action, range, insertText, snippetInfo, cursorShowRange, additionalTextEdits, 
    /**
     * A reference to the original inline completion this inline completion has been constructed from.
     * Used for event data to ensure referential equality.
    */
    sourceInlineCompletion, 
    /**
     * A reference to the original inline completion list this inline completion has been constructed from.
     * Used for event data to ensure referential equality.
    */
    source, id = `InlineCompletion:${InlineCompletionItem.ID++}`) {
        this.filterText = filterText;
        this.command = command;
        this.shownCommand = shownCommand;
        this.action = action;
        this.range = range;
        this.insertText = insertText;
        this.snippetInfo = snippetInfo;
        this.cursorShowRange = cursorShowRange;
        this.additionalTextEdits = additionalTextEdits;
        this.sourceInlineCompletion = sourceInlineCompletion;
        this.source = source;
        this.id = id;
        // TODO: these statements are no-ops
        filterText = filterText.replace(/\r\n|\r/g, '\n');
        insertText = filterText.replace(/\r\n|\r/g, '\n');
    }
    withRangeInsertTextAndFilterText(updatedRange, updatedInsertText, updatedFilterText) {
        return new InlineCompletionItem(updatedFilterText, this.command, this.shownCommand, this.action, updatedRange, updatedInsertText, this.snippetInfo, this.cursorShowRange, this.additionalTextEdits, this.sourceInlineCompletion, this.source, this.id);
    }
    hash() {
        return JSON.stringify({ insertText: this.insertText, range: this.range.toString() });
    }
    toSingleTextEdit() {
        return new SingleTextEdit(this.range, this.insertText);
    }
}
function getDefaultRange(position, model) {
    const word = model.getWordAtPosition(position);
    const maxColumn = model.getLineMaxColumn(position.lineNumber);
    // By default, always replace up until the end of the current line.
    // This default might be subject to change!
    return word
        ? new Range(position.lineNumber, word.startColumn, position.lineNumber, maxColumn)
        : Range.fromPositions(position, position.with(undefined, maxColumn));
}
function closeBrackets(text, position, model, languageConfigurationService) {
    const currentLine = model.getLineContent(position.lineNumber);
    const edit = SingleOffsetEdit.replace(new OffsetRange(position.column - 1, currentLine.length), text);
    const proposedLineTokens = model.tokenization.tokenizeLinesAt(position.lineNumber, [edit.apply(currentLine)]);
    const textTokens = proposedLineTokens?.[0].sliceZeroCopy(edit.getRangeAfterApply());
    if (!textTokens) {
        return text;
    }
    const fixedText = fixBracketsInLine(textTokens, languageConfigurationService);
    return fixedText;
}
