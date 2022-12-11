interface Action<T = any> { type: T }
type ActionType = { action: Action<any>, times?: number, strict?: boolean } |
  { type: string, params?: any[], times?: number };
type CallType = { times?: number, params: any[], output: any } |
  { times?: number, params: any[], throw: any } |
  { times?: number, params: any[], call: true };

class SagaTester<Saga> {
  constructor(
    saga: Saga,
    config?: {
      selectorConfig?: { [P: string]: any },
      expectedActions?: ActionType[],
      expectedCalls?: { [P: string]: CallType[] },
      expectedGenerators?: { [P: string]: CallType[] },
      effectiveActions?: Action<any>[],
    },
    shouldAssert?: boolean,
  );

  run: ((...args: Parameters<Saga>) => void) | ((action: Action<any>) => void);

  errorList: string[];

  returnValue: ReturnType<Saga>;
}

export default SagaTester;
