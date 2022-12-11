interface Action<T = any> { type: T }
const triggerSagaWithAction: (saga: any, action: Action) => any;

export default triggerSagaWithAction;
