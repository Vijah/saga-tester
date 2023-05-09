import {
  all,
  race,
  fork,
  join,
  delay,
} from 'redux-saga/effects';

import SagaTester from '../sagaTester';

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
