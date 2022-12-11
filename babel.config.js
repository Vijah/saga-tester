module.exports = {
  presets: [
    '@babel/preset-env', '@babel/preset-react', '@babel/preset-typescript',
  ],
  plugins: [
    'react-css-modules',
    'require-context-hook',
  ],
  sourceMaps: true,
};
