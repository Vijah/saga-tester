import __INTERRUPT__ from './__INTERRUPT__';
import debugTaskHeader from './debugTaskHeader';

const debugRecursivePendingTaskValue = (obj, level = 0) => {
  const result = { resolved: true, value: Array.isArray(obj) ? `[${obj}]` : obj };
  if (level > 1) {
    return result;
  }
  if (typeof obj === 'object' && obj !== null) {
    if (obj['@@redux-saga/TASK'] === true) {
      result.resolved = false;
      result.value = `TASK ${debugTaskHeader(obj)}`;
    } else if (obj['@@__isComplete__'] === true) {
      result.value = `Resolved (${Array.isArray(obj.result) ? `[${obj.result}]` : obj.result})`;
    } else if (obj.value === __INTERRUPT__) {
      result.resolved = false;
      result.value = `Interruption kind: ${obj.kind}, Pending: ${obj.dependencies}`;
    } else {
      const isArray = Array.isArray(obj);
      const prefix = isArray ? '[\r\n' : '{\r\n';
      let postfix = isArray ? ']' : '}';
      postfix = `\r\n${' '.repeat(level * 2)}${postfix}`;

      const parsedObj = Object.keys(obj).map((key) => {
        let value = debugRecursivePendingTaskValue(obj[key], level + 1);
        if (value.resolved) {
          value = value.value;
        } else {
          value = value.value;
          result.resolved = false;
        }
        value = isArray ? value : `${key}: ${value}`;
        return `${' '.repeat((level + 1) * 2)}${value}`;
      }).join(`,\r\n${' '.repeat(level * 2)}`);

      result.value = `${prefix}${parsedObj}${postfix}`;
      if (result.resolved) {
        result.value = 'Resolved';
      } else {
        result.value = `${prefix}${parsedObj}${postfix}`;
      }
    }
  }

  if (level === 0) {
    return result.resolved ? 'Resolved' : result.value;
  }
  return result;
};

export default debugRecursivePendingTaskValue;
