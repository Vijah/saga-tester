import { cancelled, delay, put, takeLeading } from 'redux-saga/effects';

import SagaTester from '../sagaTester';

describe('sagaTester - takeLeading effect', () => {
  it('should call the generator method only if the generator is not already matching', () => {
    let order = 1;
    function* method({ type }) {
      try {
        yield delay(50);
        yield put({ type: 'CALLED', arg: type, order: order++ });
      } finally {
        if (yield cancelled()) {
          yield put({ type: 'CALLED', cancelled: true });
        }
      }
    }
    function* saga() {
      yield takeLeading('*', method);
      yield put({ type: 'yellow' });
      yield delay(51);
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
