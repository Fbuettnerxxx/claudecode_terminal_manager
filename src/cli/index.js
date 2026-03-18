const { program } = require('commander');
const { version } = require('../../package.json');

program
  .name('ccm')
  .description('Claude Code Manager')
  .version(version);

// Subcommands registered in later tasks
require('./cmd-start')(program);
require('./cmd-stop')(program);
require('./cmd-new')(program);
require('./cmd-list')(program);
require('./cmd-tunnel')(program);

program.parse();
