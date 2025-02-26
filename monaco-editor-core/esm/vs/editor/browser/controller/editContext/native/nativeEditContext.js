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
import './nativeEditContext.css';
import { isFirefox } from '../../../../../base/browser/browser.js';
import { addDisposableListener, getActiveWindow, getWindow, getWindowId } from '../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ClipboardEventUtils, getDataToCopy, InMemoryClipboardMetadataManager } from '../clipboardUtils.js';
import { AbstractEditContext } from '../editContext.js';
import { editContextAddDisposableListener, FocusTracker } from './nativeEditContextUtils.js';
import { ScreenReaderSupport } from './screenReaderSupport.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { Position } from '../../../../common/core/position.js';
import { PositionOffsetTransformer } from '../../../../common/core/positionToOffset.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { EditContext } from './editContextFactory.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { NativeEditContextRegistry } from './nativeEditContextRegistry.js';
// Corresponds to classes in nativeEditContext.css
var CompositionClassName;
(function (CompositionClassName) {
    CompositionClassName["NONE"] = "edit-context-composition-none";
    CompositionClassName["SECONDARY"] = "edit-context-composition-secondary";
    CompositionClassName["PRIMARY"] = "edit-context-composition-primary";
})(CompositionClassName || (CompositionClassName = {}));
let NativeEditContext = class NativeEditContext extends AbstractEditContext {
    constructor(ownerID, context, overflowGuardContainer, viewController, _visibleRangeProvider, instantiationService, _accessibilityService) {
        super(context);
        this._visibleRangeProvider = _visibleRangeProvider;
        this._accessibilityService = _accessibilityService;
        this._editContextPrimarySelection = new Selection(1, 1, 1, 1);
        this._decorations = [];
        this._primarySelection = new Selection(1, 1, 1, 1);
        this._targetWindowId = -1;
        this._scrollTop = 0;
        this._scrollLeft = 0;
        this.domNode = new FastDomNode(document.createElement('div'));
        this.domNode.setClassName(`native-edit-context`);
        this.textArea = new FastDomNode(document.createElement('textarea'));
        this.textArea.setClassName('native-edit-context-textarea');
        this.textArea.setAttribute('tabindex', '-1');
        this._updateDomAttributes();
        overflowGuardContainer.appendChild(this.domNode);
        overflowGuardContainer.appendChild(this.textArea);
        this._parent = overflowGuardContainer.domNode;
        this._selectionChangeListener = this._register(new MutableDisposable());
        this._focusTracker = this._register(new FocusTracker(this.domNode.domNode, (newFocusValue) => {
            if (newFocusValue) {
                this._selectionChangeListener.value = this._setSelectionChangeListener(viewController);
                this._screenReaderSupport.setIgnoreSelectionChangeTime('onFocus');
            }
            else {
                this._selectionChangeListener.value = undefined;
            }
            this._context.viewModel.setHasFocus(newFocusValue);
        }));
        const window = getWindow(this.domNode.domNode);
        this._editContext = EditContext.create(window);
        this.setEditContextOnDomNode();
        this._screenReaderSupport = instantiationService.createInstance(ScreenReaderSupport, this.domNode, context);
        this._register(addDisposableListener(this.domNode.domNode, 'copy', (e) => this._ensureClipboardGetsEditorSelection(e)));
        this._register(addDisposableListener(this.domNode.domNode, 'cut', (e) => {
            // Pretend here we touched the text area, as the `cut` event will most likely
            // result in a `selectionchange` event which we want to ignore
            this._screenReaderSupport.setIgnoreSelectionChangeTime('onCut');
            this._ensureClipboardGetsEditorSelection(e);
            viewController.cut();
        }));
        this._register(addDisposableListener(this.domNode.domNode, 'keyup', (e) => viewController.emitKeyUp(new StandardKeyboardEvent(e))));
        this._register(addDisposableListener(this.domNode.domNode, 'keydown', async (e) => {
            const standardKeyboardEvent = new StandardKeyboardEvent(e);
            // When the IME is visible, the keys, like arrow-left and arrow-right, should be used to navigate in the IME, and should not be propagated further
            if (standardKeyboardEvent.keyCode === 114 /* KeyCode.KEY_IN_COMPOSITION */) {
                standardKeyboardEvent.stopPropagation();
            }
            viewController.emitKeyDown(standardKeyboardEvent);
        }));
        this._register(addDisposableListener(this.domNode.domNode, 'beforeinput', async (e) => {
            if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
                this._onType(viewController, { text: '\n', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 });
            }
        }));
        // Edit context events
        this._register(editContextAddDisposableListener(this._editContext, 'textformatupdate', (e) => this._handleTextFormatUpdate(e)));
        this._register(editContextAddDisposableListener(this._editContext, 'characterboundsupdate', (e) => this._updateCharacterBounds(e)));
        this._register(editContextAddDisposableListener(this._editContext, 'textupdate', (e) => {
            this._emitTypeEvent(viewController, e);
        }));
        this._register(editContextAddDisposableListener(this._editContext, 'compositionstart', (e) => {
            // Utlimately fires onDidCompositionStart() on the editor to notify for example suggest model of composition state
            // Updates the composition state of the cursor controller which determines behavior of typing with interceptors
            viewController.compositionStart();
            // Emits ViewCompositionStartEvent which can be depended on by ViewEventHandlers
            this._context.viewModel.onCompositionStart();
        }));
        this._register(editContextAddDisposableListener(this._editContext, 'compositionend', (e) => {
            // Utlimately fires compositionEnd() on the editor to notify for example suggest model of composition state
            // Updates the composition state of the cursor controller which determines behavior of typing with interceptors
            viewController.compositionEnd();
            // Emits ViewCompositionEndEvent which can be depended on by ViewEventHandlers
            this._context.viewModel.onCompositionEnd();
        }));
        this._register(addDisposableListener(this.textArea.domNode, 'paste', (e) => {
            // Pretend here we touched the text area, as the `paste` event will most likely
            // result in a `selectionchange` event which we want to ignore
            this._screenReaderSupport.setIgnoreSelectionChangeTime('onPaste');
            e.preventDefault();
            if (!e.clipboardData) {
                return;
            }
            let [text, metadata] = ClipboardEventUtils.getTextData(e.clipboardData);
            if (!text) {
                return;
            }
            metadata = metadata || InMemoryClipboardMetadataManager.INSTANCE.get(text);
            let pasteOnNewLine = false;
            let multicursorText = null;
            let mode = null;
            if (metadata) {
                const options = this._context.configuration.options;
                const emptySelectionClipboard = options.get(38 /* EditorOption.emptySelectionClipboard */);
                pasteOnNewLine = emptySelectionClipboard && !!metadata.isFromEmptySelection;
                multicursorText = typeof metadata.multicursorText !== 'undefined' ? metadata.multicursorText : null;
                mode = metadata.mode;
            }
            viewController.paste(text, pasteOnNewLine, multicursorText, mode);
        }));
        this._register(NativeEditContextRegistry.register(ownerID, this));
    }
    // --- Public methods ---
    dispose() {
        // Force blue the dom node so can write in pane with no native edit context after disposal
        this.domNode.domNode.blur();
        this.domNode.domNode.remove();
        this.textArea.domNode.remove();
        super.dispose();
    }
    setAriaOptions(options) {
        this._screenReaderSupport.setAriaOptions(options);
    }
    /* Last rendered data needed for correct hit-testing and determining the mouse position.
     * Without this, the selection will blink as incorrect mouse position is calculated */
    getLastRenderData() {
        return this._primarySelection.getPosition();
    }
    prepareRender(ctx) {
        this._screenReaderSupport.prepareRender(ctx);
        this._updateEditContext();
        this._updateSelectionAndControlBounds(ctx);
    }
    render(ctx) {
        this._screenReaderSupport.render(ctx);
    }
    onCursorStateChanged(e) {
        this._primarySelection = e.modelSelections[0] ?? new Selection(1, 1, 1, 1);
        this._screenReaderSupport.onCursorStateChanged(e);
        return true;
    }
    onConfigurationChanged(e) {
        this._screenReaderSupport.onConfigurationChanged(e);
        this._updateDomAttributes();
        return true;
    }
    onDecorationsChanged(e) {
        // true for inline decorations that can end up relayouting text
        return true;
    }
    onFlushed(e) {
        return true;
    }
    onLinesChanged(e) {
        return true;
    }
    onLinesDeleted(e) {
        return true;
    }
    onLinesInserted(e) {
        return true;
    }
    onScrollChanged(e) {
        this._scrollLeft = e.scrollLeft;
        this._scrollTop = e.scrollTop;
        return true;
    }
    onZonesChanged(e) {
        return true;
    }
    onWillPaste() {
        this._screenReaderSupport.setIgnoreSelectionChangeTime('onWillPaste');
    }
    writeScreenReaderContent() {
        this._screenReaderSupport.writeScreenReaderContent();
    }
    isFocused() {
        return this._focusTracker.isFocused || (getActiveWindow().document.activeElement === this.textArea.domNode);
    }
    focus() {
        this._focusTracker.focus();
        // If the editor is off DOM, focus cannot be really set, so let's double check that we have managed to set the focus
        this.refreshFocusState();
    }
    refreshFocusState() {
        this._focusTracker.refreshFocusState();
    }
    // TODO: added as a workaround fix for https://github.com/microsoft/vscode/issues/229825
    // When this issue will be fixed the following should be removed.
    setEditContextOnDomNode() {
        const targetWindow = getWindow(this.domNode.domNode);
        const targetWindowId = getWindowId(targetWindow);
        if (this._targetWindowId !== targetWindowId) {
            this.domNode.domNode.editContext = this._editContext;
            this._targetWindowId = targetWindowId;
        }
    }
    // --- Private methods ---
    _updateDomAttributes() {
        const options = this._context.configuration.options;
        this.domNode.domNode.setAttribute('tabindex', String(options.get(129 /* EditorOption.tabIndex */)));
    }
    _updateEditContext() {
        const editContextState = this._getNewEditContextState();
        if (!editContextState) {
            return;
        }
        this._editContext.updateText(0, Number.MAX_SAFE_INTEGER, editContextState.text);
        this._editContext.updateSelection(editContextState.selectionStartOffset, editContextState.selectionEndOffset);
        this._editContextPrimarySelection = editContextState.editContextPrimarySelection;
    }
    _emitTypeEvent(viewController, e) {
        if (!this._editContext) {
            return;
        }
        if (!this._editContextPrimarySelection.equalsSelection(this._primarySelection)) {
            return;
        }
        const model = this._context.viewModel.model;
        const startPositionOfEditContext = this._editContextStartPosition();
        const offsetOfStartOfText = model.getOffsetAt(startPositionOfEditContext);
        const offsetOfSelectionEnd = model.getOffsetAt(this._primarySelection.getEndPosition());
        const offsetOfSelectionStart = model.getOffsetAt(this._primarySelection.getStartPosition());
        const selectionEndOffset = offsetOfSelectionEnd - offsetOfStartOfText;
        const selectionStartOffset = offsetOfSelectionStart - offsetOfStartOfText;
        let replaceNextCharCnt = 0;
        let replacePrevCharCnt = 0;
        if (e.updateRangeEnd > selectionEndOffset) {
            replaceNextCharCnt = e.updateRangeEnd - selectionEndOffset;
        }
        if (e.updateRangeStart < selectionStartOffset) {
            replacePrevCharCnt = selectionStartOffset - e.updateRangeStart;
        }
        let text = '';
        if (selectionStartOffset < e.updateRangeStart) {
            text += this._editContext.text.substring(selectionStartOffset, e.updateRangeStart);
        }
        text += e.text;
        if (selectionEndOffset > e.updateRangeEnd) {
            text += this._editContext.text.substring(e.updateRangeEnd, selectionEndOffset);
        }
        let positionDelta = 0;
        if (e.selectionStart === e.selectionEnd && selectionStartOffset === selectionEndOffset) {
            positionDelta = e.selectionStart - (e.updateRangeStart + e.text.length);
        }
        const typeInput = {
            text,
            replacePrevCharCnt,
            replaceNextCharCnt,
            positionDelta
        };
        this._onType(viewController, typeInput);
        // It could be that the typed letter does not produce a change in the editor text,
        // for example if an extension registers a custom typing command, and the typing operation does something else like scrolling
        // Need to update the edit context to reflect this
        this._updateEditContext();
    }
    _onType(viewController, typeInput) {
        if (typeInput.replacePrevCharCnt || typeInput.replaceNextCharCnt || typeInput.positionDelta) {
            viewController.compositionType(typeInput.text, typeInput.replacePrevCharCnt, typeInput.replaceNextCharCnt, typeInput.positionDelta);
        }
        else {
            viewController.type(typeInput.text);
        }
    }
    _getNewEditContextState() {
        const editContextPrimarySelection = this._primarySelection;
        const model = this._context.viewModel.model;
        if (!model.isValidRange(editContextPrimarySelection)) {
            return;
        }
        const primarySelectionStartLine = editContextPrimarySelection.startLineNumber;
        const primarySelectionEndLine = editContextPrimarySelection.endLineNumber;
        const endColumnOfEndLineNumber = model.getLineMaxColumn(primarySelectionEndLine);
        const rangeOfText = new Range(primarySelectionStartLine, 1, primarySelectionEndLine, endColumnOfEndLineNumber);
        const text = model.getValueInRange(rangeOfText, 0 /* EndOfLinePreference.TextDefined */);
        const selectionStartOffset = editContextPrimarySelection.startColumn - 1;
        const selectionEndOffset = text.length + editContextPrimarySelection.endColumn - endColumnOfEndLineNumber;
        return {
            text,
            selectionStartOffset,
            selectionEndOffset,
            editContextPrimarySelection
        };
    }
    _editContextStartPosition() {
        return new Position(this._editContextPrimarySelection.startLineNumber, 1);
    }
    _handleTextFormatUpdate(e) {
        if (!this._editContext) {
            return;
        }
        const formats = e.getTextFormats();
        const editContextStartPosition = this._editContextStartPosition();
        const decorations = [];
        formats.forEach(f => {
            const textModel = this._context.viewModel.model;
            const offsetOfEditContextText = textModel.getOffsetAt(editContextStartPosition);
            const startPositionOfDecoration = textModel.getPositionAt(offsetOfEditContextText + f.rangeStart);
            const endPositionOfDecoration = textModel.getPositionAt(offsetOfEditContextText + f.rangeEnd);
            const decorationRange = Range.fromPositions(startPositionOfDecoration, endPositionOfDecoration);
            const thickness = f.underlineThickness.toLowerCase();
            let decorationClassName = CompositionClassName.NONE;
            switch (thickness) {
                case 'thin':
                    decorationClassName = CompositionClassName.SECONDARY;
                    break;
                case 'thick':
                    decorationClassName = CompositionClassName.PRIMARY;
                    break;
            }
            decorations.push({
                range: decorationRange,
                options: {
                    description: 'textFormatDecoration',
                    inlineClassName: decorationClassName,
                }
            });
        });
        this._decorations = this._context.viewModel.model.deltaDecorations(this._decorations, decorations);
    }
    _updateSelectionAndControlBounds(ctx) {
        if (!this._parent) {
            return;
        }
        const options = this._context.configuration.options;
        const lineHeight = options.get(68 /* EditorOption.lineHeight */);
        const contentLeft = options.get(151 /* EditorOption.layoutInfo */).contentLeft;
        const parentBounds = this._parent.getBoundingClientRect();
        const modelStartPosition = this._primarySelection.getStartPosition();
        const viewStartPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelStartPosition);
        const verticalOffsetStart = this._context.viewLayout.getVerticalOffsetForLineNumber(viewStartPosition.lineNumber);
        const top = parentBounds.top + verticalOffsetStart - this._scrollTop;
        const height = (this._primarySelection.endLineNumber - this._primarySelection.startLineNumber + 1) * lineHeight;
        let left = parentBounds.left + contentLeft - this._scrollLeft;
        let width;
        if (this._primarySelection.isEmpty()) {
            const linesVisibleRanges = ctx.visibleRangeForPosition(viewStartPosition);
            if (linesVisibleRanges) {
                left += linesVisibleRanges.left;
            }
            width = 0;
        }
        else {
            width = parentBounds.width - contentLeft;
        }
        const selectionBounds = new DOMRect(left, top, width, height);
        this._editContext.updateSelectionBounds(selectionBounds);
        this._editContext.updateControlBounds(selectionBounds);
    }
    _updateCharacterBounds(e) {
        if (!this._parent) {
            return;
        }
        const options = this._context.configuration.options;
        const typicalHalfWidthCharacterWidth = options.get(52 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth;
        const lineHeight = options.get(68 /* EditorOption.lineHeight */);
        const contentLeft = options.get(151 /* EditorOption.layoutInfo */).contentLeft;
        const parentBounds = this._parent.getBoundingClientRect();
        const characterBounds = [];
        const offsetTransformer = new PositionOffsetTransformer(this._editContext.text);
        for (let offset = e.rangeStart; offset < e.rangeEnd; offset++) {
            const editContextStartPosition = offsetTransformer.getPosition(offset);
            const textStartLineOffsetWithinEditor = this._editContextPrimarySelection.startLineNumber - 1;
            const characterStartPosition = new Position(textStartLineOffsetWithinEditor + editContextStartPosition.lineNumber, editContextStartPosition.column);
            const characterEndPosition = characterStartPosition.delta(0, 1);
            const characterModelRange = Range.fromPositions(characterStartPosition, characterEndPosition);
            const characterViewRange = this._context.viewModel.coordinatesConverter.convertModelRangeToViewRange(characterModelRange);
            const characterLinesVisibleRanges = this._visibleRangeProvider.linesVisibleRangesForRange(characterViewRange, true) ?? [];
            const characterVerticalOffset = this._context.viewLayout.getVerticalOffsetForLineNumber(characterViewRange.startLineNumber);
            const top = parentBounds.top + characterVerticalOffset - this._scrollTop;
            let left = 0;
            let width = typicalHalfWidthCharacterWidth;
            if (characterLinesVisibleRanges.length > 0) {
                for (const visibleRange of characterLinesVisibleRanges[0].ranges) {
                    left = visibleRange.left;
                    width = visibleRange.width;
                    break;
                }
            }
            characterBounds.push(new DOMRect(parentBounds.left + contentLeft + left - this._scrollLeft, top, width, lineHeight));
        }
        this._editContext.updateCharacterBounds(e.rangeStart, characterBounds);
    }
    _ensureClipboardGetsEditorSelection(e) {
        const options = this._context.configuration.options;
        const emptySelectionClipboard = options.get(38 /* EditorOption.emptySelectionClipboard */);
        const copyWithSyntaxHighlighting = options.get(25 /* EditorOption.copyWithSyntaxHighlighting */);
        const selections = this._context.viewModel.getCursorStates().map(cursorState => cursorState.modelState.selection);
        const dataToCopy = getDataToCopy(this._context.viewModel, selections, emptySelectionClipboard, copyWithSyntaxHighlighting);
        const storedMetadata = {
            version: 1,
            isFromEmptySelection: dataToCopy.isFromEmptySelection,
            multicursorText: dataToCopy.multicursorText,
            mode: dataToCopy.mode
        };
        InMemoryClipboardMetadataManager.INSTANCE.set(
        // When writing "LINE\r\n" to the clipboard and then pasting,
        // Firefox pastes "LINE\n", so let's work around this quirk
        (isFirefox ? dataToCopy.text.replace(/\r\n/g, '\n') : dataToCopy.text), storedMetadata);
        e.preventDefault();
        if (e.clipboardData) {
            ClipboardEventUtils.setTextData(e.clipboardData, dataToCopy.text, dataToCopy.html, storedMetadata);
        }
    }
    _setSelectionChangeListener(viewController) {
        // See https://github.com/microsoft/vscode/issues/27216 and https://github.com/microsoft/vscode/issues/98256
        // When using a Braille display or NVDA for example, it is possible for users to reposition the
        // system caret. This is reflected in Chrome as a `selectionchange` event and needs to be reflected within the editor.
        // `selectionchange` events often come multiple times for a single logical change
        // so throttle multiple `selectionchange` events that burst in a short period of time.
        let previousSelectionChangeEventTime = 0;
        return addDisposableListener(this.domNode.domNode.ownerDocument, 'selectionchange', () => {
            const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
            if (!this.isFocused() || !isScreenReaderOptimized) {
                return;
            }
            const screenReaderContentState = this._screenReaderSupport.screenReaderContentState;
            if (!screenReaderContentState) {
                return;
            }
            const now = Date.now();
            const delta1 = now - previousSelectionChangeEventTime;
            previousSelectionChangeEventTime = now;
            if (delta1 < 5) {
                // received another `selectionchange` event within 5ms of the previous `selectionchange` event
                // => ignore it
                return;
            }
            const delta2 = now - this._screenReaderSupport.getIgnoreSelectionChangeTime();
            this._screenReaderSupport.resetSelectionChangeTime();
            if (delta2 < 100) {
                // received a `selectionchange` event within 100ms since we touched the textarea
                // => ignore it, since we caused it
                return;
            }
            const activeDocument = getActiveWindow().document;
            const activeDocumentSelection = activeDocument.getSelection();
            if (!activeDocumentSelection) {
                return;
            }
            const rangeCount = activeDocumentSelection.rangeCount;
            if (rangeCount === 0) {
                return;
            }
            const range = activeDocumentSelection.getRangeAt(0);
            const viewModel = this._context.viewModel;
            const model = viewModel.model;
            const coordinatesConverter = viewModel.coordinatesConverter;
            const modelScreenReaderContentStartPositionWithinEditor = coordinatesConverter.convertViewPositionToModelPosition(screenReaderContentState.startPositionWithinEditor);
            const offsetOfStartOfScreenReaderContent = model.getOffsetAt(modelScreenReaderContentStartPositionWithinEditor);
            let offsetOfSelectionStart = range.startOffset + offsetOfStartOfScreenReaderContent;
            let offsetOfSelectionEnd = range.endOffset + offsetOfStartOfScreenReaderContent;
            const modelUsesCRLF = model.getEndOfLineSequence() === 1 /* EndOfLineSequence.CRLF */;
            if (modelUsesCRLF) {
                const screenReaderContentText = screenReaderContentState.value;
                const offsetTransformer = new PositionOffsetTransformer(screenReaderContentText);
                const positionOfStartWithinText = offsetTransformer.getPosition(range.startOffset);
                const positionOfEndWithinText = offsetTransformer.getPosition(range.endOffset);
                offsetOfSelectionStart += positionOfStartWithinText.lineNumber - 1;
                offsetOfSelectionEnd += positionOfEndWithinText.lineNumber - 1;
            }
            const positionOfSelectionStart = model.getPositionAt(offsetOfSelectionStart);
            const positionOfSelectionEnd = model.getPositionAt(offsetOfSelectionEnd);
            const newSelection = Selection.fromPositions(positionOfSelectionStart, positionOfSelectionEnd);
            viewController.setSelection(newSelection);
        });
    }
};
NativeEditContext = __decorate([
    __param(5, IInstantiationService),
    __param(6, IAccessibilityService)
], NativeEditContext);
export { NativeEditContext };
