const shell = require('shelljs');

process.stdout.write('Copy source to destination folder');

shell.rm('-rf', 'build/*.js');
shell.rm('-rf', 'build/*.json');

shell.cp('-R', 'src/app/*', 'build');
shell.rm('-rf', 'build/**/tests');

shell.echo(`\nCopy done at ${new Date().toString()}`);
