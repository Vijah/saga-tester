const isArrayEmpty = (arr) => {
  if (arr == null) {
    return true;
  }
  if (arr.length === 0) {
    return true;
  }
  return false;
};

export default isArrayEmpty;
