const debugShouldApply = (tasks, configValue) => {
  if (configValue == null || configValue === false) {
    return false;
  }
  if (configValue === true) {
    return true;
  }
  const taskList = !Array.isArray(tasks) ? [tasks] : tasks;
  const ids = [].concat(taskList.map((t) => (typeof t.id === 'number' ? t.id : t.type)), taskList.map((t) => (t.name ? t.name : t.type)));

  if (Array.isArray(configValue)) {
    return configValue.some((v) => ids.includes(v));
  }
  return ids.includes(configValue);
};

export default debugShouldApply;
