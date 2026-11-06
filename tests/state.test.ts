import {test} from 'node:test';
import assert from 'node:assert/strict';
import { createTask, filterTasks, parseTasks } from '../src/lib/state';
test('validates saved data without silently losing damaged content',()=>{
 const t=createTask({title:'Задача'});
 assert.deepEqual(parseTasks(JSON.stringify([t])),[t]);
 assert.throws(()=>parseTasks('{broken'));
 assert.throws(()=>parseTasks('[{"title":42}]'));
 assert.throws(()=>parseTasks(JSON.stringify([{...t,due:'2026-99-99'}])));
});
test('creates a trimmed task and rejects blank titles',()=>{
 assert.equal(createTask({title:'  Письмо  '}).title,'Письмо');
 assert.throws(()=>createTask({title:' '}));
});
test('filters active tasks by view, project and search',()=>{
 const a=createTask({title:'Письмо', project:'Работа',due:'2026-11-06'});
 const b={...createTask({title:'Дом'}),done:true};
 assert.deepEqual(filterTasks([a,b],'today','пись','2026-11-06'),[a]);
 assert.deepEqual(filterTasks([a,b],'completed','', '2026-11-06'),[b]);
 assert.deepEqual(filterTasks([a,b],'upcoming','', '2026-11-06'),[]);
 assert.deepEqual(filterTasks([a,b],'Работа','', '2026-11-06'),[a]);
});
