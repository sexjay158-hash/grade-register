import {DatabaseSync} from 'node:sqlite';
export function sqliteD1(){
 const sqlite=new DatabaseSync(':memory:');
 const statement=(sql,values=[])=>({
  bind:(...args)=>statement(sql,args),
  async run(){const result=sqlite.prepare(sql).run(...values);return {success:true,results:[],meta:{changes:Number(result.changes)}};},
  async first(){return sqlite.prepare(sql).get(...values)??null;},
  async all(){return {results:sqlite.prepare(sql).all(...values)};}
 });
 return {sqlite,prepare:sql=>statement(sql),async batch(queries){sqlite.exec('BEGIN IMMEDIATE');try{const results=[];for(const query of queries)results.push(await query.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
