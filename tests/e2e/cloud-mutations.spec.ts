import {test,expect,type Page} from '@playwright/test';
const uid='11111111-1111-4111-8111-111111111111';
const row={id:'33333333-3333-4333-8333-333333333333',user_id:uid,title:'Облачная задача',project:'Работа',priority:'normal',due:null,done:false,is_public:false,author_name:'Анна',created_at:'2026-11-01T12:00:00Z'};
// Isolated HTTP fixtures. RLS itself is tested separately on real PostgreSQL.
async function setup(page:Page){
 const user={id:uid,aud:'authenticated',role:'authenticated',email:'anna@example.test',user_metadata:{display_name:'Анна'},created_at:'2026-01-01T00:00:00Z'};
 const access_token=[btoa(JSON.stringify({alg:'HS256',typ:'JWT'})),btoa(JSON.stringify({sub:uid,exp:4102444800,role:'authenticated'})),'fixture'].join('.');
 let rows=[{...row}],failWrite=false;
 await page.route('https://hrwlrzbjusplfxwkrend.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.includes('/auth/v1/token'))return route.fulfill({json:{access_token,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,user}});
  if(url.pathname.includes('/auth/v1/user'))return route.fulfill({json:user});
  if(url.pathname.includes('/auth/v1/signup'))return route.fulfill({json:{user,session:null}});
  if(url.pathname.includes('/auth/v1/logout'))return route.fulfill({status:204});
  if(url.pathname.includes('/rest/v1/todos')){
   if(req.method()!=='GET' && failWrite)return route.fulfill({status:503,json:{message:'Сервер временно недоступен',code:'TEST_FAILURE'}});
   if(req.method()==='PATCH'){
    const id=url.searchParams.get('id')?.slice(3),change=req.postDataJSON();
    rows=rows.map(r=>r.id===id?{...r,...change}:r);
    const saved=rows.find(r=>r.id===id);return route.fulfill({json:saved??null});
   }
   if(req.method()==='DELETE'){const id=url.searchParams.get('id')?.slice(3);const deleted=rows.filter(r=>r.id===id);rows=rows.filter(r=>r.id!==id);return route.fulfill({json:deleted.map(r=>({id:r.id}))});}
   if(req.method()==='POST'){const saved={...row,...req.postDataJSON()};rows.push(saved);return route.fulfill({json:saved});}
   return route.fulfill({json:rows.filter(r=>(url.searchParams.get('is_public')!=='eq.true'||r.is_public)&&(!url.searchParams.has('user_id')||r.user_id===uid))});
  }
  return route.fulfill({json:{}});
 });
 return {fail:()=>{failWrite=true;},getRows:()=>rows};
}
async function login(page:Page){
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Мои задачи',exact:true}).click();
 await page.getByRole('button',{name:'Войти в аккаунт',exact:true}).click();
 await page.getByLabel('Логин',{exact:true}).fill('anna_test');await page.getByLabel('Пароль',{exact:true}).fill('fixture-password-only');
 await page.getByRole('button',{name:'Войти',exact:true}).click();await expect(page.getByText(row.title,{exact:true})).toBeVisible();
}
test('cloud task can be published, completed, restored and deleted',async({page})=>{
 const f=await setup(page);await login(page);
 await page.getByRole('button',{name:`Редактировать: ${row.title}`}).click();
 await page.getByLabel('Опубликовать в общей ленте').check();await page.getByRole('button',{name:'Сохранить изменения'}).click();
 await expect.poll(()=>f.getRows()[0]?.is_public).toBe(true);
 await page.getByRole('checkbox',{name:`Выполнить: ${row.title}`}).click();
 await expect.poll(()=>f.getRows()[0]?.done).toBe(true);
 await page.getByRole('button',{name:/Завершённые/}).click();
 await page.getByRole('checkbox',{name:`Вернуть: ${row.title}`}).click();
 await expect.poll(()=>f.getRows()[0]?.done).toBe(false);
 await page.getByRole('button',{name:/Все задачи/}).click();
 await page.getByRole('button',{name:`Удалить: ${row.title}`}).click();
 await expect.poll(()=>f.getRows().length).toBe(0);
 await expect(page.getByText(row.title,{exact:true})).toHaveCount(0);
});
test('failed cloud mutations retain saved state and show errors',async({page})=>{
 const f=await setup(page);await login(page);f.fail();
 await page.getByRole('checkbox',{name:`Выполнить: ${row.title}`}).click();
 await expect(page.getByRole('checkbox',{name:`Выполнить: ${row.title}`})).not.toBeChecked();
 await expect(page.locator('#notification-text')).toContainText('Сервер временно недоступен');
 await page.getByRole('button',{name:`Удалить: ${row.title}`}).click();
 await expect(page.getByText(row.title,{exact:true})).toBeVisible();
 await page.getByRole('button',{name:`Редактировать: ${row.title}`}).click();
 await page.getByLabel('Название задачи').fill('Несохранённое изменение');await page.getByRole('button',{name:'Сохранить изменения'}).click();
 await expect(page.locator('#task-error')).toContainText('Сервер временно недоступен');
 await expect(page.getByLabel('Название задачи')).toHaveValue('Несохранённое изменение');
 expect(f.getRows()[0]?.title).toBe(row.title);
});
test('zero-row cloud mutations never claim success',async({page})=>{
 await setup(page);await login(page);
 await page.route('**/rest/v1/todos*',async route=>{
  const method=route.request().method();
  if(method==='PATCH')return route.fulfill({json:null});
  if(method==='DELETE')return route.fulfill({json:[]});
  return route.fallback();
 });
 await page.getByRole('checkbox',{name:`Выполнить: ${row.title}`}).click();
 await expect(page.locator('#notification-text')).toContainText('Изменение не подтверждено');
 await expect(page.getByRole('checkbox',{name:`Выполнить: ${row.title}`})).not.toBeChecked();
 await page.getByRole('button',{name:`Удалить: ${row.title}`}).click();
 await expect(page.locator('#notification-text')).toContainText('Удаление не подтверждено');
 await expect(page.getByText(row.title,{exact:true})).toBeVisible();
});
test('delayed private read after logout cannot restore private rows',async({page})=>{
 await setup(page);await login(page);
 let release:()=>void=()=>{};const gate=new Promise<void>(r=>{release=r;});let requested=false;
 await page.route('**/rest/v1/todos*',async route=>{
  if(route.request().method()==='GET'){requested=true;await gate;return route.fulfill({json:[row]});}
  return route.fallback();
 });
 await page.getByRole('button',{name:'Обновить',exact:true}).click();await expect.poll(()=>requested).toBe(true);
 await page.getByRole('button',{name:'Выйти',exact:true}).click();
 const settled=page.waitForResponse(r=>r.url().includes('/rest/v1/todos'));
 release();await settled;
 await expect(page.getByText(row.title,{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Войти в аккаунт',exact:true})).toBeVisible();
});
test('logout immediately clears private cloud rows but preserves local data',async({page})=>{
 await setup(page);await login(page);
 await page.getByRole('button',{name:'Выйти',exact:true}).click();
 await expect(page.getByText(row.title,{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Войти в аккаунт',exact:true})).toBeVisible();
});
