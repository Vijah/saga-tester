import { fork, call, join, all, put } from 'redux-saga/effects';

import mockGenerator from '../../mockGenerator';
import SagaTester from '../../sagaTester';

describe('debugDeadlock', () => {
  it('should log the dependency trees an infinite loop is detected (stepLimit 500)', () => {
    function* method() {
      while (true) {
        yield put({ type: 'whatever' });
      }
    }
    function* deeplyNestedMethodWithVeryLongName() {
      const task = yield fork(method, 'deep');
      return yield join(task);
    }
    function* methodNested(arg) {
      const task1 = yield fork(method, arg);
      const task2 = yield fork(method, 'arg7');
      const callResult = yield call(deeplyNestedMethodWithVeryLongName);
      const results = yield join([task1, task2]);
      results.push(callResult);
      return results;
    }
    function* calledMethod(arg) {
      const task = yield fork(method, arg);
      const taskResult = yield join([task]);
      return `calledMethod-${taskResult[0]}`;
    }
    const mockMethodNested = mockGenerator(methodNested);

    function* saga() {
      const task1 = yield fork(method, 'arg1');
      const task2 = yield fork(method, 'arg2');
      const task3 = yield fork(method, 'arg3');
      const task4 = yield fork(method, 'arg4');
      const task5 = yield fork(method, 'arg5');
      const task6 = yield fork(mockMethodNested, 'arg6');
      const task8 = call(calledMethod, 'arg8');
      return yield all({
        task1: join(task1),
        task2: join(task2),
        sub: all([join([task3, task4]), all([join(task5), join(task6)])]),
        task8,
      });
    }

    let error;
    try {
      new SagaTester(saga, {
        expectedCalls: [
          { name: 'method', params: ['arg1'], call: true, wait: 50 },
          { name: 'method', params: ['arg2'], call: true, wait: true },
          { name: 'method', params: ['arg3'], call: true, wait: 70 },
          { name: 'method', params: ['arg4'], call: true, wait: 60 },
          { name: 'method', params: ['arg5'], call: true, wait: 100 },
          { name: 'method', params: ['arg6'], call: true, wait: 200 },
          { name: 'method', params: ['arg7'], call: true, wait: 80 },
          { name: 'method', params: ['arg8'], call: true, wait: 110 },
          { name: 'method', params: ['deep'], call: true, wait: 90 },
          { name: 'methodNested', params: ['arg6'], call: true, wait: 55 },
          { name: 'calledMethod', params: ['arg8'], call: true },
          { name: 'deeplyNestedMethodWithVeryLongName', call: true },
        ],
        options: { stepLimit: 500 },
      }).run();
    } catch (e) {
      error = e;
    }

    const expected = `Error was thrown while running SagaTester (step 500).

Error: Saga reached step 500, you are probably looking at an infinite loop somewhere. To alter this limit, provide options.stepLimit to sagaTester.
12 tasks did not finish. Remaining tasks:

[
  {
    "@@redux-saga/TASK": true,
    "isCancelled": false,
    "id": 10,
    "wait": "generator",
    "parentTask": 7,
    "name": "calledMethod",
    "started": true,
    "latestValue": "JOIN",
    "interruption": {
      "kind": "@@sagaTester__join__",
      "pending": "0=>id:11,interrupted:false"
    },
    "dependencies": [
      11
    ]
  },
  {
    "@@redux-saga/TASK": true,
    "isCancelled": false,
    "id": 7,
    "wait": "all",
    "parentTask": 0,
    "interruption": {
      "kind": "@@sagaTester__all__",
      "pending": "task1=>undefined
task2=>undefined
sub=>undefined
task8=>undefined"
    },
    "dependencies": [
      1,
      2,
      8,
      10
    ]
  },
  {
    "@@redux-saga/TASK": true,
    "isCancelled": false,
    "id": 8,
    "wait": "all",
    "parentTask": 7,
    "interruption": {
      "kind": "@@sagaTester__all__",
      "pending": "0=>undefined
1=>undefined"
    },
    "dependencies": [
      3,
      4,
      9
    ]
  },
  {
    "@@redux-saga/TASK": true,
    "isCancelled": false,
    "id": 9,
    "wait": "all",
    "parentTask": 8,
    "interruption": {
      "kind": "@@sagaTester__all__",
      "pending": "0=>undefined
1=>undefined"
    },
    "dependencies": [
      5,
      6
    ]
  },
  {
    "@@redux-saga/TASK": true,
    "isCancelled": false,
    "id": 0,
    "wait": "generator",
    "name": "root",
    "started": true,
    "latestValue": "ALL",
    "interruption": {
      "kind": "@@sagaTester__generator__"
    },
    "dependencies": [
      7
    ]
  },
  {
    "@@redux-saga/TASK": true,
    "isCancelled": false,
    "id": 1,
    "wait": 0,
    "name": "method",
    "parentTask": 0,
    "started": true,
    "latestValue": "PUT",
    "dependencies": []
  },
  {
    "@@redux-saga/TASK": true,
    "isCancelled": false,
    "id": 6,
    "wait": 5,
    "name": "methodNested",
    "parentTask": 0,
    "dependencies": []
  },
  {
    "@@redux-saga/TASK": true,
    "isCancelled": false,
    "id": 4,
    "wait": 10,
    "name": "method",
    "parentTask": 0,
    "dependencies": []
  },
  {
    "@@redux-saga/TASK": true,
    "isCancelled": false,
    "id": 3,
    "wait": 20,
    "name": "method",
    "parentTask": 0,
    "dependencies": []
  },
  {
    "@@redux-saga/TASK": true,
    "isCancelled": false,
    "id": 5,
    "wait": 50,
    "name": "method",
    "parentTask": 0,
    "dependencies": []
  },
  {
    "@@redux-saga/TASK": true,
    "isCancelled": false,
    "id": 11,
    "wait": 60,
    "name": "method",
    "parentTask": 10,
    "dependencies": []
  },
  {
    "@@redux-saga/TASK": true,
    "isCancelled": false,
    "id": 2,
    "wait": true,
    "name": "method",
    "parentTask": 0,
    "dependencies": []
  }
]`.replace(/\r\n/g, '\n');

    expect(error.message.replace(/\r\n/g, '\n').substr(0, expected.length)).toEqual(expected);
  });
});
