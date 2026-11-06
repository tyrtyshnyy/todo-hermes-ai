import {test} from 'node:test';
import assert from 'node:assert/strict';
import {usernameCredentials} from '../src/lib/username';
test('login is normalized consistently and mapped to a non-deliverable internal identifier',()=>{
 assert.deepEqual(usernameCredentials('  Sergey_123  '),{username:'sergey_123',email:'sergey_123@users.tikho.invalid'});
 assert.notDeepEqual(usernameCredentials('sergey_123'),usernameCredentials('sergey123'));
});
test('rejects ambiguous or malformed logins instead of silently changing them',()=>{
 for(const value of ['', 'ab', 'a'.repeat(33), 'a-b', 'user@example.com','сергей','a b','a.b','a+b'])assert.throws(()=>usernameCredentials(value));
});
