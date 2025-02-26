/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BugIndicatingError } from '../../common/errors.js';
import { derived, derivedOpts, derivedWithStore } from '../../common/observable.js';
import { isSVGElement } from '../dom.js';
export var n;
(function (n) {
    function nodeNs(elementNs = undefined) {
        return (tag, attributes, children) => {
            const className = attributes.class;
            delete attributes.class;
            const ref = attributes.ref;
            delete attributes.ref;
            const obsRef = attributes.obsRef;
            delete attributes.obsRef;
            return new ObserverNodeWithElement(tag, ref, obsRef, elementNs, className, attributes, children);
        };
    }
    function node(tag, elementNs = undefined) {
        const f = nodeNs(elementNs);
        return (attributes, children) => {
            return f(tag, attributes, children);
        };
    }
    n.div = node('div');
    n.elem = nodeNs(undefined);
    n.svg = node('svg', 'http://www.w3.org/2000/svg');
    n.svgElem = nodeNs('http://www.w3.org/2000/svg');
    function ref() {
        let value = undefined;
        const result = function (val) {
            value = val;
        };
        Object.defineProperty(result, 'element', {
            get() {
                if (!value) {
                    throw new BugIndicatingError('Make sure the ref is set before accessing the element. Maybe wrong initialization order?');
                }
                return value;
            }
        });
        return result;
    }
    n.ref = ref;
})(n || (n = {}));
export class ObserverNode {
    constructor(tag, ref, obsRef, ns, className, attributes, children) {
        this._deriveds = [];
        this._element = (ns ? document.createElementNS(ns, tag) : document.createElement(tag));
        if (ref) {
            ref(this._element);
        }
        if (obsRef) {
            this._deriveds.push(derivedWithStore((_reader, store) => {
                obsRef(this);
                store.add({
                    dispose: () => {
                        obsRef(null);
                    }
                });
            }));
        }
        if (className) {
            if (hasObservable(className)) {
                this._deriveds.push(derived(this, reader => {
                    /** @description set.class */
                    setClassName(this._element, getClassName(className, reader));
                }));
            }
            else {
                setClassName(this._element, getClassName(className, undefined));
            }
        }
        for (const [key, value] of Object.entries(attributes)) {
            if (key === 'style') {
                for (const [cssKey, cssValue] of Object.entries(value)) {
                    const key = camelCaseToHyphenCase(cssKey);
                    if (isObservable(cssValue)) {
                        this._deriveds.push(derivedOpts({ owner: this, debugName: () => `set.style.${key}` }, reader => {
                            this._element.style.setProperty(key, convertCssValue(cssValue.read(reader)));
                        }));
                    }
                    else {
                        this._element.style.setProperty(key, convertCssValue(cssValue));
                    }
                }
            }
            else if (key === 'tabIndex') {
                if (isObservable(value)) {
                    this._deriveds.push(derived(this, reader => {
                        /** @description set.tabIndex */
                        this._element.tabIndex = value.read(reader);
                    }));
                }
                else {
                    this._element.tabIndex = value;
                }
            }
            else if (key.startsWith('on')) {
                this._element[key] = value;
            }
            else {
                if (isObservable(value)) {
                    this._deriveds.push(derivedOpts({ owner: this, debugName: () => `set.${key}` }, reader => {
                        setOrRemoveAttribute(this._element, key, value.read(reader));
                    }));
                }
                else {
                    setOrRemoveAttribute(this._element, key, value);
                }
            }
        }
        if (children) {
            function getChildren(reader, children) {
                if (isObservable(children)) {
                    return getChildren(reader, children.read(reader));
                }
                if (Array.isArray(children)) {
                    return children.flatMap(c => getChildren(reader, c));
                }
                if (children instanceof ObserverNode) {
                    if (reader) {
                        children.readEffect(reader);
                    }
                    return [children._element];
                }
                if (children) {
                    return [children];
                }
                return [];
            }
            const d = derived(this, reader => {
                /** @description set.children */
                this._element.replaceChildren(...getChildren(reader, children));
            });
            this._deriveds.push(d);
            if (!childrenIsObservable(children)) {
                d.get();
            }
        }
    }
    readEffect(reader) {
        for (const d of this._deriveds) {
            d.read(reader);
        }
    }
    keepUpdated(store) {
        derived(reader => {
            /** update */
            this.readEffect(reader);
        }).recomputeInitiallyAndOnChange(store);
        return this;
    }
}
function setClassName(domNode, className) {
    if (isSVGElement(domNode)) {
        domNode.setAttribute('class', className);
    }
    else {
        domNode.className = className;
    }
}
function resolve(value, reader, cb) {
    if (isObservable(value)) {
        cb(value.read(reader));
        return;
    }
    if (Array.isArray(value)) {
        for (const v of value) {
            resolve(v, reader, cb);
        }
        return;
    }
    cb(value);
}
function getClassName(className, reader) {
    let result = '';
    resolve(className, reader, val => {
        if (val) {
            if (result.length === 0) {
                result = val;
            }
            else {
                result += ' ' + val;
            }
        }
    });
    return result;
}
function hasObservable(value) {
    if (isObservable(value)) {
        return true;
    }
    if (Array.isArray(value)) {
        return value.some(v => hasObservable(v));
    }
    return false;
}
function convertCssValue(value) {
    if (typeof value === 'number') {
        return value + 'px';
    }
    return value;
}
function childrenIsObservable(children) {
    if (isObservable(children)) {
        return true;
    }
    if (Array.isArray(children)) {
        return children.some(c => childrenIsObservable(c));
    }
    return false;
}
export class ObserverNodeWithElement extends ObserverNode {
    get element() {
        return this._element;
    }
}
function setOrRemoveAttribute(element, key, value) {
    if (value === null || value === undefined) {
        element.removeAttribute(camelCaseToHyphenCase(key));
    }
    else {
        element.setAttribute(camelCaseToHyphenCase(key), String(value));
    }
}
function camelCaseToHyphenCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
function isObservable(obj) {
    return obj && typeof obj === 'object' && obj['read'] !== undefined && obj['reportChanges'] !== undefined;
}
