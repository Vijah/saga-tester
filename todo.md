--- 2.3.0

TODO:
- implement actionChannel, as well as effect apis that receive channels
- implement flush

--- 2.2.0

TODO:
- implement setContext and getContext (children forks cannot modify the context of their parents unless by reference)

--- 2.1.0

TODO:
- implement cps
- implement "sideEffects" to inject actions and run timers during execution
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
- move __passOnUndefined to options.
- do not call unmocked generators by default.
- add an option to call unconfigured generators and call effects instead of failing.
- Remove the "increment by 1 on yield" option.
- Transpile to ECMA 5 so the project runs regardless of the environment. Move the untransformed code inside an /es/ subfolder in the build so the user can choose.

--- 1.4.0

TODO:
- Modify `putResolve` to await any tasks resulting from the action
- Update README with new features.
