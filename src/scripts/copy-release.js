const shell = require('shelljs');
const fs = require('fs');
const glob = require('glob');

process.stdout.write('Copy workspace files to build folder');

shell.cp('README.md', 'dist/README.md');
const packageJson = require('../../package.json');

delete packageJson.scripts;
delete packageJson.devDependencies;
delete packageJson.peerDependencies;
delete packageJson.peerDependenciesMeta;

packageJson.main = './saga-tester.cjs.js';
packageJson.module = './saga-tester.es.js';

fs.writeFileSync('dist/package.json', JSON.stringify(packageJson, undefined, 2));

const typescriptFiles = glob.sync('src/app/*.d.ts');
typescriptFiles.forEach((file) => {
  shell.cp(file, `dist/${file.substr(8)}`);
});

shell.echo(`\nCopy done at ${new Date().toString()}`);
