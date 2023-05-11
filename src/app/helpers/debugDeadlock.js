import getDependencies from './getDependencies';

const debugDeadlock = (pendingTasks, prefix = 'Deadlock: ') => {
  const simplifiedPendingTasks = pendingTasks.map((p) => {
    let interruption;
    if (p.interruption != null) {
      interruption = { kind: p.interruption.kind };
      if (p.interruption.pending == null) {
        // do nothing
      } else if (p.interruption.pending['@@redux-saga/TASK'] != null) {
        interruption.pending = p.interruption.pending.id;
      } else {
        interruption.pending = Object.keys(p.interruption.pending).map((key) => {
          const value = p.interruption.pending[key];
          const id = value?.id;
          if (id) {
            return `${key}=>id:${id},interrupted:${value.interrupted !== undefined}`;
          }
          return `${key}=>${p.pending}`;
        }).join('@@\n');
      }
    }
    const result = {
      ...p,
      generator: undefined,
      dependencies: getDependencies(p, pendingTasks),
      parentTask: p.parentTask?.id,
      interruption,
      latestValue: p.latestValue?.type,
    };
    if (Object.keys(result.context).length === 0) {
      delete result.context;
    }
    return result;
  });
  throw new Error(`${prefix}${pendingTasks.length} tasks did not finish. Remaining tasks:\n\n${JSON.stringify(simplifiedPendingTasks, undefined, 2).replace(/@@\\n/g, '\n')}`);
};

export default debugDeadlock;
