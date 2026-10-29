import('./data-files.mjs').then(module=>module.generate()).catch(error=>{console.error(error);process.exitCode=1;});
