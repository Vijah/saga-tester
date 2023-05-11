## 2.1.0

- Add support for cps
- Possibly fix a bug where errors from async calls inside all/race were incorrectly bubbled up.
- Allow defining the same matcher (e.g. same method name and same params) multiple times, to define multiple outputs or side effects for the same call (useful for sagas with infinite loops).
- Implement `config.options.reducers` such that put actions modify the selectorConfig like real reducers.

## 2.0.1

- Overhaul build with rollup. Should now work out of the box.
- Fix a bunch of build problems.
- Fix a bunch of bad typescript behavior.
- Package is now both in ES and in CJS (commonJS).

## 2.0.0

- cleanup api by merging expectedGenerators and expectedCalls into one config.
- make 'expectedCalls' a list of objects with a name property, so it better resembles the expectedAction config (less confusing)

### Breaking changes
- Move `config.selectorConfig.__passOnUndefined` to `config.options.passOnUndefinedSelector`.
- Remove deprecated option `config.options.yieldDecreasesTimer`.
- Stop adding 1 on initialized of number-type `wait` configs (risks of affecting existing tests is very low, unless the configs were 1-unit close to each other).

- Unconfigured generators now fail by default.
- Added `config.options.failOnUnconfigured`, which can be set to `false` if you want ANY unconfigured calls not to fail the SagaTester.

- Remove `config.expectedGenerators`. All is moved in `config.expectedCalls`.
- Change `config.expectedCalls` from an object to a list, where all elements have a property `name`.

BEFORE
```js
expectedCalls: {
  method1: [{ times: 1, params: ['arg1'] }],
},
expectedGenerators: {
  method2: [{ times: 1, params: ['arg2'] }],
},
```

AFTER
```js
expectedCalls: [
  { name: 'method1', times: 1, params: ['arg1'] },
  { name: 'method2', times: 1, params: ['arg2'] },
],
```

## 1.4.0

### Breaking changes
- Breaking change: Effective actions are consumed by take (just duplicate the actions that are taken multiple times)

### New features
- "Concurrent behavior" means that it behaves just like a real redux-saga, meaning it pends until it finds a match. E.g. for debounce, waits a given "time" before executing the task, pushing the time further if a second trigger is met before the time is over. The delays are fake and handled by sagaTester merely to determine in which order to run effects and tasks.
  - Concurrent `take` behavior.
  - Concurrent `takeLatest` behavior.
  - Concurrent `takeEvery` behavior.
  - Concurrent `takeLeading` behavior.
  - Concurrent `debounce` behavior.
  - Concurrent `throttle` behavior.
  - Implement `takeMaybe` and `END` action.

- Add `sideEffects` as a hook to easily inject side effects such as running timers (important to deal with setTimeout) and modifying the store (important for infinite loops)
  - add action side effect (`put`, `putResolve`).
  - add cancellation side effect (`cancel()`).
  - add `spawn` and `fork` side effect.
  - add `call` side effect.
  - add redux side effect modifying the selectorConfig (`{ wait?: number | boolean, changeSelectorConfig: (prevSelectorConfig) => newSelectorConfig }`).

- Handle promises. Requires using `runAsync` instead of `run`.
  - Handle actions within promises (in the form of redux-thunk api).
  - Handle redux-thunk type actions
  - handle calls containing promises.
  - `putResolve` blocks until the asynchronous action resolves, if it is a promise.
  - If your asynchronous code uses setTimeout, you can dispatch a sideEffect which calls `jest.runAllTimers()`, or an equivalent in your test suite. SagaTester presumes that if nothing happens during a "step", it means it is deadlocked. As a result, SagaTester cannot "spin" until promises or timers conclude. This is why you should mock most promises or timers in your tests.

### New Options
- Add `config.options.executeTakeGeneratorsOnlyOnce` option.
  - `false` by default.
  - If `true`, effects `debounce`, `throttle`, `takeEvery`, `takeLeading` and `takeLatest` will only ever be executed once.
  - By default, these effects will create as many tasks as would be created in a normal saga execution.
- Add `config.options.ignoreTakeGenerators: pattern` option.
  - Empty by default.
  - Any action matched by the pattern (which can be a list, just like in the redux-saga api) will not trigger any take generators.
- Add `config.options.swallowSpawnErrors` to allow continuing the saga normally when a spawn throws an unhandled exception
- Add `config.options.reduxThunkOptions` which are passed as a third parameter to redux-thunk function actions.

### Minor changes
- Sagas blocked by take verbs now cause a deadlock error instead of a configuration error.
- Error handling now propagates upwards to the parent, and leads to cancelled siblings.

### Bugfixes
- Fix non-mocked generators being deffered correctly when forked.
- Fix non-mocked generators lacking names for debug purposes, even when names could be inferred
- Fix cancelled tasks not returning properly when a join is made inside finally (I don't even know if redux-saga supports this)
- Fix cancelled root saga does not return correctly
- Fix error handling not behaving like specified.
- Fix throw clause not working with wait.
- Fix cancellation occasionally not working properly.
- Fix tasks occasionally terminating incorrectly when yielded in an effect.

## 1.3.0

- `fork` to behave more intuitively within `race` and `all` effects (the first returning task stops the race; this also works for race/all nested within other race/all, as well as yielded generators that internally yield tasks that must be awaited).
- support `spawn`
- Add support for `call`, `apply`, `fork` and `spawn` methods that use the context api.
- Add support for `join`, `cancel`, and `cancelled`, as well as hooks for when a specific `fork` returns.
- Add mention of `putResolve` as supported.

- Add the `config.debug.unblock` option to log the dependency tree when simulating concurrent tasks waiting after each other. Occurs when the root SagaTester is pending (usually after a `race`, `all`, or `join`), and SagaTester must pick the fastest task to run. Will usually not happen if all tasks are ran immediately (`wait: false`)
- Add the `config.debug.bubble` option to log the dependency tree (including partial values) when a resolved pending task "bubbles up" the dependency tree, potentially causing other tasks to become unblocked.
- Add the `config.debug.interrupt` option to log interruptions of tasks, the reasons, and conditions of resuming them.

- Add the `config.options.stepLimit` option to detect infinite loops faster or slower
- Add the `config.options.yieldDecreasesTimer` option, which is set to `false` by default to avoid confusing behavior. (This is technically a breaking change if your tests relied on the decreasing step count). If set to `true`, each yield action results in the timer of active tasks to decrease by 1.
- Add the `config.options.useStaticTimes` option, `false` by default (breaking change). If `false`, whenever a task with a numbered "wait" is run, all other active tasks with a numbered "wait" is decreased by the same amount. If `true`, a numbered "wait" remains static and therefore acts more like a priority.
- Add the `config.options.waitForSpawned` which is `false` by default. If `false`, spawned tasks have no parent and are therefore not awaited when concluding the tasks which spawned them. If `true`, the root saga passed to sagaTester is set to be the parent, meaning the spawned tasks will have to finish before the tester ends.

- Add `saga-tester/PLACEHOLDER_ARGS`.
  - Provide `PLACEHOLDER_ARGS.ANY` inside a `params` array to indicate an argument that is not important.
  - Provide `PLACEHOLDER_ARGS.TASK` inside a `params` array to indicate a task object of any content.
  - Provide `PLACEHOLDER_ARGS.TYPE(type)` inside a `params` array to indicate a value of `typeof type`.
  - Provide `PLACEHOLDER_ARGS.FN((value) => boolean)` inside a `params` array to indicate a value for which the method returns true.

- Implement calls having a `wait` parameter as well.

- Fix cancellation not bubbling down parent ownership.
- Fix cancellation not using "return" and therefore not correctly branching into "finally" statements.
- Fix race effect not cancelling losing tasks
- Fix const typescript boolean on `call` property.
- More flexible typescript

