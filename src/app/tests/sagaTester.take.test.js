import { take, delay, put, fork, all, race } from 'redux-saga/effects';

import SagaTester from '../sagaTester';

describe('sagaTester - take effect', () => {
  it('should unblock a take effect after a task puts an action', () => {
    let actionOrder = 0;
    function* method() {
      yield delay(50);
      yield put({ type: 'NO MATCH', actionOrder: actionOrder++ });
      yield put({ type: 'TYPE', arg: 'arg', actionOrder: actionOrder++ });
      yield delay(50);
      yield put({ type: 'WHATEVER', arg: 'arg', actionOrder: actionOrder++ });
      yield delay(50);
      yield put({ type: 'The second one', arg: 'arg', actionOrder: actionOrder++ });
      yield delay(50);
      yield put({ type: 'ignored', arg: 41, actionOrder: actionOrder++ });
      yield put({ type: 'whatever', arg: 42, actionOrder: actionOrder++ });
      yield delay(50);
      yield put({ type: 'TYPE', arg: 'arg', actionOrder: actionOrder++ });
    }
    function* saga() {
      yield fork(method);
      const results = [];
      results.push(yield take('TYPE'));
      results.push(yield take('*'));
      results.push(yield take(['the first one', 'The second one']));
      results.push(yield take((action) => action.arg === 42));
      // I know, this is weird, but the doc said if the method has toString, "action.type will be tested against pattern.toString()"
      const pattern = () => false;
      pattern.toString = () => 'TYPE';
      results.push(yield take(pattern));
      return results;
    }

    expect(new SagaTester(saga, {}).run()).toEqual([
      { type: 'TYPE', arg: 'arg', actionOrder: 1 },
      { type: 'WHATEVER', arg: 'arg', actionOrder: 2 },
      { type: 'The second one', arg: 'arg', actionOrder: 3 },
      { type: 'whatever', arg: 42, actionOrder: 5 },
      { type: 'TYPE', arg: 'arg', actionOrder: 6 },
    ]);
  });
  it('should wait for take actions inside an all effect', () => {
    function* method() {
      yield delay(50);
      yield put({ type: 'TYPE', arg: 'arg' });
      yield delay(50);
      yield put({ type: 'WHATEVER', arg: 'arg' });
      yield delay(50);
      yield put({ type: 'The second one', arg: 'arg' });
    }

    function* saga() {
      yield fork(method);
      const pattern = () => false;
      pattern.toString = () => 'The second one';
      return yield all({
        a: take('TYPE'),
        b: all([take('*'), take(['The firstone', pattern])]),
      });
    }

    expect(new SagaTester(saga, {}).run()).toEqual({
      a: { type: 'TYPE', arg: 'arg' },
      b: [{ type: 'TYPE', arg: 'arg' }, { type: 'The second one', arg: 'arg' }],
    });
  });
  it('should wait for take actions inside an all effect (array; should work even if the same type is present multiple times)', () => {
    function* method() {
      yield delay(50);
      yield put({ type: 'TYPE', arg: 'arg' });
    }

    function* saga() {
      yield fork(method);
      return yield all([
        take('TYPE'),
        take('TYPE'),
      ]);
    }

    expect(new SagaTester(saga, {}).run()).toEqual([
      { type: 'TYPE', arg: 'arg' },
      { type: 'TYPE', arg: 'arg' },
    ]);
  });
  it('should wait for take actions inside an all effect (array; should not confuse two take patterns with a single array pattern)', () => {
    function* method() {
      yield delay(50);
      yield put({ type: 'TYPE', arg: 'arg' });
      yield delay(50);
      yield put({ type: 'TYPE2', arg: 'arg' });
    }

    function* saga() {
      yield fork(method);
      return yield all([
        take('TYPE'),
        take('TYPE2'),
      ]);
    }

    expect(new SagaTester(saga, {}).run()).toEqual([
      { type: 'TYPE', arg: 'arg' },
      { type: 'TYPE2', arg: 'arg' },
    ]);
  });
  it('should wait for take actions inside an all effect (array; single element)', () => {
    function* method() {
      yield delay(50);
      yield put({ type: 'TYPE', arg: 'arg' });
      yield delay(50);
      yield put({ type: 'TYPE2', arg: 'arg' });
    }

    function* saga() {
      yield fork(method);
      return yield all([
        take('TYPE2'),
      ]);
    }

    expect(new SagaTester(saga, {}).run()).toEqual([
      { type: 'TYPE2', arg: 'arg' },
    ]);
  });
  it('should wait for take actions inside an all effect (object; should work even if the same type is present multiple times)', () => {
    function* method() {
      yield delay(50);
      yield put({ type: 'TYPE', arg: 'arg' });
    }

    function* saga() {
      yield fork(method);
      return yield all({
        a: take('TYPE'),
        b: take('TYPE'),
      });
    }

    expect(new SagaTester(saga, {}).run()).toEqual({
      a: { type: 'TYPE', arg: 'arg' },
      b: { type: 'TYPE', arg: 'arg' },
    });
  });
  it('should wait for take actions inside a race effect', () => {
    function* method() {
      yield delay(50);
      yield put({ type: 'TYPE', arg: 'arg' });
    }

    function* saga() {
      yield fork(method);
      return yield race({
        a: take('not this'),
        b: race([take((a) => a.arg === 'arg'), take(['The first one', 'The second one'])]),
      });
    }

    expect(new SagaTester(saga, {}).run()).toEqual({
      a: undefined,
      b: [{ type: 'TYPE', arg: 'arg' }, undefined],
    });
  });
});
