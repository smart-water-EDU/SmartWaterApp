import('./data-files.mjs').then(module=>module.build()).catch(error=>{console.error(error);process.exitCode=1;});
