import { cps, call, all, fork, join, cancelled, delay } from 'redux-saga/effects';

import SagaTester from '../sagaTester';

describe('sagaTester - cps effect', () => {
  it('should handle basic invocation of cps effect (setTimeout, no error)', () => {
    jest.useFakeTimers();
    let order = 1;
    const method = (param1, callback) => {
      setTimeout(() => {
        callback(null, `${param1}-order-${order++}-done`);
      }, 1000);
    };

    function* saga() {
      return yield cps(method, 'param1');
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'method', params: ['param1'], call: true },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; jest.runAllTimers(); }) },
      ],
    }).run()).toBe('param1-order-2-done');
  });
  it('should handle basic invocation of cps effect (setTimeout, error)', () => {
    jest.useFakeTimers();
    let order = 1;
    const method = (param1, callback) => {
      setTimeout(() => {
        callback(`${param1}-order-${order++}-done`, null);
      }, 1000);
    };

    function* saga() {
      try {
        return yield cps(method, 'param1');
      } catch (e) {
        return `ERROR-${e}`;
      }
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'method', params: ['param1'], call: true },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; jest.runAllTimers(); }) },
      ],
    }).run()).toBe('ERROR-param1-order-2-done');
  });
  it('should handle basic invocation of cps effect (syncronous, no error)', () => {
    const method = (param1, callback) => {
      callback(null, `${param1}-done`);
    };

    function* saga() {
      return yield cps(method, 'param1');
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'method', params: ['param1'], call: true },
      ],
    }).run()).toBe('param1-done');
  });
  it('should handle basic invocation of cps effect (syncronous, error)', () => {
    const method = (param1, callback) => {
      callback(`${param1}-done`, null);
    };

    function* saga() {
      try {
        return yield cps(method, 'param1');
      } catch (e) {
        return `ERROR-${e}`;
      }
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'method', params: ['param1'], call: true },
      ],
    }).run()).toBe('ERROR-param1-done');
  });
  it('should handle [context, fn] invocation of cps effect', () => {
    jest.useFakeTimers();
    const context = {
      contextValue: 'contextValue1',
    };
    let order = 1;
    function method(param1, callback) {
      setTimeout(() => {
        callback(null, `${param1}-${this.contextValue}-order-${order++}-done`);
      }, 1000);
    }

    function* saga() {
      return yield cps([context, method], 'param1');
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'method', params: ['param1'], call: true },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; jest.runAllTimers(); }) },
      ],
    }).run()).toBe('param1-contextValue1-order-2-done');
  });
  it('should handle { context, fn: function } invocation of cps effect', () => {
    jest.useFakeTimers();
    const context = {
      contextValue: 'contextValue1',
    };
    let order = 1;
    function method(param1, callback) {
      const boundThis = this;
      setTimeout(() => {
        callback(null, `${param1}-${boundThis.contextValue}-order-${order++}-done`);
      }, 1000);
    }

    function* saga() {
      return yield cps({ context, fn: method }, 'param1');
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'method', params: ['param1'], call: true },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; jest.runAllTimers(); }) },
      ],
    }).run()).toBe('param1-contextValue1-order-2-done');
  });
  it('should handle { context, fn: string } invocation of cps effect', () => {
    jest.useFakeTimers();
    let order = 1;
    const context = {
      contextValue: 'contextValue1',
      method: function method(param1, callback) {
        const boundThis = this;
        setTimeout(() => {
          callback(null, `${param1}-${boundThis.contextValue}-order-${order++}-done`);
        }, 1000);
      },
    };

    function* saga() {
      return yield cps({ context, fn: 'method' }, 'param1');
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'method', params: ['param1'], call: true },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; jest.runAllTimers(); }) },
      ],
    }).run()).toBe('param1-contextValue1-order-2-done');
  });
  it('should cancel sibling tasks on error', () => {
    jest.useFakeTimers();
    const finishCallback = jest.fn();
    let order = 1;

    const method = (param1, callback) => {
      setTimeout(() => {
        callback(`${param1}-order-${order++}-done`, null);
      }, 1000);
    };

    function* someTask() {
      try {
        yield delay(1000);
      } finally {
        order++;
        const isCancelled = yield cancelled();
        finishCallback(isCancelled);
      }
    }

    function* saga() {
      try {
        const task1 = yield fork(someTask);
        return yield all([
          cps(method, 'param1'),
          join(task1),
        ]);
      } catch (e) {
        return `ERROR-${e}`;
      }
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'someTask', call: true },
        { name: 'method', params: ['param1'], call: true },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; jest.runAllTimers(); }) },
      ],
    }).run()).toBe('ERROR-param1-order-2-done');

    expect(finishCallback).toHaveBeenCalledTimes(1);
    expect(finishCallback).toHaveBeenCalledWith(true);
  });
  it('should hand awaiting the cps effect (timeout, no error)', () => {
    jest.useFakeTimers();
    let order = 1;
    const method = (param1, callback) => {
      setTimeout(() => {
        callback(null, `${param1}-order-${order++}-done`);
      }, 1000);
    };

    function* saga() {
      return yield cps(method, 'param1');
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { wait: 50, name: 'method', params: ['param1'], call: true },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; jest.runAllTimers(); }) },
        { wait: 60, effect: call(() => { order++; jest.runAllTimers(); }) },
      ],
    }).run()).toBe('param1-order-3-done');
  });
  it('should hand awaiting the cps effect (timeout, error)', () => {
    jest.useFakeTimers();
    let order = 1;
    const method = (param1, callback) => {
      setTimeout(() => {
        callback(`${param1}-order-${order++}-done`, null);
      }, 1000);
    };

    function* saga() {
      try {
        return yield cps(method, 'param1');
      } catch (e) {
        return `ERROR-${e}`;
      }
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { wait: 50, name: 'method', params: ['param1'], call: true },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; jest.runAllTimers(); }) },
        { wait: 60, effect: call(() => { order++; jest.runAllTimers(); }) },
      ],
    }).run()).toBe('ERROR-param1-order-3-done');
  });
  it('should hand awaiting the cps effect (no timeout, no error)', () => {
    let order = 1;
    const method = (param1, callback) => {
      callback(null, `${param1}-order-${order++}-done`);
    };

    function* saga() {
      return yield cps(method, 'param1');
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { wait: 50, name: 'method', params: ['param1'], call: true },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; }) },
        { wait: 60, effect: call(() => { order++; }) },
      ],
    }).run()).toBe('param1-order-2-done');
  });
  it('should hand awaiting the cps effect (no timeout, error)', () => {
    let order = 1;
    const method = (param1, callback) => {
      callback(`${param1}-order-${order++}-done`, null);
    };

    function* saga() {
      try {
        return yield cps(method, 'param1');
      } catch (e) {
        return `ERROR-${e}`;
      }
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { wait: 50, name: 'method', params: ['param1'], call: true },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; }) },
        { wait: 60, effect: call(() => { order++; }) },
      ],
    }).run()).toBe('ERROR-param1-order-2-done');
  });
  it('should hand awaiting the cps effect (no timeout, no error)', () => {
    let order = 1;
    const method = (param1, callback) => {
      callback(null, `${param1}-order-${order++}-done`);
    };

    function* saga() {
      return yield cps(method, 'param1');
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { wait: 50, name: 'method', params: ['param1'], call: true },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; }) },
        { wait: 60, effect: call(() => { order++; }) },
      ],
    }).run()).toBe('param1-order-2-done');
  });
  it('should hand mocking a cps effect (awaited output)', () => {
    let order = 1;
    const method = (param1, callback) => {
      callback(`${param1}-order-${order++}-done`, null);
    };

    function* saga() {
      try {
        const result = yield cps(method, 'param1');
        return `${result}-order-${order++}`;
      } catch (e) {
        return `ERROR-${e}`;
      }
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { wait: 50, name: 'method', params: ['param1'], output: 'RESULT' },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; }) },
      ],
    }).run()).toBe('RESULT-order-2');
  });
  it('should hand mocking a cps effect (immediate output)', () => {
    let order = 1;
    const method = (param1, callback) => {
      callback(`${param1}-order-${order++}-done`, null);
    };

    function* saga() {
      try {
        const result = yield cps(method, 'param1');
        return `${result}-order-${order++}`;
      } catch (e) {
        return `ERROR-${e}`;
      }
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'method', params: ['param1'], output: 'RESULT' },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; }) },
      ],
    }).run()).toBe('RESULT-order-1');
  });
  it('should hand mocking a cps effect (awaited throw)', () => {
    let order = 1;
    const method = (param1, callback) => {
      callback(`${param1}-order-${order++}-done`, null);
    };

    function* saga() {
      try {
        return yield cps(method, 'param1');
      } catch (e) {
        return `${e}-order-${order++}`;
      }
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { wait: 50, name: 'method', params: ['param1'], throw: 'ERROR' },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; }) },
      ],
    }).run()).toBe('ERROR-order-2');
  });
  it('should hand mocking a cps effect (immediate throw)', () => {
    let order = 1;
    const method = (param1, callback) => {
      callback(`${param1}-order-${order++}-done`, null);
    };

    function* saga() {
      try {
        return yield cps(method, 'param1');
      } catch (e) {
        return `${e}-order-${order++}`;
      }
    }

    expect(new SagaTester(saga, {
      expectedCalls: [
        { name: 'method', params: ['param1'], throw: 'ERROR' },
      ],
      sideEffects: [
        { wait: 10, effect: call(() => { order++; }) },
      ],
    }).run()).toBe('ERROR-order-1');
  });
});
