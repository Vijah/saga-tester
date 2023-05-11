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

const END_TYPE = '@@redux-saga/CHANNEL_END';

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

function startOrResumeGenerator(generator, options) {
  const { currentTask, isResuming, resumeValue } = options;

  if (currentTask?.cancellationPending) {
    delete currentTask.cancellationPending;
    if (!currentTask.started) {
      generator.next();
    }
    return generator.return();
  }
  return isResuming ? { value: resumeValue, done: false } : generator.next();
}

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

function getFirstIncompleteCallOrLastCall(matchedCalls) {
  if (matchedCalls.length === 0) {
    return undefined;
  }
  for (let i = 0; i < matchedCalls.length; i++) {
    const matchedCall = matchedCalls[i];
    if (matchedCall.times === 0) { return matchedCall; }
    if (matchedCall.timesCalled === undefined) { return matchedCall; }
    if (matchedCall.times !== undefined && matchedCall.times > matchedCall.timesCalled) { return matchedCall; }
  }
  return matchedCalls[matchedCalls.length - 1];
}

function incrementCallCounter(configObject, args) {
  /* eslint-disable-next-line no-param-reassign */
  configObject.timesCalled = (configObject.timesCalled === undefined) ? 1 : configObject.timesCalled + 1;
  configObject.receivedArgs.push(args);
}

function updateSelectorConfigWithReducers(reducers, selectorConfig, action) {
  if (typeof reducers === 'function') {
    return reducers(selectorConfig, action);
  }
  const newState = clone(selectorConfig);
  Object.keys(reducers).forEach((key) => {
    newState[key] = reducers[key](newState[key], action);
  });
  return newState;
}

function getContext(task, contextName) {
  if (Object.keys(task.context).includes(contextName)) {
    return task.context[contextName];
  }
  if (task.parentTask != null) {
    return getContext(task.parentTask, contextName);
  }
  return undefined;
}

function* sideEffect(effect) {
  yield effect;
}

function* callMethodGenerator(method) {
  return method();
}

function* putMock(action) {
  yield { type: 'PUT', payload: { action } };
}

function* throwGenerator(thingToThrow) {
  throw thingToThrow;
}

const makePutCallback = (task) => (action) => {
  // eslint-disable-next-line no-param-reassign
  task.wait = false;
  // eslint-disable-next-line no-param-reassign
  task.generator = putMock(action);
};

const pseudoSleep = () => new Promise((resolve) => { resolve(); });

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
 * If `times` is not provided, an error is thrown if the method is never called.
 *
 * The `strict` flag causes an error to be thrown the moment a non-matching action with the same-typed is dispatched. It is true by default.
 *
 * `expectedCalls`: `Object` where each key is an async method (dispatched with 'call').
 *  Each value is an array of objects containing `times`, `params`, `throw` and `output` (all optional). For instance,
 *  if `someCall` is called once with `call(someCall, 'abc')` and expected output 'asd', and once with `call(someCall, 42, 42)`,
 *  an appropriate config is:
 *
 *  ``` [{ name: 'someCall', times: 1, params: ['abc'], output: 'asd' }, { name: 'someCall', params: [42, 42] }] ```
 *
 * If `times` is not provided, an error is thrown if the method is never called.
 *
 * Only mocked generators can be intercepted when yielded. If not intercepted, the generator is merely ran.
 *
 * `effectiveActions`: `Array of action` Indicates which actions are "active" in the context of takeEvery and takeLatest actions.
 *  Note that by default, if this is not specified, the first argument of the "run" method is considered to be a contextual action.
 *
 * @param {bool} shouldAssert True by default. If true, asserts when certain expected calls have not been made by the end of the run.
 */
class SagaTester {
  constructor(
    saga,
    {
      selectorConfig = {},
      expectedActions = [],
      expectedCalls = [],
      expectedGenerators,
      effectiveActions = [],
      sideEffects = [],
      debug = {},
      options = {},
    } = {},
    shouldAssert = true,
  ) {
    const err = (message) => `Error in the configuration of SagaTester: ${message}`;
    const validConfig = (config) => Array.isArray(config) && config.every((c) => typeof c === 'object' && c != null && Object.keys(c).includes('name'));
    const validActions = (config) => Array.isArray(config) && config.every((el) => el.type !== undefined || el.action !== undefined);

    assert(typeof saga === 'function' && saga.next === undefined, err('The generator method received is invalid. It must be a reference to a generator method, and it cannot be a running generator.'));
    assert(!Array.isArray(selectorConfig) && typeof selectorConfig === 'object', err('config.selectorConfig must be an object containing values'));
    assert(validConfig(expectedCalls), err('config.expectedCalls must be a list of objects containing a property "name"'));
    assert(expectedGenerators == null, err('config.expectedGenerators was removed in 2.0.0; move them all inside expectedCalls'));
    assert(validActions(expectedActions), err('config.expectedActions must be a list of objects containing either an attribute "type" or "action"'));
    assert(validActions(effectiveActions), err('config.effectiveActions must be a list of objects containing either an attribute "type" or "action"'));

    this.saga = saga;
    this.initialSelectorConfig = selectorConfig;
    this.expectedActions = expectedActions;
    this.expectedCalls = expectedCalls;
    this.actionCalls = undefined;
    this.actionCallsPerType = undefined;
    this.callCalls = undefined;
    this.errorList = undefined;
    this.assert = shouldAssert;
    this.returnValue = undefined;
    this.effectiveActions = effectiveActions;
    this.sideEffects = sideEffects;
    this.debug = debug;

    const {
      stepLimit = 1000,
      useStaticTimes = false,
      waitForSpawned = false,
      executeTakeGeneratorsOnlyOnce = false,
      ignoreTakeGenerators = undefined,
      swallowSpawnErrors = false,
      reduxThunkOptions = {},
      passOnUndefinedSelector = false,
      failOnUnconfigured = true,
      reducers = (state) => state,
      context = {},
    } = options;

    this.stepLimit = stepLimit;
    this.useStaticTimes = useStaticTimes;
    this.waitForSpawned = waitForSpawned;
    this.executeTakeGeneratorsOnlyOnce = executeTakeGeneratorsOnlyOnce;
    this.ignoreTakeGenerators = ignoreTakeGenerators;
    this.swallowSpawnErrors = swallowSpawnErrors;
    this.reduxThunkOptions = reduxThunkOptions;
    this.passOnUndefinedSelector = passOnUndefinedSelector;
    this.failOnUnconfigured = failOnUnconfigured;
    this.reducers = reducers;
    this.context = context;
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
      const generator = this.saga(...args);
      const rootTask = this.makeNewTask({ wait: 'generator', generator, name: 'root', context: this.context });
      this.initializeSideEffects(rootTask);
      this.returnValue = this.processGenerator(generator, { currentTask: rootTask, name: 'root' });
      while (
        ![undefined, null, false, 0, 'waiting-children'].includes(rootTask.wait) ||
        (rootTask.wait === 'waiting-children' && getDependencies(rootTask, this.pendingTasks).length > 0)
      ) {
        const result = this.handleInterruption(rootTask);
        this.runTask(rootTask, { isResuming: true, resumeValue: result });
        this.returnValue = rootTask.result;
      }
    } catch (e) {
      throw new Error(`Error was thrown while running SagaTester (step ${this.step}).\n\n${e?.stack ? `${e.stack}` : e}`);
    }

    return this.concludeRun();
  }

  async runAsync(...args) {
    this.prepareRun(...args);
    this.isAsync = true;

    try {
      const generator = this.saga(...args);
      const rootTask = this.makeNewTask({ wait: 'generator', generator, name: 'root', context: this.context });
      this.initializeSideEffects(rootTask);
      this.returnValue = this.processGenerator(generator, { currentTask: rootTask, name: 'root' });
      while (
        ![undefined, null, false, 0, 'waiting-children'].includes(rootTask.wait) ||
        (rootTask.wait === 'waiting-children' && getDependencies(rootTask, this.pendingTasks).length > 0)
      ) {
        // eslint-disable-next-line no-await-in-loop
        const result = await this.handleInterruptionAsync(rootTask);
        this.runTask(rootTask, { isResuming: true, resumeValue: result });
        this.returnValue = rootTask.result;
      }
    } catch (e) {
      throw new Error(`Error was thrown while running SagaTester (step ${this.step}).\n\n${e?.stack ? `${e.stack}` : e}`);
    }

    return this.concludeRun();
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
    this.callCalls.forEach((el) => { el.receivedArgs = []; });
    this.errorList = [];
    this.step = 0;
    this.taskId = 0;
    this.pendingTasks = [];
    this.taskStack = [];
    this.takeGenerators = [];
    this.inError = false;
    this.args = args;
    this.selectorConfig = clone(this.initialSelectorConfig);
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

  initializeSideEffects(rootTask) {
    let hasReadyTasks = false;
    this.sideEffects.forEach(({ wait, effect, changeSelectorConfig }) => {
      let sideEffectGenerator;
      if (changeSelectorConfig) {
        const method = () => this.changeSelectorConfig(changeSelectorConfig);
        sideEffectGenerator = callMethodGenerator(method);
      } else {
        const effectiveEffect = effect.type === 'CANCEL' ? { type: 'CANCEL', payload: rootTask } : effect;
        sideEffectGenerator = sideEffect(effectiveEffect);
      }
      this.makeNewTask({
        wait,
        generator: sideEffectGenerator,
        parentTask: effect?.payload?.detached === true || effect?.type === 'CANCEL' ? undefined : rootTask,
        name: 'sideEffect',
        isSideEffect: true,
      });
      hasReadyTasks = hasReadyTasks || [undefined, null, 0, false].includes(wait);
    });
    if (hasReadyTasks) {
      this.unblockLeastPriorityTaskAndResumeGenerators(true);
    }
  }

  changeSelectorConfig(changeSelectorConfig) {
    this.selectorConfig = changeSelectorConfig(this.selectorConfig);
  }

  concludeRun() {
    this.generateMissingCallErrors();

    if (this.assert && this.errorList != null && this.errorList.length > 0) {
      throw new Error(`Errors while running SagaTester.\n\n${this.errorList.join('\n\n')}\n\nSaga stack: ${this.taskStack.join('\n')}`);
    }
    return this.returnValue;
  }

  /**
   * Generates error messages at the end of a run, if certain expected calls were not fulfilled correctly.
   */
  generateMissingCallErrors() {
    const { actionCalls, callCalls, errorList } = this;

    actionCalls.filter(isUnmetExpectation).forEach((expected) => {
      errorList.push(this.makeError(expected, 'call(s) to action', expected.type || expected.action.type, undefined, true));
    });
    callCalls.filter(isUnmetExpectation).forEach((callCall) => { errorList.push(this.makeError(callCall, 'calls to', callCall.name)); });
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
    try {
      let nextResult;

      nextResult = startOrResumeGenerator(generator, options);

      if (!currentTask) {
        const { parentTask, name } = options;
        currentTask = this.makeNewTask({ wait: 'generator', generator, parentTask, name });
      } else if ([null, undefined, false].includes(currentTask.wait)) {
        currentTask.wait = 'generator';
      }
      // Run generator
      currentTask.started = true;
      if (currentTask.wait === 'error') {
        nextResult = this.processError(generator, nextResult.value, { ...options, currentTask });
      }
      while (!nextResult.done) {
        currentTask.latestValue = nextResult.value;
        nextResult = this.processEffect(generator, nextResult, { currentTask });
        if (nextResult.value === __INTERRUPT__) {
          if (nextResult.origin === currentTask.id) {
            return nextResult;
          }
          return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, nextResult.origin, this.debug?.interrupt);
        }
        this.incrementStep();
      }
      // TODO find a better condition
      if (currentTask.id === 0 && currentTask.result !== undefined && currentTask.isCancelled && nextResult.value === undefined) {
        currentTask.wait = false;
        return currentTask.result;
      }
      return this.cleanupGeneratorAndWaitForChildren(nextResult.value, { ...options, currentTask });
    } catch (e) {
      return this.handleGeneratorError(e, { ...options, currentTask });
    }
  }

  cleanupGeneratorAndWaitForChildren(result, options) {
    const { currentTask } = options;

    const dependencies = this.pendingTasks.filter((p) => p.parentTask?.id === currentTask.id).map((p) => p.id);
    if (dependencies.length === 0) {
      currentTask.wait = false;
    } else {
      currentTask.wait = 'waiting-children';
    }
    currentTask.result = result;
    if (currentTask.wait === false && this.pendingTasks.includes(currentTask)) {
      this.cleanupRanTasks();
    }
    if (currentTask.wait) {
      return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.WAITING_FOR_CHILDREN, dependencies, this.debug?.interrupt);
    }

    return result;
  }

  handleGeneratorError(error, options) {
    const { currentTask, parentTask } = options;
    if (this.inError) {
      throw error;
    }
    const isUnhandledSpawnError = currentTask?.id !== 0;
    const hasParent = parentTask != null;
    if (currentTask !== undefined && (isUnhandledSpawnError || hasParent)) {
      this.cancelChildren(currentTask);
    }
    if (hasParent) {
      if (currentTask !== undefined) {
        currentTask.wait = false;
      }
      parentTask.wait = 'error';
      parentTask.result = error;
      return error;
    }
    if (isUnhandledSpawnError && this.swallowSpawnErrors) {
      return error;
    }
    throw error;
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
    if (currentResult.value == null) {
      return this.nextOrReturn(generator, currentResult.value, options);
    }
    const currentType = currentResult.value.type;
    if (currentType === 'CANCELLED') {
      return this.nextOrReturn(generator, options.currentTask.isCancelled, options);
    }
    if (currentType === 'CANCEL') {
      return this.processCancellation(generator, currentResult.value, options);
    }
    if (currentType === 'JOIN') {
      return this.processJoin(generator, currentResult.value, options);
    }
    if (currentType === 'SELECT') {
      return this.processSelectEffect(generator, currentResult.value, options);
    }
    if (currentType === 'CALL' || currentType === 'CPS') {
      return this.processCallEffect(generator, currentResult.value, options);
    }
    if (currentType === 'PUT') {
      return this.processPutEffect(generator, currentResult.value, options);
    }
    if (currentType === 'FORK' && Object.keys(TAKE_GENERATOR_TYPES_MAP).includes(currentResult.value.payload.fn.name)) {
      return this.processActionMatchingTakeEffects(generator, currentResult.value, options);
    }
    if (currentType === 'FORK') {
      if (currentResult.value.payload.context != null) {
        // eslint-disable-next-line no-param-reassign
        currentResult.value.payload.fn = currentResult.value.payload.fn.bind(currentResult.value.payload.context);
      }
      const subGenerator = currentResult.value.payload.fn(...currentResult.value.payload.args);
      const methodName = currentResult.value.payload.fn.name;
      subGenerator.name = methodName;
      subGenerator.args = currentResult.value.payload.args;
      const nameMatches = this.callCalls.filter((c) => c.name === methodName);
      if (nameMatches.length <= 0) {
        subGenerator.unmocked = true;
      }
      return this.processSubGenerators(generator, subGenerator, { ...options, isTask: true, isBoundToParent: currentResult.value.payload?.detached !== true });
    }
    if (currentType === 'TAKE') {
      return this.processTake(generator, currentResult.value, options);
    }
    if (currentType === 'ALL' || currentType === 'RACE') {
      return this.processAllOrRace(generator, currentResult.value, options);
    }
    if (currentType === 'SET_CONTEXT') {
      Object.assign(options.currentTask.context, currentResult.value.payload);
      return this.nextOrReturn(generator, undefined, options);
    }
    if (currentType === 'GET_CONTEXT') {
      const result = getContext(options.currentTask, currentResult.value.payload);
      return this.nextOrReturn(generator, result, options);
    }
    if (typeof currentResult.value.then === 'function') {
      return this.processPromise(generator, currentResult.value, options);
    }
    if (typeof currentResult.value.next === 'function') {
      return this.processSubGenerators(generator, currentResult.value, options);
    }
    return this.nextOrReturn(generator, currentResult.value, options);
  }

  processError(generator, error, options) {
    const { currentTask, previousInterruption } = options;
    const isJoin = previousInterruption?.kind === INTERRUPTION_TYPES.JOIN;
    const dependencies = getDependencies(currentTask, this.pendingTasks);
    currentTask.wait = 'generator';
    const tasksToCancel = this.pendingTasks.filter((p) => (
      p.parentTask === currentTask && (
        ['race', 'all'].includes(p.wait) ||
        (isJoin && dependencies.includes(p.id))
      )
    )).map((t) => t.id);
    this.cancelTasks(tasksToCancel, []);
    return generator.throw(error);
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
    if (currentTask.isCancelled) {
      const result = wrappedTaskList.map((task) => task.result);
      return this.nextOrReturn(generator, Array.isArray(payload) ? result : result[0], options);
    }
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
    const { selector, args } = value.payload;
    let result;
    try {
      result = selector(this.selectorConfig, ...args);
    } catch (e) {
      this.inError = true;
      throw new Error(`A selector crashed while executing. Either provide the redux value in config.selectorConfig, or mock it using mockSelector (step ${this.step})\n\n${e.stack}`);
    }
    if (result === undefined && !this.passOnUndefinedSelector) {
      this.inError = true;
      throw new Error(`A selector returned undefined. If this is desirable, set config.options.passOnUndefinedSelector to true. Otherwise, adjust config.selectorConfig. (step ${this.step})`);
    }

    if (!resultIsMockedSelectorData(result)) {
      return this.nextOrReturn(generator, result, options);
    }
    const selectorId = Object.keys(result)[0].split('-')[1];
    if (!Object.keys(this.selectorConfig).includes(selectorId)) {
      this.inError = true;
      throw new Error(`Received selector with id ${selectorId}, but the SagaTest was not configured to handle this selector (step ${this.step})`);
    }
    return this.nextOrReturn(generator, this.selectorConfig[selectorId], options);
  }

  processCallEffect(generator, value, options) {
    const { currentTask } = options;
    let methodName = value.payload.fn.name;
    let { args } = value.payload;

    if (methodName === 'retry') {
      // Treat retry as call
      const remainingArgs = args.filter((x, i) => i >= 3);
      // eslint-disable-next-line prefer-destructuring, no-param-reassign
      value.payload.fn = args[2]; value.payload.args = remainingArgs;
      methodName = args[2].name;
      args = remainingArgs;
    } else if (methodName === 'delayP') {
      // handle delay effect
      const result = this.makeNewTask({ result: undefined, wait: args[0], parentTask: currentTask, name: 'delay' });
      return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, result.id, this.debug?.interrupt);
    }

    let matchedCall;
    if (currentTask.isSideEffect) {
      matchedCall = { call: true };
    } else {
      const nameMatches = this.callCalls.filter((c) => c.name === methodName);
      if (nameMatches.length <= 0 && this.failOnUnconfigured) {
        this.inError = true;
        throw new Error(`Received call effect with a method named ${methodName}, but the SagaTest was not configured to receive it (step ${this.step})`);
      }
      const matchedCalls = nameMatches.filter((config) => paramsMatch(config.params, args));
      if (matchedCalls.length <= 0 && nameMatches.length > 0) {
        const expectedArgs = nameMatches.map((el) => diffTwoObjects(el.params, args)).join('\n\n');
        this.inError = true;
        throw new Error(`Received call effect with a method named '${methodName}', but no matching set of parameters were found!\n\n${expectedArgs}`);
      }
      matchedCall = getFirstIncompleteCallOrLastCall(matchedCalls);
      if (matchedCall == null) {
        matchedCall = { call: true };
      } else {
        incrementCallCounter(matchedCall, args);
      }
    }

    return this.triggerNextStepWithResult(matchedCall, generator, { ...options, name: methodName, wait: matchedCall.wait, isCPS: value.type === 'CPS' }, value.payload);
  }

  processPutEffect(generator, value, options) {
    const { currentTask } = options;
    const { action, resolve } = value.payload;

    if (typeof action === 'function') {
      const putTask = this.makeNewTask({ wait: 'promise', generator: undefined, parentTask: currentTask, name: 'async-put' });
      const promise = action(makePutCallback(putTask), () => this.selectorConfig, this.reduxThunkOptions);
      if (typeof promise?.then === 'function') {
        if (!this.isAsync) {
          this.inError = true;
          throw new Error('Received a promise inside the saga (in the form of an async action), but was not in async mode. To process promises, use runAsync instead of run.');
        }
        promise.then(
          undefined,
          (result) => { this.pendingTasks = this.pendingTasks.filter((p) => p.id !== putTask.id); currentTask.result = result; currentTask.wait = 'error'; },
        );
      }
      if (resolve || putTask.wait === false) {
        return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, putTask.id, this.debug?.interrupt);
      }
      return this.nextOrReturn(generator, undefined, options);
    }

    const actionType = action.type;
    const matchedCalls = this.actionCalls.filter((config) => config.type === actionType || isEqual(config.action, action));
    if (matchedCalls.length > 0 && !currentTask.isSideEffect) {
      incrementCallCounter(matchedCalls[0], action);
    } else {
      const strictCalls = this.actionCalls.filter((act) => act.strict !== false && act.action && act.action.type === actionType).map((act) => act.action);
      if (strictCalls.length > 0) {
        const expectedArgs = strictCalls.map((el) => diffTwoObjects(el, action)).join('\n\n');
        this.inError = true;
        throw new Error(`Received a strictly matched action of type '${actionType}', but no matching actions were found!\n\n${expectedArgs}`);
      } else {
        const partialMatches = this.actionCalls.filter((config) => (config.type || config.action.type) === actionType);
        if (partialMatches.length > 0) {
          incrementCallCounter(this.actionCallsPerType[actionType], action);
        }
      }
    }

    this.selectorConfig = updateSelectorConfigWithReducers(this.reducers, this.selectorConfig, action);
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
    const { maybe } = value.payload;
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
    const matchedAction = this.actions.find((a) => a.type === END_TYPE || doesActionMatch(a, pattern));
    if (matchedAction === undefined) {
      const interruption = makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.TAKE, pattern, this.debug?.interrupt);
      interruption.maybe = maybe;
      currentTask.interruption.maybe = maybe;
      return interruption;
    }
    this.actions = this.actions.filter((a) => a !== matchedAction);
    if (matchedAction.type === END_TYPE && !maybe) {
      return this.processCancellation(generator, { payload: '@@redux-saga/SELF_CANCELLATION' }, options);
    }
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

  processPromise(generator, value, options) {
    if (!this.isAsync) {
      this.inError = true;
      throw new Error('Received a promise inside the saga, but was not in async mode. To process promises, use runAsync instead of run.');
    }
    const { currentTask } = options;
    // not quite, need to defer inside a new task otherwise race and all won't work
    const task = this.makeNewTask({ wait: 'promise', parentTask: currentTask });

    value.then(
      (result) => { task.result = result; task.wait = false; },
      (result) => { this.pendingTasks = this.pendingTasks.filter((p) => p.id !== task.id); currentTask.result = result; currentTask.wait = 'error'; },
    );
    return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, task.id, this.debug?.interrupt);
  }

  processSubGenerators(generator, subGenerator, options) {
    if ((!this.failOnUnconfigured && (!resultIsMockedGeneratorData(subGenerator) || subGenerator.unmocked)) || options.currentTask?.isSideEffect) {
      return this.triggerNextStepWithResult({ call: true }, generator, { ...options, wait: false, name: subGenerator.name || 'unmocked-generator' }, undefined, subGenerator);
    }
    const { args, name: methodName } = subGenerator;
    const nameMatches = this.callCalls.filter((c) => c.name === methodName);
    if (nameMatches.length <= 0 && this.failOnUnconfigured) {
      this.inError = true;
      throw new Error(`Received generator with name ${methodName} and args ${args}, but no such generator was expected in the expectedCalls config`);
    }
    const matchedCalls = nameMatches.filter((config) => paramsMatch(config.params, args));
    if (matchedCalls.length <= 0 && nameMatches.length > 0) {
      const expectedArgs = nameMatches.map((el) => diffTwoObjects(el.params, args)).join('\n\n');
      this.inError = true;
      throw new Error(`Generator method '${methodName}' was called, but no matching set of parameters were found!\n\n${expectedArgs}`);
    }
    const matchedCall = getFirstIncompleteCallOrLastCall(matchedCalls);
    incrementCallCounter(matchedCall, args);

    return this.triggerNextStepWithResult(matchedCall, generator, { ...options, wait: matchedCall.wait, name: methodName }, undefined, subGenerator);
  }

  triggerNextStepWithResult = (matchedCall, generator, options, effectPayload, subGenerator) => {
    const { isTask, currentTask, isBoundToParent, wait, name, isCPS } = options;
    if (isGenerator(effectPayload?.fn)) {
      // eslint-disable-next-line no-param-reassign
      subGenerator = this.executeFn(effectPayload);
    }

    if (matchedCall.throw) {
      if (![false, null, undefined].includes(wait)) {
        const result = this.makeNewTask({ wait, generator: throwGenerator(matchedCall.throw), parentTask: currentTask, name });
        return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, result.id, this.debug?.interrupt);
      }
      return generator.throw(matchedCall.throw);
    }

    let result;
    if (matchedCall.call) {
      if (isTask) {
        const task = this.makeNewTask({ wait, generator: subGenerator, name });
        if (currentTask.isSideEffect) {
          task.isSideEffect = true;
        }
        if (isBoundToParent) {
          task.parentTask = currentTask;
        } else if (this.waitForSpawned) {
          task.parentTask = this.pendingTasks.find((p) => p.id === 0);
        }
        if ([false, null, undefined].includes(wait)) {
          this.runTask(task);
        }
        if (currentTask.wait === 'error') {
          return this.nextOrReturn(generator, currentTask.result, options);
        }
        result = task;
      } else if (subGenerator) {
        if (![false, null, undefined].includes(wait)) {
          result = this.makeNewTask({ wait, generator: subGenerator, parentTask: currentTask, name });
          return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, result.id, this.debug?.interrupt);
        }
        result = this.processGenerator(subGenerator, { parentTask: currentTask, name });
      } else if (isCPS) {
        result = this.makeNewTask({ wait, parentTask: currentTask, name });
        result.generator = callMethodGenerator(() => this.executeFn(effectPayload, { currentTask: result, isCPS }));
        return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, result.id, this.debug?.interrupt);
      } else {
        if (![false, null, undefined].includes(wait)) {
          result = this.makeNewTask({ wait, parentTask: currentTask, name });
          result.generator = callMethodGenerator(() => this.executeFn(effectPayload, { currentTask: result }));
          return makeInterruption(currentTask, undefined, INTERRUPTION_TYPES.GENERATOR, result.id, this.debug?.interrupt);
        }
        try {
          result = this.executeFn(effectPayload, { currentTask });
          if (result?.value === __INTERRUPT__) {
            return result; // The call was a promise
          }
        } catch (e) {
          return generator.throw(e);
        }
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

  executeFn({ context, fn, args }, options) {
    const method = context != null ? fn.bind(context) : fn;

    if (options?.isCPS) {
      const { currentTask } = options;
      const cpsTask = this.makeNewTask({ wait: 'promise', parentTask: currentTask, name: 'cps-callback' });
      currentTask.wait = 'generator';
      method(...args, (error, returnValue) => {
        this.pendingTasks = this.pendingTasks.filter((p) => p.id !== cpsTask.id);
        if (error != null) {
          currentTask.wait = 'error';
          currentTask.result = error;
        } else {
          currentTask.wait = 0;
          currentTask.result = returnValue;
        }
      });
      return currentTask.result;
    }

    const result = method(...args);
    if (typeof result?.then !== 'function') {
      return result;
    }
    const { currentTask } = options;
    return this.processPromise(currentTask.generator, result, options);
  }

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
    if (task.wait === 'error') {
      isResuming = true;
      resumeValue = task.result;
    }
    const previousInterruption = task.interruption;
    // eslint-disable-next-line no-param-reassign
    delete task.interruption;
    // TODO find a better condition
    if (task.generator !== undefined && (task.result === undefined || task.id === 0 || task.wait === 'error' || task.result?.value === __INTERRUPT__) && !['waiting-children', 'race', 'all'].includes(task.wait)) {
      const result = this.processGenerator(task.generator, { currentTask: task, parentTask: task.parentTask, isResuming, resumeValue, previousInterruption });
      if (result?.value !== __INTERRUPT__) {
        // eslint-disable-next-line no-param-reassign
        task.result = result;
      }
    }

    if (task.generator === undefined && task.wait === 'error') {
      // This block of code is the result of treating all blocks like runnables.
      // race and all are not "really" runnables.
      // In case of their children failing, we must cause all children to be cancelled.
      // race/all-type tasks are the only kinds of tasks without a generator and which can be in error.

      // eslint-disable-next-line no-param-reassign
      task.parentTask.wait = 'error';
      // eslint-disable-next-line no-param-reassign
      task.parentTask.result = task.result;
      // eslint-disable-next-line no-param-reassign
      task.wait = 'all';
      // eslint-disable-next-line no-param-reassign
      task.interruption = previousInterruption;
      this.cancelChildren(task);
      // eslint-disable-next-line no-param-reassign
      task.wait = 'error';
      // eslint-disable-next-line no-param-reassign
      delete task.interruption;
    }

    if (getDependencies(task, this.pendingTasks).length === 0 && task.id !== 0) {
      // eslint-disable-next-line no-param-reassign
      task.wait = false;
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
    if (currentTask.wait === 'error') {
      return this.processError(generator, value, { ...options, currentTask });
    }
    return generator.next(value);
  }

  makeNewTask(options) {
    const newTask = { '@@redux-saga/TASK': true, isCancelled: false, id: this.taskId, ...options };
    if (options.context == null && options.generator !== undefined && options.parentTask?.context != null) {
      newTask.context = clone(options.parentTask.context);
    } else if (options.context != null && options.generator !== undefined) {
      newTask.context = clone(options.context);
    } else {
      newTask.context = {};
    }

    if (options?.parentTask?.isSideEffect) {
      newTask.isSideEffect = true;
    }
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
      if (getDependencies(rootTask, this.pendingTasks).length === 0 || rootTask.wait === 'error') {
        break;
      }
    }
    return rootTask.result;
  }

  async handleInterruptionAsync(rootTask) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      await pseudoSleep(); // Allows promises to "wake up"
      this.unblockLeastPriorityTaskAndResumeGenerators();
      if (getDependencies(rootTask, this.pendingTasks).length === 0 || rootTask.wait === 'error') {
        break;
      }
    }
    return rootTask.result;
  }

  getFastestTaskThatIsReadyToRun() {
    sortTaskPriority(this.pendingTasks);
    return this.pendingTasks.find((t) => (
      (getDependencies(t, this.pendingTasks).length === 0 && t.wait !== 'promise') ||
      (t.wait === 'generator' && t.interruption == null) ||
      (t.wait === 'error')
    ));
  }

  // Run the fastest task in the waiting queue. If there are equal-speed tasks, they are run together (synchronously one after the other).
  // If the ran tasks unlock parent tasks that were waiting for these tasks to finish, those tasks are also run; this last part is recursive.
  unblockLeastPriorityTaskAndResumeGenerators(excludeRoot = false) {
    this.incrementStep();
    const fastestTask = this.getFastestTaskThatIsReadyToRun();
    if (!fastestTask) {
      this.inError = true;
      debugDeadlock(this.pendingTasks);
    }
    const selectedPriority = [0, undefined, null, 'generator', 'error', 'race', 'all', 'waiting-children'].includes(fastestTask.wait) ? false : fastestTask.wait;

    // We run all tasks with equivalent weights "simultaneously"
    const tasksToRun = this.pendingTasks.filter((t) => (
      (getDependencies(t, this.pendingTasks).length === 0 || t.wait === 'error') &&
      (
        selectedPriority === true ||
        [0, undefined, null, false, 'generator', 'error', 'race', 'all', 'waiting-children'].includes(t.wait) ||
        (typeof selectedPriority === 'number' && typeof t.wait === 'number' && t.wait <= selectedPriority)
      ) && (!excludeRoot || t.id !== 0)
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
    const hasEndAction = putActions.some((a) => a.type === END_TYPE);
    const finishedIds = finishedTasks.map((f) => f.id);
    this.pendingTasks.filter((p) => p.wait !== 'error').forEach((p) => {
      const unblockedDependencies = getDependencies(p, this.pendingTasks).filter((dependency) => (
        typeof dependency === 'number' ?
          finishedIds.includes(dependency) :
          hasEndAction || putActions.some((a) => doesActionMatch(a, dependency))
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
            } else if (!Array.isArray(dependencies) || dependencies.every((d) => ['string', 'function'].includes(typeof d))) {
              // This is an action pattern, which can be an array of string/function, a string, or a function.
              if (hasEndAction) {
                if (pending[key].maybe) {
                  dependencies = { resolved: true, result: { type: END_TYPE } };
                  isComplete = true;
                } else {
                  cancelledTasks.push(p.parentTask.id);
                }
              } else {
                const matchedAction = putActions.find((a) => doesActionMatch(a, dependencies));
                if (matchedAction) {
                  dependencies = { resolved: true, result: matchedAction };
                  isComplete = true;
                }
              }
            } else { // Array.isArray(dependencies)
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
          // eslint-disable-next-line no-lonely-if
          if (hasEndAction) {
            if (p.interruption.maybe) {
              tasksToRun.push({ task: p, value: { type: END_TYPE } });
            } else {
              cancelledTasks.push(p.id);
            }
          } else {
            const matchedAction = putActions.find((a) => doesActionMatch(a, p.interruption.dependencies));
            tasksToRun.push({ task: p, value: matchedAction });
          }
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

  cancelChildren = (task) => this.cancelTasks([task.id], [{ task }]);

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
      // eslint-disable-next-line no-param-reassign
      t.cancellationPending = true;
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
      this.inError = true;
      debugDeadlock(this.pendingTasks, `Saga reached step ${this.stepLimit}, you are probably looking at an infinite loop somewhere. To alter this limit, provide options.stepLimit to sagaTester.\r\n`);
    }
  }
}

export default SagaTester;
