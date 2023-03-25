const debugTaskHeader = (t) => {
  let prefix = ' '.repeat(20);
  if (t.name) {
    if (t.name.length >= 20) {
      prefix = t.name;
    } else {
      prefix = `${t.name}${' '.repeat(20 - t.name.length)}`;
    }
  }
  let id = `${t.id}`;
  if (id.length === 1) {
    id = `${id} `;
  }
  const mainStr = `${prefix}id: ${id} wait: ${t.wait}`;
  if (mainStr.length >= 42) {
    return mainStr;
  }
  return `${mainStr}${' '.repeat(42 - mainStr.length)}`;
};

export default debugTaskHeader;
