import {
  put,
  call,
  all,
  race,
  fork,
  cancelled,
  cancel,
  join,
  delay,
} from 'redux-saga/effects';

import {
  mockGenerator,
  SagaTester,
} from '..';
import PLACEHOLDER_ARGS from '../PLACEHOLDER_ARGS';

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
      expectedCalls: [
        { name: 'method1', times: 1, params: ['arg1'] },
      ],
      options: {
        stepLimit: 20,
        failOnUnconfigured: false,
      },
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
      expectedCalls: [
        { name: 'mockCall', times: 2, throw: 'whatever' },
        { name: 'method1', times: 1, params: ['arg1'], output: 'the-mocked-one' },
        { name: 'method2', params: ['arg2'], call: true, wait: true },
        { name: 'method2', params: ['arg3'], call: true, wait: true },
        { name: 'method2', params: ['arg4'], call: true, wait: false },
        { name: 'method2', params: ['arg5'], call: true, wait: true },
        { name: 'method2', params: ['arg6'], call: true, wait: true },
        { name: 'method2', params: ['arg7'], call: true, wait: true },
      ],
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
      expectedCalls: [
        { name: 'loopMethod', times: 3, call: true, wait: false },
      ],
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
      expectedCalls: [
        { name: 'loopMethod', times: 1, call: true, wait: false },
        { name: 'slowMethod', times: 1, call: true, wait: false },
      ],
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
      expectedCalls: [
        { name: 'method', params: ['arg1'], call: true, wait: 1 },
        { name: 'method', params: ['arg2'], call: true },
        { name: 'method', params: ['arg3'], call: true, wait: 99 },
        { name: 'method', params: ['arg4'], call: true, wait: 50 },
      ],
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
      expectedCalls: [
        { name: 'parentMethod', params: ['arg1'], call: true, wait: 50 },
        { name: 'parentMethod', params: ['arg2'], call: true },
        { name: 'method', params: ['arg1-arg1'], call: true, wait: 25 },
        { name: 'method', params: ['arg1-arg2'], call: true },
        { name: 'method', params: ['arg2-arg1'], call: true },
        { name: 'method', params: ['arg2-arg2'], call: true, wait: 60 },
      ],
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
      expectedCalls: [
        { name: 'parentMethod', params: ['arg1'], call: true, wait: 50 },
        { name: 'parentMethod', params: ['arg2'], call: true },
        { name: 'method', params: ['arg1-arg1'], call: true, wait: 25 },
        { name: 'method', params: ['arg1-arg2'], call: true },
        { name: 'method', params: ['arg2-arg1'], call: true },
        { name: 'method', params: ['arg2-arg2'], call: true, wait: 60 },
      ],
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
      expectedCalls: [
        { name: 'parentMethod', params: ['slow'], call: true, wait: 100 },
        { name: 'parentMethod', params: ['fast'], call: true, wait: 10 },
        { name: 'deepParentMethod', params: ['slow-slow'], call: true, wait: 100 },
        { name: 'deepParentMethod', params: ['fast-slow'], call: true, wait: 100 },
        { name: 'deepParentMethod', params: ['slow-fast'], call: true, wait: 10 },
        { name: 'deepParentMethod', params: ['fast-fast'], call: true },
        { name: 'method', params: ['slow-slow-slow'], call: true, wait: 100 },
        { name: 'method', params: ['slow-fast-slow'], call: true, wait: 100 },
        { name: 'method', params: ['slow-slow-fast'], call: true },
        { name: 'method', params: ['slow-fast-fast'], call: true, wait: 10 },
        { name: 'method', params: ['fast-slow-slow'], call: true, wait: 100 },
        { name: 'method', params: ['fast-fast-slow'], call: true, wait: 100 },
        { name: 'method', params: ['fast-slow-fast'], call: true },
        { name: 'method', params: ['fast-fast-fast'], call: true },
      ],
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
      expectedCalls: [
        { name: 'parentMethod', params: ['arg1'], call: true, wait: 50 },
        { name: 'parentMethod', params: ['arg2'], call: true },
        { name: 'method', params: ['arg1-arg1'], call: true, wait: 25 },
        { name: 'method', params: ['arg1-arg2'], call: true },
        { name: 'method', params: ['arg2-arg1'], call: true },
        { name: 'method', params: ['arg2-arg2'], call: true, wait: 60 },
      ],
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
      expectedCalls: [
        { name: 'method', params: ['arg1'], call: true, wait: 50 },
        { name: 'method', params: ['arg2'], call: true, wait: true },
        { name: 'method', params: ['arg3'], call: true, wait: 70 },
        { name: 'method', params: ['arg4'], call: true, wait: 60 },
        { name: 'method', params: ['arg5'], call: true, wait: 100 },
        { name: 'method', params: ['arg6'], call: true, wait: 200 },
        { name: 'method', params: ['arg7'], call: true, wait: 80 },
        { name: 'method', params: ['arg8'], call: true, wait: 110 },
        { name: 'method', params: ['deep'], call: true, wait: 90 },
        { name: 'methodNested', params: ['arg6'], call: true, wait: 55 },
        { name: 'calledMethod', params: ['arg8'], call: true },
        { name: 'deeplyNestedMethod', call: true },
      ],
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
  it('should cancel tasks which lose within a race, and cancel it correctly when it loses multiple times', () => {
    function* method() {
      try {
        yield put({ type: 'method-entered' });
      } finally {
        if (yield cancelled()) {
          yield put({ type: 'method-cancelled' });
        }
      }
    }
    function* methodNested(task) {
      try {
        yield join([task, task]);
      } finally {
        if (yield cancelled()) {
          yield put({ type: 'methodNested-cancelled' });
        }
      }
    }
    function* saga() {
      const task = yield fork(method);
      const nestedTask = yield fork(methodNested, task);
      yield race([
        join(task),
        delay(1),
        join(task),
        join(nestedTask),
      ]);
    }

    new SagaTester(saga, {
      expectedCalls: [
        { name: 'method', times: 1, wait: true, call: true },
        { name: 'methodNested', times: 1, wait: false, call: true },
      ],
      expectedActions: [
        { type: 'method-cancelled', times: 1 },
        { type: 'methodNested-cancelled', times: 1 },
      ],
    }).run();
  });
  it('should end forked tasks in the correct order when they are yielded simultaneously inside a race effect - losing tasks should be cancelled', () => {
    let executionOrder = 0;
    function* method(arg) {
      let response;
      try {
        yield put({ type: 'method-entered' });
        executionOrder += 1;
        response = `${arg}-executed-${executionOrder}`;
      } finally {
        if (yield cancelled()) {
          yield put({ type: 'method-cancelled', arg });
        }
        // eslint-disable-next-line no-unsafe-finally
        return response;
      }
    }
    function* deeplyNestedMethod() {
      let response;
      try {
        const task = yield fork(method, 'deep');
        response = yield join(task);
      } finally {
        if (yield cancelled()) {
          yield put({ type: 'deeplyNestedMethod-cancelled' });
        }
        // eslint-disable-next-line no-unsafe-finally
        return response;
      }
    }
    function* methodNested(arg) {
      let response;
      try {
        const task1 = yield fork(method, arg);
        const task2 = yield fork(method, 'arg7');
        const callResult = yield call(deeplyNestedMethod);
        const results = yield join([task1, task2]);
        results.push(callResult);
        response = results;
      } finally {
        if (yield cancelled()) {
          yield put({ type: 'methodNested-cancelled', arg });
        }
        // eslint-disable-next-line no-unsafe-finally
        return response;
      }
    }
    function* calledMethod(arg) {
      let response;
      try {
        const task = yield fork(method, arg);
        const taskResult = yield join([task]);
        response = `calledMethod-${taskResult[0]}`;
      } finally {
        if (yield cancelled()) {
          yield put({ type: 'calledMethod-cancelled', arg });
        }
        // eslint-disable-next-line no-unsafe-finally
        return response;
      }
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
      expectedCalls: [
        { name: 'method', params: ['arg1'], call: true, wait: 200 },
        { name: 'method', params: ['arg2'], call: true, wait: true },
        { name: 'method', params: ['arg3'], call: true, wait: 270 },
        { name: 'method', params: ['arg4'], call: true, wait: 260 },
        { name: 'method', params: ['arg5'], call: true, wait: 300 },
        { name: 'method', params: ['arg6'], call: true, wait: 10 },
        { name: 'method', params: ['arg7'], call: true, wait: 10 },
        { name: 'method', params: ['arg8'], call: true, wait: 193 },
        { name: 'method', params: ['deep'], call: true, wait: 290 },
        { name: 'methodNested', params: ['arg6'], call: true, wait: 10 },
        { name: 'calledMethod', params: ['arg8'], call: true },
        { name: 'deeplyNestedMethod', call: true },
      ],
      expectedActions: [
        { action: { type: 'method-cancelled', arg: 'arg1' }, times: 1 },
        { action: { type: 'method-cancelled', arg: 'arg2' }, times: 1 },
        { action: { type: 'method-cancelled', arg: 'arg3' }, times: 1 },
        { action: { type: 'method-cancelled', arg: 'arg4' }, times: 1 },
        { action: { type: 'method-cancelled', arg: 'arg5' }, times: 1 },
        { action: { type: 'method-cancelled', arg: 'deep' }, times: 1 },
        { type: 'deeplyNestedMethod-cancelled', times: 1 },
        { type: 'methodNested-cancelled', times: 1 },
        { type: 'calledMethod-cancelled', times: 0 },
      ],
    }).run()).toEqual({
      task1: undefined, // wait 200
      task2: undefined, // wait: true (aka after everything else)
      sub: undefined,
      // wait 270, wait 260
      // wait 300
      // 10, 20, and 290, meaining two tasks actually finish early, but the parent task never ends
      task8: 'calledMethod-arg8-executed-3',
      // task8 ENDS AT THE SAME TIME AS TASK1.
      // This test documents this behavior; it would be difficult to modify the code so that tasks that end simultaneously are resolved simultaneously.
      // In addition, this is not really realistic behavior, so it will be left as is.
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
      expectedCalls: [
        { name: 'method', params: ['arg1'], call: true, wait: 200 },
        { name: 'method', params: ['arg2'], call: true, wait: true },
        { name: 'method', params: ['arg3'], call: true, wait: 270 },
        { name: 'method', params: ['arg4'], call: true, wait: 260 },
        { name: 'method', params: ['arg5'], call: true, wait: 300 },
        { name: 'method', params: ['arg6'], call: true, wait: 10 },
        { name: 'method', params: ['arg7'], call: true, wait: 10 },
        { name: 'method', params: ['deep'], call: true, wait: 290 },
        { name: 'calledMethod', params: ['arg8'], call: true, wait: 200 },
        { name: 'deeplyNestedMethod', call: true },
        { name: 'methodNested', params: ['arg6'], call: true, wait: 10 },
      ],
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
      expectedCalls: [
        { name: 'method', params: ['arg1-1'], call: true, wait: 160 },
        { name: 'method', params: ['arg1-2'], call: true, wait: true },
        { name: 'method', params: ['arg2-1'], call: true, wait: 100 },
        { name: 'method', params: ['arg2-2'], call: true, wait: 300 },
        { name: 'methodNested', params: ['arg1'], call: true, wait: false },
        { name: 'methodNested', params: ['arg2'], call: true, wait: 150 },
      ],
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
      expectedCalls: [
        { name: 'method', params: ['arg1'], call: true, wait: false },
        { name: 'method', params: ['arg2'], call: true, wait: 100 },
        { name: 'method', params: ['arg3'], call: true, wait: true },
        { name: 'method', params: ['arg1-sub'], call: true, wait: true },
        { name: 'method', params: ['arg2-sub'], call: true, wait: 200 },
        { name: 'method', params: ['arg3-sub'], call: true, wait: false },
        { name: 'methodNested', params: ['arg1', PLACEHOLDER_ARGS.TYPE('object')], call: true, wait: 50 },
        { name: 'methodNested', params: ['arg2', PLACEHOLDER_ARGS.TASK], call: true, wait: 50 },
        { name: 'methodNested', params: ['arg3', PLACEHOLDER_ARGS.FN((value) => value.id === 3)], call: true, wait: 50 },
      ],
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
      expectedCalls: [
        { name: 'method', params: ['main'], call: true, wait: true },
        { name: 'method', params: ['arg1-sub'], call: true, wait: true },
        { name: 'method', params: ['arg2-sub'], call: true, wait: 25 },
        { name: 'method', params: ['arg3-sub'], call: true, wait: false },
        { name: 'methodNested', params: ['arg1', PLACEHOLDER_ARGS.ANY], call: true, wait: 50 },
        { name: 'methodNested', params: ['arg2', PLACEHOLDER_ARGS.ANY], call: true, wait: 50 },
        { name: 'methodNested', params: ['arg3', PLACEHOLDER_ARGS.ANY], call: true, wait: 50 },
      ],
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
