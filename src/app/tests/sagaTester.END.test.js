import {
  cancelled,
  delay,
  put,
  fork,
  take,
  takeMaybe,
  join,
  race,
  all,
} from 'redux-saga/effects';
import { END } from 'redux-saga';

import SagaTester from '../sagaTester';

describe('sagaTester - END action', () => {
  it('should cancel all tasks waiting on a take effect, but not those waiting on a takeMaybe effect', () => {
    let order = 1;
    function* takeMaybeMethod(pattern) {
      try {
        const result = yield takeMaybe(pattern);
        yield put({ type: 'CALLED', arg: result, order: order++ });
      } finally {
        if (yield cancelled()) {
          yield put({ type: 'CALLED', arg: `takeMaybe-${pattern}`, order: order++, isCancelled: true });
        }
      }
    }
    function* takeMethod() {
      try {
        yield take('SOMETHING');
        yield put({ type: 'CALLED', arg: 'take', order: order++ });
      } finally {
        if (yield cancelled()) {
          yield put({ type: 'CALLED', arg: 'take', order: order++, isCancelled: true });
        }
      }
    }
    function* waitMethod() {
      try {
        yield delay(50);
        yield put({ type: 'CALLED', arg: 'wait', order: order++ });
      } finally {
        if (yield cancelled()) {
          yield put({ type: 'CALLED', arg: 'wait', order: order++, isCancelled: true });
        }
      }
    }
    function* saga() {
      yield fork(waitMethod);
      yield fork(takeMethod);
      yield fork(takeMaybeMethod, END.type);
      yield fork(takeMaybeMethod, 'MATCH');
      yield put({ type: 'MATCH' });
      yield put(END);
      yield put({ type: 'SOMETHING' });
      order++;
    }

    new SagaTester(saga, {
      expectedActions: [
        { action: { type: 'CALLED', order: 1, arg: { type: 'MATCH' } }, times: 1 },
        { action: { type: 'CALLED', order: 2, arg: 'take', isCancelled: true }, times: 1 },
        { action: { type: 'CALLED', order: 3, arg: END }, times: 1 },
        { action: { type: 'CALLED', order: 5, arg: 'wait' }, times: 1 },
      ],
      options: { failOnUnconfigured: false },
    }).run({ type: 'yes' });
  });
  it('should cancel children tasks as well', () => {
    let order = 1;
    function* childMethod(arg) {
      try {
        yield delay(1000);
      } finally {
        const isCancelled = yield cancelled();
        // eslint-disable-next-line no-unsafe-finally
        return `child-${arg}-cancelled-${isCancelled}-order-${order++}`;
      }
    }
    function* takeMaybeMethod(pattern) {
      let result;
      let task;
      try {
        task = yield fork(childMethod, 'takeMaybe');
        result = yield takeMaybe(pattern);
      } finally {
        const isCancelled = yield cancelled();
        const parentResult = `takeMaybe-${result.type}-cancelled-${isCancelled}-order-${order++}`;
        const childResult = yield join(task);
        // eslint-disable-next-line no-unsafe-finally
        return [parentResult, childResult];
      }
    }
    function* takeMethod(pattern, isArray) {
      let result = { type: 'NOTHING' };
      let task;
      try {
        task = yield fork(childMethod, 'take');
        result = yield take(pattern);
      } finally {
        const isCancelled = yield cancelled();
        const parentResult = `take-${result?.type}-cancelled-${isCancelled}-order-${order++}`;
        const childResult = yield join(isArray ? [task] : task);
        // eslint-disable-next-line no-unsafe-finally
        return [parentResult, childResult];
      }
    }
    function* saga() {
      const task1 = yield fork(takeMethod, 'SOMETHING');
      const task2 = yield fork(takeMethod, 'WHATEVER', true);
      const task3 = yield fork(takeMaybeMethod, END.type);
      yield put(END);
      yield put({ type: 'SOMETHING' });
      order++;
      return yield join([task1, task2, task3]);
    }

    expect(new SagaTester(saga, { options: { failOnUnconfigured: false } }).run()).toEqual([
      ['take-NOTHING-cancelled-true-order-3', 'child-take-cancelled-true-order-2'],
      ['take-NOTHING-cancelled-true-order-4', ['child-take-cancelled-true-order-1']],
      [`takeMaybe-${END.type}-cancelled-false-order-5`, 'child-takeMaybe-cancelled-false-order-7'],
    ]);
  });
  it('should cancel races and all effects', () => {
    let order = 1;
    function* takeMaybeAll() {
      let result;
      try {
        result = yield all([
          takeMaybe('A'),
          takeMaybe(() => true),
        ]);
      } finally {
        const isCancelled = yield cancelled();
        // eslint-disable-next-line no-unsafe-finally
        return `takeMaybeAll-${result[0].type}-${result[1].type}-cancelled-${isCancelled}-order-${order++}`;
      }
    }
    function* takeMaybeRace() {
      let result;
      try {
        result = yield race([
          takeMaybe('A'),
          takeMaybe(() => true),
        ]);
      } finally {
        const isCancelled = yield cancelled();
        // eslint-disable-next-line no-unsafe-finally
        return `takeMaybeRace-${result[0]?.type}-${result[1]?.type}-cancelled-${isCancelled}-order-${order++}`;
      }
    }
    function* takeAll() {
      let result = [{ type: 'NOTHING' }, { type: 'NOTHING' }];
      try {
        result = yield all([
          take('A'),
          take(() => true),
        ]);
      } finally {
        const isCancelled = yield cancelled();
        // eslint-disable-next-line no-unsafe-finally
        return `takeAll-${result[0].type}-${result[1].type}-cancelled-${isCancelled}-order-${order++}`;
      }
    }
    function* takeRace() {
      let result = [{ type: 'NOTHING' }, { type: 'NOTHING' }];
      try {
        result = yield race([
          take('A'),
          take(() => true),
        ]);
      } finally {
        const isCancelled = yield cancelled();
        // eslint-disable-next-line no-unsafe-finally
        return `takeRace-${result[0].type}-${result[1].type}-cancelled-${isCancelled}-order-${order++}`;
      }
    }
    function* saga() {
      const task1 = yield fork(takeMaybeAll);
      const task2 = yield fork(takeMaybeRace);
      const task3 = yield fork(takeAll);
      const task4 = yield fork(takeRace);
      yield put(END);
      yield put({ type: 'SOMETHING' });
      order++;
      return yield join([task1, task2, task3, task4]);
    }

    expect(new SagaTester(saga, { options: { failOnUnconfigured: false } }).run()).toEqual([
      `takeMaybeAll-${END.type}-${END.type}-cancelled-false-order-3`,
      `takeMaybeRace-${END.type}-${END.type}-cancelled-false-order-4`,
      'takeAll-NOTHING-NOTHING-cancelled-true-order-1',
      'takeRace-NOTHING-NOTHING-cancelled-true-order-2',
    ]);
  });
  it('should cancel take effects immediately if present in effectiveActions', () => {
    function* saga() {
      const results = [];
      try {
        results.push(yield takeMaybe(['a', 'b']));
        results.push(yield take('nice'));
        results.push(yield take('nice?'));
      } finally {
        // eslint-disable-next-line no-unsafe-finally
        return results;
      }
    }

    expect(new SagaTester(saga, { effectiveActions: [END, { type: 'nice' }, END] }).run()).toEqual([
      END,
      { type: 'nice' },
    ]);
  });
});
