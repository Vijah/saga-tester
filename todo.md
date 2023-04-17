--- 2.2.0

TODO:
- implement context ?!?
- implement channels ?!?

--- 2.1.0

TODO:
- implement cps and "sideEffects" to inject actions and run timers during
- implement "multipleOutputs", as opposed to "output", for an identical call which returns different things (to handle infinite loops better).
- implement redux side effect modifying the selectorConfig (inputs selectorConfig, outputs modified selectorConfig). Accepts reducers.
- implement run timers side effect.
- implement action side effect.
- implement cancellation side effect.
- implement spawn side effect. (a saga runs in parallel to the main saga)
- implement side-effects on: calls, actions, (sideEffects: [], and multipleSideEffects: [][], on: 'start', 'init', 'end') and on specific step numbers (on: number).

--- 2.0.0

TODO:
- cleanup api by merging expectedGenerators and expectedCalls into one config.
- make 'expectedCalls' a list of objects with a name property, so it better resembles the expectedAction config (less confusing)
- Transpile to ECMA 5 so the project runs regardless of the environment. Move the untransformed code inside an /es/ subfolder in the build so the user can choose.

--- 1.4.0

TODO:
- Concurrent take behavior.
- Test with two parallel tasks that keep pending and putting actions.
- Deadlock test.
- Concurrent takeLatest behavior.
- Test demonstrating a takeLatest generator is cancelled when an action is put while the generator is still running.
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
- Modify `putResolve` to await any tasks resulting from the action
- Update README with new features.
