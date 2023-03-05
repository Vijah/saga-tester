# @vijah/saga-tester

A tester library for redux-saga, offering the following features:

- Is order-independent (changing yield order does not break the test, making your tests less fragile).
- Handles the following redux-saga/effects: put, select, call, take, all, race, retry, fork, takeLatest, takeEvery, takeLeading, throttle and debounce.
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

### Run without failing

In rare cases, you might want to run the saga without causing failures.
It is possible to do this by providing a third parameter, e.g.

```js
const tester = new SagaTester(saga, config, false); // <= assert false
tester.run(action);
expect(tester.returnValue).toBe('something');
expect(tester.errorList.length).toBe(0);
```
 
## Roadmap

### State of the library

SagaTester was developed and used in private, and needs were met under these circumstances.

SagaTester was designed to be detached from as many dependencies as possible.
The need for maintenance in this library is not large, including `pretty-format`, `jest-diff`, `lodash.isequal`
and indirectly (and loosely), `redux-saga` and `reselect`.

While maintenance is not expected to be required, the package is simple and should be able to adjust.
That said, the package is expected to remain in ES6, since it is a strictly test-side library.

### Possible future features 

Mocking generators must be made manually by wrapping the generators inside mockGenerator; there is currently no other way of naming the resulting generator method. A babel plugin could be made to run on all relevant javascript, wrapping all exports of generator methods inside mockGenerator... If anyone ever codes this, that would be nice, although it should be opt-in (adding a generic import to the test file) so as not to pollute non-saga tests.

It might be worth looking at the possibility to mock channels and other advanced saga methods, although it seems unlikely that it will be possible to use sagaTester to test actual concurrent behavior.

