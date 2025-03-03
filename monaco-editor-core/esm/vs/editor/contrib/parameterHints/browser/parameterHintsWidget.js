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
var ParameterHintsWidget_1;
import * as dom from '../../../../base/browser/dom.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import './parameterHints.css';
import { EDITOR_FONT_DEFAULTS } from '../../../common/config/editorOptions.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { MarkdownRenderer } from '../../../browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { Context } from './provideSignatureHelp.js';
import * as nls from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { listHighlightForeground, registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
const $ = dom.$;
const parameterHintsNextIcon = registerIcon('parameter-hints-next', Codicon.chevronDown, nls.localize('parameterHintsNextIcon', 'Icon for show next parameter hint.'));
const parameterHintsPreviousIcon = registerIcon('parameter-hints-previous', Codicon.chevronUp, nls.localize('parameterHintsPreviousIcon', 'Icon for show previous parameter hint.'));
let ParameterHintsWidget = class ParameterHintsWidget extends Disposable {
    static { ParameterHintsWidget_1 = this; }
    static { this.ID = 'editor.widget.parameterHintsWidget'; }
    constructor(editor, model, contextKeyService, openerService, languageService) {
        super();
        this.editor = editor;
        this.model = model;
        this.renderDisposeables = this._register(new DisposableStore());
        this.visible = false;
        this.announcedLabel = null;
        // Editor.IContentWidget.allowEditorOverflow
        this.allowEditorOverflow = true;
        this.markdownRenderer = new MarkdownRenderer({ editor }, languageService, openerService);
        this.keyVisible = Context.Visible.bindTo(contextKeyService);
        this.keyMultipleSignatures = Context.MultipleSignatures.bindTo(contextKeyService);
    }
    createParameterHintDOMNodes() {
        const element = $('.editor-widget.parameter-hints-widget');
        const wrapper = dom.append(element, $('.phwrapper'));
        wrapper.tabIndex = -1;
        const controls = dom.append(wrapper, $('.controls'));
        const previous = dom.append(controls, $('.button' + ThemeIcon.asCSSSelector(parameterHintsPreviousIcon)));
        const overloads = dom.append(controls, $('.overloads'));
        const next = dom.append(controls, $('.button' + ThemeIcon.asCSSSelector(parameterHintsNextIcon)));
        this._register(dom.addDisposableListener(previous, 'click', e => {
            dom.EventHelper.stop(e);
            this.previous();
        }));
        this._register(dom.addDisposableListener(next, 'click', e => {
            dom.EventHelper.stop(e);
            this.next();
        }));
        const body = $('.body');
        const scrollbar = new DomScrollableElement(body, {
            alwaysConsumeMouseWheel: true,
        });
        this._register(scrollbar);
        wrapper.appendChild(scrollbar.getDomNode());
        const signature = dom.append(body, $('.signature'));
        const docs = dom.append(body, $('.docs'));
        element.style.userSelect = 'text';
        this.domNodes = {
            element,
            signature,
            overloads,
            docs,
            scrollbar,
        };
        this.editor.addContentWidget(this);
        this.hide();
        this._register(this.editor.onDidChangeCursorSelection(e => {
            if (this.visible) {
                this.editor.layoutContentWidget(this);
            }
        }));
        const updateFont = () => {
            if (!this.domNodes) {
                return;
            }
            const fontInfo = this.editor.getOption(52 /* EditorOption.fontInfo */);
            const element = this.domNodes.element;
            element.style.fontSize = `${fontInfo.fontSize}px`;
            element.style.lineHeight = `${fontInfo.lineHeight / fontInfo.fontSize}`;
            element.style.setProperty('--vscode-parameterHintsWidget-editorFontFamily', fontInfo.fontFamily);
            element.style.setProperty('--vscode-parameterHintsWidget-editorFontFamilyDefault', EDITOR_FONT_DEFAULTS.fontFamily);
        };
        updateFont();
        this._register(Event.chain(this.editor.onDidChangeConfiguration.bind(this.editor), $ => $.filter(e => e.hasChanged(52 /* EditorOption.fontInfo */)))(updateFont));
        this._register(this.editor.onDidLayoutChange(e => this.updateMaxHeight()));
        this.updateMaxHeight();
    }
    show() {
        if (this.visible) {
            return;
        }
        if (!this.domNodes) {
            this.createParameterHintDOMNodes();
        }
        this.keyVisible.set(true);
        this.visible = true;
        setTimeout(() => {
            this.domNodes?.element.classList.add('visible');
        }, 100);
        this.editor.layoutContentWidget(this);
    }
    hide() {
        this.renderDisposeables.clear();
        if (!this.visible) {
            return;
        }
        this.keyVisible.reset();
        this.visible = false;
        this.announcedLabel = null;
        this.domNodes?.element.classList.remove('visible');
        this.editor.layoutContentWidget(this);
    }
    getPosition() {
        if (this.visible) {
            return {
                position: this.editor.getPosition(),
                preference: [1 /* ContentWidgetPositionPreference.ABOVE */, 2 /* ContentWidgetPositionPreference.BELOW */]
            };
        }
        return null;
    }
    render(hints) {
        this.renderDisposeables.clear();
        if (!this.domNodes) {
            return;
        }
        const multiple = hints.signatures.length > 1;
        this.domNodes.element.classList.toggle('multiple', multiple);
        this.keyMultipleSignatures.set(multiple);
        this.domNodes.signature.innerText = '';
        this.domNodes.docs.innerText = '';
        const signature = hints.signatures[hints.activeSignature];
        if (!signature) {
            return;
        }
        const code = dom.append(this.domNodes.signature, $('.code'));
        const hasParameters = signature.parameters.length > 0;
        const activeParameterIndex = signature.activeParameter ?? hints.activeParameter;
        if (!hasParameters) {
            const label = dom.append(code, $('span'));
            label.textContent = signature.label;
        }
        else {
            this.renderParameters(code, signature, activeParameterIndex);
        }
        const activeParameter = signature.parameters[activeParameterIndex];
        if (activeParameter?.documentation) {
            const documentation = $('span.documentation');
            if (typeof activeParameter.documentation === 'string') {
                documentation.textContent = activeParameter.documentation;
            }
            else {
                const renderedContents = this.renderMarkdownDocs(activeParameter.documentation);
                documentation.appendChild(renderedContents.element);
            }
            dom.append(this.domNodes.docs, $('p', {}, documentation));
        }
        if (signature.documentation === undefined) {
            /** no op */
        }
        else if (typeof signature.documentation === 'string') {
            dom.append(this.domNodes.docs, $('p', {}, signature.documentation));
        }
        else {
            const renderedContents = this.renderMarkdownDocs(signature.documentation);
            dom.append(this.domNodes.docs, renderedContents.element);
        }
        const hasDocs = this.hasDocs(signature, activeParameter);
        this.domNodes.signature.classList.toggle('has-docs', hasDocs);
        this.domNodes.docs.classList.toggle('empty', !hasDocs);
        this.domNodes.overloads.textContent =
            String(hints.activeSignature + 1).padStart(hints.signatures.length.toString().length, '0') + '/' + hints.signatures.length;
        if (activeParameter) {
            let labelToAnnounce = '';
            const param = signature.parameters[activeParameterIndex];
            if (Array.isArray(param.label)) {
                labelToAnnounce = signature.label.substring(param.label[0], param.label[1]);
            }
            else {
                labelToAnnounce = param.label;
            }
            if (param.documentation) {
                labelToAnnounce += typeof param.documentation === 'string' ? `, ${param.documentation}` : `, ${param.documentation.value}`;
            }
            if (signature.documentation) {
                labelToAnnounce += typeof signature.documentation === 'string' ? `, ${signature.documentation}` : `, ${signature.documentation.value}`;
            }
            // Select method gets called on every user type while parameter hints are visible.
            // We do not want to spam the user with same announcements, so we only announce if the current parameter changed.
            if (this.announcedLabel !== labelToAnnounce) {
                aria.alert(nls.localize('hint', "{0}, hint", labelToAnnounce));
                this.announcedLabel = labelToAnnounce;
            }
        }
        this.editor.layoutContentWidget(this);
        this.domNodes.scrollbar.scanDomNode();
    }
    renderMarkdownDocs(markdown) {
        const renderedContents = this.renderDisposeables.add(this.markdownRenderer.render(markdown, {
            asyncRenderCallback: () => {
                this.domNodes?.scrollbar.scanDomNode();
            }
        }));
        renderedContents.element.classList.add('markdown-docs');
        return renderedContents;
    }
    hasDocs(signature, activeParameter) {
        if (activeParameter && typeof activeParameter.documentation === 'string' && assertIsDefined(activeParameter.documentation).length > 0) {
            return true;
        }
        if (activeParameter && typeof activeParameter.documentation === 'object' && assertIsDefined(activeParameter.documentation).value.length > 0) {
            return true;
        }
        if (signature.documentation && typeof signature.documentation === 'string' && assertIsDefined(signature.documentation).length > 0) {
            return true;
        }
        if (signature.documentation && typeof signature.documentation === 'object' && assertIsDefined(signature.documentation.value).length > 0) {
            return true;
        }
        return false;
    }
    renderParameters(parent, signature, activeParameterIndex) {
        const [start, end] = this.getParameterLabelOffsets(signature, activeParameterIndex);
        const beforeSpan = document.createElement('span');
        beforeSpan.textContent = signature.label.substring(0, start);
        const paramSpan = document.createElement('span');
        paramSpan.textContent = signature.label.substring(start, end);
        paramSpan.className = 'parameter active';
        const afterSpan = document.createElement('span');
        afterSpan.textContent = signature.label.substring(end);
        dom.append(parent, beforeSpan, paramSpan, afterSpan);
    }
    getParameterLabelOffsets(signature, paramIdx) {
        const param = signature.parameters[paramIdx];
        if (!param) {
            return [0, 0];
        }
        else if (Array.isArray(param.label)) {
            return param.label;
        }
        else if (!param.label.length) {
            return [0, 0];
        }
        else {
            const regex = new RegExp(`(\\W|^)${escapeRegExpCharacters(param.label)}(?=\\W|$)`, 'g');
            regex.test(signature.label);
            const idx = regex.lastIndex - param.label.length;
            return idx >= 0
                ? [idx, regex.lastIndex]
                : [0, 0];
        }
    }
    next() {
        this.editor.focus();
        this.model.next();
    }
    previous() {
        this.editor.focus();
        this.model.previous();
    }
    getDomNode() {
        if (!this.domNodes) {
            this.createParameterHintDOMNodes();
        }
        return this.domNodes.element;
    }
    getId() {
        return ParameterHintsWidget_1.ID;
    }
    updateMaxHeight() {
        if (!this.domNodes) {
            return;
        }
        const height = Math.max(this.editor.getLayoutInfo().height / 4, 250);
        const maxHeight = `${height}px`;
        this.domNodes.element.style.maxHeight = maxHeight;
        const wrapper = this.domNodes.element.getElementsByClassName('phwrapper');
        if (wrapper.length) {
            wrapper[0].style.maxHeight = maxHeight;
        }
    }
};
ParameterHintsWidget = ParameterHintsWidget_1 = __decorate([
    __param(2, IContextKeyService),
    __param(3, IOpenerService),
    __param(4, ILanguageService)
], ParameterHintsWidget);
export { ParameterHintsWidget };
registerColor('editorHoverWidget.highlightForeground', listHighlightForeground, nls.localize('editorHoverWidgetHighlightForeground', 'Foreground color of the active item in the parameter hint.'));
