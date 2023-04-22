import { cancelled, delay, put, throttle } from 'redux-saga/effects';

import SagaTester from '../sagaTester';

describe('sagaTester - throttle effect', () => {
  it('should not call when a trigger happens before the end of the throttle timer', () => {
    let order = 1;
    function* method({ type }) {
      try {
        yield delay(50);
        yield put({ type: 'CALLED', arg: type, order: order++ });
      } finally {
        if (yield cancelled()) {
          yield put({ type: 'CALLED', arg: type, isCancelled: true, order: order++ });
        }
      }
    }
    function* saga() {
      yield throttle(100, ['yellow', 'yessir', 'yes'], method);
      yield delay(30);
      yield put({ type: 'yellow' });
      yield delay(60);
      yield put({ type: 'yellow' });
      yield delay(11);
      yield put({ type: 'yessir' });
      yield put({ type: 'yessir' });
      order++;
    }

    new SagaTester(saga, {
      expectedActions: [
        { action: { type: 'CALLED', order: 1, arg: 'yes' }, times: 1 },
        { action: { type: 'CALLED', order: 3, arg: 'yessir' }, times: 1 },
      ],
    }).run({ type: 'yes' });
  });
});
