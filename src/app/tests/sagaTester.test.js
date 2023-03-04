import {
  takeLatest,
  takeLeading,
  takeEvery,
  take,
  put,
  select,
  call,
  all,
  race,
  debounce,
  throttle,
  fork,
} from 'redux-saga/effects';
import { createSelector } from 'reselect';

import {
  mockSelector,
  mockGenerator,
  SagaTester,
  triggerSagaWithAction,
  diffTwoObjects,
} from '..';

describe('triggerSagaWithAction', () => {
  it('should trigger the given action in a saga object', () => {
    const theMock = jest.fn();
    const fakeSaga = function* defaultSaga() {
      yield takeLatest('THE TYPE', theMock);
    };
    expect(() => triggerSagaWithAction(fakeSaga(), { type: 'NOTHING INTERESTING' })).toThrow();
    expect(theMock).not.toHaveBeenCalled();
    triggerSagaWithAction(fakeSaga(), { type: 'THE TYPE' });
    expect(theMock).toHaveBeenCalledWith({ type: 'THE TYPE' });
  });
  it('should trigger the given action in a saga object (*)', () => {
    const theMock = jest.fn();
    const fakeSaga = function* defaultSaga() {
      yield takeLatest('*', theMock);
    };
    triggerSagaWithAction(fakeSaga(), { type: '*' });
    expect(theMock).toHaveBeenCalledWith({ type: '*' });
  });
});

describe('SagaTester', () => {
  describe('README TEST', () => {
    it('should work as documented', () => {
      const someMethod = () => {};
      const someAction = (a, b) => ({ type: 'someType', a, b });
      const actualSelector = () => createSelector((state) => state.reducerKey, (stateData) => stateData);

      function* saga(param) {
        const callResult = yield call(someMethod, param);
        const actualSelectorResult = yield select(actualSelector());
        yield put(someAction(callResult, actualSelectorResult));
        const selectorResult = yield select(mockSelector('someSelector')());
        const generatorResult = yield mockGenerator('someGenerator')(selectorResult);
        const takeResult = yield take('someType');
        return { generatorResult, takeValue: takeResult.value };
      }

      expect(
        new SagaTester(saga, {
          selectorConfig: { someSelector: 'baz', reducerKey: 'reducerValue' },
          expectedCalls: { someMethod: [{ times: 1, params: ['foo'], output: 'bar' }] },
          expectedGenerators: { someGenerator: [{ times: 1, params: ['baz'], output: 'brak' }] },
          expectedActions: [{ action: someAction('bar', 'reducerValue'), times: 1 }],
          effectiveActions: [{ type: 'someType', value: 'someValue' }],
        }).run('foo'),
      ).toEqual({ generatorResult: 'brak', takeValue: 'someValue' });
    });
  });

  describe('core', () => {
    it('should execute empty saga correctly with an action', () => {
      const action = { type: 'TYPE' };
      const mock = jest.fn(function* irrelevant() { 'doNothing'; });
      function* saga() { yield takeLatest('TYPE', mock); }

      new SagaTester(saga).run(action);

      expect(mock).toHaveBeenCalledWith(action);
    });
    it('should execute empty saga correctly with a generator', () => {
      function* fakeGenerator(arg1, arg2) {
        yield put({ type: 'AWESOME', arg1, arg2 });
      }
      const config = { expectedActions: [{ times: 1, action: { type: 'AWESOME', arg1: { value: 'arg1' }, arg2: 'arg2' } }] };

      new SagaTester(fakeGenerator, config).run({ value: 'arg1' }, 'arg2');
    });
    it('should throw if the configuration object is invalid', () => {
      const saga = function* irrelevant() { 'doNothing'; };
      expect(() => new SagaTester({}, {})).toThrow('The generator method received is invalid. It must be a reference to a generator method, and it cannot be a running generator.');
      expect(() => new SagaTester(saga(), {})).toThrow('The generator method received is invalid. It must be a reference to a generator method, and it cannot be a running generator.');
      expect(() => new SagaTester(saga, { expectedActions: {} })).toThrow('expectedActions must be an array of object containing either an attribute "type" or "action"');
      expect(() => new SagaTester(saga, { expectedActions: [{}] })).toThrow('expectedActions must be an array of object containing either an attribute "type" or "action"');
      expect(() => new SagaTester(saga, { effectiveActions: {} })).toThrow('effectiveActions must be an array of object containing either an attribute "type" or "action"');
      expect(() => new SagaTester(saga, { effectiveActions: [{}] })).toThrow('effectiveActions must be an array of object containing either an attribute "type" or "action"');
      expect(() => new SagaTester(saga, { selectorConfig: [] })).toThrow('selectorConfig must be an object containing values');
      expect(() => new SagaTester(saga, { expectedCalls: [] })).toThrow('expectedCalls must be an object containing arrays');
      expect(() => new SagaTester(saga, { expectedCalls: { asd: {} } })).toThrow('expectedCalls must be an object containing arrays');
      expect(() => new SagaTester(saga, { expectedGenerators: [] })).toThrow('expectedGenerators must be an object containing arrays');
      expect(() => new SagaTester(saga, { expectedGenerators: { asd: {} } })).toThrow('expectedGenerators must be an object containing arrays');

      function* sagaWithTakeLatest() { yield takeLatest('TYPE', saga); }
      expect(() => new SagaTester(sagaWithTakeLatest, {}).run()).toThrow('Error in the configuration of SagaTester: Found a takeLatest action, but no actions in the context of the saga. Either pass an action as the only parameter to your saga or define effectiveActions in your configs.');
      function* sagaWithTakeEvery() { yield takeEvery('TYPE', saga); }
      expect(() => new SagaTester(sagaWithTakeEvery, {}).run()).toThrow('Error in the configuration of SagaTester: Found a takeEvery action, but no actions in the context of the saga. Either pass an action as the only parameter to your saga or define effectiveActions in your configs.');
      function* sagaWithTakeLeading() { yield takeLeading('TYPE', saga); }
      expect(() => new SagaTester(sagaWithTakeLeading, {}).run()).toThrow('Error in the configuration of SagaTester: Found a takeLeading action, but no actions in the context of the saga. Either pass an action as the only parameter to your saga or define effectiveActions in your configs.');

      function* sagaWithTake() { yield take('TYPE'); }
      expect(() => new SagaTester(sagaWithTake, {}).run()).toThrow('Error in the configuration of SagaTester: Found a take action, but no actions in the context of the saga. Either pass an action as the only parameter to your saga or define effectiveActions in your configs.');
      expect(() => new SagaTester(sagaWithTake, {}).run({ type: 'NO' })).toThrow('Error in the configuration of SagaTester: Found a take action looking for an action of type TYPE, but no such effectiveAction exists. Add this action in the effectiveActions config to solve this issue.');
    });
  });

  describe('handle technical verbs', () => {
    it('should handle the takeLatest verb (with array of types as matchers and an action passed as first param)', () => {
      const action = { type: 'TYPE' };
      const mockCall = jest.fn();
      function* sagaMethod(theAction) { mockCall(theAction); }
      function* saga() { yield takeLatest(['NO', 'TYPE'], sagaMethod); }

      new SagaTester(saga).run(action);
      expect(mockCall).toHaveBeenCalledWith(action);
    });
    it('should handle the takeLeading verb (with array of types as matchers and an action passed as first param)', () => {
      const action = { type: 'TYPE' };
      const mockCall = jest.fn();
      function* sagaMethod(theAction) { mockCall(theAction); }
      function* saga() { yield takeLeading(['NO', 'TYPE'], sagaMethod); }

      new SagaTester(saga).run(action);
      expect(mockCall).toHaveBeenCalledWith(action);
    });
    it('should handle the takeEvery verb (with wildcard type and action passed as effectiveAction)', () => {
      const action = { type: 'TYPE' };
      const mockCall = jest.fn();
      const sagaMethod = function* method(theAction) { mockCall(theAction); };
      function* saga() {
        yield takeEvery('*', sagaMethod);
      }

      new SagaTester(saga, { effectiveActions: [action] }).run();
      expect(mockCall).toHaveBeenCalledWith(action);
    });
    it('should handle the all verb (input is an array)', () => {
      // Setup mock methods
      const method1 = () => {};
      const method2 = () => {};
      const mockCall = jest.fn();

      // Saga method for test
      function* sagaMethod() {
        const result = yield all([
          call(method1, 'arg1'),
          call(method2, 'arg2'),
        ]);

        mockCall(result);
      }

      // Saga Tester config
      const config = {
        expectedCalls: { method1: [{ times: 1, params: ['arg1'], output: 'arg1' }], method2: [{ times: 1, params: ['arg2'], output: 'arg2' }] },
      };

      // Run the saga
      new SagaTester(sagaMethod, config).run();
      expect(mockCall).toHaveBeenCalledWith(['arg1', 'arg2']);
    });
    it('should handle the race verb (input is an object)', () => {
      // Setup mock methods
      const method1 = () => {};
      const method2 = () => {};
      const mockCall = jest.fn();

      // Saga method for test
      function* sagaMethod() {
        const result = yield race({
          result1: call(method1, 'arg1'),
          result2: call(method2, 'arg2'),
          result3: take('*'),
          result4: take('TYPE'),
          result5: take(['HUH', 'TYPE']),
        });

        mockCall(result);
      }

      // Saga Tester config
      const effectiveAction = { type: 'TYPE' };
      const config = {
        expectedCalls: { method1: [{ times: 1, params: ['arg1'], output: 'arg1' }], method2: [{ times: 1, params: ['arg2'], output: 'arg2' }] },
        effectiveActions: [effectiveAction],
      };

      // Run the saga
      new SagaTester(sagaMethod, config).run();
      expect(mockCall).toHaveBeenCalledWith({
        result1: 'arg1',
        result2: 'arg2',
        result3: effectiveAction,
        result4: effectiveAction,
        result5: effectiveAction,
      });
    });
    it('should handle the race verb and also not fail when certain take elements are not provided in the context', () => {
      // Setup mock methods
      const mockCall = jest.fn();
      const method = () => 'stuff';

      // Saga method for test
      function* sagaMethod() {
        const result = yield race({
          result1: takeLatest('TYPE', method),
          result2: take('TYPE 2'),
          result3: call(method),
        });

        mockCall(result);
      }

      // Saga Tester config
      const config = {
        expectedCalls: { method: [{ output: 'stuff' }] },
        effectiveActions: [],
      };

      // Run the saga
      new SagaTester(sagaMethod, config).run();
      expect(mockCall).toHaveBeenCalledWith({
        result1: undefined,
        result2: undefined,
        result3: 'stuff',
      });
    });
    it('should handle a "call" configured call inside a race, for generator methods and normal methods', () => {
      // Setup mock methods
      const method1 = (x) => x;
      function* method2(arg) { return yield call(method1, arg); }
      const mockCall = jest.fn();

      // Saga method for test
      function* sagaMethod() {
        const result = yield race({
          result1: call(method1, 'arg1'),
          result2: call(method2, 'arg2'),
        });

        mockCall(result);
      }

      // Saga Tester config
      const config = {
        expectedCalls: {
          method1: [{ times: 1, params: ['arg1'], call: true }, { times: 1, params: ['arg2'], call: true }],
          method2: [{ times: 1, params: ['arg2'], call: true }],
        },
      };

      // Run the saga
      new SagaTester(sagaMethod, config).run();
      expect(mockCall).toHaveBeenCalledWith({
        result1: 'arg1',
        result2: 'arg2',
      });
    });
    it('should handle the debounce verb by treating it like a take verb', () => {
      // Saga method for test
      function* method() {
        yield put({ type: 'TYPE1' });
      }

      function* method2() {
        yield put({ type: 'TYPE2' });
      }

      function* debouncedCall() {
        yield takeLatest('TYPE', method2);
        yield debounce(1500, 'actionType', method);
      }

      // Saga Tester config
      const config = {
        expectedActions: [
          { type: 'TYPE1' },
          { type: 'TYPE2' },
        ],
        effectiveActions: [{ type: 'actionType' }, { type: 'TYPE' }],
      };

      // Run the saga
      new SagaTester(debouncedCall, config).run();
    });
    it('should handle the throttle verb by treating it like a take verb', () => {
      // Saga method for test
      function* method() {
        yield put({ type: 'TYPE1' });
      }

      function* method2() {
        yield put({ type: 'TYPE2' });
      }

      function* throttledCall() {
        yield takeLatest('TYPE', method2);
        yield throttle(1500, 'actionType', method);
      }

      // Saga Tester config
      const config = {
        expectedActions: [
          { type: 'TYPE1' },
          { type: 'TYPE2' },
        ],
        effectiveActions: [{ type: 'actionType' }, { type: 'TYPE' }],
      };

      // Run the saga
      new SagaTester(throttledCall, config).run();
    });
    it('should handle the fork verb like a generator call', () => {
      // Saga method for test
      const method1 = mockGenerator('method1');

      function* method2(arg) {
        yield put({ type: 'TYPE2', arg });
      }

      function* saga() {
        yield fork(method1, 'arg1');
        yield fork(method2, 'arg2');
      }

      // Saga Tester config
      const config = {
        expectedActions: [
          { type: 'TYPE1', times: 0 },
          { action: { type: 'TYPE2', arg: 'arg2' }, times: 1 },
        ],
        expectedGenerators: {
          method1: [{ times: 1, params: ['arg1'] }],
        },
      };

      // Run the saga
      new SagaTester(saga, config).run();
    });
  });

  describe('handling selectors', () => {
    it('should handle configured selectors', () => {
      // Setup actions and selectors
      const action = { type: 'TYPE' };
      const selector1 = mockSelector('selector1');
      const selector2 = mockSelector('selector2');

      // Saga method for test
      function* method() {
        const value1 = yield select(selector1());
        expect(value1).toEqual('someValue');
        const value2 = yield select(selector2());
        expect(value2).toEqual('someOtherValue');
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        selectorConfig: { selector1: 'someValue', selector2: 'someOtherValue' },
      };

      // Run the saga
      new SagaTester(saga, config).run(action);
    });
    it('should handle direct selectors by providing the whole selectorConfig as the redux store', () => {
      // Setup actions and selectors
      const action = { type: 'TYPE' };
      const selector0 = mockSelector('mockedSelector');
      const selector1 = () => createSelector((s) => s.reducerKey, (s) => s.field);
      const selector2 = () => createSelector([(s) => s.a, (s) => s.b, (s) => s.c], (a, b, c) => a + b + c);
      const selector3 = () => createSelector((s) => s.d, (s) => s.e, (d, e) => d + e);
      const selector4 = (arg) => createSelector((s) => s.f, () => arg, (f, other) => f + other);

      // Saga method for test
      function* saga() {
        const result0 = yield select(selector0());
        const result1 = yield select(selector1());
        const result2 = yield select(selector2());
        const result3 = yield select(selector3());
        const result4 = yield select(selector4(1000000));
        return { result0, result1, result2, result3, result4 };
      }

      // Run the saga
      const result = new SagaTester(saga, {
        selectorConfig: {
          mockedSelector: 'mockValue',
          reducerKey: { field: 'reducer-field-value' },
          a: 1,
          b: 10,
          c: 100,
          d: 1000,
          e: 10000,
          f: 100000,
        },
      }).run(action);
      expect(result).toEqual({ result0: 'mockValue', result1: 'reducer-field-value', result2: 111, result3: 11000, result4: 1100000 });
    });
    it('should not fail when a real selector returns undefined, and __passOnUndefined ', () => {
      // Setup actions and selectors
      const action = { type: 'TYPE' };
      const selector = () => createSelector((state) => state.reducerKey, (stateData) => stateData);

      // Saga method for test
      function* method() {
        return yield select(selector());
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Run the saga
      expect(new SagaTester(saga, { selectorConfig: { __passOnUndefined: true } }).run(action)).toBe(undefined);
    });
    it('should throw error when an incorrectly configured selector is received', () => {
      // Setup actions and selectors
      const action = { type: 'TYPE' };
      const selector = () => createSelector((state) => state.reducerKey, (stateData) => stateData);

      // Saga method for test
      function* method() {
        yield select(selector());
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Run the saga
      const expectedError = 'A selector returned undefined. If this is desirable, provide selectorConfig.__passOnUndefined: true. Otherwise, provide selectorConfig. (step 0)';
      expect(() => new SagaTester(saga).run(action)).toThrow(expectedError);
    });
    it('should throw error explaining to config selectors when a selector crashes', () => {
      // Setup actions and selectors
      const action = { type: 'TYPE' };
      const selector = () => createSelector((state) => state.reducerKey, (stateData) => stateData.will.crash.because.undefined);

      // Saga method for test
      function* method() {
        yield select(selector());
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Run the saga
      const expectedError = 'A selector crashed while executing. Either provide the redux value in selectorConfig, or mock it using mockSelector (step 0)';
      expect(() => new SagaTester(saga).run(action)).toThrow(expectedError);
    });
    it('should throw error when an unexpected selector is received', () => {
      // Setup actions and selectors
      const action = { type: 'TYPE' };
      const selector = mockSelector('selector');

      // Saga method for test
      function* method() {
        yield select(selector());
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Run the saga
      const expectedError = 'Received selector with id selector, but the SagaTest was not configured to handle this selector (step 0)';
      expect(() => new SagaTester(saga).run(action)).toThrow(expectedError);
    });
  });

  describe('handling actions', () => {
    it('should keep track of actions', () => {
      // Setup actions
      const action = { type: 'TYPE' };

      // Saga method for test
      function* method() {
        yield put({ type: 'TYPE1' });
        yield put({ type: 'TYPE2', data: 'data' });
        yield put({ type: 'TYPE2', data: 'dataAgain' });
        yield put({ type: 'TYPE2', data: 'dataAgain' });
        yield put({ type: 'Something else!!!' });
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        expectedActions: [
          { type: 'TYPE1' },
          { action: { type: 'TYPE2', data: 'data' } },
          { times: 2, action: { type: 'TYPE2', data: 'dataAgain' } },
        ],
      };

      // Run the saga
      new SagaTester(saga, config).run(action);
    });
    it('should list errors for each action not called as configured', () => {
      // Setup actions
      const action = { type: 'TYPE' };

      // Saga method for test
      function* method() {
        yield put({ type: 'TYPE3' });
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        expectedActions: [
          { type: 'TYPE1' },
          { action: { type: 'TYPE2', data: 'data' } },
          { times: 2, action: { type: 'TYPE2', data: 'dataAgain' } },
          { times: 0, type: 'TYPE3' },
        ],
      };

      // Run the saga
      const tester = new SagaTester(saga, config, false);
      tester.run(action);
      expect(tester.errorList.length).toBe(4);
    });
    it('should throw error when an unexpected action is received, and there exists a strict action with a matching type', () => {
      // Setup actions
      const action = { type: 'TYPE' };
      const raisedAction = { type: 'TYPE', data: 'wrong data' };
      const expectedAction = [{ type: 'TYPE', data: 'data' }];

      // Saga method for test
      function* method() {
        yield put({ type: 'TYPE', data: 'wrong data' });
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        expectedActions: [
          { action: { type: 'TYPE', data: 'data' } },
        ],
      };

      // Run the saga
      const expectedError = `Received a strictly matched action of type 'TYPE', but no matching actions were found!\n\n${diffTwoObjects(expectedAction[0], raisedAction)}`;
      expect(() => new SagaTester(saga, config).run(action)).toThrow(expectedError);
    });
    it('should correctly diff incorrectly caught actions', () => {
      // Setup actions
      const action = { type: 'TYPE' };
      const receivedData = new Date('2000-01-01');
      const expectedData = '2000-01-01T00:00:00Z';
      const raisedAction = { type: 'TYPE', data: receivedData };
      const expectedAction = [{ type: 'TYPE', data: expectedData }];

      // Saga method for test
      function* method() {
        yield put({ type: 'TYPE', data: receivedData });
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        expectedActions: [
          { action: { type: 'TYPE', data: expectedData } },
        ],
      };

      // Run the saga
      const expectedError = `Received a strictly matched action of type 'TYPE', but no matching actions were found!\n\n${diffTwoObjects(expectedAction[0], raisedAction)}`;
      expect(() => new SagaTester(saga, config).run(action)).toThrow(expectedError);
    });
    it('should fail and list errors when there are unmatched actions (assert mode)', () => {
      // Setup actions
      const action = { type: 'TYPE' };

      // Saga method for test
      function* method() {
        yield put({ type: 'TYPE3' });
        yield put({ type: 'TYPE1' });
        yield put({ type: 'TYPE2' });
        yield put({ type: 'TYPE2' });
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        expectedActions: [
          { type: 'TYPE1' },
          { action: { type: 'TYPE2', data: 'data' }, strict: false },
          { times: 2, action: { type: 'TYPE2', data: 'dataAgain' }, strict: false },
          { times: 0, type: 'TYPE3' },
        ],
      };

      // Run the saga
      expect(() => new SagaTester(saga, config).run(action)).toThrow('Errors while running SagaTester.');
    });
  });

  describe('handling CALLs to async methods', () => {
    it('should keep track of CALL verbs, also handling RETRY verbs', () => {
      // Setup actions and methods
      const action = { type: 'TYPE' };
      const method1 = () => {};
      const method2 = () => {};
      const method3 = () => {};

      // Saga method for test
      function* method() {
        yield call(method1, 'irrelevant');
        yield call(method1);
        yield call(method2, 'data');
        yield call(method2, 'dataAgain', null, undefined);
        yield call(method2, 'dataAgain', null, undefined);
        const result = yield call(method3);
        expect(result).toEqual('someResult');
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        expectedCalls: {
          method1: [{}],
          method2: [
            { params: ['data'] },
            { times: 2, params: ['dataAgain', null, undefined] },
          ],
          method3: [{ output: 'someResult' }],
        },
      };

      // Run the saga
      new SagaTester(saga, config).run(action);
    });
    it('should successfully call methods that are configured to be called for real', () => {
      // Setup actions and methods
      const action = { type: 'TYPE' };
      const method1 = (p1, p2) => `${p1}-${p2}-method1`;
      const method2 = (p1, p2) => `${p1}-${p2}-method2`;
      const method3 = (p1, p2) => `${p1}-${p2}-method3`;

      // Saga method for test
      function* method() {
        const r0 = yield call(method1, 'a', 'b');
        const [r1, r2] = yield race([call(method2, 'a', 'b'), call(method2, 'c', 'd')]);
        const [r3, r4] = yield all([call(method3, 'a', 'b'), call(method3, 'c', 'd')]);

        expect(r0).toEqual('a-b-method1');
        expect(r1).toEqual('a-b-method2');
        expect(r2).toEqual('LOL');
        expect(r3).toEqual('a-b-method3');
        expect(r4).toEqual('LMAO');
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        expectedCalls: {
          method1: [{ params: ['a', 'b'], call: true }],
          method2: [{ params: ['a', 'b'], call: true }, { params: ['c', 'd'], output: 'LOL' }],
          method3: [{ params: ['a', 'b'], call: true }, { params: ['c', 'd'], output: 'LMAO' }],
        },
      };

      // Run the saga
      new SagaTester(saga, config).run(action);
    });
    it('should simulate a throw when a call is configured with a throw option', () => {
      // Setup actions and methods
      const action = { type: 'TYPE' };
      const method1 = () => {};
      const method2 = () => {};

      // Saga method for test
      function* method() {
        try {
          yield call(method1);
        } catch (e) {
          yield call(method2, e);
        }
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        expectedCalls: {
          method1: [{ throw: 'SOME ERROR' }],
          method2: [{ times: 1, params: ['SOME ERROR'] }],
        },
      };

      // Run the saga
      new SagaTester(saga, config).run(action);
    });
    it('should list errors for each method not CALLed', () => {
      // Setup actions and methods
      const action = { type: 'TYPE' };

      // Saga method for test
      function* method() { 'doNothing'; }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        expectedCalls: {
          method1: [{}],
          method2: [
            { params: ['data'] },
            { times: 2, params: ['dataAgain'] },
          ],
          method3: [{ output: 'someResult' }],
        },
      };

      // Run the saga
      const tester = new SagaTester(saga, config, false);
      tester.run(action);
      expect(tester.errorList.length).toBe(4);
    });
    it('should throw an error if an unexpected method is CALLed', () => {
      // Setup actions and methods
      const action = { type: 'TYPE' };
      const method1 = () => {};

      // Saga method for test
      function* method() { yield call(method1); }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {};

      // Run the saga
      const expectedError = 'Received CALL verb with a method named method1, but the SagaTest was not configured to receive this CALL (step 0)';
      expect(() => new SagaTester(saga, config).run(action)).toThrow(expectedError);
    });
    it('should throw an error if a known method is CALLed with unexpected parameters', () => {
      // Setup actions and methods
      const action = { type: 'TYPE' };
      const method1 = () => {};

      // Saga method for test
      function* method() { yield call(method1, 'unexpected parameter'); }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = { expectedCalls: { method1: [{ params: ['VERY BAD'] }] } };

      // Run the saga
      const expectedError = 'no matching set of parameters were found!';
      expect(() => new SagaTester(saga, config).run(action)).toThrow(expectedError);
    });
  });

  describe('handling inner generator methods', () => {
    it('should execute all unspecified generator methods normally', () => {
      // Setup actions, selectors and methods
      const action = { type: 'TYPE' };
      const selector1 = mockSelector('selector1');
      const selector2 = mockSelector('selector2');

      // Setup inner generators
      function* subMethod1() {
        yield 1;
        yield 2;
        yield 3;
        return yield select(selector1());
      }
      function* subMethod2() {
        return yield select(selector2());
      }

      // Saga method for test
      function* method() {
        const result1 = yield subMethod1();
        expect(result1).toEqual('someResult');
        const result2 = yield* subMethod2();
        expect(result2).toEqual('someOtherResult');
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        selectorConfig: { selector1: 'someResult', selector2: 'someOtherResult' },
      };

      // Run the saga
      new SagaTester(saga, config).run(action);
    });
    it('should keep track of all calls to generators', () => {
      // Setup actions and methods
      const action = { type: 'TYPE' };
      const generator1 = mockGenerator('generator1');
      const generator2 = mockGenerator('generator2');
      const generator3 = mockGenerator('generator3');

      // Saga method for test
      function* method() {
        const result1 = yield generator1();
        expect(result1).toEqual('someResult');
        yield generator2(5, 5);
        yield generator2(5, 5);
        yield generator3(42);
        yield generator3(43);
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        expectedGenerators: {
          generator1: [{ output: 'someResult' }],
          generator2: [{ times: 2, params: [5, 5] }],
          generator3: [{ times: 2 }],
        },
      };

      // Run the saga
      new SagaTester(saga, config).run(action);
    });
    it('should list errors for each generator not called as expected', () => {
      // Setup actions and methods
      const action = { type: 'TYPE' };
      const generator2 = mockGenerator('generator2');

      // Saga method for test
      function* method() {
        yield generator2(5, 5);
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        expectedGenerators: {
          generator1: [{}],
          generator2: [{ times: 2, params: [5, 5] }],
          generator3: [{ times: 1 }],
        },
      };

      // Run the saga
      const tester = new SagaTester(saga, config, false);
      tester.run(action);
      expect(tester.errorList.length).toBe(3);
    });
    it('should throw an error if a generator is called with unexpected parameters', () => {
      // Setup actions and methods
      const action = { type: 'TYPE' };
      const generator = mockGenerator('generator');

      // Saga method for test
      function* method() {
        yield generator(5, 5);
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Saga Tester config
      const config = {
        expectedGenerators: {
          generator: [{ params: [4, 4] }],
        },
      };

      // Run the saga
      const expectedErrors = 'no matching set of parameters were found!';
      expect(() => new SagaTester(saga, config).run(action)).toThrow(expectedErrors);
    });
    it('should throw an error if an unexpected mocked generator was called', () => {
      // Setup actions and methods
      const action = { type: 'TYPE' };
      const generator = mockGenerator('generator');

      // Saga method for test
      function* method() {
        yield generator(5, 5);
      }
      function* saga() { yield takeLatest('TYPE', method); }

      // Run the saga
      const expectedErrors = 'Received mocked generator call with name generator and args 5,5';
      expect(() => new SagaTester(saga, {}).run(action)).toThrow(expectedErrors);
    });
  });
});

describe('mockSelector', () => {
  it('should return stubbed methods', () => {
    const selector = mockSelector('name');
    expect(selector.resultFunc()).toBe('mock-name');
    expect(selector.recomputations()).toBe(0);
    expect(selector.resetRecomputations()).toBe(0);
  });
});

describe('mockGenerator', () => {
  it('should wrap the name and args properties on the resulting generator', () => {
    const action = () => ({ type: 'type' });
    function* foo(a) { yield put(action()); return a; }
    const { mockThis: namedFoo, notAMethod } = mockGenerator({ mockThis: foo, notAMethod: action });
    function* saga(a) { yield namedFoo(a); return yield namedFoo(a); }
    expect(notAMethod).toBe(action);

    expect(
      new SagaTester(saga, {
        expectedGenerators: { foo: [{ times: 2, params: ['bar'], output: 'brak' }] },
        expectedActions: [{ action: action(), times: 0 }],
      }).run('bar'),
    ).toBe('brak');
  });
  it('should handle mockGenerator receiving the generator directly, and call the mocked generators if call: true', () => {
    const action = () => ({ type: 'type' });
    function* foo(a) { yield put(action()); return `${a}-called`; }
    const namedFoo = mockGenerator(foo);
    function* saga(a) { yield namedFoo(a); return yield namedFoo(a); }

    expect(
      new SagaTester(saga, {
        expectedGenerators: { foo: [{ times: 2, params: ['bar'], call: true }] },
        expectedActions: [{ action: action(), times: 2 }],
      }).run('bar'),
    ).toBe('bar-called');
  });
  it('should throw an error if the incorrect value is provided', () => {
    expect(() => mockGenerator([])).toThrow('Parameter of mockGenerator must either be a generator method, a string, or an object. Received');
    expect(() => mockGenerator(1)).toThrow('Parameter of mockGenerator must either be a generator method, a string, or an object. Received');
    expect(mockGenerator({})).toEqual({});
  });
});
