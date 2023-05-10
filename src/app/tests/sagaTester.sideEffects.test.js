import {
  all,
  call,
  put,
  delay,
  take,
  spawn,
  fork,
  cancel,
  cancelled,
  select,
} from 'redux-saga/effects';
import { createSelector } from 'reselect';

import SagaTester from '../sagaTester';

describe('sagaTester - sideEffects', () => {
  it('should work with put side effects (do not record action)', () => {
    function* saga() {
      yield delay(10);
      return yield all([
        take('TYPE-1'),
        take('TYPE-2'),
      ]);
    }

    expect(new SagaTester(saga, {
      expectedActions: [
        { type: 'TYPE-1', times: 0 },
        { type: 'TYPE-2', times: 0 },
      ],
      sideEffects: [
        { effect: put({ type: 'TYPE-1', arg: 'not this' }) },
        { wait: 50, effect: put({ type: 'TYPE-1' }) },
        { wait: 100, effect: put({ type: 'TYPE-2' }) },
      ],
    }).run({ type: 'yes' })).toEqual([
      { type: 'TYPE-1' },
      { type: 'TYPE-2' },
    ]);
  });
  it('should work with call side effects (do not record call)', async () => {
    jest.useFakeTimers();
    let order = 1;
    const promiseMethod = () => new Promise((resolve) => { setTimeout(() => resolve(`order-${order++}`), 1000000); });
    function* saga() {
      yield delay(10);
      return yield all([
        call(promiseMethod),
        new Promise((resolve) => { setTimeout(() => resolve(`order-${order++}`), 10000000); }),
        delay(100),
      ]);
    }
    const method = () => { order++; jest.runAllTimers(); };

    const result = await new SagaTester(saga, {
      expectedCalls: [
        { name: 'promiseMethod', times: 1, call: true },
        { name: 'method', times: 0 },
      ],
      sideEffects: [
        { wait: 5, effect: call(method) },
        { wait: 50, effect: call(() => { order++; jest.runAllTimers(); }) },
        { wait: 200, effect: call(() => { order++; }) },
      ],
    }).runAsync({ type: 'yes' });

    expect(result).toEqual([
      'order-3',
      'order-4',
      undefined,
    ]);

    expect(order).toBe(6);
  });
  it('should work with fork and spawn side effects (do not record calls)', () => {
    const callback = jest.fn();
    function* forkSideEffect(arg) {
      yield delay(20);
      yield put({ type: 'TYPE-1', arg });
      yield delay(100);
      callback(arg);
    }
    function* spawnSideEffect(arg) {
      yield delay(20);
      yield put({ type: 'TYPE-2', arg });
      yield delay(200);
      callback(arg);
    }
    function* saga() {
      yield delay(10);
      return yield all([
        take('TYPE-1'),
        take('TYPE-2'),
      ]);
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'forkSideEffect', times: 0 },
        { name: 'spawnSideEffect', times: 0 },
      ],
      sideEffects: [
        { wait: 50, effect: fork(forkSideEffect, 'arg1') },
        { wait: 50, effect: spawn(spawnSideEffect, 'arg2') },
      ],
    }).run({ type: 'yes' })).toEqual([
      { type: 'TYPE-1', arg: 'arg1' },
      { type: 'TYPE-2', arg: 'arg2' },
    ]);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('arg1');
  });
  it('should wait after spawn side effects if the option is set to do so (do not record calls)', () => {
    const callback = jest.fn();
    function* forkSideEffect(arg) {
      yield delay(20);
      yield put({ type: 'TYPE-1', arg });
      yield delay(100);
      callback(arg);
    }
    function* spawnSideEffect(arg) {
      yield delay(20);
      yield put({ type: 'TYPE-2', arg });
      yield delay(200);
      callback(arg);
    }
    function* saga() {
      yield delay(10);
      return yield all([
        take('TYPE-1'),
        take('TYPE-2'),
      ]);
    }

    expect(new SagaTester(saga, {
      expectedActions: [],
      expectedCalls: [
        { name: 'forkSideEffect', times: 0 },
        { name: 'spawnSideEffect', times: 0 },
      ],
      sideEffects: [
        { wait: 50, effect: fork(forkSideEffect, 'arg1') },
        { wait: 50, effect: spawn(spawnSideEffect, 'arg2') },
      ],
      options: {
        waitForSpawned: true,
      },
    }).run({ type: 'yes' })).toEqual([
      { type: 'TYPE-1', arg: 'arg1' },
      { type: 'TYPE-2', arg: 'arg2' },
    ]);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('arg1');
    expect(callback).toHaveBeenCalledWith('arg2');
  });
  it('should work with cancel side effects', () => {
    const callback = jest.fn();
    function* forkSideEffect(arg) {
      try {
        yield delay(20);
      } finally {
        const isCancelled = yield cancelled();
        callback(arg, isCancelled);
      }
    }
    function* spawnSideEffect(arg) {
      try {
        yield delay(20);
      } finally {
        const isCancelled = yield cancelled();
        callback(arg, isCancelled);
      }
    }
    function* saga() {
      let result = [];
      try {
        result = yield all([
          take('TYPE-1'),
          take('TYPE-2'),
        ]);
      } finally {
        const isCancelled = yield cancelled();
        result.push(isCancelled);
        // eslint-disable-next-line no-unsafe-finally
        return result;
      }
    }

    expect(new SagaTester(saga, {
      expectedActions: [],
      expectedCalls: [
        { name: 'forkSideEffect', times: 0 },
        { name: 'spawnSideEffect', times: 0 },
      ],
      sideEffects: [
        { effect: fork(forkSideEffect, 'arg1') },
        { effect: spawn(spawnSideEffect, 'arg2') },
        { wait: 5, effect: cancel() },
      ],
    }).run({ type: 'yes' })).toEqual([true]);

    // Spawned task is not cancelled because it is not treated as a child
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('arg1', true);
  });
  it('should work with changeSelectorConfig', () => {
    const callback = jest.fn();
    let order = 1;
    const actualSelector = createSelector((state) => state.reducerKey, (stateData) => stateData);
    function* saga() {
      while (true) {
        const result = yield select(actualSelector);
        callback(result, order++);
        if (result.isFinished) {
          break;
        }
        yield delay(30);
      }
    }

    new SagaTester(saga, {
      selectorConfig: {
        reducerKey: { value: 'value', isFinished: false },
      },
      sideEffects: [
        { wait: 50, changeSelectorConfig: (previousConfig) => ({ ...previousConfig, reducerKey: { ...previousConfig.reducerKey, isFinished: true } }) },
      ],
    }).run({ type: 'yes' });

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledWith({ value: 'value', isFinished: false }, 1);
    expect(callback).toHaveBeenCalledWith({ value: 'value', isFinished: false }, 2);
    expect(callback).toHaveBeenCalledWith({ value: 'value', isFinished: true }, 3);
  });
});
