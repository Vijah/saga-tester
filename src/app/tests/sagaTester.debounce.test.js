import { cancelled, delay, put, debounce } from 'redux-saga/effects';

import SagaTester from '../sagaTester';

describe('sagaTester - debounce effect', () => {
  it('should not call until the timer elapses, resetting the timer ever time a trigger is caught, and calling only the last trigger', () => {
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
      yield debounce(100, ['yellow', 'yessir', 'yes', 'yoo'], method);
      yield delay(30);
      yield put({ type: 'yellow' });
      yield delay(60);
      yield put({ type: 'yellow' });
      order++;
      yield delay(101);
      yield put({ type: 'yessir' });
      yield delay(101);
      yield put({ type: 'yoo' });
      order++;
      yield delay(50);
      order++;
    }

    new SagaTester(saga, {
      expectedActions: [
        { action: { type: 'CALLED', order: 2, arg: 'yellow' }, times: 1 },
        { action: { type: 'CALLED', order: 4, arg: 'yessir' }, times: 1 },
        { action: { type: 'CALLED', order: 6, arg: 'yoo' }, times: 1 },
      ],
    }).run({ type: 'yes' });
  });
});
