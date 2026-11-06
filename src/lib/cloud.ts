import {createTask,parseTasks, type Task} from './state';
export type CloudTask=Task & {user_id:string;is_public:boolean;author_name:string;created_at:string};
export function displayName(value:unknown):string{const name=typeof value==='string'?value.trim():'';if(!name||name.length>40)throw new Error('Имя: от 1 до 40 символов');return name;}
export function cloudInput(input:Partial<Task>&{is_public?:boolean},userId:string,name:string){
 const task=createTask(input);parseTasks(JSON.stringify([task]));
 return {title:task.title,project:task.project,priority:task.priority,due:task.due||null,done:input.done??false,user_id:userId,is_public:input.is_public===true,author_name:displayName(name)};
}
export function cloudTask(row:Record<string,unknown>):CloudTask{const task={...row,due:row.due??''};parseTasks(JSON.stringify([task]));return task as CloudTask;}
export function decodeCloudPage(data:unknown):{tasks:CloudTask[];skipped:number;rawCount:number}{
 if(!Array.isArray(data))throw new Error('Некорректный ответ облака. Попробуйте обновить список.');
 const rows=data as Record<string,unknown>[];
 const tasks:CloudTask[]=[];let skipped=0;
 for(const row of rows){try{tasks.push(cloudTask(row));}catch{skipped++;}}
 return {tasks,skipped,rawCount:rows.length};
}
export function cloudError(error:{code?:string;message?:string}):string{return ['PGRST205','42P01'].includes(error.code??'')?'Облако ещё не настроено. Выполните supabase/migrations/001_todos.sql в SQL Editor Supabase, затем нажмите «Обновить».':error.message||'Не удалось связаться с облаком. Попробуйте ещё раз.';}
