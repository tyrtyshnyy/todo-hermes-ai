import type {User} from '@supabase/supabase-js';
import {createTask, filterTasks, parseTasks, projects, type Task} from '../lib/state';
import {supabase, supabaseUrl, supabasePublishableKey} from '../lib/supabase';
import {usernameCredentials} from '../lib/username';
import {cloudTask, cloudInput, cloudError, decodeCloudPage, displayName, type CloudTask} from '../lib/cloud';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const key = 'tikho.tasks.v1';
const dialog = $<HTMLDialogElement>('#task-dialog');
const form = $<HTMLFormElement>('#task-form');
const search = $<HTMLInputElement>('#search');
const authDialog = $<HTMLDialogElement>('#auth-dialog');
const authForm = $<HTMLFormElement>('#auth-form');
let tasks: Task[] = [], cloudTasks: CloudTask[] = [];
let scope = 'local', view = 'all', priority = 'all', editing: string | null = null;
let removed: Task | null = null, storageBlocked = false;
let user: User | null = null, authMode = 'login', authBusy = false;
let generation = 0, identity = 0, loading = false, hasMore = false, busy = false;
let cloudStatus = '', cloudFailed = false;
let cloudOffset = 0, cloudSkipped = 0;
const labels: Record<string, string> = {all:'Все задачи',today:'Сегодня',upcoming:'Предстоящие',completed:'Завершённые'};
const descriptions: Record<string, string> = {all:'Освободите голову. Всё важное — здесь.',today:'Один день. Несколько важных шагов. Просроченные дела тоже здесь.',upcoming:'Планы на потом. Чтобы сейчас быть здесь.',completed:'Маленькие шаги, из которых складывается большое.'};

function today() {
 const d = new Date();
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function notify(text: string, undo = false) {
 $('#notification-text').textContent = text;
 $('#undo').hidden = !undo;
 $('#notification').hidden = false;
}
function publicName() {
 try { return displayName(user?.user_metadata?.display_name); } catch { return 'Участник'; }
}
try {
 const raw = localStorage.getItem(key);
 if (raw !== null) tasks = parseTasks(raw);
} catch {
 storageBlocked = true;
 notify('Не удалось прочитать сохранённые задачи. Старые данные не перезаписываются. Сейчас изменения хранятся только до перезагрузки.');
}
try { document.documentElement.classList.toggle('dark', localStorage.getItem('tikho.theme') === 'dark'); } catch {}
function persist(undo = false): boolean {
 if (storageBlocked) { notify('Изменения только в памяти: сохранённые данные недоступны. Не закрывайте страницу.', undo); return false; }
 try { localStorage.setItem(key, JSON.stringify(tasks)); return true; }
 catch { notify('Не удалось сохранить задачи. Не закрывайте страницу: изменения пока только в памяти.', undo); return false; }
}
function menu(open: boolean) {
 document.body.classList.toggle('menu-open', open);
 $('.scrim').hidden = !open;
 $('#menu-toggle').setAttribute('aria-expanded', String(open));
}
$('#menu-toggle').addEventListener('click', () => menu(!document.body.classList.contains('menu-open')));
$('.scrim').addEventListener('click', () => menu(false));
$('#theme-toggle').addEventListener('click', () => {
 const dark = document.documentElement.classList.toggle('dark');
 try { localStorage.setItem('tikho.theme', dark ? 'dark' : 'light'); } catch { notify('Тема изменена, но не сохранена.'); }
});
$('#date-label').textContent = new Intl.DateTimeFormat('ru', {weekday:'long',day:'numeric',month:'long'}).format(new Date());

async function loadCloud(more = false) {
 if (scope === 'local' || busy) return;
 const token = ++generation;
 loading = true; cloudFailed = false;
 if (!more) { cloudTasks = []; hasMore = false; cloudOffset = 0; cloudSkipped = 0; }
 if (scope === 'mine' && !user) {
  cloudStatus = 'Войдите в аккаунт, чтобы создавать задачи и видеть их на других устройствах.';
  loading = false; render(); return;
 }
 cloudStatus = 'Загрузка задач…'; render();
 try {
  let query = supabase.from('todos').select('*').order('created_at', {ascending:false}).order('id', {ascending:false});
  query = scope === 'feed' ? query.eq('is_public', true) : query.eq('user_id', user!.id);
  const start = more ? cloudOffset : 0;
  const {data, error} = await query.range(start, start + 49);
  if (token !== generation) return;
  if (error) throw error;
  const page = decodeCloudPage(data);
  const rows = page.tasks; cloudOffset = start + page.rawCount; cloudSkipped += page.skipped;
  cloudTasks = more ? [...new Map([...cloudTasks, ...rows].map(t => [t.id,t])).values()] : rows;
  hasMore = page.rawCount === 50;
  cloudStatus = scope === 'feed' ? 'Публичные задачи всех участников. Показаны загруженные записи; имена авторов не проверены.' : 'Ваши облачные задачи. По умолчанию они личные.';
  if (cloudSkipped) cloudStatus += ` Пропущено некорректных записей: ${cloudSkipped}.`;
 } catch (error) {
  if (token === generation) { cloudFailed = true; cloudStatus = cloudError(error as Error); }
 } finally { if (token === generation) { loading = false; render(); } }
}
function switchScope(next: string) {
 if (busy) return;
 generation++; scope = next; cloudTasks = []; hasMore = false; loading = false; cloudFailed = false;
 view = 'all'; search.value = ''; priority = 'all'; dialog.close(); removed = null;
 $('#notification').hidden = true; menu(false); render(); void loadCloud();
}
document.querySelectorAll<HTMLElement>('[data-scope]').forEach(button => button.addEventListener('click', () => switchScope(button.dataset.scope!)));
$('#cloud-refresh').addEventListener('click', () => void loadCloud());
$('#cloud-more').addEventListener('click', () => { if (!loading) void loadCloud(true); });
window.addEventListener('focus', () => { if (scope !== 'local' && !busy && !loading && !dialog.open && !authDialog.open) void loadCloud(); });

function openAuth() {
 menu(false); authForm.reset(); setAuthMode('login'); authDialog.showModal();
 (authForm.elements.namedItem('username') as HTMLInputElement).focus();
}
function setAuthMode(mode: string) {
 if (authBusy) return;
 authMode = mode; $('#auth-message').textContent = '';

 const password = authForm.elements.namedItem('password') as HTMLInputElement;
 password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
 $('#auth-title').textContent = mode === 'signup' ? 'Место для ваших планов.' : 'С возвращением.';
 $('#auth-submit').textContent = mode === 'signup' ? 'Создать аккаунт' : 'Войти';
 document.querySelectorAll<HTMLElement>('[data-auth-mode]').forEach(el => { const selected = el.dataset.authMode === mode; el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected)); });
}
$('#auth-open').addEventListener('click', openAuth);
$('#auth-close').addEventListener('click', () => { if (!authBusy) authDialog.close(); });
authDialog.addEventListener('cancel', event => { if (authBusy) event.preventDefault(); });
document.querySelectorAll<HTMLElement>('[data-auth-mode]').forEach(el => el.addEventListener('click', () => setAuthMode(el.dataset.authMode!)));
authForm.addEventListener('submit', async event => {
 event.preventDefault(); if (authBusy) return;
 const data = new FormData(authForm); authBusy = true;
 $<HTMLButtonElement>('#auth-submit').disabled = true;
 document.querySelectorAll<HTMLButtonElement>('[data-auth-mode]').forEach(el => el.disabled = true);
 $('#auth-message').textContent = authMode === 'signup' ? 'Создаём аккаунт…' : 'Входим…';
 try {
  const {username, email} = usernameCredentials(data.get('username'));
  const credentials = {email, password: String(data.get('password'))};
  if (authMode === 'signup') {
   const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {headers:{apikey:supabasePublishableKey}, signal:AbortSignal.timeout(12000)});
   if (!response.ok) throw new Error('Не удалось проверить настройки регистрации. Попробуйте позже.');
   const settings = await response.json();
   if (settings.mailer_autoconfirm !== true) throw new Error('Регистрация без почты ещё не включена: в Supabase отключите Confirm email (Authentication → Sign In / Providers → Email). Письма не отправлялись.');
  }
  const result = authMode === 'signup'
   ? await supabase.auth.signUp({...credentials, options:{data:{display_name:username, username}}})
   : await supabase.auth.signInWithPassword(credentials);
  if (result.error) throw result.error;
  (authForm.elements.namedItem('password') as HTMLInputElement).value = '';
  if (result.data.session) {
   applyUser(result.data.session.user); authDialog.close();
   if (scope === 'local') switchScope('mine'); else void loadCloud();
  } else {
   $('#auth-message').textContent = 'Не удалось начать сеанс. Логин может быть занят. В Supabase должно быть отключено Confirm email; письмо не требуется.';
  }
 } catch (error) {
  $('#auth-message').textContent = error instanceof Error ? error.message : 'Не удалось войти. Попробуйте ещё раз.';
 } finally {
  authBusy = false; $<HTMLButtonElement>('#auth-submit').disabled = false;
  document.querySelectorAll<HTMLButtonElement>('[data-auth-mode]').forEach(el => el.disabled = false);
 }
});
function applyUser(next: User | null) {
 const changed = user?.id !== next?.id;
 user = next;
 if (changed) {
  identity++; generation++; cloudTasks = []; hasMore = false; loading = false; busy = false;
  dialog.close(); removed = null; $('#notification').hidden = true;
 }
 render();
 // Never await Supabase calls while inside its auth callback: refresh after the lock is released.
 if (changed && scope !== 'local') setTimeout(() => void loadCloud(), 0);
}
$('#auth-logout').addEventListener('click', async () => {
 if (busy) return;
 applyUser(null);
 try { const {error} = await supabase.auth.signOut({scope:'local'}); if (error) throw error; }
 catch { notify('Не удалось завершить сеанс полностью. Повторите вход и выход; не оставляйте устройство без присмотра.'); }
});
supabase.auth.onAuthStateChange((_event, session) => applyUser(session?.user ?? null));

function openTask(task?: Task) {
 if (busy || loading || (scope !== 'local' && !user)) return;
 if (task && scope !== 'local' && (task as CloudTask).user_id !== user?.id) return;
 editing = task?.id ?? null; form.reset();
 (form.elements.namedItem('title') as HTMLInputElement).value = task?.title ?? '';
 (form.elements.namedItem('project') as HTMLSelectElement).value = task?.project ?? (projects.includes(view as typeof projects[number]) ? view : 'Личное');
 (form.elements.namedItem('priority') as HTMLSelectElement).value = task?.priority ?? 'normal';
 (form.elements.namedItem('due') as HTMLInputElement).value = task?.due ?? (view === 'today' ? today() : '');
 (form.elements.namedItem('is_public') as HTMLInputElement).checked = scope !== 'local' && (task as CloudTask | undefined)?.is_public === true;
 $('#publish-field').hidden = scope === 'local'; $('#task-error').hidden = true;
 $('#dialog-title').textContent = task ? 'Немного уточним.' : 'Что нужно сделать?';
 $('#save-task').textContent = task ? 'Сохранить изменения' : 'Добавить задачу';
 menu(false); dialog.showModal(); $('#task-title').focus();
}
document.querySelectorAll('.new-task').forEach(el => el.addEventListener('click', () => openTask()));
$('#close-dialog').addEventListener('click', () => { if (!busy) dialog.close(); });
$('#cancel-dialog').addEventListener('click', () => { if (!busy) dialog.close(); });
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
form.addEventListener('submit', async event => {
 event.preventDefault(); if (busy) return;
 const data = new FormData(form);
 const input = {title:String(data.get('title')),project:String(data.get('project')),priority:String(data.get('priority')),due:String(data.get('due'))};
 if (scope === 'local') {
  try {
   const task = createTask(input);
   if (editing) tasks = tasks.map(t => t.id === editing ? {...task,id:t.id,done:t.done} : t);
   else { tasks.push(task); view = view === 'completed' ? 'all' : view; priority = 'all'; search.value = ''; }
   persist(); dialog.close(); render();
  } catch (error) { notify(error instanceof Error ? error.message : 'Не удалось добавить задачу'); }
  return;
 }
 if (!user) return;
 const owner = user.id, epoch = identity, origin = scope;
 const original = cloudTasks.find(t => t.id === editing);
 const editedId = editing;
 busy = true; $('#task-error').hidden = true; render();
 try {
  if (editedId && (!original || original.user_id !== owner)) throw new Error('Задача недоступна для изменения. Обновите список.');
  const payload = cloudInput({...input,done:original?.done ?? false,is_public:data.get('is_public') === 'on'}, owner, original?.author_name ?? publicName());
  const query = editedId ? supabase.from('todos').update(payload).eq('id', editedId).eq('user_id', owner) : supabase.from('todos').insert(payload);
  const {data: saved, error} = await query.select().single();
  if (error) throw error;
  if (!saved) throw new Error('Сервер не подтвердил сохранение. Обновите список.');
  if (epoch !== identity || user?.id !== owner || origin !== scope) return;
  const task = cloudTask(saved);
  cloudTasks = editedId ? cloudTasks.map(t => t.id === editedId ? task : t) : [task, ...cloudTasks];
  if (scope === 'feed' && !task.is_public) cloudTasks = cloudTasks.filter(t => t.id !== task.id);
  view = view === 'completed' && !task.done ? 'all' : view; priority = 'all'; search.value = '';
  dialog.close(); notify(task.is_public ? 'Задача сохранена и опубликована' : 'Личная задача сохранена в облаке');
 } catch (error) {
  if (epoch === identity && origin === scope) { $('#task-error').textContent = cloudError(error as Error); $('#task-error').hidden = false; }
 } finally { if (epoch === identity) { busy = false; render(); } }
});

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => { if (busy) return; view = button.dataset.view!; priority = 'all'; search.value = ''; menu(false); render(); }));
document.querySelectorAll<HTMLButtonElement>('[data-priority]').forEach(button => button.addEventListener('click', () => { priority = button.dataset.priority!; render(); }));
search.addEventListener('input', render); $('#sort').addEventListener('change', render);
function element(tag: string, className: string, text?: string) {
 const el = document.createElement(tag); el.className = className;
 if (text) el.textContent = text;
 return el;
}
async function mutateCloud(task: CloudTask, operation: 'toggle' | 'delete') {
 if (busy || loading || !user || task.user_id !== user.id || scope === 'local') return;
 const owner = user.id, epoch = identity, origin = scope;
 busy = true; render();
 try {
  if (operation === 'delete') {
   const {data, error} = await supabase.from('todos').delete().eq('id', task.id).eq('user_id', owner).select('id');
   if (error) throw error;
   if (!data || data.length !== 1 || data[0].id !== task.id) throw new Error('Удаление не подтверждено. Возможно, задача уже удалена. Обновите список.');
   if (epoch !== identity || origin !== scope || user?.id !== owner) return;
   cloudTasks = cloudTasks.filter(t => t.id !== task.id);
   notify('Задача удалена из облака');
  } else {
   const {data, error} = await supabase.from('todos').update({done:!task.done}).eq('id', task.id).eq('user_id', owner).select().single();
   if (error) throw error;
   if (!data) throw new Error('Изменение не подтверждено. Обновите список.');
   if (epoch !== identity || origin !== scope || user?.id !== owner) return;
   const saved = cloudTask(data);
   cloudTasks = cloudTasks.map(t => t.id === task.id ? saved : t);
  }
 } catch (error) { if (epoch === identity && origin === scope) notify(cloudError(error as Error)); }
 finally { if (epoch === identity) { busy = false; render(); } }
}
function render() {
 const listTasks: Task[] = scope === 'local' ? tasks : cloudTasks;
 const writable = !busy && !loading && (scope === 'local' || !!user);
 $('#cloud-panel').hidden = scope === 'local';
 $('#cloud-status').textContent = cloudStatus;
 $('#cloud-more').hidden = !hasMore || scope === 'local';
 $<HTMLButtonElement>('#cloud-refresh').disabled = loading || busy;
 $<HTMLButtonElement>('#cloud-more').disabled = loading || busy;
 document.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach(el => { el.setAttribute('aria-pressed', String(el.dataset.scope === scope)); el.classList.toggle('active', el.dataset.scope === scope); el.disabled = busy; });
 document.querySelectorAll<HTMLButtonElement>('.new-task').forEach(el => el.disabled = !writable);
 $<HTMLButtonElement>('#save-task').disabled = busy;
 document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('#task-form input, #task-form select, #close-dialog, #cancel-dialog').forEach(el => el.disabled = busy);
 $<HTMLButtonElement>('#auth-logout').disabled = busy;
 $('#auth-open').hidden = !!user; $('#auth-logout').hidden = !user;
 $('#account-name').textContent = user ? publicName() : 'Без аккаунта';
 $('.local-info').textContent = scope === 'local' ? 'Только на этом устройстве' : scope === 'mine' ? 'Ваше облачное пространство' : 'Открыто для всех';
 const title = view === 'all' && scope !== 'local' ? (scope === 'mine' ? 'Мои задачи' : 'Общая лента') : labels[view] ?? view;
 $('h1').textContent = title; $('#crumb').textContent = title;
 $('#view-description').textContent = scope === 'feed' ? 'Чужие планы могут вдохновить на свои. Только опубликованные задачи.' : descriptions[view] ?? 'Немного порядка в одной части жизни.';
 document.querySelectorAll<HTMLElement>('[data-view]').forEach(el => { const active = el.dataset.view === view; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
 document.querySelectorAll<HTMLElement>('[data-count]').forEach(el => el.textContent = String(filterTasks(listTasks,el.dataset.count!,'',today()).length));
 document.querySelectorAll<HTMLElement>('[data-priority]').forEach(el => { const active = el.dataset.priority === priority; el.classList.toggle('selected',active); el.setAttribute('aria-pressed',String(active)); });
 let visible = filterTasks(listTasks,view,search.value,today()).filter(t => priority !== 'high' || t.priority === 'high');
 const sort = $<HTMLSelectElement>('#sort').value;
 if (sort === 'priority') { const rank:Record<string,number> = {high:0,normal:1,low:2}; visible.sort((a,b) => rank[a.priority]! - rank[b.priority]!); }
 if (sort === 'due') visible.sort((a,b) => (a.due || '9999').localeCompare(b.due || '9999'));
 $('#list-count').textContent = `${visible.length} в списке${scope === 'local' ? '' : ' · загружено'}`;
 const list = $('#task-list'); list.replaceChildren();
 for (const task of visible) {
  const row = element('article', `task-row${task.done ? ' done' : ''}`);
  const own = scope === 'local' || (task as CloudTask).user_id === user?.id;
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = task.done;
  checkbox.setAttribute('aria-label', `${task.done ? 'Вернуть' : 'Выполнить'}: ${task.title}`);
  checkbox.disabled = busy || loading;
  checkbox.addEventListener('change', () => { if (scope === 'local') { task.done = checkbox.checked; persist(); render(); } else void mutateCloud(task as CloudTask, 'toggle'); });
  const body = element('div','task-body'); body.append(element('div','task-title',task.title));
  const meta = element('div','task-meta'); meta.append(element('span','project-tag',task.project));
  if (task.due) {
   const date = task.due === today() ? 'Сегодня' : new Intl.DateTimeFormat('ru',{day:'numeric',month:'short'}).format(new Date(task.due+'T12:00:00'));
   meta.append(element('span',task.due < today() && !task.done ? 'priority-tag' : '',`${task.due < today() && !task.done ? 'Просрочено · ' : ''}${date}`));
  }
  if (task.priority === 'high') meta.append(element('span','priority-tag','⚑ Важно'));
  if (task.priority === 'low') meta.append(element('span','','Невысокий приоритет'));
  if (scope !== 'local') {
   const cloud = task as CloudTask;
   meta.append(element('span','author-label',`${cloud.author_name} · имя не проверено`));
   meta.append(element('span','visibility-tag',cloud.is_public ? 'Публичная' : 'Личная'));
   row.dataset.authorId = cloud.user_id; row.title = `ID автора: ${cloud.user_id}`;
   if (task.done && !own) meta.append(element('span','','Завершена'));
  }
  body.append(meta);
  const actions = element('div','task-actions');
  const edit = element('button','','↗') as HTMLButtonElement;
  edit.setAttribute('aria-label',`Редактировать: ${task.title}`); edit.disabled = busy || loading;
  edit.addEventListener('click',() => openTask(task));
  const del = element('button','','×') as HTMLButtonElement;
  del.setAttribute('aria-label',`Удалить: ${task.title}`); del.disabled = busy || loading;
  del.addEventListener('click',() => {
   if (scope !== 'local') { void mutateCloud(task as CloudTask, 'delete'); return; }
   removed = task; tasks = tasks.filter(t => t.id !== task.id);
   const saved = persist(true); render(); if (saved) notify('Задача удалена',true); $('#undo').focus();
  });
  actions.append(edit,del);
  if (own) row.append(checkbox,body,actions); else row.append(body);
  list.append(row);
 }
 $('#empty').hidden = visible.length > 0 || (scope !== 'local' && (loading || cloudFailed || (scope === 'mine' && !user)));
 $('#inline-add').hidden = visible.length === 0 || !writable;
 const narrowed = !!search.value.trim() || priority === 'high';
 $('#empty-title').textContent = narrowed ? 'Ничего не найдено' : scope === 'feed' ? 'Здесь появятся опубликованные планы.' : view === 'completed' ? 'Здесь будут ваши маленькие победы.' : view === 'today' ? 'На сегодня всё спокойно.' : view === 'upcoming' ? 'Будущее пока открыто.' : listTasks.length ? 'Есть место для нового.' : 'Большие планы начинаются с малого.';
 $('#empty-description').textContent = narrowed ? 'Попробуйте другой запрос или уберите фильтр.' : scope === 'feed' ? 'Участники сами решают, какими задачами поделиться.' : view === 'completed' ? 'Отметьте выполненное дело — оно появится здесь.' : view === 'today' ? 'Задачи на сегодня и просроченные дела появятся здесь.' : view === 'upcoming' ? 'Добавьте задачу с будущей датой — и вернитесь к настоящему.' : 'Запишите первое дело — и дайте мыслям немного пространства.';
 $('#empty-add').hidden = narrowed || view === 'completed' || !writable;
 $('#demo').hidden = scope !== 'local' || listTasks.length > 0 || narrowed || view !== 'all';
 const done = listTasks.filter(t => t.done).length;
 $('#progress-label').textContent = listTasks.length ? `${done} из ${listTasks.length} завершено` : 'Без спешки.';
}
$('#undo').addEventListener('click', () => { if (removed && scope === 'local') { tasks.push(removed); removed = null; const saved = persist(); render(); if (saved) $('#notification').hidden = true; } });
$('#dismiss').addEventListener('click', () => { $('#notification').hidden = true; removed = null; });
$('#demo').addEventListener('click', () => {
 if (scope !== 'local' || tasks.length) return;
 tasks = [createTask({title:'Выбрать одно главное дело на сегодня',project:'Работа',priority:'high',due:today()}), createTask({title:'Оставить полчаса для хорошей книги',project:'Личное'}), createTask({title:'Записать идею, которая не даёт покоя',project:'Идеи'}), {...createTask({title:'Найти спокойное место для своих планов',project:'Личное'}),done:true}];
 const saved = persist(); render(); if (saved) notify('Добавлены 4 примера. Их можно изменить или удалить.');
});
document.addEventListener('keydown', event => {
 if (event.key === 'Escape') menu(false);
 if (event.ctrlKey || event.metaKey || event.altKey || dialog.open || authDialog.open || ['INPUT','SELECT','TEXTAREA'].includes((event.target as HTMLElement).tagName)) return;
 if (event.key.toLowerCase() === 'n' || event.key === 'т') { event.preventDefault(); openTask(); }
 if (event.key === '/') { event.preventDefault(); search.focus(); }
});
render();
