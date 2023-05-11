import { put, select, delay, call, putResolve } from 'redux-saga/effects';
import { createSelector } from 'reselect';
import delayP from '@redux-saga/delay-p';

import SagaTester from '../sagaTester';

describe('sagaTester - reducers options', () => {
  it('should alter selector config by running actions in the provided config (reducers is a function)', () => {
    const actualSelector = createSelector((state) => state, (stateData) => stateData);
    function* saga() {
      const state1 = yield select(actualSelector);
      yield put({ type: 'whatever', key: 'field', value: 'value' });
      const state2 = yield select(actualSelector);
      return [state1, state2];
    }

    expect(new SagaTester(saga, {
      selectorConfig: { someThing: 'something' },
      options: {
        reducers: (state, action) => ({ ...state, [action.key]: action.value }),
      },
    }).run()).toEqual([
      { someThing: 'something' },
      { someThing: 'something', field: 'value' },
    ]);
  });
  it('should alter selector config by running actions in the provided config (reducers is an object)', () => {
    const actualSelector = createSelector((state) => state, (stateData) => stateData);
    function* saga() {
      const state1 = yield select(actualSelector);
      yield put({ type: 'whatever', value: 'actionValue' });
      const state2 = yield select(actualSelector);
      return [state1, state2];
    }

    expect(new SagaTester(saga, {
      selectorConfig: { reducerKey1: 'value1', reducerKey2: 'value2' },
      options: {
        reducers: {
          reducerKey1: (state, action) => (`${state}-${action.value}`),
          reducerKey2: (state, action) => (`${state}-${action.value}`),
        },
      },
    }).run()).toEqual([
      { reducerKey1: 'value1', reducerKey2: 'value2' },
      { reducerKey1: 'value1-actionValue', reducerKey2: 'value2-actionValue' },
    ]);
  });
  it('should also work with async actions', async () => {
    jest.useFakeTimers();
    const actualSelector = createSelector((state) => state, (stateData) => stateData);
    function* saga() {
      yield put((dispatch, getState) => delayP(500).then(() => {
        dispatch({ type: 'whatever', state: getState(), key: 'field2', value: 'value2' });
      }));
      // This will modify the state for the async action
      yield put({ type: 'whatever', key: 'field1', value: 'value1' });
      const state1 = yield select(actualSelector);
      yield delay(100); // async action executes now because of side effect
      const state2 = yield select(actualSelector);
      yield putResolve((dispatch, getState) => delayP(500).then(() => {
        dispatch({ type: 'whatever', state: getState(), key: 'field3', value: 'value3' });
      }));
      const state3 = yield select(actualSelector);
      return [state1, state2, state3];
    }

    const result = await new SagaTester(saga, {
      selectorConfig: { someThing: 'something' },
      expectedActions: [
        { action: { type: 'whatever', key: 'field1', value: 'value1' }, times: 1 },
        { action: { type: 'whatever', state: { someThing: 'something', field1: 'value1' }, key: 'field2', value: 'value2' }, times: 1 },
        { action: { type: 'whatever', state: { someThing: 'something', field1: 'value1', field2: 'value2' }, key: 'field3', value: 'value3' }, times: 1 },
      ],
      options: {
        reducers: (state, action) => ({ ...state, [action.key]: action.value }),
      },
      sideEffects: [
        { wait: 50, effect: call(() => { jest.runAllTimers(); }) },
        { wait: 150, effect: call(() => { jest.runAllTimers(); }) },
      ],
    }).runAsync();

    expect(result).toEqual([
      { someThing: 'something', field1: 'value1' },
      { someThing: 'something', field1: 'value1', field2: 'value2' },
      { someThing: 'something', field1: 'value1', field2: 'value2', field3: 'value3' },
    ]);
  });
});
