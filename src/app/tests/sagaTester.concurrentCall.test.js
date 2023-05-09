import {
  call,
  all,
} from 'redux-saga/effects';

import {
  SagaTester,
} from '..';

describe('concurrent call', () => {
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
});
