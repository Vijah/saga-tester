import { fork, call, join, all } from 'redux-saga/effects';

import mockGenerator from '../../mockGenerator';
import SagaTester from '../../sagaTester';

describe('debugBubbledTasks', () => {
  it('should log the dependency trees when bubbling up resolved tasks', () => {
    let executionOrder = 0;
    function* method(arg) {
      executionOrder += 1;
      return `${arg}-executed-${executionOrder}`;
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
      const results = yield all({
        task1: join(task1),
        task2: join(task2),
        sub: all([join([task3, task4]), all([join(task5), join(task6)])]),
        task8,
      });
      return results;
    }

    const logMock = jest.spyOn(console, 'log').mockImplementation();

    expect(new SagaTester(saga, {
      expectedGenerators: {
        method: [
          { params: ['arg1'], call: true, wait: 50 },
          { params: ['arg2'], call: true, wait: true },
          { params: ['arg3'], call: true, wait: 70 },
          { params: ['arg4'], call: true, wait: 60 },
          { params: ['arg5'], call: true, wait: 100 },
          { params: ['arg6'], call: true, wait: 200 },
          { params: ['arg7'], call: true, wait: 80 },
          { params: ['arg8'], call: true, wait: 110 },
          { params: ['deep'], call: true, wait: 90 },
        ],
        methodNested: [{ params: ['arg6'], call: true, wait: 55 }],
      },
      expectedCalls: {
        calledMethod: [{ params: ['arg8'], call: true }],
        deeplyNestedMethodWithVeryLongName: [{ call: true }],
      },
      debug: {
        bubble: true,
      },
      options: { yieldDecreasesTimer: true },
    }).run()).toEqual({
      task1: 'arg1-executed-1', // wait 50
      task2: 'arg2-executed-9', // wait: true (aka after everything else)
      sub: [
        ['arg3-executed-3', 'arg4-executed-2'], // wait 70, wait 60
        ['arg5-executed-6', // wait 100
          [
            'arg6-executed-8', // wait 200, (same generator also dispatches arg7 and deep) within a wait 55
            'arg7-executed-4', // wait 80, but forked inside arg6, which is wait 55
            'deep-executed-5', // wait 90, but forked inside arg6, which is wait 55
          ],
        ],
      ],
      task8: 'calledMethod-arg8-executed-7', // wait 110, nested within an instantaneous call
    });

    expect(logMock).toHaveBeenCalledTimes(14);

    // first log, tree is pretty big since most tasks are blocked
    logMock.mock.calls[0][0].replace(/\r\n/g, '\n');
    expect(logMock.mock.calls[0][0].replace(/\r\n/g, '\n')).toEqual(`-- TASKS TO BUBBLE:
method              id: 1  wait: false    value: arg1-executed-1
-- TREE:
                    id: 7  wait: all       Children: [3,4,8] Partially resolved value: 
[
  Interruption kind: @@sagaTester__join__, Pending: 3,4,
  Interruption kind: @@sagaTester__all__, Pending: 8
]
                    id: 8  wait: all       Children: [5,6] Partially resolved value: 
[
  Interruption kind: @@sagaTester__join__, Pending: 5,
  Interruption kind: @@sagaTester__join__, Pending: 6
]
root                id: 0  wait: generator Children: [1,2,3,4,5,6,7,9] Partially resolved value: 
{
  task1: Interruption kind: @@sagaTester__join__, Pending: 1,
  task2: Interruption kind: @@sagaTester__join__, Pending: 2,
  sub: Interruption kind: @@sagaTester__all__, Pending: 7,
  task8: Interruption kind: @@sagaTester__generator__, Pending: 9
}
calledMethod        id: 9  wait: generator Children: [10] Partially resolved value: 
[
  TASK method              id: 10 wait: 110      
]
methodNested        id: 6  wait: 53        Children: [] (pending)
method              id: 4  wait: 56        Children: [] (pending)
method              id: 3  wait: 65        Children: [] (pending)
method              id: 5  wait: 97        Children: [] (pending)
method              id: 10 wait: 110       Children: [] (pending)
method              id: 2  wait: true      Children: [] (pending)
`.replace(/\r\n/g, '\n'));

    // Middle log
    expect(logMock.mock.calls[3][0].replace(/\r\n/g, '\n')).toEqual(`-- TASKS TO BUBBLE:
method              id: 12 wait: false    value: arg7-executed-4
-- TREE:
                    id: 7  wait: all       Children: [8] Partially resolved value: 
[
  Resolved ([arg3-executed-3,arg4-executed-2]),
  Interruption kind: @@sagaTester__all__, Pending: 8
]
                    id: 8  wait: all       Children: [5,6] Partially resolved value: 
[
  Interruption kind: @@sagaTester__join__, Pending: 5,
  Interruption kind: @@sagaTester__join__, Pending: 6
]
root                id: 0  wait: generator Children: [2,5,6,7,9] Partially resolved value: 
{
  task1: Resolved (arg1-executed-1),
  task2: Interruption kind: @@sagaTester__join__, Pending: 2,
  sub: Interruption kind: @@sagaTester__all__, Pending: 7,
  task8: Interruption kind: @@sagaTester__generator__, Pending: 9
}
calledMethod        id: 9  wait: generator Children: [10] Partially resolved value: 
[
  TASK method              id: 10 wait: 105      
]
deeplyNestedMethodWithVeryLongNameid: 13 wait: generator Children: [14] Partially resolved value: 
TASK method              id: 14 wait: 90       
methodNested        id: 6  wait: 48        Children: [11,12,13] (pending)
method              id: 14 wait: 90        Children: [] (pending)
method              id: 5  wait: 92        Children: [] (pending)
method              id: 10 wait: 105       Children: [] (pending)
method              id: 11 wait: 197       Children: [] (pending)
method              id: 2  wait: true      Children: [] (pending)
`.replace(/\r\n/g, '\n'));

    // Last log: most stuff is resolved
    expect(logMock.mock.calls[13][0].replace(/\r\n/g, '\n')).toEqual(`-- TASKS TO BUBBLE:
method              id: 2  wait: false    value: arg2-executed-9
-- TREE:
root                id: 0  wait: generator Children: [2] Partially resolved value: 
{
  task1: Resolved (arg1-executed-1),
  task2: Interruption kind: @@sagaTester__join__, Pending: 2,
  sub: Resolved ([arg3-executed-3,arg4-executed-2,arg5-executed-6,arg6-executed-8,arg7-executed-4,deep-executed-5]),
  task8: Resolved (calledMethod-arg8-executed-7)
}
`.replace(/\r\n/g, '\n'));
    logMock.mockRestore();
  });
});
