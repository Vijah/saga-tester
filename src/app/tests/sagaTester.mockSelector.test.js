import {
  mockSelector,
} from '..';

describe('mockSelector', () => {
  it('should return stubbed methods', () => {
    const selector = mockSelector('name');
    expect(selector.resultFunc()).toBe('mock-name');
    expect(selector.recomputations()).toBe(0);
    expect(selector.resetRecomputations()).toBe(0);
  });
});
