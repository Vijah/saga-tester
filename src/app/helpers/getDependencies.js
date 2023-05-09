const getDependencies = (currentTask, pendingTasks) => {
  if (['waiting-children', 'error'].includes(currentTask.wait)) {
    return pendingTasks.filter((p) => p.parentTask?.id === currentTask.id).map((p) => p.id);
  }
  if (currentTask?.interruption?.dependencies) {
    const dependencies = Array.isArray(currentTask.interruption.dependencies) ? currentTask.interruption.dependencies :
      [currentTask.interruption.dependencies];
    if (currentTask.cancellationPending) {
      return dependencies.filter((d) => typeof d === 'number'); // filter out take actions, only wait after generators
    }
    return dependencies;
  }
  return [];
};

export default getDependencies;
