import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudInput, cloudTask, displayName, cloudError} from '../src/lib/cloud';
import * as cloud from '../src/lib/cloud';
test('cloud page preserves valid rows and counts incompatible user titles',()=>{
 const valid={...cloudInput({title:'Valid'},'id','Name'),id:'valid',created_at:'2026-01-01'};
 const page=cloud.decodeCloudPage([valid,{...valid,id:'blank',title:'\n\n'},{...valid,id:'emoji',title:'😀'.repeat(101)}]);
 assert.deepEqual(page.tasks,[cloudTask(valid)]);
 assert.equal(page.skipped,2);
 assert.equal(page.rawCount,3);
});
test('cloud page rejects malformed envelopes instead of claiming empty success',()=>{
 for(const data of [null,undefined,{},'', '[]',42]) assert.throws(()=>cloud.decodeCloudPage(data),/Некорректный ответ облака/);
 assert.deepEqual(cloud.decodeCloudPage([]),{tasks:[],skipped:0,rawCount:0});
});
test('cloud input is private by default and validates date, project and display label',()=>{
 const value=cloudInput({title:'  Cloud  '},'user-id','  Анна  ');
 assert.equal(value.is_public,false); assert.equal(value.due,null); assert.equal(value.author_name,'Анна'); assert.equal(value.title,'Cloud');
 assert.throws(()=>displayName(' '));assert.throws(()=>displayName('x'.repeat(41)));
 assert.throws(()=>cloudInput({title:'x',due:'2026-02-30'},'id','Name'));
 assert.throws(()=>cloudInput({title:'x',project:'bad'},'id','Name'));
 assert.equal(cloudTask({...value,id:'a',created_at:'2026-01-01'}).due,'');
 assert.match(cloudError({code:'PGRST205',message:'missing'}),/001_todos.sql/);
});
