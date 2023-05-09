import {
  put,
  call,
} from 'redux-saga/effects';

import {
  mockGenerator,
  SagaTester,
} from '..';

describe('mockGenerator', () => {
  it('should be recognized inside a call verb as its given name', () => {
    function* method1() { /* */ }
    const result1 = mockGenerator(method1);
    const result2 = mockGenerator('method2');
    function* saga(a) { yield call(result1, a); return yield call(result2, a); }

    expect(
      new SagaTester(saga, {
        expectedCalls: {
          method1: [{ times: 1, params: ['input'] }],
          method2: [{ times: 1, params: ['input'], output: 'output' }],
        },
      }).run('input'),
    ).toBe('output');
  });
  it('should wrap the name and args properties on the resulting generator', () => {
    const action = () => ({ type: 'type' });
    function* foo(a) { yield put(action()); return a; }
    const { mockThis: namedFoo, notAMethod } = mockGenerator({ mockThis: foo, notAMethod: action });
    function* saga(a) { yield namedFoo(a); return yield namedFoo(a); }
    expect(notAMethod).toBe(action);

    expect(
      new SagaTester(saga, {
        expectedGenerators: { foo: [{ times: 2, params: ['bar'], output: 'brak' }] },
        expectedActions: [{ action: action(), times: 0 }],
      }).run('bar'),
    ).toBe('brak');
  });
  it('should handle mockGenerator receiving the generator directly, and call the mocked generators if call: true', () => {
    const action = () => ({ type: 'type' });
    function* whatever(a) { yield put(action()); return `${a}-called`; }
    const namedFoo = mockGenerator(whatever);
    function* saga(a) { yield namedFoo(a); return yield namedFoo(a); }

    expect(
      new SagaTester(saga, {
        expectedGenerators: { whatever: [{ times: 2, params: ['bar'], call: true }] },
        expectedActions: [{ action: action(), times: 2 }],
      }).run('bar'),
    ).toBe('bar-called');
  });
  it('should throw an error if the incorrect value is provided', () => {
    expect(() => mockGenerator([])).toThrow('Parameter of mockGenerator must either be a generator method, a string, or an object. Received');
    expect(() => mockGenerator(1)).toThrow('Parameter of mockGenerator must either be a generator method, a string, or an object. Received');
    expect(mockGenerator({})).toEqual({});
  });
});
