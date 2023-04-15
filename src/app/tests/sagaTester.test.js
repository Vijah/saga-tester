import {
  takeLatest,
  takeLeading,
  takeEvery,
  take,
  put,
  putResolve,
  select,
  call,
  apply,
  all,
  race,
  debounce,
  throttle,
  fork,
  retry,
  cancelled,
  cancel,
  join,
  delay,
} from 'redux-saga/effects';
import { createSelector } from 'reselect';

import {
  mockSelector,
  mockGenerator,
  SagaTester,
  triggerSagaWithAction,
  diffTwoObjects,
} from '..';
import PLACEHOLDER_ARGS from '../helpers/PLACEHOLDER_ARGS';

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

  describe('fork', () => {
    it('should handle the fork verb like a generator call', () => {
      // Saga method for test
      const context = { field: 'value' };
      const method1 = mockGenerator('method1');
      function* method2(arg) { yield put({ type: 'TYPE2', arg }); }
      function* method3(arg) { yield put({ type: 'TYPE3', arg: `${arg}-${this.field}` }); }
      function* method4(arg) { yield put({ type: 'TYPE4', arg: `${arg}-${this.field}` }); }

      function* saga() {
        yield fork(method1, 'arg1');
        yield fork(method2, 'arg2');
        yield fork([context, method3], 'arg3');
        yield fork({ context, fn: method4 }, 'arg4');
      }

      // Run the saga
      new SagaTester(saga, {
        expectedActions: [
          { type: 'TYPE1', times: 0 },
          { action: { type: 'TYPE2', arg: 'arg2' }, times: 1 },
          { action: { type: 'TYPE3', arg: 'arg3-value' }, times: 1 },
          { action: { type: 'TYPE4', arg: 'arg4-value' }, times: 1 },
        ],
        expectedGenerators: {
          method1: [{ times: 1, params: ['arg1'] }],
        },
        options: { stepLimit: 20 },
      }).run();
    });
    it('should treat fork as if creating a task with the given output, deferring its execution, and handling cancellation status', () => {
      const method1 = mockGenerator('method1');
      const mockCall = () => {};
      function* method2(arg) {
        let catchBranch = false;
        try {
          if (arg === 'arg6') {
            yield cancel();
          }
          yield call(mockCall);
        } catch {
          catchBranch = true;
          const isCancelled = yield cancelled();
          yield put({ type: 'TYPE', value: `catch-method2-${arg}-${isCancelled ? 'cancelled' : 'notCancelled'}` });
        } finally {
          if (!catchBranch) {
            const isCancelled = yield cancelled();
            yield put({ type: 'TYPE', value: `finally-method2-${arg}-${isCancelled ? 'cancelled' : 'notCancelled'}` });
            // eslint-disable-next-line no-unsafe-finally
            return `finally-method2-${arg}-${isCancelled ? 'cancelled' : 'notCancelled'}`;
          }
        }
        const isCancelled = yield cancelled();
        return `method2-${arg}-${isCancelled ? 'cancelled' : 'notCancelled'}`;
      }

      function* saga() {
        const task1 = yield fork(method1, 'arg1');
        const task2 = yield fork(method2, 'arg2');
        const task3 = yield fork(method2, 'arg3');
        const runsTooFast = yield fork(method2, 'arg4');
        const notCancelled = yield fork(method2, 'arg5');
        const selfCancelled = yield fork(method2, 'arg6');
        const notRun = yield fork(method2, 'arg7');

        // Handle both single parameters and array calls for cancel and join
        yield cancel(task1);
        yield cancel([task2, task3, runsTooFast, notRun]);

        const results = yield join([task1, task2, task3, runsTooFast, notCancelled]);
        results.push(yield join(selfCancelled));

        return results;
      }

      // Saga Tester config
      const config = {
        expectedActions: [
          { action: { type: 'TYPE', value: 'finally-method2-arg2-cancelled' }, times: 1 },
          { action: { type: 'TYPE', value: 'finally-method2-arg3-cancelled' }, times: 1 },
          { action: { type: 'TYPE', value: 'catch-method2-arg4-notCancelled' }, times: 1 },
          { action: { type: 'TYPE', value: 'catch-method2-arg5-notCancelled' }, times: 1 },
          { action: { type: 'TYPE', value: 'finally-method2-arg6-cancelled' }, times: 1 },
          { action: { type: 'TYPE', value: 'finally-method2-arg7-cancelled' }, times: 1 },
        ],
        expectedCalls: {
          mockCall: [{ times: 2, throw: 'whatever' }],
        },
        expectedGenerators: {
          method1: [{ times: 1, params: ['arg1'], output: 'the-mocked-one' }],
          method2: [
            { params: ['arg2'], call: true, wait: true },
            { params: ['arg3'], call: true, wait: true },
            { params: ['arg4'], call: true, wait: false },
            { params: ['arg5'], call: true, wait: true },
            { params: ['arg6'], call: true, wait: true },
            { params: ['arg7'], call: true, wait: true },
          ],
        },
      };

      // Run the saga
      expect(new SagaTester(saga, config).run()).toEqual([
        'the-mocked-one',
        'finally-method2-arg2-cancelled',
        'finally-method2-arg3-cancelled',
        'method2-arg4-notCancelled',
        'method2-arg5-notCancelled',
        'finally-method2-arg6-cancelled',
      ]);
    });
    it('should cancel children tasks when the parent is cancelled', () => {
      function* loopMethod() {
        try {
          while (true) {
            yield delay(1000);
          }
        } finally {
          const isCancelled = yield cancelled();
          yield put({ type: 'LOOP_ENDED', isCancelled });
        }
      }

      function* saga() {
        try {
          yield fork(loopMethod);
          yield fork(loopMethod);
          yield fork(loopMethod);

          yield cancel();
          yield put({ type: 'ROOT_END' });
        } finally {
          const isCancelled = yield cancelled();
          yield put({ type: 'ROOT_FINALLY', isCancelled });
        }
      }

      // Saga Tester config
      const config = {
        expectedActions: [
          { action: { type: 'LOOP_ENDED', isCancelled: true }, times: 3 },
          { action: { type: 'ROOT_END' }, times: 0 },
          { action: { type: 'ROOT_FINALLY', isCancelled: true }, times: 1 },
        ],
        expectedGenerators: {
          loopMethod: [{ times: 3, call: true, wait: false }],
        },
      };

      // Run the saga
      new SagaTester(saga, config).run();
    });
    it('should not cancel tasks which are passed to a cancelled task', () => {
      function* loopMethod(task) {
        try {
          while (true) {
            yield join(task);
            yield delay(100);
          }
        } finally {
          const isCancelled = yield cancelled();
          yield put({ type: 'LOOP_ENDED', isCancelled });
        }
      }

      function* slowMethod() {
        yield delay(2000);
        const isCancelled = yield cancelled();
        yield put({ type: 'SLOW_METHOD_ENDED', isCancelled });
      }

      function* saga() {
        const slowTask = yield fork(slowMethod);
        const loopTask = yield fork(loopMethod, slowTask);
        yield delay(500);
        yield cancel(loopTask);
        yield put({ type: 'ROOT_END' });
      }

      // Run the saga
      new SagaTester(saga, {
        expectedActions: [
          { action: { type: 'LOOP_ENDED', isCancelled: true }, times: 1 },
          { action: { type: 'ROOT_END' }, times: 1 },
          { action: { type: 'SLOW_METHOD_ENDED', isCancelled: false }, times: 1 },
        ],
        expectedGenerators: {
          loopMethod: [{ times: 1, call: true, wait: false }],
          slowMethod: [{ times: 1, call: true, wait: false }],
        },
      }).run();
    });
    it('should execute tasks joined simultaneously in the correct order', () => {
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
    it('should wait for unfinished children tasks to end before finishing the parent', () => {
      let executionOrder = 0;
      const sideEffectMethod = jest.fn();
      function* method(arg) {
        executionOrder += 1;
        sideEffectMethod(`${arg}-executed-${executionOrder}`);
      }
      function* parentMethod(arg) {
        yield fork(method, `${arg}-arg1`);
        yield fork(method, `${arg}-arg2`);
      }

      function* saga() {
        yield fork(parentMethod, 'arg1');
        yield fork(parentMethod, 'arg2');
      }

      expect(new SagaTester(saga, {
        expectedGenerators: {
          parentMethod: [
            { params: ['arg1'], call: true, wait: 50 },
            { params: ['arg2'], call: true },
          ],
          method: [
            { params: ['arg1-arg1'], call: true, wait: 25 },
            { params: ['arg1-arg2'], call: true },
            { params: ['arg2-arg1'], call: true },
            { params: ['arg2-arg2'], call: true, wait: 60 },
          ],
        },
        options: {
          useStaticTimes: true,
        },
      }).run()).toBe(undefined);
      expect(sideEffectMethod).toHaveBeenCalledTimes(4);
      expect(sideEffectMethod).toHaveBeenCalledWith('arg2-arg1-executed-1');
      expect(sideEffectMethod).toHaveBeenCalledWith('arg1-arg2-executed-2');
      expect(sideEffectMethod).toHaveBeenCalledWith('arg1-arg1-executed-3');
      expect(sideEffectMethod).toHaveBeenCalledWith('arg2-arg2-executed-4'); // Because the times are not additive
    });
    it('should have parent tasks returning correctly despite waiting for children tasks to finish', () => {
      let executionOrder = 0;
      const sideEffectMethod = jest.fn();
      function* method(arg) {
        executionOrder += 1;
        sideEffectMethod(`${arg}-executed-${executionOrder}`);
      }
      function* parentMethod(arg) {
        yield fork(method, `${arg}-arg1`);
        yield fork(method, `${arg}-arg2`);
        return arg;
      }

      function* saga() {
        const task1 = yield fork(parentMethod, 'arg1');
        const task2 = yield fork(parentMethod, 'arg2');
        return yield join([task1, task2]);
      }

      expect(new SagaTester(saga, {
        expectedGenerators: {
          parentMethod: [
            { params: ['arg1'], call: true, wait: 50 },
            { params: ['arg2'], call: true },
          ],
          method: [
            { params: ['arg1-arg1'], call: true, wait: 25 },
            { params: ['arg1-arg2'], call: true },
            { params: ['arg2-arg1'], call: true },
            { params: ['arg2-arg2'], call: true, wait: 60 },
          ],
        },
        options: {
          useStaticTimes: true,
        },
      }).run()).toEqual(['arg1', 'arg2']);
      expect(sideEffectMethod).toHaveBeenCalledTimes(4);
      expect(sideEffectMethod).toHaveBeenCalledWith('arg2-arg1-executed-1');
      expect(sideEffectMethod).toHaveBeenCalledWith('arg1-arg2-executed-2');
      expect(sideEffectMethod).toHaveBeenCalledWith('arg1-arg1-executed-3');
      expect(sideEffectMethod).toHaveBeenCalledWith('arg2-arg2-executed-4'); // Because the times are not additive
    });
    it('should have parent tasks returning correctly despite waiting for children tasks to finish (deep version)', () => {
      let executionOrder = 0;
      const sideEffectMethod = jest.fn();
      function* method(arg) {
        executionOrder += 1;
        sideEffectMethod(`${arg}-executed-${executionOrder}`);
        return `${arg}-executed-${executionOrder}`;
      }
      function* deepParentMethod(arg) {
        yield fork(method, `${arg}-slow`);
        const task = yield fork(method, `${arg}-fast`);
        return yield join(task);
      }
      function* parentMethod(arg) {
        yield fork(deepParentMethod, `${arg}-slow`);
        const task = yield fork(deepParentMethod, `${arg}-fast`);
        return yield join(task);
      }

      function* saga() {
        const task1 = yield fork(parentMethod, 'slow');
        const task2 = yield fork(parentMethod, 'fast');
        return yield join([task1, task2]);
      }

      expect(new SagaTester(saga, {
        expectedGenerators: {
          parentMethod: [
            { params: ['slow'], call: true, wait: 100 },
            { params: ['fast'], call: true, wait: 10 },
          ],
          deepParentMethod: [
            { params: ['slow-slow'], call: true, wait: 100 },
            { params: ['fast-slow'], call: true, wait: 100 },
            { params: ['slow-fast'], call: true, wait: 10 },
            { params: ['fast-fast'], call: true },
          ],
          method: [
            { params: ['slow-slow-slow'], call: true, wait: 100 },
            { params: ['slow-fast-slow'], call: true, wait: 100 },
            { params: ['slow-slow-fast'], call: true },
            { params: ['slow-fast-fast'], call: true, wait: 10 },
            { params: ['fast-slow-slow'], call: true, wait: 100 },
            { params: ['fast-fast-slow'], call: true, wait: 100 },
            { params: ['fast-slow-fast'], call: true },
            { params: ['fast-fast-fast'], call: true },
          ],
        },
        options: {
          useStaticTimes: true,
        },
      }).run()).toEqual(['slow-fast-fast-executed-4', 'fast-fast-fast-executed-1']);
      expect(sideEffectMethod).toHaveBeenCalledTimes(8);
      // Times are not additive
      expect(sideEffectMethod).toHaveBeenCalledWith('fast-fast-fast-executed-1');
      expect(sideEffectMethod).toHaveBeenCalledWith('fast-fast-slow-executed-3');
      expect(sideEffectMethod).toHaveBeenCalledWith('fast-slow-fast-executed-2');
      expect(sideEffectMethod).toHaveBeenCalledWith('fast-slow-slow-executed-6');
      expect(sideEffectMethod).toHaveBeenCalledWith('slow-fast-fast-executed-4');
      expect(sideEffectMethod).toHaveBeenCalledWith('slow-fast-slow-executed-7');
      expect(sideEffectMethod).toHaveBeenCalledWith('slow-slow-fast-executed-5');
      expect(sideEffectMethod).toHaveBeenCalledWith('slow-slow-slow-executed-8');
    });
    it('should have parent tasks returning correctly despite waiting for children tasks to finish', () => {
      let executionOrder = 0;
      const sideEffectMethod = jest.fn();
      function* method(arg) {
        executionOrder += 1;
        sideEffectMethod(`${arg}-executed-${executionOrder}`);
      }
      function* parentMethod(arg) {
        yield fork(method, `${arg}-arg1`);
        yield fork(method, `${arg}-arg2`);
        return arg;
      }

      function* saga() {
        const task1 = yield fork(parentMethod, 'arg1');
        const task2 = yield fork(parentMethod, 'arg2');
        return yield join([task1, task2]);
      }

      expect(new SagaTester(saga, {
        expectedGenerators: {
          parentMethod: [
            { params: ['arg1'], call: true, wait: 50 },
            { params: ['arg2'], call: true },
          ],
          method: [
            { params: ['arg1-arg1'], call: true, wait: 25 },
            { params: ['arg1-arg2'], call: true },
            { params: ['arg2-arg1'], call: true },
            { params: ['arg2-arg2'], call: true, wait: 60 },
          ],
        },
        options: {
          useStaticTimes: false,
        },
      }).run()).toEqual(['arg1', 'arg2']);
      expect(sideEffectMethod).toHaveBeenCalledTimes(4);
      expect(sideEffectMethod).toHaveBeenCalledWith('arg2-arg1-executed-1');
      expect(sideEffectMethod).toHaveBeenCalledWith('arg1-arg2-executed-2');
      expect(sideEffectMethod).toHaveBeenCalledWith('arg1-arg1-executed-4');
      expect(sideEffectMethod).toHaveBeenCalledWith('arg2-arg2-executed-3'); // Because the times are additive
    });
    it('should end forked tasks in the correct order when they are yielded simultaneously inside an all effect', () => {
      let executionOrder = 0;
      function* method(arg) {
        executionOrder += 1;
        return `${arg}-executed-${executionOrder}`;
      }
      function* deeplyNestedMethod() {
        const task = yield fork(method, 'deep');
        return yield join(task);
      }
      function* methodNested(arg) {
        const task1 = yield fork(method, arg);
        const task2 = yield fork(method, 'arg7');
        const callResult = yield call(deeplyNestedMethod);
        const results = yield join([task1, task2]);
        results.push(callResult);
        return results;
      }
      function* calledMethod(arg) {
        const task = yield fork(method, arg);
        const taskResult = yield join([task]);
        return `calledMethod-${taskResult[0]}`;
      }
      const mockMethodNested = mockGenerator(methodNested);

      function* saga() {
        const task1 = yield fork(method, 'arg1');
        const task2 = yield fork(method, 'arg2');
        const task3 = yield fork(method, 'arg3');
        const task4 = yield fork(method, 'arg4');
        const task5 = yield fork(method, 'arg5');
        const task6 = yield fork(mockMethodNested, 'arg6');
        const task8 = call(calledMethod, 'arg8');
        const results = yield all({
          task1: join(task1),
          task2: join(task2),
          sub: all([join([task3, task4]), all([join(task5), join(task6)])]),
          task8,
        });
        return results;
      }

      expect(new SagaTester(saga, {
        expectedGenerators: {
          method: [
            { params: ['arg1'], call: true, wait: 50 },
            { params: ['arg2'], call: true, wait: true },
            { params: ['arg3'], call: true, wait: 70 },
            { params: ['arg4'], call: true, wait: 60 },
            { params: ['arg5'], call: true, wait: 100 },
            { params: ['arg6'], call: true, wait: 200 },
            { params: ['arg7'], call: true, wait: 80 },
            { params: ['arg8'], call: true, wait: 110 },
            { params: ['deep'], call: true, wait: 90 },
          ],
          methodNested: [{ params: ['arg6'], call: true, wait: 55 }],
        },
        expectedCalls: {
          calledMethod: [{ params: ['arg8'], call: true }],
          deeplyNestedMethod: [{ call: true }],
        },
        options: {
          useStaticTimes: true,
        },
      }).run()).toEqual({
        task1: 'arg1-executed-1', // wait 50
        task2: 'arg2-executed-9', // wait: true (aka after everything else)
        sub: [
          ['arg3-executed-3', 'arg4-executed-2'], // wait 70, wait 60
          ['arg5-executed-6', // wait 100
            [
              'arg6-executed-8', // wait 200, (same generator also dispatches arg7 and deep) within a wait 55
              'arg7-executed-4', // wait 80, but forked inside arg6, which is wait 55
              'deep-executed-5', // wait 90, but forked inside arg6, which is wait 55
            ],
          ],
        ],
        task8: 'calledMethod-arg8-executed-7', // wait 110, nested within an instantaneous call
      });
    });
    it('should end forked tasks in the correct order when they are yielded simultaneously inside a race effect', () => {
      let executionOrder = 0;
      function* method(arg) {
        executionOrder += 1;
        return `${arg}-executed-${executionOrder}`;
      }
      function* deeplyNestedMethod() {
        const task = yield fork(method, 'deep');
        return yield join(task);
      }
      function* methodNested(arg) {
        const task1 = yield fork(method, arg);
        const task2 = yield fork(method, 'arg7');
        const callResult = yield call(deeplyNestedMethod);
        const results = yield join([task1, task2]);
        results.push(callResult);
        return results;
      }
      function* calledMethod(arg) {
        const task = yield fork(method, arg);
        const taskResult = yield join([task]);
        return `calledMethod-${taskResult[0]}`;
      }
      const mockMethodNested = mockGenerator(methodNested);

      function* saga() {
        const task1 = yield fork(method, 'arg1');
        const task2 = yield fork(method, 'arg2');
        const task3 = yield fork(method, 'arg3');
        const task4 = yield fork(method, 'arg4');
        const task5 = yield fork(method, 'arg5');
        const task6 = yield fork(mockMethodNested, 'arg6');
        const task8 = call(calledMethod, 'arg8');
        const results = yield race({
          task1: join(task1),
          task2: join(task2),
          sub: race([join([task3, task4]), race([join(task5), join(task6)])]),
          task8,
        });
        return results;
      }

      expect(new SagaTester(saga, {
        expectedGenerators: {
          method: [
            { params: ['arg1'], call: true, wait: 200 },
            { params: ['arg2'], call: true, wait: true },
            { params: ['arg3'], call: true, wait: 270 },
            { params: ['arg4'], call: true, wait: 260 },
            { params: ['arg5'], call: true, wait: 300 },
            { params: ['arg6'], call: true, wait: 10 },
            { params: ['arg7'], call: true, wait: 10 },
            { params: ['arg8'], call: true, wait: 193 },
            { params: ['deep'], call: true, wait: 290 },
          ],
          methodNested: [{ params: ['arg6'], call: true, wait: 10 }],
        },
        expectedCalls: {
          calledMethod: [{ params: ['arg8'], call: true }],
          deeplyNestedMethod: [{ call: true }],
        },
        options: { yieldDecreasesTimer: true },
      }).run()).toEqual({
        task1: 'arg1-executed-3', // wait 200
        task2: undefined, // wait: true (aka after everything else)
        sub: undefined,
        // wait 270, wait 260
        // wait 300
        // 10, 20, and 290, meaining two tasks actually finish early, but the parent task never ends
        task8: undefined, // 'calledMethod-arg8-executed-4'
        // task8 ENDS AT THE SAME TIME AS TASK1, but task 1 is processed before, and root is resolved without it.
        // This test documents this behavior; it would be difficult to modify the code so that tasks that end simultaneously are resolved simultaneously.
        // In addition, this is not really realistic behavior, so we will leave it as is.
      });
    });
    it('should end forked tasks and awaited calls in the correct order when they are yielded simultaneously inside a race effect', () => {
      let executionOrder = 0;
      function method(arg) {
        executionOrder += 1;
        return `${arg}-executed-${executionOrder}`;
      }
      function* deeplyNestedMethod() {
        return yield call(method, 'deep');
      }
      function* methodNested(arg) {
        const task1 = call(method, arg);
        const task2 = call(method, 'arg7');
        const callResult = call(deeplyNestedMethod);
        return yield all([task1, task2, callResult]);
      }
      function calledMethod(arg) {
        return `calledMethod-${method(arg)}`;
      }

      function* saga() {
        const task1 = call(method, 'arg1');
        const task2 = call(method, 'arg2');
        const task3 = call(method, 'arg3');
        const task4 = call(method, 'arg4');
        const task5 = call(method, 'arg5');
        const task6 = yield fork(methodNested, 'arg6');
        const task8 = call(calledMethod, 'arg8');
        const results = yield race({
          task1,
          task2,
          sub: race([all([task3, task4]), race([task5, join(task6)])]),
          task8,
        });
        return results;
      }

      expect(new SagaTester(saga, {
        expectedCalls: {
          method: [
            { params: ['arg1'], call: true, wait: 200 },
            { params: ['arg2'], call: true, wait: true },
            { params: ['arg3'], call: true, wait: 270 },
            { params: ['arg4'], call: true, wait: 260 },
            { params: ['arg5'], call: true, wait: 300 },
            { params: ['arg6'], call: true, wait: 10 },
            { params: ['arg7'], call: true, wait: 10 },
            { params: ['deep'], call: true, wait: 290 },
          ],
          calledMethod: [{ params: ['arg8'], call: true, wait: 200 }],
          deeplyNestedMethod: [{ call: true }],
        },
        expectedGenerators: {
          methodNested: [{ params: ['arg6'], call: true, wait: 10 }],
        },
        options: { yieldDecreasesTimer: true },
      }).run()).toEqual({
        task1: 'arg1-executed-3', // wait 200
        task2: undefined, // wait: true (aka after everything else)
        sub: undefined,
        // wait 270, wait 260
        // wait 300
        // 10, 20, and 290, meaining two tasks actually finish early, but the parent task never ends
        task8: 'calledMethod-arg8-executed-4', // task8 ENDS AT THE SAME TIME AS TASK1
      });
    });
    it('should end forked tasks in the correct order when they are yielded simultaneously inside a join effect', () => {
      let childExecutionOrder = 0;
      let parentExecutionOrder = 0;
      function* method(arg) {
        childExecutionOrder += 1;
        return `${arg}-childOrder-${childExecutionOrder}`;
      }
      function* methodNested(arg) {
        const task1 = yield fork(method, `${arg}-1`);
        const task2 = yield fork(method, `${arg}-2`);
        const result = yield join([task1, task2]);
        parentExecutionOrder += 1;
        return result.map((r) => `${r}-parentOrder-${parentExecutionOrder}`);
      }

      function* saga() {
        const task1 = yield fork(methodNested, 'arg1');
        const task2 = yield fork(methodNested, 'arg2');
        return yield join([task1, task2]);
      }

      expect(new SagaTester(saga, {
        expectedGenerators: {
          method: [
            { params: ['arg1-1'], call: true, wait: 160 },
            { params: ['arg1-2'], call: true, wait: true },
            { params: ['arg2-1'], call: true, wait: 100 },
            { params: ['arg2-2'], call: true, wait: 300 },
          ],
          methodNested: [
            { params: ['arg1'], call: true, wait: false },
            { params: ['arg2'], call: true, wait: 150 },
          ],
        },
        options: {
          useStaticTimes: true,
        },
      }).run()).toEqual([
        [ // The parent task is executed instantly, but resolves second since its inner tasks are slower
          'arg1-1-childOrder-2-parentOrder-2',
          'arg1-2-childOrder-4-parentOrder-2',
        ],
        [
          'arg2-1-childOrder-1-parentOrder-1',
          'arg2-2-childOrder-3-parentOrder-1',
        ],
      ]);
    });
    it('should end deferred calls in the correct order when they are yielded simultaneously inside an all effect', () => {
      let childExecutionOrder = 0;
      let parentExecutionOrder = 0;
      function* method(arg) {
        childExecutionOrder += 1;
        return `${arg}-childOrder-${childExecutionOrder}`;
      }
      function* methodNested(arg) {
        const task1 = call(method, `${arg}-1`);
        const task2 = call(method, `${arg}-2`);
        const result = yield all([task1, task2]);
        parentExecutionOrder += 1;
        return result.map((r) => `${r}-parentOrder-${parentExecutionOrder}`);
      }

      function* saga() {
        const task1 = call(methodNested, 'arg1');
        const task2 = call(methodNested, 'arg2');
        const task3 = call(methodNested, 'mocked');
        return yield all([task1, task2, task3]);
      }

      expect(new SagaTester(saga, {
        expectedCalls: {
          method: [
            { params: ['arg1-1'], call: true, wait: 160 },
            { params: ['arg1-2'], call: true, wait: true },
            { params: ['arg2-1'], call: true, wait: 100 },
            { params: ['arg2-2'], call: true, wait: 300 },
          ],
          methodNested: [
            { params: ['arg1'], call: true, wait: false },
            { params: ['arg2'], call: true, wait: 150 },
            { params: ['mocked'], output: 'mocked-output', wait: 10 },
          ],
        },
        options: {
          useStaticTimes: true,
        },
      }).run()).toEqual([
        [ // The parent task is executed instantly, but resolves second since its inner tasks are slower
          'arg1-1-childOrder-2-parentOrder-2',
          'arg1-2-childOrder-4-parentOrder-2',
        ],
        [
          'arg2-1-childOrder-1-parentOrder-1',
          'arg2-2-childOrder-3-parentOrder-1',
        ],
        'mocked-output',
      ]);
    });
    it('should complete tasks in the correct order even if they are awaited in separate tasks', () => {
      let childExecutionOrder = 0;
      function* method(arg) {
        childExecutionOrder += 1;
        return `${arg}-childOrder-${childExecutionOrder}`;
      }
      function* methodNested(arg, task1) {
        const task2 = yield fork(method, `${arg}-sub`);
        return yield join([task1, task2]);
      }

      function* saga() {
        const task1Def = yield fork(method, 'arg1');
        const task2Def = yield fork(method, 'arg2');
        const task3Def = yield fork(method, 'arg3');

        const task1 = yield fork(methodNested, 'arg1', task1Def);
        const task2 = yield fork(methodNested, 'arg2', task2Def);
        const task3 = yield fork(methodNested, 'arg3', task3Def);

        return yield join([task1, task2, task3]);
      }

      expect(new SagaTester(saga, {
        expectedGenerators: {
          method: [
            { params: ['arg1'], call: true, wait: false },
            { params: ['arg2'], call: true, wait: 100 },
            { params: ['arg3'], call: true, wait: true },
            { params: ['arg1-sub'], call: true, wait: true },
            { params: ['arg2-sub'], call: true, wait: 200 },
            { params: ['arg3-sub'], call: true, wait: false },
          ],
          methodNested: [
            { params: ['arg1', PLACEHOLDER_ARGS.TYPE('object')], call: true, wait: 50 },
            { params: ['arg2', PLACEHOLDER_ARGS.TASK], call: true, wait: 50 },
            { params: ['arg3', PLACEHOLDER_ARGS.FN((value) => value.id === 3)], call: true, wait: 50 },
          ],
        },
      }).run()).toEqual([
        [
          'arg1-childOrder-1',
          'arg1-sub-childOrder-6',
        ],
        [
          'arg2-childOrder-3',
          'arg2-sub-childOrder-4',
        ],
        [
          'arg3-childOrder-5',
          'arg3-sub-childOrder-2',
        ],
      ]);
    });
    it('should complete tasks in the correct order even if a task is being awaited simultaneously in multiple places', () => {
      let childExecutionOrder = 0;
      function* method(arg) {
        childExecutionOrder += 1;
        return `${arg}-childOrder-${childExecutionOrder}`;
      }
      function* methodNested(arg, task1) {
        const task2 = yield fork(method, `${arg}-sub`);
        return yield join([task1, task2]);
      }

      function* saga() {
        const mainTask = yield fork(method, 'main');

        const task1 = yield fork(methodNested, 'arg1', mainTask);
        const task2 = yield fork(methodNested, 'arg2', mainTask);
        const task3 = yield fork(methodNested, 'arg3', mainTask);

        return yield join([task1, task2, task3]);
      }

      expect(new SagaTester(saga, {
        expectedGenerators: {
          method: [
            { params: ['main'], call: true, wait: true },
            { params: ['arg1-sub'], call: true, wait: true },
            { params: ['arg2-sub'], call: true, wait: 25 },
            { params: ['arg3-sub'], call: true, wait: false },
          ],
          methodNested: [
            { params: ['arg1', PLACEHOLDER_ARGS.ANY], call: true, wait: 50 },
            { params: ['arg2', PLACEHOLDER_ARGS.ANY], call: true, wait: 50 },
            { params: ['arg3', PLACEHOLDER_ARGS.ANY], call: true, wait: 50 },
          ],
        },
        options: { yieldDecreasesTimer: false },
      }).run()).toEqual([
        [
          'main-childOrder-3',
          'arg1-sub-childOrder-4',
        ],
        [
          'main-childOrder-3',
          'arg2-sub-childOrder-2',
        ],
        [
          'main-childOrder-3',
          'arg3-sub-childOrder-1',
        ],
      ]);
    });
  });

  describe('delay', () => {
    it('should behave as a joined task set to wait for that amount', () => {
      function* method(arg) {
        return arg;
      }

      function* saga() {
        yield delay(0);
        const task1 = yield fork(method, 'slow');
        const task2 = yield fork(method, 'fast');

        return yield all([
          race([join(task1), delay(50)]),
          race([join(task2), delay(50)]),
        ]);
      }

      expect(new SagaTester(saga, {
        expectedGenerators: {
          method: [
            { params: ['slow'], call: true, wait: 75 },
            { params: ['fast'], call: true, wait: 25 },
          ],
        },
      }).run()).toEqual([
        [undefined, undefined],
        ['fast', undefined],
      ]);
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
    it('should handle the retry verb by treating it as a CALL verb', () => {
      // Saga method for test
      const method1 = mockGenerator('method1');

      function method2(arg) {
        return `${arg}-method2`;
      }

      function* saga() {
        let result = yield retry(3, 1000, method1, 'arg1');
        yield put({ type: 'TYPE1', result });
        result = yield retry(3, 1000, method2, 'arg2');
        yield put({ type: 'TYPE2', result });
      }

      // Saga Tester config
      const config = {
        expectedCalls: {
          method1: [{ times: 1, params: ['arg1'], output: 'method1-output' }],
          method2: [{ times: 1, params: ['arg2'], call: true }],
        },
        expectedActions: [
          { action: { type: 'TYPE1', result: 'method1-output' }, times: 1 },
          { action: { type: 'TYPE2', result: 'arg2-method2' }, times: 1 },
        ],
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
    it('should handle the laternate putResolve effect', () => {
      // Setup actions
      const action = { type: 'TYPE' };

      // Saga method for test
      function* method() {
        yield putResolve({ type: 'TYPE1' });
        yield putResolve({ type: 'TYPE2', data: 'data' });
        yield putResolve({ type: 'TYPE2', data: 'dataAgain' });
        yield putResolve({ type: 'TYPE2', data: 'dataAgain' });
        yield putResolve({ type: 'Something else!!!' });
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
    it('should keep track of CALL verbs', () => {
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

      // Run the saga
      new SagaTester(saga, {
        expectedCalls: {
          method1: [{ params: ['a', 'b'], call: true }],
          method2: [{ params: ['a', 'b'], call: true }, { params: ['c', 'd'], output: 'LOL' }],
          method3: [{ params: ['a', 'b'], call: true }, { params: ['c', 'd'], output: 'LMAO' }],
        },
        debug: {
          bubble: true,
          unblock: true,
        },
      }).run(action);
    });
    it('should handle call verbs with alternate apis', () => {
      // Setup actions and methods
      const action = { type: 'TYPE' };
      class C {
        field4 = 'value4';

        method3(arg) { return `method3-${arg}-${this.field3}`; }

        method4(arg) { return `method4-${arg}-${this.field4}`; }
      }
      const cInstance = new C();
      const context = {
        field1: 'value1',
        field2: 'value2',
        method2: function method2(arg) { return `method2-${arg}-${this.field2}`; },
        field3: 'value3',
        field4: 'value4',
      };
      function method1(arg) { return `method1-${arg}-${this.field1}`; }

      // Saga method for test
      function* saga() {
        const results = [];
        results.push(yield call([context, method1], 'input1'));
        results.push(yield call([context, 'method2'], 'input2'));
        results.push(yield call({ context, fn: cInstance.method3 }, 'input3'));
        results.push(yield apply(cInstance, cInstance.method4, ['input4', 'input4-2']));
        return results;
      }
      // Saga Tester config
      const config = {
        expectedCalls: {
          method1: [{ times: 1, call: true, params: ['input1'] }],
          method2: [{ times: 1, call: true, params: ['input2'] }],
          method3: [{ times: 1, call: true, params: ['input3'] }],
          method4: [{ times: 1, call: true, params: ['input4', 'input4-2'] }],
        },
      };

      // Run the saga
      expect(new SagaTester(saga, config).run(action)).toEqual([
        'method1-input1-value1',
        'method2-input2-value2',
        'method3-input3-value3',
        'method4-input4-value4',
      ]);
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
  it('should be recognized inside a call verb as its given name', () => {
    function* method1() { /* */ }
    const result1 = mockGenerator(method1);
    const result2 = mockGenerator('method2');
    function* saga(a) { yield call(result1, a); return yield call(result2, a); }

    expect(
      new SagaTester(saga, {
        expectedCalls: {
          method1: [{ times: 1, params: ['input'] }],
          method2: [{ times: 1, params: ['input'], output: 'output' }],
        },
      }).run('input'),
    ).toBe('output');
  });
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
    function* whatever(a) { yield put(action()); return `${a}-called`; }
    const namedFoo = mockGenerator(whatever);
    function* saga(a) { yield namedFoo(a); return yield namedFoo(a); }

    expect(
      new SagaTester(saga, {
        expectedGenerators: { whatever: [{ times: 2, params: ['bar'], call: true }] },
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
