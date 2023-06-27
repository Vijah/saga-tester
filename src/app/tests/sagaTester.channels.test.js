import {
  actionChannel,
  all,
  call,
  cancelled,
  delay,
  flush,
  fork,
  put,
  race,
  take,
  takeEvery,
  takeLeading,
  takeMaybe,
  throttle,
} from 'redux-saga/effects';
import { END, buffers, channel, eventChannel, multicastChannel } from 'redux-saga';

import SagaTester from '../sagaTester';

describe('sagaTester - channels effect', () => {
  it('should handle custom eventChannels (i.e. not using redux) and cancellation', () => {
    jest.useFakeTimers();
    let order = 0;
    const callback = jest.fn();
    function countdown(secs) {
      return eventChannel((emitter) => {
        const iv = setInterval(() => {
          // eslint-disable-next-line no-param-reassign
          secs -= 1;
          if (secs > 0) {
            order++;
            emitter(secs);
          } else {
            order++;
            emitter(END);
          }
        }, 1000);
        return () => {
          callback('CHANNEL CLOSED', `order-${order++}`);
          clearInterval(iv);
        };
      });
    }

    function* saga() {
      const someChannel = yield call(countdown, 3);
      try {
        while (true) {
          const seconds = yield take(someChannel);
          callback(seconds, `order-${order}`);
        }
      } finally {
        callback('ENDED', `order-${order++}`);
        someChannel.close();
      }
    }

    new SagaTester(saga, {
      options: { failOnUnconfigured: false },
      sideEffects: [
        { wait: 5, effect: call(() => { jest.runOnlyPendingTimers(); }) },
        { wait: 10, effect: call(() => { jest.runOnlyPendingTimers(); }) },
        { wait: 15, effect: call(() => { jest.runOnlyPendingTimers(); }) },
      ],
    }).run();

    expect(callback).toHaveBeenCalledTimes(4);
    expect(callback).toHaveBeenCalledWith(2, 'order-1');
    expect(callback).toHaveBeenCalledWith(1, 'order-2');
    expect(callback).toHaveBeenCalledWith('CHANNEL CLOSED', 'order-3');
    expect(callback).toHaveBeenCalledWith('ENDED', 'order-4');
  });
  it('should handle actionChannel effects, cancelling the task if take receives END (even on a channel)', () => {
    function* dispatchActionWithDelay(action) { yield delay(10); yield put(action); }
    function* saga() {
      const results = [];
      const requestChan = yield actionChannel('TYPE');

      try {
        yield fork(dispatchActionWithDelay, { type: 'TYPE', value: '2' });
        yield put({ type: 'TYPE', value: '1' });
        results.push(yield take(requestChan));
        results.push(yield take(requestChan));
        yield fork(dispatchActionWithDelay, END);
        results.push(yield take(requestChan));

        // cancelled
        yield put({ type: 'TYPE', value: '3' });
        results.push(yield take(requestChan));
      } catch (e) {
        results.push(e.stack);
      } finally {
        const isCancelled = yield cancelled();
        results.push(isCancelled);
        requestChan.close();
        // eslint-disable-next-line no-unsafe-finally
        return results;
      }
    }

    expect(new SagaTester(saga, { options: { failOnUnconfigured: false } }).run()).toEqual([
      { type: 'TYPE', value: '1' },
      { type: 'TYPE', value: '2' },
      true,
    ]);
  });
  it('should handle actionChannel effects with buffers', () => {
    function* saga() {
      const results = [];

      const someChannel = yield actionChannel('TYPE', buffers.sliding(3));
      yield put({ type: 'TYPE', value: '1' }); // dropped by buffer
      yield put({ type: 'TYPE', value: '2' });
      yield put({ type: 'TYPE', value: '3' });
      yield put({ type: 'TYPE', value: '4' });

      results.push(yield take(someChannel));
      results.push(yield take(someChannel));
      results.push(yield take(someChannel));

      // Now that we emptied the buffer, we can add more again
      yield put({ type: 'TYPE', value: '5' });
      results.push(yield take(someChannel));

      someChannel.close();
      return results;
    }

    expect(new SagaTester(saga, { options: { failOnUnconfigured: false } }).run()).toEqual([
      { type: 'TYPE', value: '2' },
      { type: 'TYPE', value: '3' },
      { type: 'TYPE', value: '4' },
      { type: 'TYPE', value: '5' },
    ]);
  });
  it('should handle actionChannel effects with buffers being flushed', () => {
    function* saga() {
      const someChannel = yield actionChannel('TYPE', buffers.sliding(3));
      yield put({ type: 'TYPE', value: '1' }); // dropped by buffer
      yield put({ type: 'TYPE', value: '2' });
      yield put({ type: 'TYPE', value: '3' });
      yield put({ type: 'TYPE', value: '4' });

      const result = yield flush(someChannel);
      someChannel.close();
      return result;
    }

    expect(new SagaTester(saga, { options: { failOnUnconfigured: false } }).run()).toEqual([
      { type: 'TYPE', value: '2' },
      { type: 'TYPE', value: '3' },
      { type: 'TYPE', value: '4' },
    ]);
  });
  it('should handle multicastChannels', () => {
    function* doSomeActions(someChannel) {
      yield delay(5);
      yield put(someChannel, { type: 'TYPE', value: '1' });
      yield delay(5);
      yield put(someChannel, { type: 'TYPE', value: '2' });
      yield delay(5);
      yield put(someChannel, { type: 'TYPE', value: '3' });
      yield delay(5);
      yield put(someChannel, { type: 'TYPE 2', value: '4' });
      yield delay(5);
      yield put({ type: 'TYPE', value: '5' }); // action put
    }

    function* saga() {
      const results = [];

      const someChannel = multicastChannel();
      yield fork(doSomeActions, someChannel);

      results.push(yield all([
        take(someChannel, 'TYPE'),
        take(someChannel, 'TYPE'),
      ]));
      results.push(yield race({
        1: take(someChannel, 'NOT THIS'),
        2: take(someChannel, 'TYPE'),
      }));
      results.push(yield all([
        take(someChannel, 'TYPE'),
        take(someChannel, 'TYPE 2'),
        all([
          take(someChannel, 'TYPE'),
          take(someChannel, 'TYPE 2'),
        ]),
        take('TYPE'), // action take (twice to test for non-duplication)
        take('TYPE'), // action take
      ]));

      someChannel.close();
      return results;
    }

    expect(new SagaTester(saga, { options: { failOnUnconfigured: false } }).run()).toEqual([
      [{ type: 'TYPE', value: '1' }, { type: 'TYPE', value: '1' }],
      { 1: undefined, 2: { type: 'TYPE', value: '2' } },
      [
        { type: 'TYPE', value: '3' },
        { type: 'TYPE 2', value: '4' },
        [
          { type: 'TYPE', value: '3' },
          { type: 'TYPE 2', value: '4' },
        ],
        { type: 'TYPE', value: '5' },
        { type: 'TYPE', value: '5' },
      ],
    ]);
  });
  it('should fail if a multicast channel is flushed (not supported since they do not have buffers)', () => {
    function* saga() {
      const someChannel = multicastChannel();
      yield flush(someChannel);
    }

    expect(() => new SagaTester(saga, {}).run()).toThrow('Cannot flush multicastChannel');
  });
  it('should fail if an event channel is put (not supported since they self-produce their events)', () => {
    jest.useFakeTimers();
    function* saga() {
      const someChannel = eventChannel((emitter) => {
        const iv = setInterval(() => { emitter(END); }, 1000);
        return () => { clearInterval(iv); };
      });
      yield put(someChannel, { type: 'YO' });
    }

    expect(() => new SagaTester(saga, {}).run()).toThrow('Should not put eventChannel; it emits its own events.');
  });
  it('should handle the channel util, alternating from oldest taker to newest taker', () => {
    const callback = jest.fn();
    function* someWork(arg, channelParam) {
      try {
        while (true) {
          const action = yield take(channelParam);
          callback(arg, action);
        }
      } finally {
        callback(arg, 'CANCELLED');
      }
    }

    function* saga() {
      const someChannel = channel();

      yield fork(someWork, 'arg1', someChannel);
      yield fork(someWork, 'arg2', someChannel);

      yield put(someChannel, { type: 'TYPE', arg: '1' });
      yield put(someChannel, { type: 'TYPE', arg: '2' });
      yield put(someChannel, { type: 'TYPE', arg: '3' });
      yield put(someChannel, { type: 'TYPE', arg: '4' });
      yield put(someChannel, END);
      yield put(someChannel, END);
    }

    new SagaTester(saga, { options: { failOnUnconfigured: false } }).run();

    expect(callback).toHaveBeenCalledTimes(6);
    expect(callback).toHaveBeenCalledWith('arg1', { type: 'TYPE', arg: '1' });
    expect(callback).toHaveBeenCalledWith('arg2', { type: 'TYPE', arg: '2' });
    expect(callback).toHaveBeenCalledWith('arg1', { type: 'TYPE', arg: '3' });
    expect(callback).toHaveBeenCalledWith('arg2', { type: 'TYPE', arg: '4' });
    expect(callback).toHaveBeenCalledWith('arg1', 'CANCELLED');
    expect(callback).toHaveBeenCalledWith('arg2', 'CANCELLED');
  });
  it('should handle the multicastChannel util, allowing to dispatch the same action multiple times', () => {
    const callback = jest.fn();
    function* someWork(arg, channelParam) {
      try {
        while (true) {
          const action = yield take(channelParam, 'TYPE');
          callback(arg, action);
        }
      } finally {
        callback(arg, 'CANCELLED');
      }
    }

    function* saga() {
      const someChannel = multicastChannel();

      yield fork(someWork, 'arg1', someChannel);
      yield fork(someWork, 'arg2', someChannel);

      yield put(someChannel, { type: 'TYPE', arg: '1' });
      yield put(someChannel, { type: 'TYPE', arg: '2' });
      yield put(someChannel, END);
    }

    new SagaTester(saga, { options: { failOnUnconfigured: false } }).run();

    expect(callback).toHaveBeenCalledTimes(6);
    expect(callback).toHaveBeenCalledWith('arg1', { type: 'TYPE', arg: '1' });
    expect(callback).toHaveBeenCalledWith('arg2', { type: 'TYPE', arg: '1' });
    expect(callback).toHaveBeenCalledWith('arg1', { type: 'TYPE', arg: '2' });
    expect(callback).toHaveBeenCalledWith('arg2', { type: 'TYPE', arg: '2' });
    expect(callback).toHaveBeenCalledWith('arg1', 'CANCELLED');
    expect(callback).toHaveBeenCalledWith('arg2', 'CANCELLED');
  });
  it('should END flush, take effects if they are invoked on closed and empty channels', () => {
    const callback = jest.fn();
    function* yieldSomeEffect(arg, effect) {
      try {
        yield effect;
      } finally {
        const isCancelled = yield cancelled();
        callback(arg, isCancelled ? 'CANCELLED' : 'NOT CANCELLED');
      }
    }

    function* saga() {
      const someChannel1 = channel();
      yield put(someChannel1, { type: 'TYPE' });
      const someChannel2 = channel();
      yield put(someChannel2, { type: 'TYPE' });
      someChannel1.close();
      someChannel2.close();

      yield fork(yieldSomeEffect, 'arg1', take(someChannel1));
      yield fork(yieldSomeEffect, 'arg2', take(someChannel1));
      yield fork(yieldSomeEffect, 'arg3', put(someChannel1, { type: 'TYPE' }));
      yield fork(yieldSomeEffect, 'arg4', flush(someChannel2));
      yield fork(yieldSomeEffect, 'arg5', flush(someChannel2));
    }

    new SagaTester(saga, { options: { failOnUnconfigured: false } }).run();

    expect(callback).toHaveBeenCalledTimes(5);
    expect(callback).toHaveBeenCalledWith('arg1', 'CANCELLED');
    expect(callback).toHaveBeenCalledWith('arg2', 'CANCELLED');
    expect(callback).toHaveBeenCalledWith('arg3', 'NOT CANCELLED'); // Put does not END; it just has no effect
    expect(callback).toHaveBeenCalledWith('arg4', 'NOT CANCELLED'); // flush merely returns an empty list, does not cancel
    expect(callback).toHaveBeenCalledWith('arg5', 'NOT CANCELLED');
  });
  it('should handle takeMaybe receiving END in a channel, or receiving a closed channel', () => {
    const someChannel = channel();
    function* foo() {
      yield delay(50);
      yield put(someChannel, END);
      yield delay(50);
      someChannel.close();
      yield delay(50);
    }

    function* saga() {
      const results = [];
      yield fork(foo);
      results.push(yield takeMaybe(someChannel));
      results.push(yield takeMaybe(someChannel));
      return results;
    }

    expect(new SagaTester(saga, { options: { failOnUnconfigured: false } }).run()).toEqual([
      END,
      END,
    ]);
  });
  it('should handle high level take effects, with a normal channel dispatching to one taker at a time', () => {
    let order = 1;
    const someChannel = channel();
    const callback = jest.fn();
    function* method1(action) {
      callback(`Called1-order-${order++}-${action.type}-${action.arg}`);
      if (action.type.startsWith('INTERNAL')) { return; }
      yield delay(50);
      yield put(someChannel, { type: `INTERNAL TYPE 1 - ${action.type}`, arg: action.arg });
    }
    function* method2(action) {
      callback(`Called2-order-${order++}-${action.type}-${action.arg}`);
      if (action.type.startsWith('INTERNAL')) { return; }
      yield delay(50);
      yield put(someChannel, { type: `INTERNAL TYPE 2 - ${action.type}`, arg: action.arg });
    }

    function* saga() {
      yield takeEvery(someChannel, method1);
      yield takeEvery(someChannel, method2);
      yield put(someChannel, { type: 'TYPE', arg: '1' });
      yield put(someChannel, { type: 'TYPE', arg: '2' });
      yield put(someChannel, { type: 'TYPE', arg: '3' });
      const result = yield take(someChannel);
      callback(`root-order-${order++}-${result.type}-${result.arg}`);
    }

    new SagaTester(saga, { options: { failOnUnconfigured: false } }).run();

    expect(callback).toHaveBeenCalledWith('Called1-order-1-TYPE-1');
    expect(callback).toHaveBeenCalledWith('Called2-order-2-TYPE-2');
    expect(callback).toHaveBeenCalledWith('Called1-order-3-TYPE-3');
    expect(callback).toHaveBeenCalledWith('root-order-4-INTERNAL TYPE 1 - TYPE-3');
    expect(callback).toHaveBeenCalledWith('Called2-order-5-INTERNAL TYPE 1 - TYPE-1');
    expect(callback).toHaveBeenCalledWith('Called1-order-6-INTERNAL TYPE 2 - TYPE-2');
    expect(callback).toHaveBeenCalledTimes(6);
  });
  it('should not cancel high level effects with END actions (TODO: might be a misunderstanding of the doc, but this test documents the behavior)', () => {
    const callback = jest.fn();
    function* method1() {
      try {
        yield delay(50);
      } finally {
        const isCancelled = yield cancelled();
        callback('method1', isCancelled);
      }
    }
    function* method2() {
      try {
        yield delay(50);
      } finally {
        const isCancelled = yield cancelled();
        callback('method2', isCancelled);
      }
    }

    function* saga() {
      const someChannel = channel();
      yield takeEvery(someChannel, method1);
      yield takeEvery(someChannel, method2);
      yield put(someChannel, END);
      yield put(someChannel, { type: 'Nothing' });
    }

    new SagaTester(saga, { options: { failOnUnconfigured: false } }).run();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('method1', false);
    expect(callback).toHaveBeenCalledWith('method2', false);
  });
  it('should have throttle and takePending not swallow actions when they are supposedly not listening (TODO: might be a misunderstanding of the doc, but this test documents the behavior)', () => {
    const callback = jest.fn();
    function* method1(action) {
      yield delay(1000);
      callback('method1', action);
    }
    function* method2(action) {
      callback('method2', action);
    }
    function* saga() {
      const someChannel = channel();
      yield takeLeading(someChannel, method1);
      yield throttle(1000, someChannel, method2);
      yield put(someChannel, 1); // caught by takeLeading
      yield put(someChannel, 2); // caught by throttle
      yield put(someChannel, 3); // caught by neither since they are not "listening"
      yield put(someChannel, 4);
      callback(yield flush(someChannel));
      yield put(someChannel, 5); // buffered, caught by takeLeading
      yield put(someChannel, 6); // buffered, caught by throttle
      yield delay(2000);
    }

    new SagaTester(saga, { options: { failOnUnconfigured: false } }).run();

    expect(callback).toHaveBeenCalledTimes(5);
    expect(callback).toHaveBeenCalledWith('method1', 1);
    expect(callback).toHaveBeenCalledWith('method2', 2);
    expect(callback).toHaveBeenCalledWith([3, 4]);
    expect(callback).toHaveBeenCalledWith('method1', 6);
    expect(callback).toHaveBeenCalledWith('method2', 5);
  });

  describe('channel', () => {
    it('should have a grasp on how the util channels work (scaffolding test)', () => {
      // Intercepting channels:
      // - We can inject an id when first encountering them.
      // - Callbacks can create a new task to put an action of type `${type}@@CHANNEL:${channelId}`
      // - This will allow blocked generators and race/all effect to resolve without any change to the code.
      // - All other mechanisms still work since they are unmocked, even if the user decides to do odd shenanigans.
      // - It also gives the user more flexibility to provide their own implementation of channels.
      //
      // When to INTERRUPT the SagaTester so that the taken effects execute in the correct order:
      // - Create special tasks and look whether there are such pending tasks.
      // - The ran task is interrupted, but its overall status is unchanged.
      // - The unblock that decides to run channel-bubbling events instead of normal tasks.
      // - Such interruptions can happen after ANY effect is processed. Thus, we must check for it in the processGenerator loop.
      //
      // To handle cancellations due to channels closing,
      // we bubble the END event and cancel the tasks pending on it (but not the takeMaybes)
      // - More precisely, `${END}@@CHANNEL:${channelId}`
      // - It is worth creating a wrapper around .close when intercepting the channel for the first time, so that it correctly bubbles up this task.
      //
      // IMPORTANT: We must remove the @@CHANNEL:## suffix on the types before resolving the values!
      //
      // Since channels don't dispatch the action to all takers at once, it is important to encode the id of the taker in the dispatched action.
      // - The encoding should be done by the callback, which will be created in a context where both taker-id and channel-id are available.

      let someChannel = channel();
      const callbackOutput = {};
      const callback = (...args) => { callbackOutput.args = args; };
      expect(Object.keys(someChannel)).toEqual(['take', 'put', 'flush', 'close']);
      someChannel.close();
      expect(Object.keys(someChannel)).toEqual(['take', 'put', 'flush', 'close']); // no change

      someChannel = channel();
      someChannel.put({ type: 'TYPE', a: 'a' });
      expect(Object.keys(someChannel)).toEqual(['take', 'put', 'flush', 'close']); // no change
      let output = someChannel.flush(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [[{ type: 'TYPE', a: 'a' }]] }); // (1 argument; the list of actions)
      delete callbackOutput.args;
      output = someChannel.flush(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [[]] }); // (action list is empty)
      delete callbackOutput.args;

      someChannel.put({ type: 'TYPE', b: 'b' });
      output = someChannel.take(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: 'TYPE', b: 'b' }] }); // (1 argument; the taken action)
      delete callbackOutput.args;
      output = someChannel.take(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: undefined }); // (blocked)
      delete callbackOutput.args;

      someChannel.put({ type: 'TYPE', c: 'c' });
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: 'TYPE', c: 'c' }] }); // (from previous callback!)
      delete callbackOutput.args;
      someChannel.put({ type: 'TYPE', d: 'd' });
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: undefined });

      someChannel.close();
      someChannel.put({ type: 'TYPE' });
      output = someChannel.take(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: 'TYPE', d: 'd' }] }); // closed, but can still take remaining stuff
      delete callbackOutput.args;
      output = someChannel.take(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: '@@redux-saga/CHANNEL_END' }] }); // closed, and empty
      delete callbackOutput.args;
      output = someChannel.flush(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: '@@redux-saga/CHANNEL_END' }] }); // closed, and empty (note that this is not a list of actions!)
      delete callbackOutput.args;

      someChannel = channel();
      someChannel.take(callback);
      someChannel.close();
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: '@@redux-saga/CHANNEL_END' }] }); // cancelled
      delete callbackOutput.args;

      someChannel = channel();
      someChannel.take(callback);
      someChannel.put(END);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: '@@redux-saga/CHANNEL_END' }] }); // ended
      delete callbackOutput.args;

      someChannel.take(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: undefined }); // ended != closed
    });
    it('actionChannel should create an actionChannel that behaves essentially the same as a normal channel', () => {
      function* saga() { return yield actionChannel('TYPE'); }

      let someChannel = new SagaTester(saga).run();
      const callbackOutput = {};
      const callback = (...args) => { callbackOutput.args = args; };
      expect(Object.keys(someChannel)).toEqual(['type', 'take', 'put', 'flush', 'close']);
      someChannel.close();
      expect(Object.keys(someChannel)).toEqual(['type', 'take', 'put', 'flush', 'close']); // no change

      someChannel = new SagaTester(saga).run();
      someChannel.put({ type: 'TYPE', a: 'a' });
      expect(Object.keys(someChannel)).toEqual(['type', 'take', 'put', 'flush', 'close']); // no change
      let output = someChannel.flush(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [[{ type: 'TYPE', a: 'a' }]] }); // (1 argument; the list of actions)
      delete callbackOutput.args;
      output = someChannel.flush(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [[]] }); // (action list is empty)
      delete callbackOutput.args;

      someChannel.put({ type: 'TYPE', b: 'b' });
      output = someChannel.take(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: 'TYPE', b: 'b' }] }); // (1 argument; the taken action)
      delete callbackOutput.args;
      output = someChannel.take(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: undefined }); // (blocked)
      delete callbackOutput.args;

      someChannel.put({ type: 'TYPE', c: 'c' });
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: 'TYPE', c: 'c' }] }); // (from previous callback!)
      delete callbackOutput.args;
      someChannel.put({ type: 'TYPE', d: 'd' });
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: undefined });

      someChannel.close();
      someChannel.put({ type: 'TYPE' });
      output = someChannel.take(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: 'TYPE', d: 'd' }] }); // closed, but can still take remaining stuff
      delete callbackOutput.args;
      output = someChannel.take(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: '@@redux-saga/CHANNEL_END' }] }); // closed, and empty
      delete callbackOutput.args;
      output = someChannel.flush(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: '@@redux-saga/CHANNEL_END' }] }); // closed, and empty (note that this is not a list of actions!)
      delete callbackOutput.args;

      someChannel = new SagaTester(saga).run();
      someChannel.take(callback);
      someChannel.close();
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: '@@redux-saga/CHANNEL_END' }] }); // cancelled
      delete callbackOutput.args;

      someChannel = new SagaTester(saga).run();
      someChannel.take(callback);
      someChannel.put(END);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: [{ type: '@@redux-saga/CHANNEL_END' }] }); // ended
      delete callbackOutput.args;

      someChannel.take(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: undefined }); // ended != closed
    });
    it('actionChannel should not put or trigger takers if the pattern is not matched', () => {
      function* saga() { return yield actionChannel('TYPE'); }

      const someChannel = new SagaTester(saga).run();
      const callbackOutput = {};
      const callback = (...args) => { callbackOutput.args = args; };

      let output = someChannel.take(callback);
      someChannel.put({ type: 'NOT TYPE' });
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: undefined });
      output = someChannel.take(callback);
      expect({ output, args: callbackOutput.args }).toEqual({ output: undefined, args: undefined });
    });
  });
});
