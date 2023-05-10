import { fork, join } from 'redux-saga/effects';

import SagaTester from '../../sagaTester';

describe('debugShouldApply', () => {
  let logMock;

  beforeEach(() => {
    logMock = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    logMock.mockRestore();
  });

  it('should interruptions when matching the task ids or names provided in the config', () => {
    function* methodInner() { return 'whatever'; }
    function* method1() { const task = yield fork(methodInner, '1'); yield join([task]); }
    function* method2() { const task = yield fork(methodInner, '2'); yield join([task]); }
    function* method3() { const task = yield fork(methodInner, '3'); yield join([task]); }

    function* saga() {
      const task1 = yield fork(method1);
      const task2 = yield fork(method2);
      const task3 = yield fork(method3);
      yield join([task1, task2, task3]);
    }

    new SagaTester(saga, {
      expectedCalls: [
        { name: 'methodInner', call: true, times: 3, wait: true },
        { name: 'method1', call: true, times: 1, wait: true },
        { name: 'method2', call: true, times: 1, wait: true },
        { name: 'method3', call: true, times: 1, wait: true },
      ],
      debug: { interrupt: [3, 'method2'], bubble: false, unblock: false },
    }).run();

    expect(logMock).toHaveBeenCalledTimes(2);

    // first log, tree is pretty big since most tasks are blocked
    expect(logMock.mock.calls[0][0])
      .toEqual(`INTERRUPT
task: 2-method2, dependencies: 5, interruptionType: @@sagaTester__join__
`);
    expect(logMock.mock.calls[1][0])
      .toEqual(`INTERRUPT
task: 3-method3, dependencies: 6, interruptionType: @@sagaTester__join__
`);
  });
  it('should interruptions when matching the task ids or names provided in the config (single id', () => {
    function* method1() { return 'whatever'; }
    function* method2() { return 'whatever'; }
    function* method3() { return 'whatever'; }

    function* saga() {
      const task1 = yield fork(method1);
      const task2 = yield fork(method2);
      const task3 = yield fork(method3);
      yield join([task1, task2, task3]);
    }

    new SagaTester(saga, {
      expectedCalls: [
        { name: 'method1', call: true, wait: true },
        { name: 'method2', call: true, wait: true },
        { name: 'method3', call: true, wait: true },
      ],
      debug: { interrupt: 0 },
    }).run();

    expect(logMock).toHaveBeenCalledTimes(1);

    // first log, tree is pretty big since most tasks are blocked
    expect(logMock.mock.calls[0][0])
      .toEqual(`INTERRUPT
task: 0-root, dependencies: 1,2,3, interruptionType: @@sagaTester__join__
`);
  });
  it('should interruptions when matching the task ids or names provided in the config (single id', () => {
    function* method1() { return 'whatever'; }
    function* method2() { return 'whatever'; }
    function* method3() { return 'whatever'; }

    function* saga() {
      const task1 = yield fork(method1);
      const task2 = yield fork(method2);
      const task3 = yield fork(method3);
      yield join([task1, task2, task3]);
    }

    new SagaTester(saga, {
      expectedCalls: [
        { name: 'method1', call: true, wait: true },
        { name: 'method2', call: true, wait: true },
        { name: 'method3', call: true, wait: true },
      ],
      debug: { interrupt: 'root' },
    }).run();

    expect(logMock).toHaveBeenCalledTimes(1);

    // first log, tree is pretty big since most tasks are blocked
    expect(logMock.mock.calls[0][0])
      .toEqual(`INTERRUPT
task: 0-root, dependencies: 1,2,3, interruptionType: @@sagaTester__join__
`);
  });
});
