const { nodeResolve } = require('@rollup/plugin-node-resolve');
const { babel } = require('@rollup/plugin-babel');
const replace = require('@rollup/plugin-replace');

const pkg = require('./package.json');

const makeExternalPredicate = (externalArr) => {
  if (!externalArr.length) {
    return () => false;
  }
  const pattern = new RegExp(`^(${externalArr.join('|')})($|/)`);
  return (id) => pattern.test(id);
};

const deps = Object.keys(pkg.dependencies || {});
const peerDeps = Object.keys(pkg.peerDependencies || {});

const helperPath = /^(@babel\/runtime\/helpers)\/(\w+)$/;

const rewriteRuntimeHelpersImports = ({ types: t }) => ({
  name: 'rewrite-runtime-helpers-imports',
  visitor: {
    ImportDeclaration(pathParam) {
      const source = pathParam.get('source');
      if (!helperPath.test(source.node.value)) {
        return;
      }
      const rewrittenPath = source.node.value.replace(helperPath, (m, p1, p2) => [p1, 'esm', p2].join('/'));
      source.replaceWith(t.stringLiteral(rewrittenPath));
    },
  },
});

const createConfig = ({ input, output, external, env, useESModules = output.format !== 'cjs' }) => ({
  input,
  output: {
    exports: 'named',
    ...output,
  },
  external: makeExternalPredicate(external === 'peers' ? peerDeps : deps.concat(peerDeps)),
  plugins: [
    nodeResolve({
      jsnext: true,
    }),
    babel({
      exclude: 'node_modules/**',
      babelHelpers: 'runtime',
      plugins: [
        useESModules && rewriteRuntimeHelpersImports,
        [
          '@babel/plugin-transform-runtime',
          {
            useESModules,
          },
        ],
      ].filter(Boolean),
    }),
    env &&
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify(env),
      }),
  ].filter(Boolean),
  onwarn(warning, warn) {
    if (warning.code === 'UNUSED_EXTERNAL_IMPORT') {
      return;
    }
    warn(warning);
  },
});

module.exports = [
  createConfig({
    input: 'src/app/index.js',
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: 'saga-tester.[format].js',
    },
  }),
  createConfig({
    input: 'src/app/index.js',
    output: {
      dir: 'dist',
      format: 'cjs',
      entryFileNames: 'saga-tester.[format].js',
    },
    env: 'production',
  }),
];
