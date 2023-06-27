const getDependencies = (currentTask, pendingTasks) => {
  if (['waiting-children', 'error'].includes(currentTask.wait)) {
    return pendingTasks.filter((p) => p.parentTask?.id === currentTask.id).map((p) => p.id);
  }
  if (currentTask?.interruption?.dependencies != null) {
    const dependencies = Array.isArray(currentTask.interruption.dependencies) ? currentTask.interruption.dependencies :
      [currentTask.interruption.dependencies];
    if (currentTask.cancellationPending) {
      return dependencies.filter((d) => typeof d === 'number'); // filter out take actions, only wait after generators
    }
    if (currentTask.interruption.channelId != null) {
      return dependencies.map((d) => ({ __channelDependency: true, channelId: currentTask.interruption.channelId, takerId: currentTask.interruption.takerId, pattern: d }));
    }
    if (typeof currentTask.interruption.pending === 'object' && Object.keys(currentTask.interruption.pending).some((key) => currentTask.interruption.pending[key]?.channelId != null)) {
      const dependenciesList = [];
      Object.keys(currentTask.interruption.pending).forEach((key) => {
        const i = currentTask.interruption.pending[key];
        if (i.channelId != null) {
          dependenciesList.push({ __channelDependency: true, channelId: i.channelId, takerId: i.takerId, pattern: i.dependencies });
        } else if (!dependenciesList.includes(i.dependencies)) {
          dependenciesList.push(i.dependencies);
        }
      });
      return dependenciesList;
    }
    return dependencies;
  }
  if (currentTask?.interruption?.channelId != null) {
    return [{ __channelDependency: true, channelId: currentTask.interruption.channelId, takerId: currentTask.interruption.takerId }];
  }
  return [];
};

export default getDependencies;
