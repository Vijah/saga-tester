const PLACEHOLDER_ARGS = {
  ANY: '@@SagaTester__any__',
  TASK: '@@SagaTester__task__',
  TYPE: (type) => ({ kind: '@@SagaTester__type__', type }),
  FN: (method) => ({ kind: '@@SagaTester__fn__', method }),
};

export default PLACEHOLDER_ARGS;
