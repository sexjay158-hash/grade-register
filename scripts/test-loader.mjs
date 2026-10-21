// Node's TS stripping requires explicit extensions; application bundlers do not.
// Restrict fallback to relative, extensionless imports in the isolated test process.
import path from 'node:path';
export async function resolve(specifier,context,nextResolve){
 try{return await nextResolve(specifier,context);}
 catch(error){
  if(error.code!=='ERR_MODULE_NOT_FOUND'||!specifier.startsWith('.')||path.extname(specifier))throw error;
  return nextResolve(`${specifier}.ts`,context);
 }
}
