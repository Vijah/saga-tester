const doesActionMatch = (action, pattern) => {
  if (pattern === '*') {
    return action != null;
  }
  if (typeof pattern === 'function') {
    return pattern(action);
  }
  const listOfMatchers = Array.isArray(pattern) ? pattern : [pattern];
  return listOfMatchers.includes(action.type.toString());
};

export default doesActionMatch;
