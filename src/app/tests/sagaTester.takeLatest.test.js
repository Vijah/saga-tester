import { cancelled, delay, put, takeLatest } from 'redux-saga/effects';

import SagaTester from '../sagaTester';

describe('sagaTester - takeLatest effect', () => {
  it('should cancel the task if it is not finished yet and another one is triggered', () => {
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
      yield takeLatest(['yellow', 'yessir', 'yes'], method);
      yield delay(25);
      yield put({ type: 'yellow' });
      yield delay(51);
      yield put({ type: 'yessir' });
      order++;
    }

    new SagaTester(saga, {
      expectedActions: [
        { action: { type: 'CALLED', order: 1, isCancelled: true, arg: 'yes' }, times: 1 },
        { action: { type: 'CALLED', order: 2, arg: 'yellow' }, times: 1 },
        { action: { type: 'CALLED', order: 4, arg: 'yessir' }, times: 1 },
      ],
    }).run({ type: 'yes' });
  });
});
