export const projects = ['Работа','Личное','Идеи'] as const;
export type Task = { id:string; title:string; project:string; priority:string; due:string; done:boolean };
export function filterTasks(tasks:Task[], view:string, query:string, today:string):Task[] {
 return tasks.filter(t=> (view==='completed' ? t.done : !t.done) &&
 (view==='today' ? !!t.due && t.due<=today : view==='upcoming' ? t.due>today : projects.includes(view as typeof projects[number]) ? t.project===view : true) &&
 t.title.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru').trim()));
}
export function parseTasks(raw:string):Task[] {
 const data:unknown=JSON.parse(raw);
 if (!Array.isArray(data) || data.some(t=>!t || typeof t.id!=='string' || typeof t.title!=='string' || !t.title.trim() || t.title.length>200 || !projects.includes(t.project) || !['normal','high','low'].includes(t.priority) || typeof t.done!=='boolean' || typeof t.due!=='string' || (t.due && (!/^\d{4}-\d{2}-\d{2}$/.test(t.due) || !Number.isFinite(Date.parse(t.due)) || new Date(t.due).toISOString().slice(0,10)!==t.due)))) throw new Error('Повреждены сохранённые задачи');
 if(new Set(data.map(t=>t.id)).size!==data.length) throw new Error('Повторяющиеся задачи');
 return data;
}
export function createTask(input: Partial<Task>): Task {
 const title = input.title?.trim();
 if (!title || title.length > 200) throw new Error('Введите название от 1 до 200 символов');
 return { id:crypto.randomUUID(), title, project:input.project || 'Личное', priority:input.priority || 'normal', due:input.due || '', done:false };
}
