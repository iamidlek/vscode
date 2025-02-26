/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../../nls.js';
import * as nls from '../../../../../nls.js';
export class InlineCompletionContextKeys {
    static { this.inlineSuggestionVisible = new RawContextKey('inlineSuggestionVisible', false, localize('inlineSuggestionVisible', "Whether an inline suggestion is visible")); }
    static { this.inlineSuggestionHasIndentation = new RawContextKey('inlineSuggestionHasIndentation', false, localize('inlineSuggestionHasIndentation', "Whether the inline suggestion starts with whitespace")); }
    static { this.inlineSuggestionHasIndentationLessThanTabSize = new RawContextKey('inlineSuggestionHasIndentationLessThanTabSize', true, localize('inlineSuggestionHasIndentationLessThanTabSize', "Whether the inline suggestion starts with whitespace that is less than what would be inserted by tab")); }
    static { this.suppressSuggestions = new RawContextKey('inlineSuggestionSuppressSuggestions', undefined, localize('suppressSuggestions', "Whether suggestions should be suppressed for the current suggestion")); }
    static { this.cursorInIndentation = new RawContextKey('cursorInIndentation', false, localize('cursorInIndentation', "Whether the cursor is in indentation")); }
    static { this.hasSelection = new RawContextKey('editor.hasSelection', false, localize('editor.hasSelection', "Whether the editor has a selection")); }
    static { this.cursorAtInlineEdit = new RawContextKey('cursorAtInlineEdit', false, localize('cursorAtInlineEdit', "Whether the cursor is at an inline edit")); }
    static { this.inlineEditVisible = new RawContextKey('inlineEditIsVisible', false, localize('inlineEditVisible', "Whether an inline edit is visible")); }
    static { this.tabShouldJumpToInlineEdit = new RawContextKey('tabShouldJumpToInlineEdit', false, localize('tabShouldJumpToInlineEdit', "Whether tab should jump to an inline edit.")); }
    static { this.tabShouldAcceptInlineEdit = new RawContextKey('tabShouldAcceptInlineEdit', false, localize('tabShouldAcceptInlineEdit', "Whether tab should accept the inline edit.")); }
    static { this.inInlineEditsPreviewEditor = new RawContextKey('inInlineEditsPreviewEditor', true, nls.localize('inInlineEditsPreviewEditor', "Whether the current code editor is showing an inline edits preview")); }
}
