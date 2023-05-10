import {
  all,
  delay,
  call,
  fork,
  cancelled,
  spawn,
  join,
  putResolve,
} from 'redux-saga/effects';

import SagaTester from '../sagaTester';

describe('sagaTester - error handling', () => {
  it('should bubble up the error of an instantaneous call effect', () => {
    const error = new Error('ERROR');
    const callback = jest.fn();
    function doNothing() { /* do nothing */ }
    function someCall() { throw error; }
    function* saga() {
      try {
        yield call(doNothing);
        yield call(someCall);
        return 'no error';
      } catch (e) {
        callback(e);
        return e;
      }
    }

    expect(new SagaTester(saga, { options: { failOnUnconfigured: false } }).run()).toEqual(error);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(error);
  });
  it('should bubble up the error of an instantaneous fork effect', () => {
    const error = new Error('ERROR');
    const callback = jest.fn();
    function* doNothing() { /* do nothing */ }
    function* someCall() { throw error; }
    function* saga() {
      try {
        yield fork(doNothing);
        yield fork(someCall);
        return 'no error';
      } catch (e) {
        callback(e);
        return e;
      }
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'doNothing', call: true },
        { name: 'someCall', call: true },
      ],
    }).run()).toEqual(error);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(error);
  });
  it('should bubble up the error if an action inside an all effect or inside a fork is thrown', () => {
    const callback = jest.fn();
    function someCall() {}
    function* method() {
      try {
        yield call(someCall);
      } catch (e) {
        callback('someCall', e);
        throw e;
      }
    }
    function* cancelledMethod() {
      try {
        yield delay(1000);
      } finally {
        const isCancelled = yield cancelled();
        callback('cancelledMethod', isCancelled);
        // eslint-disable-next-line no-unsafe-finally
        return isCancelled;
      }
    }
    function* saga() {
      let task1;
      let task2;
      try {
        task1 = yield fork(method);
        task2 = yield fork(cancelledMethod);
        return yield all([
          join(task1),
          join(task2),
        ]);
      } catch (e) {
        callback('root', e);
        return yield join([task1, task2]);
      }
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'someCall', wait: 5, throw: 'ERROR' },
      ],
      options: { failOnUnconfigured: false },
    }).run({ type: 'yes' })).toEqual(['ERROR', true]);

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledWith('someCall', 'ERROR');
    expect(callback).toHaveBeenCalledWith('cancelledMethod', true);
    expect(callback).toHaveBeenCalledWith('root', 'ERROR');
  });
  it('should not bubble the error if it comes from a spawn effect', () => {
    const callback = jest.fn();
    function someCall() {}
    function* method() {
      try {
        yield delay(5);
        yield call(someCall);
      } catch (e) {
        callback('someCall', e);
        throw e;
      }
    }
    function* cancelledMethod() {
      try {
        yield delay(1000);
      } finally {
        const isCancelled = yield cancelled();
        callback('cancelledMethod', isCancelled);
        // eslint-disable-next-line no-unsafe-finally
        return isCancelled;
      }
    }
    function* saga() {
      let task1;
      let task2;
      try {
        task1 = yield spawn(method);
        task2 = yield spawn(cancelledMethod);
        return yield all([
          join(task1),
          join(task2),
        ]);
      } catch (e) {
        callback('root', e);
        return yield join([task1, task2]);
      }
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'someCall', throw: 'ERROR' },
      ],
      options: {
        swallowSpawnErrors: true,
        failOnUnconfigured: false,
      },
    }).run({ type: 'yes' })).toEqual(['ERROR', false]);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('someCall', 'ERROR');
    expect(callback).toHaveBeenCalledWith('cancelledMethod', false);
  });
  it('should bubble up the error of a promise', async () => {
    jest.useFakeTimers();
    const callback = jest.fn();
    function* method() {
      try {
        // eslint-disable-next-line prefer-promise-reject-errors
        yield new Promise((resolve, reject) => { setTimeout(() => reject('ERROR'), 1000000); });
      } catch (e) {
        callback('someCall', e);
        throw e;
      }
    }
    function* saga() {
      try {
        yield fork(method);
        yield delay(100);
      } catch (e) {
        callback('root', e);
      }
    }

    await new SagaTester(saga, {
      sideEffects: [
        { wait: 50, effect: call(() => { jest.runAllTimers(); }) },
      ],
      options: { failOnUnconfigured: false },
    }).runAsync();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('someCall', 'ERROR');
    expect(callback).toHaveBeenCalledWith('root', 'ERROR');
  });
  it('should bubble up the error of a call (promise)', async () => {
    jest.useFakeTimers();
    const callback = jest.fn();
    // eslint-disable-next-line prefer-promise-reject-errors
    const promiseMethod = () => new Promise((resolve, reject) => { setTimeout(() => { reject('ERROR'); }, 1000000); });
    function* method() {
      try {
        yield call(promiseMethod);
      } catch (e) {
        callback('someCall', e);
        throw e;
      }
    }
    function* saga() {
      try {
        yield fork(method);
        yield delay(100);
      } catch (e) {
        callback('root', e);
      }
    }

    await new SagaTester(saga, {
      expectedCalls: [
        { name: 'promiseMethod', call: true },
      ],
      sideEffects: [
        { wait: 50, effect: call(() => { jest.runAllTimers(); }) },
      ],
      options: { failOnUnconfigured: false },
    }).runAsync();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('someCall', 'ERROR');
    expect(callback).toHaveBeenCalledWith('root', 'ERROR');
  });
  it('should bubble up the error of a call (wait + promise)', async () => {
    jest.useFakeTimers();
    const callback = jest.fn();
    // eslint-disable-next-line prefer-promise-reject-errors
    const promiseMethod = () => new Promise((resolve, reject) => { setTimeout(() => { reject('ERROR'); }, 1000000); });
    function* method() {
      try {
        yield call(promiseMethod);
      } catch (e) {
        callback('someCall', e);
        throw e;
      }
    }
    function* saga() {
      try {
        yield fork(method);
        yield delay(100);
      } catch (e) {
        callback('root', e);
      }
    }

    await new SagaTester(saga, {
      expectedCalls: [
        { name: 'promiseMethod', call: true, wait: 20 },
      ],
      sideEffects: [
        { wait: 50, effect: call(() => { jest.runAllTimers(); }) },
      ],
      options: { failOnUnconfigured: false },
    }).runAsync();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('someCall', 'ERROR');
    expect(callback).toHaveBeenCalledWith('root', 'ERROR');
  });
  it('should bubble up the error of a call (deferred call)', () => {
    const callback = jest.fn();
    const deferredMethod = () => {
      // eslint-disable-next-line no-throw-literal
      throw 'ERROR';
    };
    function* method() {
      try {
        yield call(deferredMethod);
      } catch (e) {
        callback('someCall', e);
        throw e;
      }
    }
    function* saga() {
      try {
        yield fork(method);
        yield delay(100);
      } catch (e) {
        callback('root', e);
      }
    }

    new SagaTester(saga, {
      expectedCalls: [
        { name: 'deferredMethod', wait: 50, call: true },
      ],
      options: { failOnUnconfigured: false },
    }).run();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('someCall', 'ERROR');
    expect(callback).toHaveBeenCalledWith('root', 'ERROR');
  });
  it('should bubble up the error of a fork', () => {
    const callback = jest.fn();
    function* method() {
      yield delay(50);
      // eslint-disable-next-line no-throw-literal
      throw 'ERROR';
    }
    function* saga() {
      try {
        yield fork(method);
        yield delay(100);
      } catch (e) {
        callback('root', e);
      }
    }

    new SagaTester(saga, { options: { failOnUnconfigured: false } }).run();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('root', 'ERROR');
  });
  it('should bubble up the error of a generator', () => {
    const callback = jest.fn();
    function* method() {
      // eslint-disable-next-line no-throw-literal
      throw 'ERROR';
    }
    function* saga() {
      try {
        yield method();
      } catch (e) {
        callback('root', e);
      }
    }

    new SagaTester(saga, { options: { failOnUnconfigured: false } }).run();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('root', 'ERROR');
  });
  it('should bubble up the error of a putResolve', async () => {
    jest.useFakeTimers();
    const callback = jest.fn();
    // eslint-disable-next-line prefer-promise-reject-errors
    const action = () => new Promise((resolve, reject) => { setTimeout(() => { reject('ERROR'); }, 1000000); });
    function* method() {
      try {
        yield putResolve(action);
      } catch (e) {
        callback('someCall', e);
        throw e;
      }
    }
    function* cancelledMethod() {
      try {
        yield delay(100);
      } catch (e) {
        callback('cancelled', e);
        throw e;
      }
    }
    function* saga() {
      try {
        yield fork(cancelledMethod);
        yield fork(method);
        yield delay(100);
      } catch (e) {
        callback('root', e);
      }
    }

    await new SagaTester(saga, {
      sideEffects: [
        { wait: 50, effect: call(() => { jest.runAllTimers(); }) },
      ],
      options: { failOnUnconfigured: false },
    }).runAsync();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('someCall', 'ERROR');
    expect(callback).toHaveBeenCalledWith('root', 'ERROR');
  });
  it('should bubble up the error of a join', () => {
    const callback = jest.fn();
    function* method() {
      yield delay(10);
      // eslint-disable-next-line no-throw-literal
      throw 'ERROR';
    }
    function* noError() {
      let thrown = false;
      try {
        yield delay(100);
      } catch (e) {
        thrown = true;
      } finally {
        const isCancelled = yield cancelled();
        callback('noError', isCancelled, thrown);
      }
    }
    function* saga() {
      try {
        const task1 = yield fork(noError);
        const task2 = yield fork(method);
        yield join([task1, task2]);
      } catch (e) {
        callback('root', e);
      }
    }

    new SagaTester(saga, { options: { failOnUnconfigured: false } }).run();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('noError', true, false);
    expect(callback).toHaveBeenCalledWith('root', 'ERROR');
  });
});
