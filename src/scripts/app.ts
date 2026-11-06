import {createTask, filterTasks, parseTasks, projects, type Task} from '../lib/state';
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const key='tikho.tasks.v1';
let tasks:Task[]=[], view='all', priority='all', editing:string|null=null, removed:Task|null=null, storageBlocked=false;
const dialog=$<HTMLDialogElement>('#task-dialog'), form=$<HTMLFormElement>('#task-form');
const search=$<HTMLInputElement>('#search');
const labels:Record<string,string>={all:'Все задачи',today:'Сегодня',upcoming:'Предстоящие',completed:'Завершённые'};
const descriptions:Record<string,string>={all:'Освободите голову. Всё важное — здесь.',today:'Один день. Несколько важных шагов. Просроченные дела тоже здесь.',upcoming:'Планы на потом. Чтобы сейчас быть здесь.',completed:'Маленькие шаги, из которых складывается большое.'};
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function notify(text:string,undo=false){$('#notification-text').textContent=text;$('#undo').hidden=!undo;$('#notification').hidden=false;}
try { const raw=localStorage.getItem(key);if(raw!==null)tasks=parseTasks(raw); } catch {storageBlocked=true;notify('Не удалось прочитать сохранённые задачи. Старые данные не перезаписываются. Сейчас изменения хранятся только до перезагрузки.');}
try{document.documentElement.classList.toggle('dark',localStorage.getItem('tikho.theme')==='dark');}catch{}
function persist(undo=false):boolean{if(storageBlocked){notify('Изменения только в памяти: сохранённые данные недоступны. Не закрывайте страницу.',undo);return false;}try{localStorage.setItem(key,JSON.stringify(tasks));return true;}catch{notify('Не удалось сохранить задачи. Не закрывайте страницу: изменения пока только в памяти.',undo);return false;}}
function menu(open:boolean){document.body.classList.toggle('menu-open',open);$('.scrim').hidden=!open;$('#menu-toggle').setAttribute('aria-expanded',String(open));}
$('#menu-toggle').addEventListener('click',()=>menu(!document.body.classList.contains('menu-open')));
$('.scrim').addEventListener('click',()=>menu(false));
$('#theme-toggle').addEventListener('click',()=>{const dark=document.documentElement.classList.toggle('dark');try{localStorage.setItem('tikho.theme',dark?'dark':'light');}catch{notify('Тема изменена, но не сохранена.');}});
$('#date-label').textContent=new Intl.DateTimeFormat('ru',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
function openTask(task?:Task){editing=task?.id??null;form.reset();(form.elements.namedItem('title') as HTMLInputElement).value=task?.title??'';(form.elements.namedItem('project') as HTMLSelectElement).value=task?.project??(projects.includes(view as typeof projects[number])?view:'Личное');(form.elements.namedItem('priority') as HTMLSelectElement).value=task?.priority??'normal';(form.elements.namedItem('due') as HTMLInputElement).value=task?.due??(view==='today'?today():'');$('#dialog-title').textContent=task?'Немного уточним.':'Что нужно сделать?';$('#save-task').textContent=task?'Сохранить изменения':'Добавить задачу';menu(false);dialog.showModal();$('#task-title').focus();}
document.querySelectorAll('.new-task').forEach(el=>el.addEventListener('click',()=>openTask()));
$('#close-dialog').addEventListener('click',()=>dialog.close());$('#cancel-dialog').addEventListener('click',()=>dialog.close());
form.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(form);try{const task=createTask({title:String(data.get('title')),project:String(data.get('project')),priority:String(data.get('priority')),due:String(data.get('due'))});if(editing)tasks=tasks.map(t=>t.id===editing?{...task,id:t.id,done:t.done}:t);else{tasks.push(task);if(view==='completed')view='all';priority='all';search.value='';}persist();dialog.close();render();}catch(e){notify(e instanceof Error?e.message:'Не удалось добавить задачу');}});
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view!;priority='all';search.value='';menu(false);render();}));
document.querySelectorAll<HTMLButtonElement>('[data-priority]').forEach(button=>button.addEventListener('click',()=>{priority=button.dataset.priority!;render();}));
search.addEventListener('input',render);$('#sort').addEventListener('change',render);
function element(tag:string,className:string,text?:string){const el=document.createElement(tag);el.className=className;if(text)el.textContent=text;return el;}
function render(){
 const title=labels[view]??view;$('h1').textContent=title;$('#crumb').textContent=title;$('#view-description').textContent=descriptions[view]??'Немного порядка в одной части жизни.';
 document.querySelectorAll<HTMLElement>('[data-view]').forEach(el=>{const active=el.dataset.view===view;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
 document.querySelectorAll<HTMLElement>('[data-count]').forEach(el=>el.textContent=String(filterTasks(tasks,el.dataset.count!,'',today()).length));
 document.querySelectorAll<HTMLElement>('[data-priority]').forEach(el=>{const active=el.dataset.priority===priority;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));});
 let visible=filterTasks(tasks,view,search.value,today()).filter(t=>priority!=='high'||t.priority==='high');
 const sort=$<HTMLSelectElement>('#sort').value;
 if(sort==='priority')visible.sort((a,b)=>({high:0,normal:1,low:2}[a.priority as 'high']??1)-({high:0,normal:1,low:2}[b.priority as 'high']??1));
 if(sort==='due')visible.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
 $('#list-count').textContent=`${visible.length} в списке`;
 const list=$('#task-list');list.replaceChildren();
 for(const task of visible){
  const row=element('article',`task-row${task.done?' done':''}`);
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=task.done;checkbox.setAttribute('aria-label',`${task.done?'Вернуть':'Выполнить'}: ${task.title}`);
  checkbox.addEventListener('change',()=>{task.done=checkbox.checked;persist();render();const next=$<HTMLInputElement>('.task-row input[type=checkbox]');if(next)next.focus();else $<HTMLButtonElement>('.main-new').focus();});
  const body=element('div','task-body');body.append(element('div','task-title',task.title));const meta=element('div','task-meta');meta.append(element('span','project-tag',task.project));
  if(task.due){const date=task.due===today()?'Сегодня':new Intl.DateTimeFormat('ru',{day:'numeric',month:'short'}).format(new Date(task.due+'T12:00:00'));meta.append(element('span',task.due<today()&&!task.done?'priority-tag':'',`${task.due<today()&&!task.done?'Просрочено · ':''}${date}`));}
  if(task.priority==='high')meta.append(element('span','priority-tag','⚑ Важно'));if(task.priority==='low')meta.append(element('span','','Невысокий приоритет'));body.append(meta);
  const actions=element('div','task-actions');const edit=element('button','','↗');edit.setAttribute('aria-label',`Редактировать: ${task.title}`);edit.addEventListener('click',()=>openTask(task));
  const del=element('button','','×');del.setAttribute('aria-label',`Удалить: ${task.title}`);del.addEventListener('click',()=>{removed=task;tasks=tasks.filter(t=>t.id!==task.id);const saved=persist(true);render();if(saved)notify('Задача удалена',true);$('#undo').focus();});actions.append(edit,del);row.append(checkbox,body,actions);list.append(row);
 }
 $('#empty').hidden=visible.length>0;$('#inline-add').hidden=visible.length===0;
 const narrowed=!!search.value.trim()||priority==='high';
 $('#empty-title').textContent=narrowed?'Ничего не найдено':view==='completed'?'Здесь будут ваши маленькие победы.':view==='today'?'На сегодня всё спокойно.':view==='upcoming'?'Будущее пока открыто.':tasks.length?'Есть место для нового.':'Большие планы начинаются с малого.';
 $('#empty-description').textContent=narrowed?'Попробуйте другой запрос или уберите фильтр.':view==='completed'?'Отметьте выполненное дело — оно появится здесь.':view==='today'?'Задачи на сегодня и просроченные дела появятся здесь.':view==='upcoming'?'Добавьте задачу с будущей датой — и вернитесь к настоящему.':'Запишите первое дело — и дайте мыслям немного пространства.';
 $('#empty-add').hidden=narrowed||view==='completed';$('#demo').hidden=tasks.length>0||narrowed||view!=='all';
 const done=tasks.filter(t=>t.done).length;$('#progress-label').textContent=tasks.length?`${done} из ${tasks.length} завершено`:'Без спешки.';
}
$('#undo').addEventListener('click',()=>{if(removed){tasks.push(removed);removed=null;const saved=persist();render();if(saved)$('#notification').hidden=true;}});$('#dismiss').addEventListener('click',()=>{$('#notification').hidden=true;removed=null;});
$('#demo').addEventListener('click',()=>{if(tasks.length)return;tasks=[createTask({title:'Выбрать одно главное дело на сегодня',project:'Работа',priority:'high',due:today()}),createTask({title:'Оставить полчаса для хорошей книги',project:'Личное'}),createTask({title:'Записать идею, которая не даёт покоя',project:'Идеи'}),{...createTask({title:'Найти спокойное место для своих планов',project:'Личное'}),done:true}];const saved=persist();render();if(saved)notify('Добавлены 4 примера. Их можно изменить или удалить.');});
document.addEventListener('keydown',event=>{if(event.key==='Escape')menu(false);if(event.ctrlKey||event.metaKey||event.altKey||dialog.open||['INPUT','SELECT','TEXTAREA'].includes((event.target as HTMLElement).tagName))return;if(event.key.toLowerCase()==='n'||event.key==='т'){event.preventDefault();openTask();}if(event.key==='/'){event.preventDefault();search.focus();}});
render();
