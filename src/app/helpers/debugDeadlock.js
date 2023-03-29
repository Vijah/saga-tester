const debugDeadlock = (pendingTasks, prefix = 'Deadlock: ') => {
  const simplifiedPendingTasks = pendingTasks.map((p) => ({
    ...p,
    generator: undefined,
    children: p.children.map((c) => c.id),
    parentTask: p.parentTask?.id,
    interruption: !p.interruption ? undefined : {
      kind: p.interruption.kind,
      pending: p.interruption.pending ? Object.keys(p.interruption.pending).map((key) => {
        const value = p.interruption.pending[key];
        const id = value?.id;
        if (id) {
          return `${key}=>id:${id},interrupted:${value.interrupted !== undefined}`;
        }
        return `${key}=>${p.pending}`;
      }).join('@@\n') : null,
    },
    latestValue: p.latestValue?.type,
  }));
  throw new Error(`${prefix}${pendingTasks.length} tasks did not finish. Remaining tasks:\n\n${JSON.stringify(simplifiedPendingTasks, undefined, 2).replace(/@@\\n/g, '\n')}`);
};

export default debugDeadlock;
