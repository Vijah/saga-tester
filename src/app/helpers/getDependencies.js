const getDependencies = (currentTask, pendingTasks) => {
  if (currentTask.wait === 'waiting-children') {
    return pendingTasks.filter((p) => p.parentTask?.id === currentTask.id).map((p) => p.id);
  }
  if (currentTask?.interruption?.dependencies) {
    return Array.isArray(currentTask.interruption.dependencies) ? currentTask.interruption.dependencies :
      [currentTask.interruption.dependencies];
  }
  return [];
};

export default getDependencies;
