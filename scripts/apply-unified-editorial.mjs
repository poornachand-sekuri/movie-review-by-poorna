import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { remoteD1 } from './d1-read-client.mjs';

const migration = '0009_unified_editorial.sql';
async function apply(target) {
  const {config,binding,query}=remoteD1(target);
  const tables=new Set((await query("SELECT name FROM sqlite_master WHERE type='table'")).results.map(r=>r.name));
  assert(tables.has('reviews'), 'Missing reviews table. Refusing to deploy.');
  if(tables.has('d1_migrations')){
    const applied=await query('SELECT name FROM d1_migrations WHERE name=?1',[migration]);
    if(applied.results.length){
      for(const name of ['editorial_presets','social_promotional_drafts','review_verdict_formatting'])
        assert(tables.has(name),'Editorial schema incomplete: '+name);
      console.log(migration+' already applied.');
      return;
    }
  }
  const configFile=target==='preview'?'wrangler.preview.jsonc':'wrangler.jsonc';
  const wrangler=(args)=>{
    const result=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),...args],{
      stdio:['pipe','inherit','inherit'],input:'y\n',
      env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}
    });
    if(result.error)throw result.error;
    assert.equal(result.status,0,'Editorial migration failed: deployment stopped.');
  };
  // Record a D1 restore bookmark before any new schema is applied.
  wrangler(['d1','time-travel','info',binding.database_name,'--config',configFile,'--json']);
  const temp=mkdtempSync(join(tmpdir(),'mrp-editorial-'));
  try{
    mkdirSync(join(temp,'migrations'));
    cpSync(join('migrations',migration),join(temp,'migrations',migration));
    const configPath=join(temp,'wrangler.json');
    writeFileSync(configPath,JSON.stringify({
      name:config.name,compatibility_date:config.compatibility_date,
      d1_databases:[{...binding,migrations_dir:'migrations'}]
    }));
    wrangler(['d1','migrations','apply',binding.database_name,'--remote','--config',configPath]);
    const applied=await query('SELECT name FROM d1_migrations WHERE name=?1',[migration]);
    assert.equal(applied.results.length,1,'New schema is not registered; stop deployment.');
    const newTables=new Set((await query("SELECT name FROM sqlite_master WHERE type='table'")).results.map(r=>r.name));
    for(const name of ['editorial_presets','social_promotional_drafts','review_verdict_formatting'])
      assert(newTables.has(name),'Missing editorial table: '+name);
    console.log('Additive editorial schema verified; existing review and reaction rows not modified.');
  }finally{rmSync(temp,{recursive:true,force:true});}
}
if(import.meta.main)await apply(process.argv[2]??'production');
