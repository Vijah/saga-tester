--- 1.3.0

- Add support for `call`, `apply`, and `fork` methods that use the context api.
- Add support for `join`, `cancel`, and `cancelled`, as well as hooks for when a specific `fork` returns.
- `fork` to behave more intuitively within `race` and `all` effects (the first returning task stops the race; this also works for race/all nested within other race/all, as well as yielded generators that internally yield tasks that must be awaited).
- Add mention of `putResolve` as supported.
- Fix const typescript boolean on `call` property.
- Add the `config.debug.unblock` option to log the dependency tree when simulating concurrent tasks waiting after each other. Occurs when the root SagaTester is pending (usually after a `race`, `all`, or `join`), and SagaTester must pick the fastest task to run. Will usually not happen if all tasks are ran immediately (`wait: false`)
- Add the `config.debug.bubble` option to log the dependency tree (including partial values) when a resolved pending task "bubbles up" the dependency tree, potentially causing other tasks to become unblocked.