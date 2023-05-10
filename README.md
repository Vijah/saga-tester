# @vijah/saga-tester

A tester library for redux-saga, offering the following features:

- Is order-independent (changing yield order does not break the test, making your tests less fragile).
- Handles the following redux-saga/effects: put, putResolve, select, call, apply, all, race, retry, take, takeMaybe, the END action, takeLatest, takeEvery, takeLeading, throttle, debounce, fork, spawn, delay, cancel, cancelled, join.
- Runs the entire generator method from start to finish with one holistic config.
- Handles concurrent task executions, error handling and task cancellation internally, like redux-saga.

It has the following limitations:

- Is in ECMA6 and not transpiled (this will change in 2.0.0)
- Does not handle channels and other advanced saga features to handle complex concurrent behavior (coming in 2.3.0).

## Install

```
yarn add @vijah/saga-tester --dev
```

```
npm install --save-dev @vijah/saga-tester
```

## API

```js
new SagaTester(saga, config).run(sagaArgs);
```

## Example

Given the following saga method:
```js
import selector from 'path/to/selector';
import generator from 'path/to/generator';

const someMethod = () => {};
const someAction = (a, b) => ({ type: 'someType', a, b });
const actualSelector = () => createSelector((state) => state.reducerKey, (stateData) => stateData);

function* mySaga(param) {
  const callResult = yield call(someMethod, param);
  const actualSelectorResult = yield select(actualSelector());
  yield put(someAction(callResult, actualSelectorResult));
  const selectorResult = yield select(selector());
  const generatorResult = yield generator(selectorResult);
  const takeResult = yield take('someType');
  return { generatorResult, takeValue: takeResult.value };
}
```

We can test it the following way:

```js
jest.mock('path/to/selector', () => {
  const { mockSelector } = jest.requireActual('saga-tester');
  return mockSelector('someSelector');
});
jest.mock('path/to/generator', () => {
  const { mockGenerator } = jest.requireActual('saga-tester');
  return mockGenerator(jest.requireActual('path/to/generator'));
});

const result = new SagaTester(mySaga, {
  selectorConfig: { someSelector: 'baz', reducerKey: 'reducerValue' },
  expectedCalls: [
    { name: 'someMethod', times: 1, params: ['foo'], output: 'bar' },
    { name: 'someGenerator', times: 1, params: ['baz'], output: 'brak' },
  ],
  expectedActions: [{ action: someAction('bar', 'reducerValue'), times: 1 }],
  effectiveActions: [{ type: 'someType', value: 'someValue' }],
}).run('foo'); // If the config is not respected, a detailed error is thrown here!
expect(result).toEqual({ generatorResult: 'brak', takeValue: 'someValue' });
```

## config.selectorConfig
`selectorConfig`: `Object` that acts as the redux store.

Additionally, you can mock a selector using mockSelector, and its ID in the selectorConfig will give its value.

To avoid bad configs, if a real selector returns undefined, the saga will fail.

If you want a selector to return an undefined value without failing, set `config.options.passOnUndefinedSelector` to true.

## config.expectedActions

`expectedActions`: `Array` where each element is an action matcher (dispatched with 'put')
Each element of the array is a tuple of `times`, `strict`, `action` or `type` (only one of `action` and `type` must be provided).
For instance, if `someAction` is called twice, once as `someAction('abc')` and once as `someAction(42, 42)`,
and if `doOtherAction` of type 'TYPE' is called with unknown parameters, an appropriate config is:

```js
[{ times: 1, action: someAction('abc') }, { action: someAction(42, 42) }, { type: 'TYPE' }]
```

Note that if `times` is not provided, an error is thrown if the method is never called.

The `strict` flag causes an error to be thrown the moment a non-matching action with a same type is dispatched.
It is `true` by default. Setting it to `false` will ignore similar actions with non-matching parameters.
 
## config.expectedCalls

`expectedCalls`: `Array` where each object has a `name` property being the name of received method (dispatched with `call`, `fork` or `spawn` -- note that the `retry` effect is treated as a `call`).

E.g. if `someCall` is called once with `call(someCall, 'abc')` and expected output 'asd', and once with `call(someCall, 42, 42)`:

```js
expectedCalls: [
  { name: 'someCall', times: 1, params: ['abc'], output: 'asd' },
  { name: 'someCall', params: [42, 42] },
],
```

If `times` is not provided, it acts as "at least once", i.e. an error is thrown if the method is never called.

- `output` is the mocked result of the call.
- `throw` is similar to output, except the value of `throw` is thrown. Useful to simulate errors.
- `call`, if "true" means that the method is actually called (and if it is a generator, it is run), and the result of the generator becomes its output.
- `wait` is `false` by default, meaning it will be run immediately. If the value is a `number` or `true`, it will create a pseudo-task that is only ran after some time (see Concurrent behavior).

Only one of `output`, `throw` or `call: true` should ever be provided.

### Mocking generators

Generally, `generators` will work seamlessly with SagaTester. However, there is an edge case: if they are yielded. Yielding a generator means SagaTester receives a nameless generator method, which it cannot match against the `name` property. The `mockGenerator` provides the ability to inject the name inside the generator, allowing it to be matched by SagaTester.

Using `mockGenerator` is unnecessary if the generator is called inside a `call`, `fork` or `spawn` effect, since the effect receives the named function and not a running generator object.

The recommended ways of mocking a generator is by forwarding the entire module in `mockGenerator`, which can receive:

- an object (all properties that are generator methods are wrapped with metadata that sagaTester recognizes)
- a direct generator method (wrapped with metadata that sagaTester recognizes)
- a string (recommended only if you want to force a new name on your generator for sagaTester to detect; this mock is empty and should never be called with `call: true`).

Example of `mockGenerator`:

```js
jest.mock('path/to/generator', () => {
  const { mockGenerator } = jest.requireActual('saga-tester');
  return mockGenerator(jest.requireActual('path/to/generator'));
});

...
// path/to/generator.js :
export { generator1, generator2, notAGenerator }; // <= notAGenerator will not be mocked
...
// your test:

new SagaTester(saga, {
  expectedCalls: [
    { name: 'generator1', params: ['foo'] },
    { name: 'generator2', params: ['bar'] },
  ],
}).run();
```

## config.effectiveActions

`effectiveActions`: `Action[]` Indicating which actions are "active" in the context of `take`, `takeEvery`, `takeLatest`, `takeLeading`, `debounce`, `throttle` effects. By default, if `effectiveActions` is not specified, the first argument of the "run" method is considered to be a contextual action.

Each time an effect "consumes" an `effectiveActions`, it is removed from the list. If an effect finds no match in `effectiveActions`, normal concurrent behavior happens.

## Partial param matching

When providing a `params` array to match, you can use `PLACEHOLDER_ARGS` to specify a logic for matching different from equality.

```js
import { PLACEHOLDER_ARGS } from 'saga-tester';
...
  expectedCalls: [{ name: 'foo', times: 1, params: [PLACEHOLDER_ARGS.ANY, PLACEHOLDER_ARGS.TASK, PLACEHOLDER_ARGS.TYPE('number')] }],
```

- `PLACEHOLDER_ARGS.ANY` inside a `params` array to indicate an argument that is not important.
- `PLACEHOLDER_ARGS.TASK` inside a `params` array to indicate a task object of any content.
- `PLACEHOLDER_ARGS.TYPE(type)` inside a `params` array to indicate a value of `typeof type`.
- `PLACEHOLDER_ARGS.FN((value) => boolean)` inside a `params` array to indicate a value for which the method returns true.

## Concurrent behavior

SagaTester can simulate concurrently executing tasks, and these tasks can be made to execute after a certain pseudo-delay, which can cause them to execute in a specific order, which can be useful to test code which, for instance, needs one task to finish first, or for a cancellation to happen mid-execution.

The pseudo-delay of `call`, `fork`, or `spawn` effects can be configured using `expectedCalls[-].wait`:

- If `wait` is falsey, the work will be ran immediately.
- If it is a `number`, it will wait that given number (it is a pseudo-delay, meaning the test does not actually wait; the number dictates in which order to run the tasks).
- If it is `true`, it will be ran only when all other tasks which can be run have ran.
- All pending work with identical `wait` are ran simultaneously.

The supported saga effects simulate `redux-saga` behavior, meaning that:

- A task will wait for a `join` to resolve,
- A task will wait for `fork`'ed tasks to finish before resolving, but not `spawn`'ed tasks.
- Cancellation will spread to the children.
- Unhandled errors will bubble up from the children to the parents, and cause siblings to be cancelled if the parent cannot handle the error.
- `all` will await all of its children.
- `race` resolves when one of its children completes, and cancels all of the losers.
- `delay(time)` acts as a task with `wait: time`.
- When multiple tasks are blocked, the fastest task (lowest `wait`) is ran.
- A task will block after a `take` effect, unblocking only when the right action is dispatched.
- A higher effect method like `takeLeading`, `takeLatest`, `takeEvery`, `debounce` and `throttle` will create new tasks when matching actions, in the manner specified in the redux-saga api (see tests for examples).

## Handling promises

To correctly handle promises, which includes yielded promises, `call` containing promises, or async redux-thunk-style actions with promises, you must use `runAsync` instead of `run`. You can see examples in the `reduxThunkActions` tests.

SagaTester will fail if the promises remain unresolved while nothing else is happening (it will interpret it as a deadlock). You should consider mocking your promises or mocking the relevant setTimeouts.

## Handling setTimeout

To handle setTimeout correctly, you will need to mock timers and to run them using `side effects` (see below). There is no built-in way to mock timers, but most javascript unit test libraries offer ways to do it. `reduxThunkActions` tests have examples of timers mocked using the `jest` library.

## config.sideEffects

Side effects are an advanced element of SagaTester which are useful to test awkward cases like infinite loops, where you may want to test a case of a loop running once, but without causing your test to loop infinitely itself.

Side effects are a way to act "as if" there were additional things going on outside of the tested saga, and can include:

- `{ wait?: number | boolean, effect: put(someAction) }`
- `{ wait?: number | boolean, effect: fork(someGeneratorFunction) }`
- `{ wait?: number | boolean, effect: spawn(someGeneratorFunction) }`
- `{ wait?: number | boolean, effect: call(someMethod) }` - useful to run timers
- `{ wait?: number | boolean, effect: cancel() }` - this will cancel the main saga specifically
- `{ wait?: number | boolean, changeSelectorConfig: (prevSelectorConfig) => newSelectorConfig }` - alters `config.selectorConfig` for the rest of the run

Side effects do not register in `config.expectedActions` or `config.expectedCalls` and therefore cannot fail your test.

For examples, you can check the sideEffects tests.

## config.options

These offer additional hooks to modify how sagaTester runs.

- `config.options.stepLimit`, default: `1000`. When sagaTester has ran for this many steps, it fails. This helps detect infinite loops.
- `config.options.usePriorityConcurrency`, default: `false`. If `false`, when e.g. `task1.wait = 40` runs while `task2.wait = 60` is pending, `task2` will be lowered to `wait = 20` (60 - 40 = 20). If `usePriorityConcurrency` is `true`, task timers are not lowered, and instead act like priority weights.
- `config.options.waitForSpawned`, default: `false`. If `false`, a spawned task will only resolve if it is fast enough to run during the execution of the parent saga. If `true`, each spawned task is awaited when the parent saga finishes, and sagaTester only completes when all spawned tasks have resolved.
- `config.options.executeTakeGeneratorsOnlyOnce`, default: `false`.
  - If `true`, effects `debounce`, `throttle`, `takeEvery`, `takeLeading` and `takeLatest` will only ever be executed once.
  - By default, these effects will create as many tasks as would be created in a normal saga execution.
- `config.options.ignoreTakeGenerators: pattern`, default: empty. Any action matched by the pattern (which can be a list, just like in the redux-saga api) will not trigger any take generators.
- `config.options.swallowSpawnErrors`, default: `false`. If `true`, ignores errors thrown by `spawn`'ed tasks to prevent interrupting sagaTester.
- `config.options.reduxThunkOptions`, default: `{}`. Passed as a third parameter to redux-thunk function actions.
- `config.options.passOnUndefinedSelector`, default: `false`. If `false`, when a selector returns undefined, SagaTester fails, reminding the user to configure it. 
- `config.options.failOnUnconfigured`, default: `true`. If `true`, a `spawn`, `fork`, `call` or yielded generator, which has a `name` which does not match any entry in `config.expectedCalls` will cause SagaTester to fail. If `false`, it will default to `{ call: true, wait: false }`. Note that if an entry's `name` property matches but not arguments do not, SagaTester will fail regardless of this option, as it is likely an error the user must be informed about.

### Debugging

The `config` of the tester can contain a property `debug` which has options determining what to log.

- `unblock` will log when executing the top priority call.
- `bubble` will log when a task is finished and it needs to be "bubbled" up the dependency tree, possibly unblocking other tasks which depended on it.
- `interrupt` will log when a task cannot be run immediately by the tester. This step can be noisy due to SagaTester needing to trigger context shifts for the sake of correct-order execution.

The value of each debug property can be: `true`, `false`, a `number` representing the task id (which depends on the order in which it was created - this order is deterministic, so it will always be the same), a `string` representing the name or method associated with the task, or a list of `string` or `number` if several tasks are to be monitored. Example:

```js
new SagaTester(saga, { debug: { bubble: ['foo', 3], unblock: true } }).run();
```

## Roadmap

### State of the library

SagaTester was designed to be detached from as many dependencies as possible.
The need for maintenance in this library is not large, including `pretty-format`, `jest-diff`, `lodash.isequal`
and indirectly (via matching string literals and api-mock-up), `redux-saga` and `reselect`.

### Possible future features 

Not all `redux-saga` features are supported. See [todo.md](todo.md)

Other ideas not in the todo list:

Mocking generators must be made manually by wrapping the generators inside mockGenerator; there is currently no other way of naming the resulting generator method. A babel plugin could be made to run on all relevant javascript, wrapping all exports of generator methods inside mockGenerator... If anyone ever codes this, that would be nice, although it should be opt-in (adding a generic import to the test file) so as not to pollute non-saga tests.

That said, uncalled generators (like `call(someGenerator, someArg)`, or `fork(someGenerator, someArg)`) are named since we are passing the method and not the generator created by the method. This means mocking generators is ONLY useful if they are yielded (not including `yield*`) and ONLY if the user wishes to intercept the call (but if so, the user can just use `call`). Meaning the use case is very niche. What it would benefit is a slightly less confusing experience to inexperienced users.

