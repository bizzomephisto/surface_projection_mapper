import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
await build({stdin:{contents:"export {default} from 'polygon-clipping';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',outfile:'src/vendor/polygon-clipping.mjs'});
await copyFile('node_modules/polygon-clipping/LICENSE.md','src/vendor/polygon-clipping.LICENSE.md');
