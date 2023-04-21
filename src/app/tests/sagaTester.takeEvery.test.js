import { delay, put, takeEvery } from 'redux-saga/effects';

import SagaTester from '../sagaTester';

describe('sagaTester - takeEvery effect', () => {
  it('should call the generator method every time an action matches', () => {
    let order = 1;
    function* method({ type }) {
      yield delay(50);
      yield put({ type: 'CALLED', arg: type, order: order++ });
    }
    function* saga() {
      yield takeEvery((a) => a.type.startsWith('y'), method);
      yield put({ type: 'yellow' });
      yield put({ type: 'yessir' });
      order++;
    }

    new SagaTester(saga, {
      expectedActions: [
        { action: { type: 'CALLED', order: 2, arg: 'yes' }, times: 1 },
        { action: { type: 'CALLED', order: 3, arg: 'yellow' }, times: 1 },
        { action: { type: 'CALLED', order: 4, arg: 'yessir' }, times: 1 },
      ],
    }).run({ type: 'yes' });
  });
  it('should call the generator only once if the option executeTakeGeneratorsOnlyOnce is true', () => {
    let order = 1;
    function* method({ type }) {
      yield delay(50);
      yield put({ type: 'CALLED', arg: type, order: order++ });
    }
    function* saga() {
      yield takeEvery((a) => a.type.startsWith('y'), method);
      yield put({ type: 'yellow' });
      yield put({ type: 'yessir' });
      order++;
    }

    new SagaTester(saga, {
      expectedActions: [
        { action: { type: 'CALLED', order: 2, arg: 'yes' }, times: 1 },
      ],
      options: {
        executeTakeGeneratorsOnlyOnce: true,
      },
    }).run({ type: 'yes' });
  });
  it('should not call the generator if the ignoreTakeGenerators pattern matches the action', () => {
    let order = 1;
    function* method(action) {
      yield delay(50);
      yield put({ type: 'CALLED', arg: action.type, order: order++ });
    }
    function* saga() {
      yield takeEvery((a) => a.type.startsWith('y'), method);
      yield put({ type: 'yellow' });
      yield put({ type: 'yessir' });
      order++;
    }

    new SagaTester(saga, {
      expectedActions: [
        { action: { type: 'CALLED', order: 2, arg: 'yessir' }, times: 1 },
      ],
      options: {
        ignoreTakeGenerators: ['yellow', (a) => (a.type.length < 4)],
      },
    }).run({ type: 'yes' });
  });
});
