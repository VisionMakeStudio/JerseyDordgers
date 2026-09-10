import {build} from 'esbuild';import fs from 'node:fs/promises';import {contentSchema} from './src/schema.mjs';
contentSchema.parse(JSON.parse(await fs.readFile('seed.json','utf8')));
await build({entryPoints:['src/site.mjs','src/admin.mjs'],outdir:'public/js',bundle:true,format:'esm',target:'es2022',minify:true});
console.log('Public pages and admin compiled. Seed validated.');
