function sortTaskPriority(taskList) {
  return taskList.sort((a, b) => {
    let aValue = a.wait;
    let bValue = b.wait;
    if (aValue === 'error' && bValue !== 'error') { return -1; }
    if (aValue !== 'error' && bValue === 'error') { return 1; }
    if (aValue === bValue) { return 0; }
    if (aValue === false || aValue == null) { return -1; }
    if (aValue === true) { return 1; }
    if (bValue === true) { return -1; }
    if (bValue === false || bValue == null) { return 1; }
    aValue = typeof aValue === 'string' ? 0 : aValue;
    bValue = typeof bValue === 'string' ? 0 : bValue;
    return aValue > bValue ? 1 : -1;
  });
}

export default sortTaskPriority;
