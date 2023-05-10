import { all, call, fork, put, putResolve, take } from 'redux-saga/effects';
import delay from '@redux-saga/delay-p';

import SagaTester from '../sagaTester';

describe('sagaTester - reduxThunk actions', () => {
  it('should handle an action taking a dispatch as a parameter and returning a promise, awaiting it inside a putResolve but not inside a put', async () => {
    jest.useFakeTimers();
    let order = 1;
    const fetchSomething = (type) => (dispatch) => delay(500).then(() => dispatch({ type }));
    function* method(pattern) {
      const action = yield take(pattern);
      yield put({ type: 'RECEIVED', action, order: order++ });
    }
    function* saga() {
      yield fork(method, 'TYPE-1');
      yield fork(method, 'TYPE-2');
      yield putResolve(fetchSomething('TYPE-1')); // is not taken in the all since this one is blocking
      yield put(fetchSomething('TYPE-2'));
      yield put(fetchSomething('TYPE-3'));
      order++;
      // The task can take its own action since the action is not put immediately
      return yield all([
        take(['TYPE-1', 'TYPE-3']),
        take('TYPE-2'),
      ]);
    }

    const result = await new SagaTester(saga, {
      expectedActions: [
        { action: { type: 'RECEIVED', order: 2, action: { type: 'TYPE-1' } }, times: 1 },
        { action: { type: 'RECEIVED', order: 5, action: { type: 'TYPE-2' } }, times: 1 },
      ],
      sideEffects: [
        { wait: 50, effect: call(() => { order++; jest.runAllTimers(); }) },
        { wait: 100, effect: call(() => { order++; jest.runAllTimers(); }) },
      ],
      options: { failOnUnconfigured: false },
    }).runAsync({ type: 'yes' });

    expect(result).toEqual([
      { type: 'TYPE-3' },
      { type: 'TYPE-2' },
    ]);
  });
  it('should handle an action taking a dispatch, getState method, and options parameter', () => {
    let order = 1;
    const fetchSomething = (type) => (dispatch, getState, options) => { dispatch({ type, state: getState(), options }); };
    function* method(pattern) {
      const action = yield take(pattern);
      yield put({ type: 'RECEIVED', action, order: order++ });
    }
    function* saga() {
      yield fork(method, 'TYPE-1');
      yield fork(method, 'TYPE-2');
      yield putResolve(fetchSomething('TYPE-1'));
      yield put(fetchSomething('TYPE-2'));
      order++;
    }

    new SagaTester(saga, {
      selectorConfig: {
        someState: 'someValue',
      },
      expectedActions: [
        { action: { type: 'RECEIVED', order: 1, action: { type: 'TYPE-1', state: { someState: 'someValue' }, options: { someOption: 'someValue' } } }, times: 1 },
        { action: { type: 'RECEIVED', order: 2, action: { type: 'TYPE-2', state: { someState: 'someValue' }, options: { someOption: 'someValue' } } }, times: 1 },
      ],
      options: {
        reduxThunkOptions: { someOption: 'someValue' },
        failOnUnconfigured: false,
      },
    }).run();
  });
  it('should have a state that is up to date with the selector config at time of execution', async () => {
    jest.useFakeTimers();
    let order = 1;
    const fetchSomething = (type) => (dispatch, getState, options) => delay(500).then(() => { dispatch({ type, state: getState(), options }); });
    function* method(pattern) {
      const action = yield take(pattern);
      yield put({ type: 'RECEIVED', action, order: order++ });
    }
    function* saga() {
      yield fork(method, 'TYPE-1');
      yield put(fetchSomething('TYPE-1'));
      order++;
    }

    await new SagaTester(saga, {
      selectorConfig: {
        someFlag: false,
      },
      expectedActions: [
        { action: { type: 'RECEIVED', order: 3, action: { type: 'TYPE-1', state: { someFlag: true }, options: {} } }, times: 1 },
      ],
      sideEffects: [
        { wait: 30, changeSelectorConfig: (previousConfig) => ({ ...previousConfig, someFlag: true }) },
        { wait: 50, effect: call(() => { order++; jest.runAllTimers(); }) },
      ],
      options: { failOnUnconfigured: false },
    }).runAsync();
  });
});
