## 1.4.0 (unpublished)

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
- Implement takeMaybe and END action.

### New Options
- Add `config.options.executeTakeGeneratorsOnlyOnce` option.
  - `false` by default.
  - If `true`, effects `debounce`, `throttle`, `takeEvery`, `takeLeading` and `takeLatest` will only ever be executed once.
  - By default, these effects will create as many tasks as would be created in a normal saga execution.
- Add `config.options.ignoreTakeGenerators: pattern` option.
  - Empty by default.
  - Any action matched by the pattern (which can be a list, just like in the redux-saga api) will not trigger any take generators.

### Minor changes
- Sagas blocked by take verbs now cause a deadlock error instead of a configuration error.

### Bugfixes
- Fix non-mocked generators being deffered correctly when forked.
- Fix non-mocked generators lacking names for debug purposes, even when names could be inferred
- Fix cancelled tasks not returning properly when a join is made inside finally (I don't even know if redux-saga supports this)
- Fix cancelled root saga does not return correctly

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

