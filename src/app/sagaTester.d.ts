interface Action<T = any> { type: T, [P: string]: any; }
type ActionType =
  { action: Action<any>, times?: number, strict?: boolean } |
  { type: string, times?: number };
type CallType =
  { name: string | undefined; times?: number, params?: any[], wait?: boolean | number, output?: any } |
  { name: string | undefined; times?: number, params?: any[], wait?: boolean | number, throw: any } |
  { name: string | undefined; times?: number, params?: any[], wait?: boolean | number, call: boolean };

type DebugType = number | string | boolean | (number | string)[];

type ActionMatcher = string | ((action: { type: string }) => boolean);

type ReducerType = (state: { [P: string]: any }, action: Action<any>) => { [P: string]: any };

class SagaTester<Saga> {
  constructor(
    saga: Saga,
    config?: {
      selectorConfig?: { [P: string]: any };
      expectedActions?: ActionType[];
      expectedCalls?: CallType[];
      effectiveActions?: Action<any>[];
      sideEffects?: (
        { wait?: boolean | number, effect: { type: string } } |
        { wait?: boolean | number, changeSelectorConfig: ((selectorConfig: { [P: string]: any }) => { [P: string]: any }) }
      )[],
      debug?: {
        unblock?: DebugType;
        bubble?: DebugType;
        interrupt?: DebugType;
      };
      options?: {
        stepLimit?: number;
        useStaticTimes?: boolean;
        waitForSpawned?: boolean;
        executeTakeGeneratorsOnlyOnce?: boolean;
        ignoreTakeGenerators: ActionMatcher | ActionMatcher[];
        swallowSpawnErrors?: boolean;
        passOnUndefinedSelector?: boolean;
        failOnUnconfigured?: boolean;
        reducers?: ReducerType | ({ [P: string]: ReducerType });
        context?: { [P: string]: any };
      };
    },
    shouldAssert?: boolean,
  );

  run: (...args?: Parameters<Saga> | [Action<any>]) => void;

  runAsync: (...args?: Parameters<Saga> | [Action<any>]) => Promise<void>;

  errorList: string[];

  returnValue: ReturnType<Saga>;
}

export default SagaTester;
