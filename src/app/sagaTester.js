import isEqual from 'lodash.isequal';

import diffTwoObjects from './diffTwoObjects';
import debugBubbledTasks from './helpers/debugBubbledTasks';
import debugDeadlock from './helpers/debugDeadlock';
import debugShouldApply from './helpers/debugShouldApply';
import debugUnblock from './helpers/debugUnblock';
import doesActionMatch from './helpers/doesActionMatch';
import getDependencies from './helpers/getDependencies';
import INTERRUPTION_TYPES from './helpers/INTERRUPTION_TYPES';
import isArrayEmpty from './helpers/isArrayEmpty';
import isGenerator from './helpers/isGenerator';
import makeInterruption from './helpers/makeInterruption';
import paramsMatch from './helpers/paramsMatch';
import sortTaskPriority from './helpers/sortTaskPriority';
import __INTERRUPT__ from './helpers/__INTERRUPT__';
import TAKE_GENERATOR_TYPES from './helpers/TAKE_GENERATOR_TYPES';
import TAKE_GENERATOR_TYPES_MAP from './helpers/TAKE_GENERATOR_TYPES_MAP';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion error - ${message}`);
  }
};

const clone = (value) => {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    const newValue = [];
    value.forEach((d) => { newValue.push(clone(d)); });
    return newValue;
  }
  const newValue = {};
  Object.keys(value).forEach((k) => { newValue[k] = clone(value[k]); });
  return newValue;
};

/**
 * Filters the calls which were not made as expected
 * @param {Object} methodCall Data object containing the details of the expected call,
 *  especially "times" (the expected number of calls) and "timesCalled" (the amount of times it was actually called).
 */
function isUnmetExpectation(methodCall) {
  return (methodCall.timesCalled === undefined && methodCall.times !== 0) ||
    (methodCall.times !== undefined && methodCall.timesCalled !== undefined && methodCall.times !== methodCall.timesCalled);
}

function resultIsMockedGeneratorData(result) {
  return result != null && typeof result.next === 'function' && result.args !== undefined && result.name !== undefined;
}

function resultIsMockedSelectorData(result) {
  return typeof result === 'object' && result !== null && Object.keys(result).length === 1 && Object.keys(result)[0].startsWith('mock-');
}

function incrementCallCounter(configObject, args) {
  /* eslint-disable-next-line no-param-reassign */
  configObject.timesCalled = (configObject.timesCalled === undefined) ? 1 : configObject.timesCalled + 1;
  configObject.receivedArgs.push(args);
}

function executeFn({ context, fn, args }) {
  const method = context != null ? fn.bind(context) : fn;
  return method(...args);
}

/**
 * Use this to generate a configured saga runner.
 * To run it, call its 'run(...args)' method.
 * For a defaultSaga method, the args should be the action.
 * The tester will run the saga to the end and make assertions based on its configs,
 * causing the test to succeed or fail accordingly.
 *
 * SagaTester stores a returnValue property which can be asserted on after calling `run`.
 *
 * @param {*} saga Saga method or generator to test.
 * @param {*} config An object containing configuration settings to use when running the saga.
 *  Configs include:
 *
 * `selectorConfig`: `Object` where each key is the string returned by a mocked selector (see mockSelector)
 *  and the value is what's to be injected upon encountering that selector in the saga.
 *
 * `expectedActions`: `Array` where each element is an action matcher (dispatched with 'put')
 *  Each element of the array is a tuple of `times`, `strict`, `action` or `type` (only one of `action` and `type` must be provided).
 *  For instance, if `someAction` is called twice, once as `someAction('abc')` and once as `someAction(42, 42)`,
 *  and if `doOtherAction` of type 'TYPE' is called with unknown parameters, an appropriate config is:
 *
 *  ``` [{ times: 1, action: someAction('abc') }, { action: someAction(42, 42) }, { type: 'TYPE' }] ```
 *
 * Note that if `times` is not provided, an error is thrown if the method is never called.
 * The `strict` flag causes an error to be thrown the moment a non-matching call to a same-typed
 * action is encountered.
 *
 * `expectedCalls`: `Object` where each key is an async method (dispatched with 'call').
 *  Each value is an array of objects containing `times`, `params`, `throw` and `output` (all optional). For instance,
 *  if `someCall` is called once with `call(someCall, 'abc')` and expected output 'asd', and once with `call(someCall, 42, 42)`,
 *  an appropriate config is:
 *
 *  ``` { someCall: [{ times: 1, params: ['abc'], output: 'asd' }, { params: [42, 42] }] } ```
 *
 * Note that if `times` is not provided, an error is thrown if the method is never called.
 *
 * `expectedGenerators`: `Object` where each key is the name of a mocked generator function (see mockGenerator).
 * Each value is an array of objects containing `times`, `params` and `output` (all optional).
 * NOTE: if the generator is called inside a "call" verb, it is treated as a call action, not a generator.
 * A generator inside a "call" verb does not need to be mocked.
 *
 * Note that all mocked generators must be configured, whereas all non-mocked generators should not be configured.
 * Note that if `times` is not provided (but a config exists for the generator), an error is thrown if it is never called.
 *
 * `effectiveActions`: `Array of action` Indicates which actions are "active" in the context of takeEvery and takeLatest actions.
 *  Note that by default, if this is not specified, the first argument of the "run" method is considered to be a contextual action.
 *
 * @param {bool} shouldAssert True by default. If true, asserts when certain expected calls have not been made by the end of the run.
 */
class SagaTester {
  constructor(saga, { selectorConfig = {}, expectedActions = [], expectedCalls = {}, expectedGenerators = {}, effectiveActions = [], debug = {}, options = {} } = {}, shouldAssert = true) {
    const err = (message) => `Error in the configuration of SagaTester: ${message}`;
    const validConfig = (config) => !Array.isArray(config) && typeof config === 'object' && Object.keys(config).every((key) => Array.isArray(config[key]));
    const validActions = (config) => Array.isArray(config) && config.every((el) => el.type !== undefined || el.action !== undefined);

    assert(typeof saga === 'function' && saga.next === undefined, err('The generator method received is invalid. It must be a reference to a generator method, and it cannot be a running generator.'));
    assert(!Array.isArray(selectorConfig) && typeof selectorConfig === 'object', err('selectorConfig must be an object containing values'));
    assert(validConfig(expectedCalls), err('expectedCalls must be an object containing arrays'));
    assert(validConfig(expectedGenerators), err('expectedGenerators must be an object containing arrays'));
    assert(validActions(expectedActions), err('expectedActions must be an array of object containing either an attribute "type" or "action"'));
    assert(validActions(effectiveActions), err('effectiveActions must be an array of object containing either an attribute "type" or "action"'));

    this.saga = saga;
    this.selectorConfig = selectorConfig;
    this.expectedActions = expectedActions;
    this.expectedCalls = expectedCalls;
    this.expectedGenerators = expectedGenerators;
    this.actionCalls = undefined;
    this.actionCallsPerType = undefined;
    this.callCalls = undefined;
    this.generatorCalls = undefined;
    this.errorList = undefined;
    this.assert = shouldAssert;
    this.returnValue = undefined;
    this.effectiveActions = effectiveActions;
    this.debug = debug;

    const {
      stepLimit = 1000,
      yieldDecreasesTimer = false,
      useStaticTimes = false,
      waitForSpawned = false,
      executeTakeGeneratorsOnlyOnce = false,
      ignoreTakeGenerators = undefined,
    } = options;

    this.stepLimit = stepLimit;
    this.yieldDecreasesTimer = yieldDecreasesTimer;
    this.useStaticTimes = useStaticTimes;
    this.waitForSpawned = waitForSpawned;
    this.executeTakeGeneratorsOnlyOnce = executeTakeGeneratorsOnlyOnce;
    this.ignoreTakeGenerators = ignoreTakeGenerators;
  }

  /**
   * Calls the generator method provided in the constructor with the given arguments, and iterates through it until the end.
   *
   * If a single argument is provided and effectiveActions is not provided, the first argument is considered as the action to trigger a top-level saga method.
   *
   * During the run, if it encounters yields that are not specified in the configuration, a detailed error is thrown.
   *
   * After the run, if any expected calls, actions or generator calls are missing (or if too many have been made), an error is thrown, and they are listed.
   *
   * @param  {...any} args Args with which to call the generator method provided in the constructor
   *  (if the first argument is an action, it will be used to trigger takeLatest and takeEvery verbs).
   */
  run(...args) {
    this.prepareRun(...args);

    try {
      this.returnValue = this.processGenerator(this.saga(...args), { name: 'root' });
    } catch (e) {
      throw new Error(`Error was thrown while running SagaTester (step ${this.step}).\n\n${e.stack}`);
    }
    this.generateMissingCallErrors();

    if (this.assert && this.errorList != null && this.errorList.length > 0) {
      throw new Error(`Errors while running SagaTester.\n\n${this.errorList.join('\n\n')}\n\nSaga stack: ${this.taskStack.join('\n')}`);
    }
    return this.returnValue;
  }

  /**
   * Prepares the state for a run, wiping artifacts from previous runs.
   * @param  {...any} args Arguments used during the run.
   */
  prepareRun(...args) {
    /* eslint-disable no-param-reassign */
    this.actionCalls = clone(this.expectedActions);
    this.actionCallsPerType = {};
    this.actionCalls.forEach((el) => {
      el.receivedArgs = [];
      const effectiveType = el.type || el.action.type;
      this.actionCallsPerType[effectiveType] = { receivedArgs: [] };
    });
    this.callCalls = clone(this.expectedCalls);
    Object.values(this.callCalls).forEach((el) => { el.forEach((subEl) => { subEl.receivedArgs = []; }); });
    this.generatorCalls = clone(this.expectedGenerators);
    Object.values(this.generatorCalls).forEach((el) => { el.forEach((subEl) => { subEl.receivedArgs = []; }); });
    this.errorList = [];
    this.step = 0;
    this.taskId = 0;
    this.pendingTasks = [];
    this.taskStack = [];
    this.takeGenerators = [];
    this.args = args;
    if (isArrayEmpty(this.effectiveActions)) {
      if (args[0] == null || (typeof args[0] === 'object' && args[0].type === undefined)) {
        this.actions = [];
      } else {
        this.actions = [args[0]];
      }
    } else {
      this.actions = clone(this.effectiveActions);
    }

    /* eslint-enable no-param-reassign */
  }

  /**
   * Generates error messages at the end of a run, if certain expected calls were not fulfilled correctly.
   */
  generateMissingCallErrors() {
    const { actionCalls, callCalls, generatorCalls, errorList } = this;

    actionCalls.filter(isUnmetExpectation).forEach((expected) => {
      errorList.push(this.makeError(expected, 'call(s) to action', expected.type || expected.action.type, undefined, true));
    });
    Object.keys(callCalls)
      .forEach((methodName) => callCalls[methodName].filter(isUnmetExpectation)
        .forEach((expected) => { errorList.push(this.makeError(expected, 'CALL verb(s) to', methodName)); }));
    Object.keys(generatorCalls)
      .forEach((generatorName) => generatorCalls[generatorName].filter(isUnmetExpectation)
        .forEach((expected) => { errorList.push(this.makeError(expected, 'call(s) to generator method', generatorName, '\n\nDid you mock your generator using mockGenerator?')); }));
  }

  /**
   * Standard method to print an error message pertaining to unfulfilled expectations at the end of a run.
   * @param {*} expected Config object defining an expected call.
   * @param {*} callLabel Name of this type of config (generator, call, action).
   * @param {*} expectedString What was the name of the expected element (generator name, action type, method name).
   * @param {*} note Additional string info to add at the end of the message.
   */
  makeError(expected, callLabel, expectedString, note = '', includePartialMatches = false) {
    const expectedInput = expected.params || expected.action;
    let listOfReceivedArgs = expected.receivedArgs;
    let timesCalled = expected.timesCalled || 0;

    if (includePartialMatches) {
      listOfReceivedArgs = [].concat(listOfReceivedArgs, this.actionCallsPerType[expectedString].receivedArgs);
      timesCalled += this.actionCallsPerType[expectedString].timesCalled || 0;
    }

    const paramsString = expectedInput !== undefined ? `, with args ${JSON.stringify(expectedInput, undefined, 2)}` : '';
    let expectedCallsString = expected.times;
    if (expected.times === undefined) { expectedCallsString = 'at least one'; }

    let receivedArgs = '';
    let hasNoArgs = isArrayEmpty(listOfReceivedArgs);
    if (expectedInput !== undefined && !hasNoArgs) {
      receivedArgs = `\nReceived elements include:\n${listOfReceivedArgs.map((el) => diffTwoObjects(expectedInput, el)).join('\n\n')}`;
    } else {
      receivedArgs = !hasNoArgs ? '' : `\nReceived elements include: ${JSON.stringify(listOfReceivedArgs, undefined, 2)}`;
    }

    listOfReceivedArgs = this.actionCallsPerType?.[expectedString]?.receivedArgs;
    hasNoArgs = isArrayEmpty(listOfReceivedArgs);
    if (includePartialMatches && hasNoArgs) {
      // minimize unnecessary logs; log each action's received calls only once to prevent nested logs
      this.actionCallsPerType[expectedString].receivedArgs = [];
    }

    return `Expected to receive ${expectedCallsString} ${callLabel} ${expectedString}${paramsString}. Received ${timesCalled}${receivedArgs}${note}`;
  }

  /**
   * Handles each step of the run, by yielding each of the steps of the generator passed to the constructor of the SagaTester.
   * The root generator (the root saga) is also responsible for handling blocking logic between multiple tasks.
   *
   * @param {generator} generator Saga or generator to run.
   * @param {object} options
   * - task; the pseudo task either yielded via a fork, or as a stand-in for the generator's execution root (see processEffect for more detail).
   * - parentTask; If this generator was called by a parent generator, this is the owning task. The parent will only terminate when all of its children terminate.
   * - isResuming: false by default. If true, uses the resume value. We are "resuming" a stopped generator.
   * - resumeValue: undefined by default. If true, replaces the first next call by this value.
   * - name: Name for the generator's task, for debug purposes. Corresponds to the name of the generator.
   */
  processGenerator(generator, options) {
    let { currentTask } = options;
    const { parentTask, isResuming, resumeValue, name } = options;
    let nextResult;
    if (currentTask?.isCancelled) {
      if (!currentTask.started) {
        generator.next();
      }
      nextResult = generator.return();
    } else {
      nextResult = isResuming ? { value: resumeValue, done: false } : generator.next();
    }
    if (!currentTask) {
      // eslint-disable-next-line no-param-reassign
      currentTask = this.makeNewTask({ wait: 'generator', generator, parentTask, name });
    }
    currentTask.started = true;

    try {
      while (!nextResult.done) {
        currentTask.latestValue = nextResult.value;
        nextResult = this.processEffect(generator, nextResult, { currentTask });
        if (nextResult.value === __INTERRUPT__) {
          if (currentTask.id !== 0) {
            if (nextResult.origin === currentTask.id) {
              return nextResult;
            }
            return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, nextResult.origin, this.debug?.interrupt);
          }
          if (currentTask.interruption == null) {
            makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, nextResult.origin, this.debug?.interrupt);
          }
          const result = this.handleInterruption(currentTask);
          nextResult = generator.next(result);
        }
        this.incrementStep();
      }
    } catch (e) {
      this.taskStack.push(`id: ${currentTask.id}, generator: ${currentTask.id === 0 ? 'root' : currentTask.generator?.name}`);
      throw e;
    }

    // Cleanup now that the generator ended, or make it wait after its children
    const dependencies = this.pendingTasks.filter((p) => p.parentTask?.id === currentTask.id).map((p) => p.id);
    if (dependencies.length === 0) {
      currentTask.wait = false;
    } else {
      currentTask.wait = 'waiting-children';
    }
    currentTask.result = nextResult.value;
    if (currentTask.wait === false && this.pendingTasks.includes(currentTask)) {
      this.cleanupRanTasks();
    }
    if (currentTask.id === 0 && currentTask.wait) {
      this.handleInterruption(currentTask);
    } else if (currentTask.wait) {
      return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.WAITING_FOR_CHILDREN, dependencies, this.debug?.interrupt);
    }

    return nextResult.value;
  }

  /**
   * Process (artificially) the effect yielded at the current step.
  *
   * @param {generator} generator Generator being run; its next method is called if noNext is false.
   * @param {object} currentResult Result of the last yield (object with value and done properties)
   * @param {bool} options
   * - noNext (false by default); if false, at the end of this step, the generator's next method is called.
   * - noNext is true, the result of the effect is returned directly (allowing processing a list of effects, like with a race or all).
   * - currentTask; the pseudo task either yielded via a fork, or as a stand-in for the generator's execution root.
   * - currentTask.id; unique identifier of a task for debugging purposes
   * - currentTask.parentTask; the owning task, undefined if this is the root OR this is a spawn task
   * - currentTask.generator; the generator whose execution is tied to this task
   * - currentTask.isCancelled; boolean, set to false at first. Can be set to true with a "cancel" effect, and is returned when encountering a "cancelled" effect.
   * - currentTask.interruption; {pending: obj, kind: string}. Set if the task was interrupted by something. Specify the conditions for resuming.
   * - currentTask.wait; if false, and not interrupted, this task is considered complete. If a number, it will run with that priority (0 = highest priority)
   *                     if 'generator' it is considered to complete when its generator completes.
   *                     if true, it will run ONLY if either awaited inside a "join" or if SagaTester needs to run it in order to unblock its root execution
   * - isRacing (false by default); if true, weakens the checks on take verbs, so a blocked "take" effect does not stop a race that would resolve on other effects.
   */
  processEffect(generator, currentResult, options) {
    this.countDownTasks(options);
    if (currentResult.value == null) {
      return this.nextOrReturn(generator, currentResult.value, options);
    }
    if (currentResult.value.type === 'CANCELLED') {
      return this.nextOrReturn(generator, options.currentTask.isCancelled, options);
    }
    if (currentResult.value.type === 'CANCEL') {
      return this.processCancellation(generator, currentResult.value, options);
    }
    if (currentResult.value.type === 'JOIN') {
      return this.processJoin(generator, currentResult.value, options);
    }
    if (currentResult.value.type === 'SELECT') {
      return this.processSelectEffect(generator, currentResult.value, options);
    }
    if (currentResult.value.type === 'CALL') {
      return this.processCallEffect(generator, currentResult.value, options);
    }
    if (currentResult.value.type === 'PUT') {
      return this.processPutEffect(generator, currentResult.value, options);
    }
    if (currentResult.value.type === 'FORK' && Object.keys(TAKE_GENERATOR_TYPES_MAP).includes(currentResult.value.payload.fn.name)) {
      return this.processActionMatchingTakeEffects(generator, currentResult.value, options);
    }
    if (currentResult.value.type === 'FORK') {
      if (currentResult.value.payload.context != null) {
        // eslint-disable-next-line no-param-reassign
        currentResult.value.payload.fn = currentResult.value.payload.fn.bind(currentResult.value.payload.context);
      }
      const subGenerator = currentResult.value.payload.fn(...currentResult.value.payload.args);
      const methodName = currentResult.value.payload.fn.name;
      if (this.generatorCalls?.[methodName] != null) {
        subGenerator.name = methodName;
        subGenerator.args = currentResult.value.payload.args;
      }
      return this.processSubGenerators(generator, subGenerator, { ...options, isTask: true, isBoundToParent: currentResult.value.payload?.detached !== true });
    }
    if (currentResult.value.type === 'TAKE') {
      return this.processTake(generator, currentResult.value, options);
    }
    if (currentResult.value.type === 'ALL' || currentResult.value.type === 'RACE') {
      return this.processAllOrRace(generator, currentResult.value, options);
    }
    if (typeof currentResult.value.next === 'function') {
      return this.processSubGenerators(generator, currentResult.value, options);
    }
    return this.nextOrReturn(generator, currentResult.value, options);
  }

  processCancellation(generator, value, options) {
    const { currentTask } = options;
    const { payload } = value;
    let cancelledTasks = [];
    if (payload === '@@redux-saga/SELF_CANCELLATION') {
      cancelledTasks.push(currentTask);
    } else if (Array.isArray(payload)) {
      cancelledTasks = payload;
    } else {
      cancelledTasks.push(payload);
    }
    cancelledTasks.forEach(this.recursiveCancelTasks());

    if (payload === '@@redux-saga/SELF_CANCELLATION') {
      return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.WAITING_FOR_CHILDREN, currentTask.id, this.debug?.interrupt);
    }
    return this.nextOrReturn(generator, undefined, options);
  }

  processJoin(generator, value, options) {
    const { currentTask } = options;
    const { payload } = value;

    const wrappedTaskList = Array.isArray(payload) ? [...payload] : [payload];
    const results = [];
    if (wrappedTaskList.some((t) => ![false, undefined].includes(t.wait) || getDependencies(t, this.pendingTasks).length > 0)) {
      const taskList = Array.isArray(payload) ? [...payload] : payload;
      return makeInterruption(currentTask, taskList, INTERRUPTION_TYPES.JOIN, Array.isArray(payload) ? payload.map((t) => t.id) : payload.id, this.debug?.interrupt);
    }
    const sorted = sortTaskPriority([...wrappedTaskList]);
    sorted.forEach((task) => { this.runTask(task); });
    wrappedTaskList.forEach((task) => { results.push(task.result); });
    return this.nextOrReturn(generator, Array.isArray(payload) ? results : results[0], options);
  }

  processSelectEffect(generator, value, options) {
    const { selector } = value.payload;
    let result;
    try {
      result = selector(this.selectorConfig);
    } catch (e) {
      throw new Error(`A selector crashed while executing. Either provide the redux value in selectorConfig, or mock it using mockSelector (step ${this.step})\n\n${e.stack}`);
    }
    if (result === undefined && !this.selectorConfig.__passOnUndefined) {
      throw new Error(`A selector returned undefined. If this is desirable, provide selectorConfig.__passOnUndefined: true. Otherwise, provide selectorConfig. (step ${this.step})`);
    }

    if (!resultIsMockedSelectorData(result)) {
      return this.nextOrReturn(generator, result, options);
    }
    const selectorId = Object.keys(result)[0].split('-')[1];
    if (!Object.keys(this.selectorConfig).includes(selectorId)) {
      throw new Error(`Received selector with id ${selectorId}, but the SagaTest was not configured to handle this selector (step ${this.step})`);
    }
    return this.nextOrReturn(generator, this.selectorConfig[selectorId], options);
  }

  processCallEffect(generator, value, options) {
    let methodId = value.payload.fn.name;
    let { args } = value.payload;

    if (methodId === 'retry') {
      // Treat retry as call
      const remainingArgs = args.filter((x, i) => i >= 3);
      // eslint-disable-next-line prefer-destructuring, no-param-reassign
      value.payload.fn = args[2]; value.payload.args = remainingArgs;
      methodId = args[2].name;
      args = remainingArgs;
    } else if (methodId === 'delayP') {
      // handle delay effect
      const result = this.makeNewTask({ result: undefined, wait: args[0], parentTask: options.currentTask, name: 'delay' });
      return makeInterruption(options.currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, result.id, this.debug?.interrupt);
    }
    if (!Object.keys(this.callCalls).includes(methodId)) {
      throw new Error(`Received CALL verb with a method named ${methodId}, but the SagaTest was not configured to receive this CALL (step ${this.step})`);
    }

    const matchedCalls = this.callCalls[methodId].filter((config) => paramsMatch(config.params, args));
    if (matchedCalls.length === 0) {
      const expectedArgs = this.callCalls[methodId].map((el) => diffTwoObjects(el.params, args)).join('\n\n');

      throw new Error(`Received async method '${methodId}' was called, but no matching set of parameters were found!\n\n${expectedArgs}`);
    }
    incrementCallCounter(matchedCalls[0], args);

    return this.triggerNextStepWithResult(matchedCalls[0], generator, { ...options, name: methodId, wait: matchedCalls[0].wait }, value.payload);
  }

  processPutEffect(generator, value, options) {
    const { action } = value.payload;
    const actionType = action.type;
    const matchedCalls = this.actionCalls.filter((config) => config.type === actionType || isEqual(config.action, action));
    if (matchedCalls.length > 0) {
      incrementCallCounter(matchedCalls[0], action);
    } else {
      const strictCalls = this.actionCalls.filter((act) => act.strict !== false && act.action && act.action.type === actionType).map((act) => act.action);
      if (strictCalls.length > 0) {
        const expectedArgs = strictCalls.map((el) => diffTwoObjects(el, action)).join('\n\n');

        throw new Error(`Received a strictly matched action of type '${actionType}', but no matching actions were found!\n\n${expectedArgs}`);
      } else {
        const partialMatches = this.actionCalls.filter((config) => (config.type || config.action.type) === actionType);
        if (partialMatches.length > 0) {
          incrementCallCounter(this.actionCallsPerType[actionType], action);
        }
      }
    }

    this.bubbleUpFinishedTask([], [action]);

    this.takeGenerators.forEach((tg) => {
      if (doesActionMatch(action, tg.pattern)) {
        this.triggerTakeGenerator(tg, action);
      }
    });

    return this.nextOrReturn(generator, undefined, options);
  }

  processActionMatchingTakeEffects(generator, value, options) {
    const generatorType = TAKE_GENERATOR_TYPES_MAP[value.payload.fn.name];
    const { args } = value.payload;
    let pattern;
    let method;
    let delayArg;

    // handle the debounced verb
    if (args.length === 3 && typeof args[0] === 'number' && typeof args[2] === 'function') {
      [delayArg, pattern, method] = args;
    } else {
      [pattern, method] = args;
    }

    this.addNewTakeGenerator({ actionPattern: pattern, generatorMethod: method, generatorType, delayArg }, options);
    return this.nextOrReturn(generator, undefined, options);
  }

  processTake(generator, value, options) {
    const { currentTask } = options;
    let { pattern } = value.payload;
    // This weird line is to fit the description of the redux-saga doc on "take", while not stringifying every function patterns.
    if (typeof pattern === 'number' || (typeof pattern === 'function' && pattern?.toString?.toString && pattern.toString.toString().indexOf('[native code]') < 0)) {
      pattern = pattern.toString();
    }
    if (Array.isArray(pattern)) {
      pattern = pattern.map((p) => {
        if (typeof p === 'number' || (typeof p === 'function' && p?.toString?.toString && p.toString.toString().indexOf('[native code]') < 0)) {
          return p.toString();
        }
        return p;
      });
    }
    const matchedAction = this.actions.find((a) => doesActionMatch(a, pattern));
    if (matchedAction === undefined) {
      return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.TAKE, pattern, this.debug?.interrupt);
    }
    this.actions = this.actions.filter((a) => a !== matchedAction);
    return this.nextOrReturn(generator, matchedAction, options);
  }

  processAllOrRace(generator, value, options) {
    const { isRacing } = options;
    let { currentTask } = options;
    const { payload } = value;

    const newTask = this.makeNewTask({ wait: value.type === 'RACE' ? 'race' : 'all', parentTask: currentTask });
    currentTask = newTask;

    // All actions are executed, even for race; if you want to mock a certain action "winning" the race, just have all other actions return undefined.
    // If the saga is treating a list of racing items, the assertions for "take" effects are less aggressive.
    const verbIsRace = isRacing || value.type === 'RACE';
    let results;
    if (!Array.isArray(payload)) {
      results = {};
      Object.keys(payload).forEach((key) => {
        results[key] = this.processEffect(generator, { value: payload[key] }, { ...options, currentTask, noNext: true, isRacing: verbIsRace });
      });
    } else {
      results = [];
      payload.forEach((el) => {
        results.push(this.processEffect(generator, { value: el }, { ...options, currentTask, noNext: true, isRacing: verbIsRace }));
      });
    }

    const conditionType = value.type === 'RACE' ? 'every' : 'some';
    const interruptionType = value.type === 'RACE' ? INTERRUPTION_TYPES.RACE : INTERRUPTION_TYPES.ALL;
    if (Array.isArray(results)) {
      if (results[conditionType]((r) => r?.value === __INTERRUPT__)) {
        const dependencies = [];
        results = results.map((r) => (r?.value === __INTERRUPT__ && r.origin !== currentTask.id ? { ...r, dependencies: r.origin } : r));
        results
          .filter((r) => r?.value === __INTERRUPT__ && r?.dependencies != null)
          .map((r) => (Array.isArray(r.dependencies) ? r.dependencies : [r.dependencies]))
          .forEach((deps) => {
            deps.forEach((dependency) => { if (!dependencies.includes(dependency)) { dependencies.push(dependency); } });
          });
        return makeInterruption(currentTask, results, interruptionType, dependencies, this.debug?.interrupt);
      }
    } else if (Object.keys(results)[conditionType]((key) => results[key]?.value === __INTERRUPT__)) {
      const dependencies = [];
      Object.keys(results).forEach((key) => {
        if (results[key]?.value === __INTERRUPT__ && results[key].origin !== currentTask.id) {
          results[key] = { ...results[key], dependencies: results[key].origin };
        }
      });

      Object.keys(results)
        .filter((key) => results[key]?.value === __INTERRUPT__ && results[key]?.dependencies)
        .map((key) => [results[key].dependencies])
        .forEach((deps) => {
          deps.forEach((dependency) => { if (!dependencies.includes(dependency)) { dependencies.push(dependency); } });
        });
      return makeInterruption(currentTask, results, interruptionType, dependencies, this.debug?.interrupt);
    }
    // Take out unfinished tasks in case of a partially completed race
    Object.keys(results).forEach((key) => { const v = results[key]; results[key] = v?.value === __INTERRUPT__ ? undefined : v; });

    // race or all task was completed without any interruption, so we resolve it
    this.pendingTasks = this.pendingTasks.filter((t) => currentTask.id !== t.id);

    return this.nextOrReturn(generator, results, options);
  }

  processSubGenerators(generator, subGenerator, options) {
    if (!resultIsMockedGeneratorData(subGenerator)) {
      return this.triggerNextStepWithResult({ call: true }, generator, { ...options, wait: false, name: 'unmocked-generator' }, undefined, subGenerator);
    }
    const { args, name } = subGenerator;
    if (this.generatorCalls == null || this.generatorCalls[name] == null) {
      throw new Error(`Received mocked generator call with name ${name} and args ${args}, but no such generator was defined in the expectedGenerators config`);
    }
    const matchedCalls = this.generatorCalls[name].filter((config) => paramsMatch(config.params, args));
    if (matchedCalls.length === 0) {
      const expectedArgs = this.generatorCalls[name].map((el) => diffTwoObjects(el.params, args)).join('\n\n');

      throw new Error(`Generator method '${name}' was called, but no matching set of parameters were found!\n\n${expectedArgs}`);
    }
    incrementCallCounter(matchedCalls[0], args);

    return this.triggerNextStepWithResult(matchedCalls[0], generator, { ...options, wait: matchedCalls[0].wait, name }, undefined, subGenerator);
  }

  triggerNextStepWithResult = (matchedCall, generator, options, effectPayload, subGenerator) => {
    const { isTask, currentTask, isBoundToParent, wait, name } = options;
    if (isGenerator(effectPayload?.fn)) {
      // eslint-disable-next-line no-param-reassign
      subGenerator = executeFn(effectPayload);
    }

    if (matchedCall.throw) {
      return generator.throw(matchedCall.throw);
    }

    let result;
    if (matchedCall.call) {
      if (isTask) {
        // eslint-disable-next-line no-promise-executor-return
        const task = this.makeNewTask({ wait: typeof wait === 'number' ? wait + 1 : wait, generator: subGenerator, name });
        if (isBoundToParent) {
          task.parentTask = currentTask;
        } else if (this.waitForSpawned) {
          task.parentTask = this.pendingTasks.find((p) => p.id === 0);
        }
        if ([false, null, undefined].includes(wait)) {
          this.runTask(task);
        }
        result = task;
      } else if (subGenerator) {
        if (![false, null, undefined].includes(wait)) {
          result = this.makeNewTask({ wait: typeof wait === 'number' ? wait + 1 : wait, generator: subGenerator, parentTask: currentTask, name });
          return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, result.id, this.debug?.interrupt);
        }
        result = this.processGenerator(subGenerator, { parentTask: currentTask, name });
      } else {
        if (![false, null, undefined].includes(wait)) {
          result = this.makeNewTask({ wait: typeof wait === 'number' ? wait + 1 : wait, parentTask: currentTask, name });
          // eslint-disable-next-line no-inner-declarations
          function* asyncCall(task) {
            return executeFn(effectPayload, { currentTask: task, parentTask: currentTask, name });
          }
          result.generator = asyncCall(result);
          return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, result.id, this.debug?.interrupt);
        }
        result = executeFn(effectPayload, { parentTask: currentTask, name });
      }
      return this.nextOrReturn(generator, result, options);
    }

    if (isTask) {
      result = this.makeNewTask({ result: matchedCall.output, wait, parentTask: currentTask, name });
    } else if (![false, null, undefined].includes(wait)) {
      result = this.makeNewTask({ result: matchedCall.output, wait, parentTask: currentTask, name });
      return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, result.id, this.debug?.interrupt);
    } else {
      result = matchedCall.output;
    }
    return this.nextOrReturn(generator, result, options);
  };

  runTask = (task, options = {}) => {
    let { isResuming, resumeValue } = options;
    if (['race', 'all'].includes(task.wait)) {
      // eslint-disable-next-line no-param-reassign
      task.result = task.interruption.pending;
    }
    if (task.interruption?.resolved === true) {
      isResuming = true;
      resumeValue = task.interruption.value;
    }
    // eslint-disable-next-line no-param-reassign
    delete task.interruption;
    if (task.generator !== undefined && (task.result === undefined || task.result?.value === __INTERRUPT__) && !['waiting-children', 'race', 'all'].includes(task.wait)) {
      const result = this.processGenerator(task.generator, { currentTask: task, parentTask: task.parentTask, isResuming, resumeValue });
      if (result?.value !== __INTERRUPT__) {
        // eslint-disable-next-line no-param-reassign
        task.result = result;
      }
    }
    if (getDependencies(task, this.pendingTasks).length === 0 && task.id !== 0) {
      // eslint-disable-next-line no-param-reassign
      task.wait = false;
    }
  };

  countDownTasks = (options) => {
    if (options.noNext || !this.yieldDecreasesTimer) {
      return;
    }
    let ran = false;
    this.pendingTasks.forEach((task) => {
      if (typeof task.wait === 'number' && task.wait > 0) {
        // eslint-disable-next-line no-param-reassign
        task.wait -= 1;
        if (task.wait === 0) {
          this.runTask(task);
          ran = true;
        }
      }
    });
    if (ran) {
      this.cleanupRanTasks();
    }
  };

  /**
   * Triggers the "next" step of the generator with the value, if the noNext mode if disabled.
   * If we're in noNext mode, we simply return the value of the verb, and we don't do "next".
   * @param {generator} generator Generator to call "next" on.
   * @param {object} value Value to return or use within "next".
   * @param {object} options noNext: Whether to call "next" or directly return the value. currentTask: currently running task.
   */
  nextOrReturn(generator, value, options) {
    const { noNext, currentTask } = options;
    if (value?.value === __INTERRUPT__) {
      return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, value.origin, this.debug?.interrupt);
    }
    if (noNext) {
      return value;
    }
    return generator.next(value);
  }

  makeNewTask(options) {
    const newTask = { '@@redux-saga/TASK': true, isCancelled: false, id: this.taskId, ...options };
    this.taskId++;
    this.pendingTasks.push(newTask);
    return newTask;
  }

  addNewTakeGenerator({ actionPattern, generatorType, generatorMethod, delayArg }, options) {
    const { currentTask } = options;
    const newTakeGenerator = {
      parentTask: currentTask,
      pattern: actionPattern,
      kind: generatorType,
      method: generatorMethod,
      state: { delayArg, timer: 0, lastTaskId: undefined },
    };
    this.takeGenerators.push(newTakeGenerator);
    const matchedAction = this.actions.find((a) => doesActionMatch(a, actionPattern));
    if (matchedAction) {
      this.actions = this.actions.filter((a) => a !== matchedAction);
      this.triggerTakeGenerator(newTakeGenerator, matchedAction);
    }
  }

  triggerTakeGenerator(takeGenerator, action) {
    const { kind, method, parentTask, state: { delayArg, timer, lastTaskId } } = takeGenerator;
    if (this.executeTakeGeneratorsOnlyOnce && lastTaskId != null) { return; }
    if (this.ignoreTakeGenerators != null && doesActionMatch(action, this.ignoreTakeGenerators)) { return; }

    const lastTask = this.pendingTasks.find((t) => t.id === lastTaskId);

    let task;
    if (kind === TAKE_GENERATOR_TYPES.TAKE_EVERY) {
      task = this.makeNewTask({ wait: false, generator: method(action), parentTask, name: method.name });
    } else if (kind === TAKE_GENERATOR_TYPES.TAKE_LATEST) {
      if (lastTask) {
        this.cancelTasks([lastTask.id], []);
      }
      task = this.makeNewTask({ wait: false, generator: method(action), parentTask, name: method.name });
    } else if (kind === TAKE_GENERATOR_TYPES.TAKE_LEADING) {
      if (!lastTask) {
        task = this.makeNewTask({ wait: false, generator: method(action), parentTask, name: method.name });
      }
    } else if (kind === TAKE_GENERATOR_TYPES.THROTTLE) {
      if (timer <= 0) {
        task = this.makeNewTask({ wait: false, generator: method(action), parentTask, name: method.name });
        // eslint-disable-next-line no-param-reassign
        takeGenerator.state.timer = delayArg;
      }
    } else { // kind === TAKE_GENERATOR_TYPES.DEBOUNCE
      task = this.makeNewTask({ wait: delayArg, generator: method(action), parentTask, name: method.name });
      if (lastTask && !lastTask.started) {
        // The task has not even been run yet; we remove it from the queue to prevent it from ever running
        this.pendingTasks = this.pendingTasks.filter((p) => p !== lastTask);
      }
    }

    if (task) {
      // eslint-disable-next-line no-param-reassign
      takeGenerator.state.lastTaskId = task.id;
    }
  }

  handleInterruption(rootTask) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.unblockLeastPriorityTaskAndResumeGenerators();
      if (getDependencies(rootTask, this.pendingTasks).length === 0) {
        break;
      }
    }
    return rootTask.result;
  }

  // Run the fastest task in the waiting queue. If there are equal-speed tasks, they are run together (synchronously one after the other).
  // If the ran tasks unlock parent tasks that were waiting for these tasks to finish, those tasks are also run; this last part is recursive.
  unblockLeastPriorityTaskAndResumeGenerators() {
    this.incrementStep();
    sortTaskPriority(this.pendingTasks);
    const fastestTask = this.pendingTasks.find((t) => getDependencies(t, this.pendingTasks).length === 0 || (t.wait === 'generator' && t.interruption == null));
    if (!fastestTask) {
      debugDeadlock(this.pendingTasks);
    }
    const selectedPriority = [0, undefined, null, 'generator', 'race', 'all', 'waiting-children'].includes(fastestTask.wait) ? false : fastestTask.wait;

    // We run all tasks with equivalent weights "simultaneously"
    const tasksToRun = this.pendingTasks.filter((t) => (
      getDependencies(t, this.pendingTasks).length === 0 &&
      (
        selectedPriority === true ||
        [0, undefined, null, false, 'race', 'all', 'generator', 'waiting-children'].includes(t.wait) ||
        (typeof selectedPriority === 'number' && typeof t.wait === 'number' && t.wait <= selectedPriority)
      )
    ));
    if (debugShouldApply(tasksToRun, this.debug.unblock)) {
      // eslint-disable-next-line no-console
      console.log(debugUnblock(tasksToRun, this.pendingTasks));
    }

    if (!this.useStaticTimes && typeof selectedPriority === 'number' && selectedPriority > 0) {
      this.pendingTasks.forEach((p) => {
        if (typeof p.wait === 'number') {
          // eslint-disable-next-line no-param-reassign
          p.wait = Math.max(0, p.wait - selectedPriority);
        }
      });
      this.takeGenerators.forEach((tg) => {
        // eslint-disable-next-line no-param-reassign
        tg.state.timer = Math.max(0, tg.state.timer - selectedPriority);
      });
    }

    tasksToRun.forEach((t) => {
      this.runTask(t);
    });

    const ranTasks = tasksToRun.filter((t) => t.wait === false);
    if (ranTasks.length > 0) {
      this.cleanupRanTasks();
      this.bubbleUpFinishedTask(ranTasks, []);
    }
  }

  bubbleUpFinishedTask(finishedTasks, putActions) {
    const tasksToRun = [];
    const cancelledTasks = [];

    if (debugShouldApply(finishedTasks, this.debug.bubble) || debugShouldApply(putActions, this.debug.bubble)) {
      // eslint-disable-next-line no-console
      console.log(debugBubbledTasks([].concat(finishedTasks, putActions), this.pendingTasks));
    }
    const finishedIds = finishedTasks.map((f) => f.id);
    this.pendingTasks.forEach((p) => {
      const unblockedDependencies = getDependencies(p, this.pendingTasks).filter((dependency) => (
        typeof dependency === 'number' ?
          finishedIds.includes(dependency) :
          putActions.some((a) => doesActionMatch(a, dependency))
      ));
      if (unblockedDependencies.length > 0 && p.interruption) {
        const { kind, pending } = p.interruption;
        if (p.interruption.dependencies != null && Array.isArray(p.interruption.dependencies)) {
          // eslint-disable-next-line no-param-reassign
          p.interruption.dependencies = p.interruption.dependencies.filter((d) => !finishedIds.includes(d));
        }
        if ([INTERRUPTION_TYPES.RACE, INTERRUPTION_TYPES.ALL].includes(kind)) {
          // pending is an object or list of interruptions, and if race:one/all:all of they keys/indexes are not interrupted anymore, it must be run.
          Object.keys(pending).forEach((key) => {
            if (pending[key]?.['@@__isComplete__'] || pending[key]?.dependencies == null) { return; }
            let isComplete = false;
            let { dependencies } = pending[key];
            if (typeof dependencies === 'number') { // a lone id
              const matchedTask = finishedTasks.find((t) => dependencies === t.id);
              if (matchedTask) {
                dependencies = { resolved: true, result: matchedTask.result };
                isComplete = true;
              }
            } else if (Array.isArray(dependencies) && dependencies.every((d) => ['string', 'function'].includes(typeof d))) {
              // This is not a list of dependencies, but an array action pattern
              const matchedAction = putActions.find((a) => doesActionMatch(a, dependencies));
              if (matchedAction) {
                dependencies = { resolved: true, result: matchedAction };
                isComplete = true;
              }
            } else if (Array.isArray(dependencies)) {
              for (let i = 0; i < dependencies.length; i++) {
                const d = dependencies[i];
                if (typeof d === 'number') {
                  const matchedTask = finishedTasks.find((t) => d === t.id);
                  if (matchedTask) {
                    dependencies[i] = { resolved: true, result: matchedTask.result };
                  }
                }
              }
              isComplete = dependencies.every((d) => d?.resolved === true);
            } else {
              const matchedAction = putActions.find((a) => doesActionMatch(a, dependencies));
              if (matchedAction) {
                dependencies = { resolved: true, result: matchedAction };
                isComplete = true;
              }
            }
            if (isComplete) {
              pending[key] = { '@@__isComplete__': true, result: Array.isArray(dependencies) ? dependencies.map((d) => d.result) : dependencies.result };
            }
          });
          const methodCheck = kind === INTERRUPTION_TYPES.RACE ? 'some' : 'every';
          if (Object.keys(pending)[methodCheck]((key) => pending[key]?.value !== __INTERRUPT__)) {
            // Task is ready to complete! Remove incomplete tasks and unwrap results before resolving them
            Object.keys(pending).forEach((key) => {
              if (pending[key]?.value === __INTERRUPT__) {
                cancelledTasks.push(pending[key].origin);
                pending[key] = undefined;
              } else {
                pending[key] = pending[key].result;
              }
            });
            tasksToRun.push({ task: p, value: pending });
          }
        } else if (kind === INTERRUPTION_TYPES.JOIN) {
          // pending is a single task, or a list of tasks. If all tasks are not interrupted anymore, it must be run.
          if (Array.isArray(pending)) {
            if (Array.isArray(pending) && pending.every((t) => t.interruption === undefined && [undefined, false].includes(t.wait))) {
              tasksToRun.push({ task: p, value: pending.map((t) => t.result) });
            }
          } else {
            tasksToRun.push({ task: p, value: pending.result });
          }
        } else if (kind === INTERRUPTION_TYPES.GENERATOR) {
          // resolve the task which caused the generator to be interrupted (fork'ed tasks may not have blocked the generator)
          const match = finishedTasks.find((t) => t.id === p.interruption.dependencies);
          tasksToRun.push({ task: p, value: match.result });
        } else { // INTERRUPTION_TYPES.TAKE
          const matchedAction = putActions.find((a) => doesActionMatch(a, p.interruption.dependencies));
          tasksToRun.push({ task: p, value: matchedAction });
        }
      }
    });

    if (cancelledTasks.length > 0) {
      this.cancelTasks(cancelledTasks, tasksToRun);
    }

    tasksToRun.forEach(({ task, value }) => {
      if (task.id === 0) {
        // eslint-disable-next-line no-param-reassign
        task.result = value;
        // eslint-disable-next-line no-param-reassign
        delete task.interruption;
      } else if ([false, 0, 'waiting-children', 'race', 'all', 'generator'].includes(task.wait)) {
        this.runTask(task, { isResuming: true, resumeValue: value });
      } else {
        // eslint-disable-next-line no-param-reassign
        task.interruption = { resolved: true, value };
      }
    });
    const completedTasks = tasksToRun.filter((t) => t.task.wait === false);
    if (completedTasks.length > 0) {
      this.cleanupRanTasks();
      this.bubbleUpFinishedTask(completedTasks.map((t) => t.task), []);
    }
  }

  cancelTasks(idsEligibleForCancellation, tasksNotToCancel) {
    let tasksToCancel = [];
    idsEligibleForCancellation.forEach((id) => {
      const task = this.pendingTasks.find((p) => p.id === id);
      if (tasksToCancel.includes(task)) {
        return;
      }
      tasksToCancel.push(task);
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const count = tasksToCancel.length;
      for (let i = 0; i < this.pendingTasks.length; i++) {
        const p = this.pendingTasks[i];
        if (
          !tasksToCancel.includes(p) &&
          tasksToCancel.some((t) => t === p.parentTask || getDependencies(t, this.pendingTasks).includes(p.id))
        ) {
          tasksToCancel.unshift(p);
        }
      }
      if (count === tasksToCancel.length) { break; }
    }
    tasksToCancel = tasksToCancel.filter((t) => !tasksNotToCancel.some(({ task }) => task.id === t.id));
    tasksToCancel.forEach(this.recursiveCancelTasks());
    tasksToCancel.forEach((t) => { this.runTask(t); });
  }

  recursiveCancelTasks(ignores = []) {
    return (t) => {
      // eslint-disable-next-line no-param-reassign
      t.isCancelled = true;
      if (t.wait === true || typeof t.wait === 'number') {
        // eslint-disable-next-line no-param-reassign
        t.wait = 0;
      }
      this.pendingTasks.forEach((c) => {
        if (c.parentTask !== t || ignores.includes(c)) { return; } // Children indicate dependencies, not ownership.
        this.recursiveCancelTasks([...ignores, t])(c);
      });
    };
  }

  cleanupRanTasks() {
    this.pendingTasks = this.pendingTasks.filter((t) => t.wait !== false || getDependencies(t, this.pendingTasks).length !== 0);
  }

  incrementStep() {
    this.step += 1;
    if (this.step >= this.stepLimit) {
      debugDeadlock(this.pendingTasks, `Saga reached step ${this.stepLimit}, you are probably looking at an infinite loop somewhere. To alter this limit, provide options.stepLimit to sagaTester.\r\n`);
    }
  }
}

export default SagaTester;
