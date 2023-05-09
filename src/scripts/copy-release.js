const shell = require('shelljs');
const fs = require('fs');

process.stdout.write('Copy source to destination folder');

shell.rm('-rf', 'build/*.js');
shell.rm('-rf', 'build/*.d.ts');
shell.rm('-rf', 'build/*.json');

shell.cp('-R', 'src/app/*', 'build');
shell.cp('README.md', 'build/README.md');

shell.rm('-rf', 'build/**/tests');

const packageJson = require('../../package.json');

delete packageJson.scripts;
delete packageJson.devDependencies;
delete packageJson.peerDependencies;
delete packageJson.peerDependenciesMeta;

fs.writeFileSync('build/package.json', JSON.stringify(packageJson, undefined, 2));

shell.echo(`\nCopy done at ${new Date().toString()}`);
