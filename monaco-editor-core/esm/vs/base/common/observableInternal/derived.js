/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BaseObservable, _setDerivedOpts } from './base.js';
import { DebugNameData } from './debugName.js';
import { BugIndicatingError, DisposableStore, assertFn, onBugIndicatingError, strictEquals } from './commonFacade/deps.js';
import { getLogger } from './logging/logging.js';
export function derived(computeFnOrOwner, computeFn) {
    if (computeFn !== undefined) {
        return new Derived(new DebugNameData(computeFnOrOwner, undefined, computeFn), computeFn, undefined, undefined, undefined, strictEquals);
    }
    return new Derived(new DebugNameData(undefined, undefined, computeFnOrOwner), computeFnOrOwner, undefined, undefined, undefined, strictEquals);
}
export function derivedWithSetter(owner, computeFn, setter) {
    return new DerivedWithSetter(new DebugNameData(owner, undefined, computeFn), computeFn, undefined, undefined, undefined, strictEquals, setter);
}
export function derivedOpts(options, computeFn) {
    return new Derived(new DebugNameData(options.owner, options.debugName, options.debugReferenceFn), computeFn, undefined, undefined, options.onLastObserverRemoved, options.equalsFn ?? strictEquals);
}
_setDerivedOpts(derivedOpts);
/**
 * Represents an observable that is derived from other observables.
 * The value is only recomputed when absolutely needed.
 *
 * {@link computeFn} should start with a JS Doc using `@description` to name the derived.
 *
 * Use `createEmptyChangeSummary` to create a "change summary" that can collect the changes.
 * Use `handleChange` to add a reported change to the change summary.
 * The compute function is given the last change summary.
 * The change summary is discarded after the compute function was called.
 *
 * @see derived
 */
export function derivedHandleChanges(options, computeFn) {
    return new Derived(new DebugNameData(options.owner, options.debugName, undefined), computeFn, options.createEmptyChangeSummary, options.handleChange, undefined, options.equalityComparer ?? strictEquals);
}
export function derivedWithStore(computeFnOrOwner, computeFnOrUndefined) {
    let computeFn;
    let owner;
    if (computeFnOrUndefined === undefined) {
        computeFn = computeFnOrOwner;
        owner = undefined;
    }
    else {
        owner = computeFnOrOwner;
        computeFn = computeFnOrUndefined;
    }
    // Intentionally re-assigned in case an inactive observable is re-used later
    // eslint-disable-next-line local/code-no-potentially-unsafe-disposables
    let store = new DisposableStore();
    return new Derived(new DebugNameData(owner, undefined, computeFn), r => {
        if (store.isDisposed) {
            store = new DisposableStore();
        }
        else {
            store.clear();
        }
        return computeFn(r, store);
    }, undefined, undefined, () => store.dispose(), strictEquals);
}
export function derivedDisposable(computeFnOrOwner, computeFnOrUndefined) {
    let computeFn;
    let owner;
    if (computeFnOrUndefined === undefined) {
        computeFn = computeFnOrOwner;
        owner = undefined;
    }
    else {
        owner = computeFnOrOwner;
        computeFn = computeFnOrUndefined;
    }
    let store = undefined;
    return new Derived(new DebugNameData(owner, undefined, computeFn), r => {
        if (!store) {
            store = new DisposableStore();
        }
        else {
            store.clear();
        }
        const result = computeFn(r);
        if (result) {
            store.add(result);
        }
        return result;
    }, undefined, undefined, () => {
        if (store) {
            store.dispose();
            store = undefined;
        }
    }, strictEquals);
}
export class Derived extends BaseObservable {
    get debugName() {
        return this._debugNameData.getDebugName(this) ?? '(anonymous)';
    }
    constructor(_debugNameData, _computeFn, createChangeSummary, _handleChange, _handleLastObserverRemoved = undefined, _equalityComparator) {
        super();
        this._debugNameData = _debugNameData;
        this._computeFn = _computeFn;
        this.createChangeSummary = createChangeSummary;
        this._handleChange = _handleChange;
        this._handleLastObserverRemoved = _handleLastObserverRemoved;
        this._equalityComparator = _equalityComparator;
        this._state = 0 /* DerivedState.initial */;
        this.value = undefined;
        this._updateCount = 0;
        this._dependencies = new Set();
        this.dependenciesToBeRemoved = new Set();
        this.changeSummary = undefined;
        this._isUpdating = false;
        this._isComputing = false;
        this._removedObserverToCallEndUpdateOn = null;
        // IReader Implementation
        this._isReaderValid = false;
        this.changeSummary = this.createChangeSummary?.();
    }
    onLastObserverRemoved() {
        /**
         * We are not tracking changes anymore, thus we have to assume
         * that our cache is invalid.
         */
        this._state = 0 /* DerivedState.initial */;
        this.value = undefined;
        getLogger()?.handleDerivedCleared(this);
        for (const d of this._dependencies) {
            d.removeObserver(this);
        }
        this._dependencies.clear();
        this._handleLastObserverRemoved?.();
    }
    get() {
        const checkEnabled = false; // TODO set to true
        if (this._isComputing && checkEnabled) {
            // investigate why this fails in the diff editor!
            throw new BugIndicatingError('Cyclic deriveds are not supported yet!');
        }
        if (this._observers.size === 0) {
            let result;
            // Without observers, we don't know when to clean up stuff.
            // Thus, we don't cache anything to prevent memory leaks.
            try {
                this._isReaderValid = true;
                result = this._computeFn(this, this.createChangeSummary?.());
            }
            finally {
                this._isReaderValid = false;
            }
            // Clear new dependencies
            this.onLastObserverRemoved();
            return result;
        }
        else {
            do {
                // We might not get a notification for a dependency that changed while it is updating,
                // thus we also have to ask all our depedencies if they changed in this case.
                if (this._state === 1 /* DerivedState.dependenciesMightHaveChanged */) {
                    for (const d of this._dependencies) {
                        /** might call {@link handleChange} indirectly, which could make us stale */
                        d.reportChanges();
                        if (this._state === 2 /* DerivedState.stale */) {
                            // The other dependencies will refresh on demand, so early break
                            break;
                        }
                    }
                }
                // We called report changes of all dependencies.
                // If we are still not stale, we can assume to be up to date again.
                if (this._state === 1 /* DerivedState.dependenciesMightHaveChanged */) {
                    this._state = 3 /* DerivedState.upToDate */;
                }
                if (this._state !== 3 /* DerivedState.upToDate */) {
                    this._recompute();
                }
                // In case recomputation changed one of our dependencies, we need to recompute again.
            } while (this._state !== 3 /* DerivedState.upToDate */);
            return this.value;
        }
    }
    _recompute() {
        const emptySet = this.dependenciesToBeRemoved;
        this.dependenciesToBeRemoved = this._dependencies;
        this._dependencies = emptySet;
        const hadValue = this._state !== 0 /* DerivedState.initial */;
        const oldValue = this.value;
        this._state = 3 /* DerivedState.upToDate */;
        let didChange = false;
        this._isComputing = true;
        try {
            const changeSummary = this.changeSummary;
            this.changeSummary = this.createChangeSummary?.();
            try {
                this._isReaderValid = true;
                /** might call {@link handleChange} indirectly, which could invalidate us */
                this.value = this._computeFn(this, changeSummary);
            }
            finally {
                this._isReaderValid = false;
                // We don't want our observed observables to think that they are (not even temporarily) not being observed.
                // Thus, we only unsubscribe from observables that are definitely not read anymore.
                for (const o of this.dependenciesToBeRemoved) {
                    o.removeObserver(this);
                }
                this.dependenciesToBeRemoved.clear();
            }
            didChange = hadValue && !(this._equalityComparator(oldValue, this.value));
            getLogger()?.handleObservableUpdated(this, {
                oldValue,
                newValue: this.value,
                change: undefined,
                didChange,
                hadValue,
            });
        }
        catch (e) {
            onBugIndicatingError(e);
        }
        this._isComputing = false;
        if (didChange) {
            for (const r of this._observers) {
                r.handleChange(this, undefined);
            }
        }
    }
    toString() {
        return `LazyDerived<${this.debugName}>`;
    }
    // IObserver Implementation
    beginUpdate(_observable) {
        if (this._isUpdating) {
            throw new BugIndicatingError('Cyclic deriveds are not supported yet!');
        }
        this._updateCount++;
        this._isUpdating = true;
        try {
            const propagateBeginUpdate = this._updateCount === 1;
            if (this._state === 3 /* DerivedState.upToDate */) {
                this._state = 1 /* DerivedState.dependenciesMightHaveChanged */;
                // If we propagate begin update, that will already signal a possible change.
                if (!propagateBeginUpdate) {
                    for (const r of this._observers) {
                        r.handlePossibleChange(this);
                    }
                }
            }
            if (propagateBeginUpdate) {
                for (const r of this._observers) {
                    r.beginUpdate(this); // This signals a possible change
                }
            }
        }
        finally {
            this._isUpdating = false;
        }
    }
    endUpdate(_observable) {
        this._updateCount--;
        if (this._updateCount === 0) {
            // End update could change the observer list.
            const observers = [...this._observers];
            for (const r of observers) {
                r.endUpdate(this);
            }
            if (this._removedObserverToCallEndUpdateOn) {
                const observers = [...this._removedObserverToCallEndUpdateOn];
                this._removedObserverToCallEndUpdateOn = null;
                for (const r of observers) {
                    r.endUpdate(this);
                }
            }
        }
        assertFn(() => this._updateCount >= 0);
    }
    handlePossibleChange(observable) {
        // In all other states, observers already know that we might have changed.
        if (this._state === 3 /* DerivedState.upToDate */ && this._dependencies.has(observable) && !this.dependenciesToBeRemoved.has(observable)) {
            this._state = 1 /* DerivedState.dependenciesMightHaveChanged */;
            for (const r of this._observers) {
                r.handlePossibleChange(this);
            }
        }
    }
    handleChange(observable, change) {
        if (this._dependencies.has(observable) && !this.dependenciesToBeRemoved.has(observable)) {
            getLogger()?.handleDerivedDependencyChanged(this, observable, change);
            let shouldReact = false;
            try {
                shouldReact = this._handleChange ? this._handleChange({
                    changedObservable: observable,
                    change,
                    didChange: (o) => o === observable,
                }, this.changeSummary) : true;
            }
            catch (e) {
                onBugIndicatingError(e);
            }
            const wasUpToDate = this._state === 3 /* DerivedState.upToDate */;
            if (shouldReact && (this._state === 1 /* DerivedState.dependenciesMightHaveChanged */ || wasUpToDate)) {
                this._state = 2 /* DerivedState.stale */;
                if (wasUpToDate) {
                    for (const r of this._observers) {
                        r.handlePossibleChange(this);
                    }
                }
            }
        }
    }
    readObservable(observable) {
        if (!this._isReaderValid) {
            throw new BugIndicatingError('The reader object cannot be used outside its compute function!');
        }
        // Subscribe before getting the value to enable caching
        observable.addObserver(this);
        /** This might call {@link handleChange} indirectly, which could invalidate us */
        const value = observable.get();
        // Which is why we only add the observable to the dependencies now.
        this._dependencies.add(observable);
        this.dependenciesToBeRemoved.delete(observable);
        return value;
    }
    addObserver(observer) {
        const shouldCallBeginUpdate = !this._observers.has(observer) && this._updateCount > 0;
        super.addObserver(observer);
        if (shouldCallBeginUpdate) {
            if (this._removedObserverToCallEndUpdateOn && this._removedObserverToCallEndUpdateOn.has(observer)) {
                this._removedObserverToCallEndUpdateOn.delete(observer);
            }
            else {
                observer.beginUpdate(this);
            }
        }
    }
    removeObserver(observer) {
        if (this._observers.has(observer) && this._updateCount > 0) {
            if (!this._removedObserverToCallEndUpdateOn) {
                this._removedObserverToCallEndUpdateOn = new Set();
            }
            this._removedObserverToCallEndUpdateOn.add(observer);
        }
        super.removeObserver(observer);
    }
}
export class DerivedWithSetter extends Derived {
    constructor(debugNameData, computeFn, createChangeSummary, handleChange, handleLastObserverRemoved = undefined, equalityComparator, set) {
        super(debugNameData, computeFn, createChangeSummary, handleChange, handleLastObserverRemoved, equalityComparator);
        this.set = set;
    }
}
