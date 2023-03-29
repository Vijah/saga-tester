--- 2.2.0

TODO:
- implement context ?!?
- implement channels ?!?

--- 2.1.0

TODO:
- implement cps and "sideEffects" to inject actions and run timers during 

--- 2.0.0

TODO:
- cleanup api by merging expectedGenerators and expectedCalls into one config.
- make 'expectedCalls' a list of objects with a name property, so it better resembles the expectedAction config (less confusing)

--- 1.4.0

TODO:
- Concurrent take behavior.
- Test with two parallel tasks that keep pending and putting actions.
- Deadlock test.
- Concurrent takeLatest behavior.
- Test demonstrating a takeLatest generator is interrupted when an action is put while the generator is still running.
- Concurrent takeEvery behavior.
- Test demonstrating a takeEvery generator can run multiple instances in a row when an action is put while the generator is still running.
- Concurrent takeLeading behavior.
- Test demonstrating a takeLeading generator does nothing if the generator is still running.
- Concurrent debounce behavior.
- Test which demonstrates a debounced generator is called later if it is put again
- Test which demonstrates a debounced generator is called after a faster task.
- Concurrent throttle behavior.
- Test which demonstrates a throttled generator is not called again if the call is within a certain time limit, but is called again when called passed this time limit.
- Implement takeMaybe and END action
- Test ???
- Update README with new features.

--- 1.3.0

TODO:
- Implement concurrent delay effect
- Implement pointed debugging that only logs certain task Ids or names (list of, or directly)
- Implement awaitable calls
- Implement spawn
- Implement "waitForSpawned" option
- Update README with new features (esp. concurrency behavior, options section and debug section).