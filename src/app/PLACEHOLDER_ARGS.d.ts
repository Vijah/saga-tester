const PLACEHOLDER_ARGS = {
  ANY: '@@SagaTester__any__',
  TASK: '@@SagaTester__task__',
  TYPE: (type: 'string') => ({ kind: '@@SagaTester__type__', type }),
  FN: (method: (value: any) => boolean) => ({ kind: '@@SagaTester__fn__', method }),
};

export default PLACEHOLDER_ARGS;
