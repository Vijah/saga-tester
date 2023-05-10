import { spawn, join } from 'redux-saga/effects';

import SagaTester from '../sagaTester';

describe('sagaTester - spawn effect', () => {
  it('should NOT wait for unfinished spawned tasks to end before finishing the parent if the option is not set to wait for them (off by default)', () => {
    let executionOrder = 0;
    const sideEffectMethod = jest.fn();
    function* method(arg) {
      executionOrder += 1;
      sideEffectMethod(`${arg}-executed-${executionOrder}`);
    }
    function* deepParentMethod(arg) {
      yield spawn(method, arg);
      return arg;
    }
    function* parentMethod(arg) {
      const task1 = yield spawn(deepParentMethod, `${arg}-arg1`);
      const task2 = yield spawn(deepParentMethod, `${arg}-arg2`);
      const results = yield join([task1, task2]);
      executionOrder += 1;
      sideEffectMethod(`${arg}-parent-${results[0]}-${results[1]}-executed-${executionOrder}`);
    }

    function* saga() {
      yield spawn(parentMethod, 'arg1');
      yield spawn(parentMethod, 'arg2');
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'deepParentMethod', call: true },
        { name: 'parentMethod', params: ['arg1'], call: true, wait: 50 },
        { name: 'parentMethod', params: ['arg2'], call: true },
        { name: 'method', params: ['arg2-arg1'], call: true },
        { name: 'method', params: ['arg2-arg2'], call: true, wait: 60 },
      ],
      options: {
        useStaticTimes: true,
      },
    }).run()).toBe(undefined);
    expect(sideEffectMethod).toHaveBeenCalledTimes(2);
    expect(sideEffectMethod).toHaveBeenCalledWith('arg2-arg1-executed-1');
    expect(sideEffectMethod).toHaveBeenCalledWith('arg2-parent-arg2-arg1-arg2-arg2-executed-2');
  });
  it('should wait for unfinished children tasks to end before finishing the parent, including spawns if the option is set to wait for them', () => {
    let executionOrder = 0;
    const sideEffectMethod = jest.fn();
    function* method(arg) {
      executionOrder += 1;
      sideEffectMethod(`${arg}-executed-${executionOrder}`);
    }
    function* deepParentMethod(arg) {
      yield spawn(method, arg);
      return arg;
    }
    function* parentMethod(arg) {
      const task1 = yield spawn(deepParentMethod, `${arg}-arg1`);
      const task2 = yield spawn(deepParentMethod, `${arg}-arg2`);
      const results = yield join([task1, task2]);
      executionOrder += 1;
      sideEffectMethod(`${arg}-parent-${results[0]}-${results[1]}-executed-${executionOrder}`);
    }

    function* saga() {
      yield spawn(parentMethod, 'arg1');
      yield spawn(parentMethod, 'arg2');
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'deepParentMethod', call: true },
        { name: 'parentMethod', params: ['arg1'], call: true, wait: 50 },
        { name: 'parentMethod', params: ['arg2'], call: true },
        { name: 'method', params: ['arg1-arg1'], call: true, wait: 25 },
        { name: 'method', params: ['arg1-arg2'], call: true },
        { name: 'method', params: ['arg2-arg1'], call: true },
        { name: 'method', params: ['arg2-arg2'], call: true, wait: 60 },
      ],
      options: {
        useStaticTimes: true,
        waitForSpawned: true,
      },
    }).run()).toBe(undefined);
    expect(sideEffectMethod).toHaveBeenCalledTimes(6);
    expect(sideEffectMethod).toHaveBeenCalledWith('arg2-arg1-executed-1');
    expect(sideEffectMethod).toHaveBeenCalledWith('arg2-parent-arg2-arg1-arg2-arg2-executed-2');
    expect(sideEffectMethod).toHaveBeenCalledWith('arg1-arg2-executed-3');
    expect(sideEffectMethod).toHaveBeenCalledWith('arg1-parent-arg1-arg1-arg1-arg2-executed-4');
    expect(sideEffectMethod).toHaveBeenCalledWith('arg1-arg1-executed-5');
    expect(sideEffectMethod).toHaveBeenCalledWith('arg2-arg2-executed-6'); // Because the times are not additive
  });
});
