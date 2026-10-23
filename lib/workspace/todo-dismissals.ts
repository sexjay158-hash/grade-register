import {initializeOnce} from '../query-initialization';
import type {WorkspaceTodo} from './todos';
export const dismissalSchema=`CREATE TABLE IF NOT EXISTS todo_dismissals(owner TEXT NOT NULL,account_id TEXT NOT NULL,year_id TEXT NOT NULL,todo_id TEXT NOT NULL,revision TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(owner,account_id,year_id,todo_id))`;
export async function ensureTodoDismissals(d:D1Database){await initializeOnce('todo-dismissals-schema',()=>d.prepare(dismissalSchema).run());}
export function filterDismissedTodos(todos:WorkspaceTodo[],dismissals:{todo_id:string;revision:string}[]){
 const hidden=new Map(dismissals.map(row=>[row.todo_id,row.revision]));
 return todos.filter(todo=>!hidden.has(todo.id)||hidden.get(todo.id)!==todo.revision);
}
