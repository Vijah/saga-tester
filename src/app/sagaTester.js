import isEqual from 'lodash.isequal';

import diffTwoObjects from './diffTwoObjects';

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

const isArrayEmpty = (arr) => {
  if (arr == null) {
    return true;
  }
  if (arr.length === 0) {
    return true;
  }
  return false;
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

/**
 * Triggers the "next" step of the generator with the value, if the noNext mode if disabled.
 * If we're in noNext mode, we simply return the value of the verb, and we don't do "next".
 * @param {generator} generator Generator to call "next" on.
 * @param {object} value Value to return or use within "next".
 * @param {bool} noNext Whether to call "next" or directly return the value.
 */
function nextOrReturn(generator, value, noNext) {
  if (noNext) {
    return value;
  }
  return generator.next(value);
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
  constructor(saga, { selectorConfig = {}, expectedActions = [], expectedCalls = {}, expectedGenerators = {}, effectiveActions = [] } = {}, shouldAssert = true) {
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
      this.returnValue = this.processGenerator(this.saga(...args));
    } catch (e) {
      throw new Error(`Error was thrown while running SagaTester (step ${this.step}).\n\n${e.stack}`);
    }
    this.generateMissingCallErrors();

    if (this.assert && this.errorList != null && this.errorList.length > 0) {
      throw new Error(`Errors while running SagaTester.\n\n${this.errorList.join('\n\n')}`);
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
    this.args = args;
    if (isArrayEmpty(this.effectiveActions)) {
      if (args[0] == null || (typeof args[0] === 'object' && args[0].type === undefined)) {
        this.actions = undefined;
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
   * @param {generator} generator Saga or generator to run.
   */
  processGenerator(generator) {
    let nextResult = generator.next();

    while (!nextResult.done) {
      nextResult = this.processVerb(generator, nextResult);
      this.step += 1;
    }

    return nextResult.value;
  }

  /**
   * Process (artificially) the verb yielded at the current step.
   * If noNext mode is disabled, at the end of this step, generator.next(result) is called.
   * If noNext mode is on, the result of the verb is returned directly.
   * Handled verbs: select, call, put, takeLatest, takeEvery, all (everything is executed),
   *  race (everything is executed) and take (no effect, returns undefined).
   * @param {generator} generator Generator being run; generator.next(result) is called if noNext is false.
   * @param {object} currentResult Result of the last yield (object with value and done properties)
   * @param {bool} noNext (false by default) Whether to call "next" on the generator, or directly return the result.
   */
  processVerb(generator, currentResult, noNext = false, isRacing = false) {
    const noActionConfig = isArrayEmpty(this.actions);

    if (currentResult.value.type === 'SELECT') {
      return this.processSelectVerb(generator, currentResult.value, noNext);
    }
    if (currentResult.value.type === 'CALL') {
      return this.processCallVerb(generator, currentResult.value, noNext);
    }
    if (currentResult.value.type === 'PUT') {
      return this.processPutVerb(generator, currentResult.value, noNext);
    }
    if (currentResult.value.type === 'FORK' && ['takeLeading', 'takeLatest', 'takeEvery', 'debounceHelper', 'throttle'].includes(currentResult.value.payload.fn.name)) {
      const methodName = currentResult.value.payload.fn.name;
      assert(isRacing || this.actions !== undefined, `Error in the configuration of SagaTester: Found a ${methodName} action, but no actions in the context of the saga. Either pass an action as the only parameter to your saga or define effectiveActions in your configs.`);
      const { args } = currentResult.value.payload;
      let type;
      let method;

      // handle the debounced verb
      if (args.length === 3 && typeof args[0] === 'number' && typeof args[2] === 'function') {
        [, type, method] = args;
      } else {
        [type, method] = args;
      }

      if (type === '*') {
        return this.processSubGenerators(generator, method(this.actions[0]));
      }
      const listOfMatchers = Array.isArray(type) ? type : [type];
      const matchedAction = noActionConfig ? undefined : this.actions.find((action) => listOfMatchers.includes(action.type));
      if (matchedAction) {
        return this.processSubGenerators(generator, method(matchedAction));
      }
    } else if (currentResult.value.type === 'FORK') {
      return this.processSubGenerators(generator, currentResult.value.payload.fn(...currentResult.value.payload.args));
    }
    if (currentResult.value.type === 'TAKE') {
      assert(isRacing || this.actions !== undefined, 'Error in the configuration of SagaTester: Found a take action, but no actions in the context of the saga. Either pass an action as the only parameter to your saga or define effectiveActions in your configs.');
      const { pattern } = currentResult.value.payload;
      if (pattern === '*') {
        return nextOrReturn(generator, this.actions[0], noNext);
      }
      const listOfMatchers = Array.isArray(pattern) ? pattern : [pattern];
      const matchedAction = noActionConfig ? undefined : this.actions.find((action) => listOfMatchers.includes(action.type));
      assert(isRacing || matchedAction !== undefined, `Error in the configuration of SagaTester: Found a take action looking for an action of type ${pattern}, but no such effectiveAction exists. Add this action in the effectiveActions config to solve this issue.`);
      return nextOrReturn(generator, matchedAction, noNext);
    }
    if (currentResult.value.type === 'ALL' || currentResult.value.type === 'RACE') {
      // All actions are executed, even for race; if you want to mock a certain action "winning" the race, just have all other actions return undefined.
      const verbIsRace = isRacing || currentResult.value.type === 'RACE';
      if (!Array.isArray(currentResult.value.payload)) {
        const results = {};
        Object.keys(currentResult.value.payload).forEach((key) => {
          results[key] = this.processVerb(generator, { value: currentResult.value.payload[key] }, true, verbIsRace);
        });
        return nextOrReturn(generator, results, noNext);
      }
      const results = [];
      currentResult.value.payload.forEach((el) => {
        results.push(this.processVerb(generator, { value: el }, true, verbIsRace));
      });
      return nextOrReturn(generator, results, noNext);
    }
    if (typeof currentResult.value.next === 'function') {
      return this.processSubGenerators(generator, currentResult.value, noNext);
    }
    return nextOrReturn(generator, undefined, noNext);
  }

  processSelectVerb(generator, value, noNext) {
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
      return nextOrReturn(generator, result, noNext);
    }
    const selectorId = Object.keys(result)[0].split('-')[1];
    if (!Object.keys(this.selectorConfig).includes(selectorId)) {
      throw new Error(`Received selector with id ${selectorId}, but the SagaTest was not configured to handle this selector (step ${this.step})`);
    }
    return nextOrReturn(generator, this.selectorConfig[selectorId], noNext);
  }

  processCallVerb(generator, value, noNext) {
    const methodId = value.payload.fn.name;
    const { args } = value.payload;
    if (!Object.keys(this.callCalls).includes(methodId)) {
      throw new Error(`Received CALL verb with a method named ${methodId}, but the SagaTest was not configured to receive this CALL (step ${this.step})`);
    }
    const matchedCalls = this.callCalls[methodId].filter((config) => config.params === undefined || isEqual(config.params, args));
    if (matchedCalls.length === 0) {
      const expectedArgs = this.callCalls[methodId].map((el) => diffTwoObjects(el.params, args)).join('\n\n');

      throw new Error(`Received async method '${methodId}' was called, but no matching set of parameters were found!\n\n${expectedArgs}`);
    }
    incrementCallCounter(matchedCalls[0], args);

    return this.triggerNextStepWithResult(matchedCalls[0], generator, noNext, value);
  }

  processPutVerb(generator, value, noNext) {
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

    return nextOrReturn(generator, undefined, noNext);
  }

  processSubGenerators(generator, subGenerator, noNext) {
    if (!resultIsMockedGeneratorData(subGenerator)) {
      const result = this.processGenerator(subGenerator);
      return nextOrReturn(generator, result, noNext);
    }
    const { args, name } = subGenerator;
    if (this.generatorCalls == null || this.generatorCalls[name] == null) {
      throw new Error(`Received mocked generator call with name ${name} and args ${args}, but no such generator was defined in the expectedGenerators config`);
    }
    const matchedCalls = this.generatorCalls[name].filter((config) => config.params === undefined || isEqual(config.params, args));
    if (matchedCalls.length === 0) {
      const expectedArgs = this.generatorCalls[name].map((el) => diffTwoObjects(el.params, args)).join('\n\n');

      throw new Error(`Generator method '${name}' was called, but no matching set of parameters were found!\n\n${expectedArgs}`);
    }
    incrementCallCounter(matchedCalls[0], args);

    return this.triggerNextStepWithResult(matchedCalls[0], generator, noNext, { generator: subGenerator });
  }

  triggerNextStepWithResult = (matchedCall, generator, noNext, value) => {
    if (matchedCall.throw) {
      return generator.throw(matchedCall.throw);
    }
    if (matchedCall.call) {
      let result = value.generator ? value.generator : value.payload.fn(...value.payload.args);
      if (result != null && typeof result.next === 'function') {
        result = this.processGenerator(result);
        return nextOrReturn(generator, result, noNext);
      }
      return nextOrReturn(generator, result, noNext);
    }
    return nextOrReturn(generator, matchedCall.output, noNext);
  };
}

export default SagaTester;
