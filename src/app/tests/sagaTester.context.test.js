import {
  delay,
  call,
  fork,
  spawn,
  setContext,
  getContext,
  join,
  all,
} from 'redux-saga/effects';

import SagaTester from '../sagaTester';

describe('sagaTester - setContext and getContext effect', () => {
  it('should alter the context using setContext, and retrive it using getContext', () => {
    function* saga() {
      const results = [];
      results.push(yield getContext('foo'));
      yield setContext({ foo: '1', bar: '2' });
      results.push(yield getContext('foo'));
      results.push(yield getContext('bar'));
      return results;
    }

    expect(new SagaTester(saga, {}).run()).toEqual([
      undefined,
      '1',
      '2',
    ]);
  });
  it('should get the context passed in the options on startup', () => {
    function* saga() {
      const results = [];
      results.push(yield getContext('foo'));
      return results;
    }

    expect(new SagaTester(saga, { options: { context: { foo: 'initialValue' } } }).run()).toEqual([
      'initialValue',
    ]);
  });
  it('should have the context shadowed by children if defined, getting the parents\' value otherwise', () => {
    function* method(arg) {
      const results = [];
      results.push(yield getContext('value1'));
      results.push(yield getContext('value2'));
      yield delay(100);
      results.push(yield getContext('value1'));
      results.push(yield getContext('value2'));
      yield setContext({ value1: arg, value2: arg });
      results.push(yield getContext('value1'));
      results.push(yield getContext('value2'));
      return results;
    }

    function* saga() {
      yield setContext({ value1: '1' });

      const task1 = yield fork(method, 'arg1');
      const task2 = yield spawn(method, 'arg2'); // does not inherit context

      yield delay(50);

      yield setContext({ value2: '2' });

      const results = yield all([
        join(task1),
        join(task2),
        call(method, 'arg3'),
      ]);
      // Unmodified since children receive a deep copy of the context
      results.push([yield getContext('value1'), yield getContext('value2')]);

      return results;
    }

    expect(new SagaTester(saga, { options: { failOnUnconfigured: false } }).run()).toEqual([
      ['1', undefined, '1', '2', 'arg1', 'arg1'],
      [undefined, undefined, undefined, undefined, 'arg2', 'arg2'],
      ['1', '2', '1', '2', 'arg3', 'arg3'],
      ['1', '2'],
    ]);
  });
});
