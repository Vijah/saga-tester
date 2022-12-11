import format from 'pretty-format';
import { diffLinesUnified2 } from 'jest-diff';

const diffTwoObjects = (expected, received) => diffLinesUnified2(
  format(expected).split('\n'),
  format(received).split('\n'),
  format(expected, { indent: 0 }).split('\n'),
  format(received, { indent: 0 }).split('\n'),
);

export default diffTwoObjects;
