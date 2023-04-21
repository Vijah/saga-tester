interface Action<T = any> { type: T }
type ActionType =
  { action: Action<any>, times?: number, strict?: boolean } |
  { type: string, times?: number };
type CallType =
  { times?: number, params?: any[], wait?: boolean | number, output?: any } |
  { times?: number, params?: any[], throw: any } |
  { times?: number, params?: any[], wait?: boolean | number, call: boolean };

type DebugType = number | string | boolean | (number | string)[];

type ActionMatcher = string | ((action: { type: string }) => boolean);

class SagaTester<Saga> {
  constructor(
    saga: Saga,
    config?: {
      selectorConfig?: { [P: string]: any };
      expectedActions?: ActionType[];
      expectedCalls?: { [P: string]: CallType[] };
      expectedGenerators?: { [P: string]: CallType[] };
      effectiveActions?: Action<any>[];
      debug?: {
        unblock?: DebugType;
        bubble?: DebugType;
        interrupt?: DebugType;
      };
      options?: {
        stepLimit?: number;
        yieldDecreasesTimer?: boolean;
        useStaticTimes?: boolean;
        waitForSpawned?: boolean;
        executeTakeGeneratorsOnlyOnce?: boolean;
        ignoreTakeGenerators: ActionMatcher | ActionMatcher[];
      };
    },
    shouldAssert?: boolean,
  );

  run: ((...args: Parameters<Saga>) => void) | ((action: Action<any>) => void) | (() => void);

  errorList: string[];

  returnValue: ReturnType<Saga>;
}

export default SagaTester;
