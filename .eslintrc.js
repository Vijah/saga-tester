const path = require('path');
const fs = require('fs');

const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = (relativePath) => path.resolve(appDirectory, relativePath);

// eslint-disable-next-line import/no-dynamic-require
const appPackageJson = require(resolveApp('package.json'));
const overrides = [];

const isTypeScriptInstalled = Boolean(
  (appPackageJson.dependencies && appPackageJson.dependencies.typescript) ||
  (appPackageJson.devDependencies && appPackageJson.devDependencies.typescript),
);

if (isTypeScriptInstalled) {
  overrides.push({
    files: ['**/*.ts', '**/*.tsx'],
    parser: '@typescript-eslint/parser',
    parserOptions: {
      project: './tsconfig.json',
    },
    plugins: ['@typescript-eslint'],
    extends: [
      'plugin:@typescript-eslint/eslint-recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:@typescript-eslint/recommended-requiring-type-checking',
    ],
    settings: {
      'import/extensions': ['.js', '.jsx', '.ts', '.tsx'],
      'import/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
      'import/resolver': {
        node: {
          paths: ['src', 'app'],
          extensions: ['.js', '.ts', '.jsx', '.tsx', '.json', '.d.ts'],
          moduleDirectory: ['node_modules', 'src/', 'app/'],
        },
        extensions: ['.js', '.ts', '.jsx', '.tsx', '.json', '.d.ts'],
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/semi': 1,
      '@typescript-eslint/no-shadow': ['error'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'local',
          args: 'after-used',
          ignoreRestSiblings: true,
        },
      ],
      'import/extensions': [
        'error',
        'ignorePackages',
        { js: 'never', jsx: 'never', ts: 'never', tsx: 'never' },
      ],
      '@typescript-eslint/no-floating-promises': 1,
    },
  });
  overrides.push({
    files: ['**/tests/*.ts', '**/tests/*.tsx'],
    rules: {},
  });
}

overrides.push({
  files: ['**/tests/*.js', '**/tests/*.jsx'],
  rules: {},
});

module.exports = {
  root: true,
  parser: '@babel/eslint-parser',
  extends: [
    'airbnb',
    'plugin:react-hooks/recommended',
  ],
  env: {
    browser: true,
    node: true,
    jest: true,
    es6: true,
  },
  globals: {
    page: true,
    browser: true,
    context: true,
    jestPuppeteer: true,
  },
  plugins: [
    'react',
    'jsx-a11y',
    'react-hooks',
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: { modules: true },
    babelOptions: { configFile: path.join(__dirname, './.babelrc.js') },
  },
  settings: {
    'import/resolver': {
      node: {
        paths: ['src', 'app'],
        extensions: ['.js', '.ts', '.jsx', '.tsx', '.json', '.d.ts'],
        moduleDirectory: ['node_modules', 'src/', 'app/'],
      },
      extensions: ['.js', '.ts', '.jsx', '.tsx', '.json', '.d.ts'],
    },
  },
  rules: {
    'linebreak-style': 0,
    'import/no-extraneous-dependencies': 0,
    'max-len': 0,
    'no-plusplus': 0,
    'no-underscore-dangle': 0,
    'operator-linebreak': 0,
    'react/function-component-definition': 0,
    'react/jsx-filename-extension': [2, { extensions: ['.tsx', '.jsx'] }],
    'react/jsx-one-expression-per-line': 0,
    'require-yield': 0,
    'import/extensions': [
      'error',
      'ignorePackages',
      { js: 'never', jsx: 'never', ts: 'never', tsx: 'never' },
    ],

    'arrow-body-style': [1, 'as-needed'],
    'comma-dangle': ['error', {
      arrays: 'always-multiline',
      objects: 'always-multiline',
      imports: 'always-multiline',
      exports: 'always-multiline',
      functions: 'only-multiline',
    }],
    'import/no-unresolved': [2, { caseSensitive: true }],
    indent: [2, 2, { SwitchCase: 1 }],
    'no-console': 1,
    'no-param-reassign': 2,
    'no-unused-vars': 2,
    'object-curly-newline': [
      'error', {
        ObjectExpression: { multiline: true, minProperties: 8, consistent: true },
        ObjectPattern: { multiline: true, minProperties: 8, consistent: true },
        ImportDeclaration: { multiline: true, minProperties: 8, consistent: true },
        ExportDeclaration: { multiline: true, minProperties: 8, consistent: true },
      },
    ],
    'prefer-template': 2,
  },
  overrides,
};
