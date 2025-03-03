/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorAction2 } from '../../../browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { StickyScrollController } from './stickyScrollController.js';
export class ToggleStickyScroll extends EditorAction2 {
    constructor() {
        super({
            id: 'editor.action.toggleStickyScroll',
            title: {
                ...localize2('toggleEditorStickyScroll', "Toggle Editor Sticky Scroll"),
                mnemonicTitle: localize({ key: 'mitoggleStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Toggle Editor Sticky Scroll"),
            },
            metadata: {
                description: localize2('toggleEditorStickyScroll.description', "Toggle/enable the editor sticky scroll which shows the nested scopes at the top of the viewport"),
            },
            category: Categories.View,
            toggled: {
                condition: ContextKeyExpr.equals('config.editor.stickyScroll.enabled', true),
                title: localize('stickyScroll', "Sticky Scroll"),
                mnemonicTitle: localize({ key: 'miStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Sticky Scroll"),
            },
            menu: [
                { id: MenuId.CommandPalette },
                { id: MenuId.MenubarAppearanceMenu, group: '4_editor', order: 3 },
                { id: MenuId.StickyScrollContext }
            ]
        });
    }
    async runEditorCommand(accessor, editor) {
        const configurationService = accessor.get(IConfigurationService);
        const newValue = !configurationService.getValue('editor.stickyScroll.enabled');
        const isFocused = StickyScrollController.get(editor)?.isFocused();
        configurationService.updateValue('editor.stickyScroll.enabled', newValue);
        if (isFocused) {
            editor.focus();
        }
    }
}
const weight = 100 /* KeybindingWeight.EditorContrib */;
export class FocusStickyScroll extends EditorAction2 {
    constructor() {
        super({
            id: 'editor.action.focusStickyScroll',
            title: {
                ...localize2('focusStickyScroll', "Focus Editor Sticky Scroll"),
                mnemonicTitle: localize({ key: 'mifocusEditorStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Focus Editor Sticky Scroll"),
            },
            precondition: ContextKeyExpr.and(ContextKeyExpr.has('config.editor.stickyScroll.enabled'), EditorContextKeys.stickyScrollVisible),
            menu: [
                { id: MenuId.CommandPalette },
            ]
        });
    }
    runEditorCommand(_accessor, editor) {
        StickyScrollController.get(editor)?.focus();
    }
}
export class SelectNextStickyScrollLine extends EditorAction2 {
    constructor() {
        super({
            id: 'editor.action.selectNextStickyScrollLine',
            title: localize2('selectNextStickyScrollLine.title', "Select the next editor sticky scroll line"),
            precondition: EditorContextKeys.stickyScrollFocused.isEqualTo(true),
            keybinding: {
                weight,
                primary: 18 /* KeyCode.DownArrow */
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        StickyScrollController.get(editor)?.focusNext();
    }
}
export class SelectPreviousStickyScrollLine extends EditorAction2 {
    constructor() {
        super({
            id: 'editor.action.selectPreviousStickyScrollLine',
            title: localize2('selectPreviousStickyScrollLine.title', "Select the previous sticky scroll line"),
            precondition: EditorContextKeys.stickyScrollFocused.isEqualTo(true),
            keybinding: {
                weight,
                primary: 16 /* KeyCode.UpArrow */
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        StickyScrollController.get(editor)?.focusPrevious();
    }
}
export class GoToStickyScrollLine extends EditorAction2 {
    constructor() {
        super({
            id: 'editor.action.goToFocusedStickyScrollLine',
            title: localize2('goToFocusedStickyScrollLine.title', "Go to the focused sticky scroll line"),
            precondition: EditorContextKeys.stickyScrollFocused.isEqualTo(true),
            keybinding: {
                weight,
                primary: 3 /* KeyCode.Enter */
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        StickyScrollController.get(editor)?.goToFocused();
    }
}
export class SelectEditor extends EditorAction2 {
    constructor() {
        super({
            id: 'editor.action.selectEditor',
            title: localize2('selectEditor.title', "Select Editor"),
            precondition: EditorContextKeys.stickyScrollFocused.isEqualTo(true),
            keybinding: {
                weight,
                primary: 9 /* KeyCode.Escape */
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        StickyScrollController.get(editor)?.selectEditor();
    }
}
