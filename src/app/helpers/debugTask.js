import __INTERRUPT__ from './__INTERRUPT__';
import debugTaskHeader from './debugTaskHeader';

const debugTask = (t) => {
  if (t['@@redux-saga/TASK'] !== true) {
    return t.type; // We're logging an action pattern
  }
  const header = debugTaskHeader(t);
  let value = '';
  if (t.result !== undefined && t.result?.value !== __INTERRUPT__) {
    value = `value: ${Array.isArray(t.result) ? `[${t.result}]` : t.result}`;
  } else if (['race', 'all'].includes(t.wait)) {
    value = `value: ${t.interruption.pending}`;
  } else if (t.interruption?.resolved === true) {
    value = `value: ${t.interruption.value}`;
  }
  return `${header}${value}`;
};

export default debugTask;
