# @vijah/saga-tester

A tester library for redux-saga, offering the following features:

- Is order-independent (changing yield order does not break the test, making your tests less fragile).
- Handles the following redux-saga/effects: put, putResolve, select, call, apply, all, race, retry, take, takeLatest, takeEvery, takeLeading, throttle, debounce, fork, delay, cancel, cancelled, join.
- Runs the entire generator method from start to finish with one holistic config.
- Is indirectly a generator function tester.

It has the following limitations:

- Does not handle concurrent executions or concurrent logic.
- Does not handle channels and other advanced saga features to handle complex concurrent behavior.

## Package usage

### API

```js
new SagaTester(saga, config, shouldAssert).run(parameters);
```

### Example

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
  expectedCalls: { someMethod: [{ times: 1, params: ['foo'], output: 'bar' }] },
  expectedGenerators: { someGenerator: [{ times: 1, params: ['baz'], output: 'brak' }] },
  expectedActions: [{ action: someAction('bar', 'reducerValue'), times: 1 }],
  effectiveActions: [{ type: 'someType', value: 'someValue' }],
}).run('foo'); // If the config is not respected, a detailed error is thrown here!
expect(result).toEqual({ generatorResult: 'brak', takeValue: 'someValue' });
```

(This test is replicated in the unit tests as the README TEST)

### config.selectorConfig
`selectorConfig`: `Object` that acts as the redux store.

Additionally, you can mock a selector using mockSelector, and its ID in the selectorConfig will give its value.

To avoid bad configs, if a real selector returns undefined, the saga will fail.
If you want a selector to return an undefined value without failing, provide
`selectorConfig: { __passOnUndefined: true }`

### config.expectedActions

`expectedActions`: `Array` where each element is an action matcher (dispatched with 'put')
Each element of the array is a tuple of `times`, `strict`, `action` or `type` (only one of `action` and `type` must be provided).
For instance, if `someAction` is called twice, once as `someAction('abc')` and once as `someAction(42, 42)`,
and if `doOtherAction` of type 'TYPE' is called with unknown parameters, an appropriate config is:

```js
[{ times: 1, action: someAction('abc') }, { action: someAction(42, 42) }, { type: 'TYPE' }]
```

Note that if `times` is not provided, an error is thrown if the method is never called.

The `strict` flag causes an error to be thrown the moment a non-matching call to a same-typed
action is encountered. It is true by default. Setting it to false will ignore similar actions with non-matching parameters.
 
### config.expectedCalls

`expectedCalls`: `Object` where each key is an async method (dispatched with `call` -- note that the `retry` effect is treated as a `call`).
Each value is an array of objects containing `times`, `params`, `throw`, `output` and `call` (all optional). For instance,
if `someCall` is called once with `call(someCall, 'abc')` and expected output 'asd', and once with `call(someCall, 42, 42)`,
an appropriate config is:

```js
{ someCall: [{ times: 1, params: ['abc'], output: 'asd' }, { params: [42, 42] }] }
```

Note that if `times` is not provided, it acts as "at least once" an error is thrown if the method is never called.

- `output` is the mocked result of the call.
- `throw` is similar to output, except the value of `throw` is thrown. Useful to simulate errors.
- `call`, if "true" means that the method is actually called (and if it is a generator, it is run), and the result of the generator becomes its output.

Only one of `output`, `throw` or `call: true` should ever be provided.

### config.expectedGenerators

`expectedGenerators`: `Object` where each key is the ID of a mocked generator (use mockGenerator).
Each value is an array of objects containing `times`, `params`, `throw`, `call` and `output` (all optional).

If a `fork` verb is yielded, it counts as a generator call (and is executed synchronously inside the test).

A generator is called during its execution if:

- It is called by a `call` verb, and the corresponding expectedCalls is set to `call: true`.
- It is not mocked by mockGenerator.
- It is yielded by `yield*`.
- It is mocked, yielded directly by a `yield` and the corresponding expectedGenerator is set to `call: true`.

The recommended ways of mocking a generator is by forwarding the entire module in `mockGenerator`, which can receive:

- an object (all properties that are generator methods are wrapped with metadata that sagaTester recognizes)
- a direct generator method (wrapped with metadata that sagaTester recognizes)
- a string (recommended only if you want to force a new name on your generator for sagaTester to detect; this mock is empty and should never be called with `call: true`).

Example of `mockGenerator`

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
  expectedGenerators: {
    generator1: [{ times: 1, params: ['foo'] }],
    generator2: [{ times: 1, params: ['bar'] }],
  },
}).run();
```

Note that if `times` is not provided, it acts as "at least once" and an error is thrown if it is never called.

- `output` is the mocked result of the call.
- `throw` is similar to output, except the value of `throw` is thrown. Useful to simulate errors.
- `call`, if "true" means that the method is actually called (and if it is a generator, it is run), and the result of the generator becomes its output.

Only one of `output`, `throw` or `call: true` should ever be provided.

### config.effectiveActions

`effectiveActions`: `Action[]` Indicating which actions are "active" in the context of take/takeEvery/takeLatest/takeLeading/debounce/throttle effects.
Note that by default, if this is not specified, the first argument of the "run" method is considered to be a contextual action,
unless the first argument is not an action.

### Partial param matching

When providing a `params` array to match, you can use `PLACEHOLDER_ARGS` to specify a logic for matching different from equality.

```js
import { PLACEHOLDER_ARGS } from 'saga-tester';
...
  expectedCalls: { foo: [{ times: 1, params: [PLACEHOLDER_ARGS.ANY, PLACEHOLDER_ARGS.TASK, PLACEHOLDER_ARGS.TYPE('number')] }] },
```

- `PLACEHOLDER_ARGS.ANY` inside a `params` array to indicate an argument that is not important.
- `PLACEHOLDER_ARGS.TASK` inside a `params` array to indicate a task object of any content.
- `PLACEHOLDER_ARGS.TYPE(type)` inside a `params` array to indicate a value of `typeof type`.
- `PLACEHOLDER_ARGS.FN((value) => boolean)` inside a `params` array to indicate a value for which the method returns true.

### Run without failing

In rare cases, you might want to run the saga without causing failures.
It is possible to do this by providing a third parameter, e.g.

```js
const tester = new SagaTester(saga, config, false); // <= assert false
tester.run(action);
expect(tester.returnValue).toBe('something');
expect(tester.errorList.length).toBe(0);
```

## Concurrent execution

While SagaTester seeks to be order-independent, certain features are provided to facilitate certain simple out-of-order behavior.

These features are specific to `fork` effects. These effects create a pseudo-task during execution, and this pseudo-task is executed either immediately, when it is joined, or after a given amount of `yield` steps (`yield*` does not count). In order to defer execution, you must:

- Mock the generator using `mockGenerator`
- Configure `expectedGenerators` with the property `wait`; (`false` means instantaneous execution, `true` means wait until `join`, and a `number` means wait under a given amount of steps).

Delaying the execution of `fork`ed tasks allows testing the behavior of sub-tasks which are, for instance, `cancel`led by the parent or itself. This allows support of `cancel` and `cancelled` effects.

Furthermore, when inside a `join` containing a list of tasks, or within a `race` or `all` containing multiple joins, the pseudo-tasks are set to finish in the configured order. This also works for tasks which are forked inside another `fork` or a `call`. `delay` effects behaves like a pseudo-task set to wait for that amount.

A current limitation is that `debounce`, `takeLatest`, `takeEvery`, `takeLeading` and `throttle` do not behave concurrently; they will merely be executed instantly if a matching action is found.

Example from the unit tests (using `options.yieldDecreasesTimer`):

```js
it('should treat fork as if creating a task with the given output, deferring its execution, and handling cancellation status', () => {
  let executionOrder = 0;
  function* method(arg) {
    executionOrder += 1;
    return `${arg}-executed-${executionOrder}`;
  }
  const mockMethod = mockGenerator(method);

  function* saga() {
    const task1 = yield fork(mockMethod, 'arg1');
    const task2 = yield fork(mockMethod, 'arg2');
    const task3 = yield fork(mockMethod, 'arg3');
    const task4 = yield fork(mockMethod, 'arg4');
    return yield join([task1, task2, task3, task4]);
  }

  expect(new SagaTester(saga, {
    expectedGenerators: {
      method: [
        { params: ['arg1'], call: true, wait: 1 },
        { params: ['arg2'], call: true },
        { params: ['arg3'], call: true, wait: 99 },
        { params: ['arg4'], call: true, wait: 50 },
      ],
    },
    options: { yieldDecreasesTimer: true },
  }).run()).toEqual([
    'arg1-executed-2', // Delayed by one; executed after task2
    'arg2-executed-1', // wait is false by default; executed instantly
    'arg3-executed-4', // Terminated by joint, but after task 3 because wait is higher
    'arg4-executed-3',
  ]);
});
```

## Debugging

The `config` of the tester can contain a property `debug` which has options determining what to log.

- `unblock` will log when executing the top priority call.
- `bubble` will log when a task is finished and it needs to be "bubbled up" the dependency tree to run other tasks which depended on it.
- `interrupt` will log when a task cannot be run immediately by the tester.

The value of each debug property can be: `true`, `false`, a `number` representing the task id (which depends on the order in which it was created - this order is deterministic, so it will always be the same), a `string` representing the name or method associated with the task, or a list of `string` or `number` if several tasks are to be monitored.

## Roadmap

### State of the library

SagaTester was designed to be detached from as many dependencies as possible.
The need for maintenance in this library is not large, including `pretty-format`, `jest-diff`, `lodash.isequal`
and indirectly (via matching string literals), `redux-saga` and `reselect`.

Tthe package is simple and should be able to adjust to external changes.
The package is expected to remain in ES6 since it is a strictly test-side library.

### Possible future features 

Not all `redux-saga` features are supported. See [todo.md](todo.md)

Other ideas not in the todo list:

Mocking generators must be made manually by wrapping the generators inside mockGenerator; there is currently no other way of naming the resulting generator method. A babel plugin could be made to run on all relevant javascript, wrapping all exports of generator methods inside mockGenerator... If anyone ever codes this, that would be nice, although it should be opt-in (adding a generic import to the test file) so as not to pollute non-saga tests.

That said, uncalled generators (like `call(someGenerator, someArg)`, or `fork(someGenerator, someArg)`) are named since we are passing the method and not the generator created by the method. This means mocking generators is ONLY useful if they are yielded (not including `yield*`) and ONLY if the user wishes to intercept the call (but if so, the user can just use `call`). Meaning the use case is very niche. What it would benefit is a slightly less confusing experience to inexperienced users.

