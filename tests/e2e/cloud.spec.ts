import {test,expect,type Page} from '@playwright/test';
const uid='11111111-1111-4111-8111-111111111111';
const foreign='22222222-2222-4222-8222-222222222222';
const row={id:'33333333-3333-4333-8333-333333333333',user_id:foreign,title:'Публичная мысль',project:'Идеи',priority:'normal',due:null,done:false,is_public:true,author_name:'Автор',created_at:'2026-11-01T12:00:00Z'};
// Deterministic HTTP fixtures only in Playwright. Production always uses Supabase.
async function fixture(page:Page){await page.route('https://hrwlrzbjusplfxwkrend.supabase.co/**',async route=>{
 if(route.request().url().includes('/rest/v1/todos'))return route.fulfill({json:[row]});
 return route.fulfill({json:{}});
});}
test('mixed poisoned public pages retain valid tasks and paginate by raw offsets',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const offsets:number[]=[];
 const first=[...Array.from({length:48},(_,i)=>({...row,id:`valid-${i}`,title:`План ${i}`})),{...row,id:'blank',title:'\n\n'},{...row,id:'emoji',title:'😀'.repeat(101)}];
 await page.route('https://hrwlrzbjusplfxwkrend.supabase.co/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.includes('/rest/v1/todos')){
   const offset=Number(url.searchParams.get('offset'));offsets.push(offset);
   return route.fulfill({json:offset===0?first:offset===50?Array.from({length:50},(_,i)=>({...row,id:`bad-${i}`,title:'\n'})):[row]});
  }
  return route.fulfill({json:{}});
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Общая лента',exact:true}).click();
 await expect(page.getByText('План 0',{exact:true})).toBeVisible();
 await expect(page.locator('.task-row')).toHaveCount(48);
 await expect(page.locator('#cloud-status')).toContainText('Пропущено некорректных записей: 2.');
 await page.locator('#cloud-more').click();
 await expect(page.locator('#cloud-status')).toContainText('Пропущено некорректных записей: 52.');
 await expect(page.locator('#cloud-more')).toBeVisible();
 await page.locator('#cloud-more').click();
 await expect(page.getByText(row.title,{exact:true})).toBeVisible();
 await expect(page.locator('.task-row')).toHaveCount(49);
 await expect(page.locator('#cloud-more')).toBeHidden();
 expect(offsets).toEqual([0,50,100]);expect(errors).toEqual([]);
 await page.locator('#cloud-refresh').click();
 await expect(page.locator('#cloud-status')).toContainText('Пропущено некорректных записей: 2.');
 await expect(page.locator('.task-row')).toHaveCount(48);
});
test('malformed public page reports an error rather than successful empty feed',async({page})=>{
 await page.route('https://hrwlrzbjusplfxwkrend.supabase.co/**',route=>route.fulfill({json:null}));
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Общая лента',exact:true}).click();
 await expect(page.locator('#cloud-status')).toContainText('Некорректный ответ облака');
 await expect(page.locator('#empty')).toBeHidden();
});
test('sign-in opens own cloud space and new tasks stay private',async({page})=>{
 const own={...row,id:'44444444-4444-4444-8444-444444444444',user_id:uid,title:'Личное дело',is_public:false,author_name:'Анна'};
 const user={id:uid,aud:'authenticated',role:'authenticated',email:'anna@example.test',user_metadata:{display_name:'Анна'},created_at:'2026-01-01T00:00:00Z'};
 const token=[btoa(JSON.stringify({alg:'HS256',typ:'JWT'})),btoa(JSON.stringify({sub:uid,exp:4102444800,role:'authenticated'})),'fixture'].join('.');
 let posted:any=null;
 await page.route('https://hrwlrzbjusplfxwkrend.supabase.co/**',async route=>{
  const req=route.request(),url=req.url();
  if(url.includes('/auth/v1/token'))return route.fulfill({json:{access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,user}});
  if(url.includes('/auth/v1/user'))return route.fulfill({json:user});
  if(url.includes('/rest/v1/todos')){if(req.method()==='POST'){posted=req.postDataJSON();return route.fulfill({json:{...own,...posted}});}return route.fulfill({json:[own]});}
  return route.fulfill({json:{}});
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Мои задачи',exact:true}).click();
 await page.getByRole('button',{name:'Войти в аккаунт',exact:true}).click();
 await page.getByLabel('Логин',{exact:true}).fill('anna_test');
 await page.getByLabel('Пароль',{exact:true}).fill('fixture-password-only');
 await page.getByRole('button',{name:'Войти',exact:true}).click();
 await expect(page.getByText('Личное дело',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Новая задача',exact:true}).click();
 await expect(page.getByLabel('Опубликовать в общей ленте')).not.toBeChecked();
 await page.getByLabel('Название задачи').fill('Секретный план');
 await page.getByRole('button',{name:'Добавить задачу',exact:true}).click();
 await expect.poll(()=>posted?.is_public).toBe(false);
 await expect.poll(()=>posted?.user_id).toBe(uid);
 await expect(page.getByText('Секретный план',{exact:true})).toBeVisible();
});
test('signup uses only login/password and immediately starts session without email',async({page})=>{
 let signup:any;
 await page.route('https://hrwlrzbjusplfxwkrend.supabase.co/**',async route=>{
  if(route.request().url().includes('/auth/v1/settings'))return route.fulfill({json:{mailer_autoconfirm:true}});
  if(route.request().url().includes('/auth/v1/signup')){signup={url:route.request().url(),body:route.request().postDataJSON()};const user={id:uid,aud:'authenticated',role:'authenticated',email:'anna_test@users.tikho.invalid',user_metadata:{display_name:'anna_test',username:'anna_test'}};return route.fulfill({json:{access_token:[btoa('{}'),btoa(JSON.stringify({sub:uid,exp:4102444800})),'fixture'].join('.'),refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,user}});}
  if(route.request().url().includes('/rest/v1/todos'))return route.fulfill({json:[]});
  return route.fulfill({json:{}});
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Войти в аккаунт',exact:true}).click();
 await page.getByRole('button',{name:'Регистрация',exact:true}).click();
 await page.getByLabel('Логин',{exact:true}).fill('anna_test');
 await page.getByLabel('Пароль',{exact:true}).fill('fixture-password-only');
 await page.getByRole('button',{name:'Создать аккаунт',exact:true}).click();
 await expect(page.locator('#auth-dialog')).not.toBeVisible();
 await expect(page.getByRole('heading',{name:'Мои задачи',exact:true})).toBeVisible();
 expect(signup.body.email).toBe('anna_test@users.tikho.invalid');
 expect(signup.body.data.display_name).toBe('anna_test');
 expect(signup.body.data.username).toBe('anna_test');
 expect(new URL(signup.url).searchParams.has('redirect_to')).toBe(false);
 await expect(page.locator('input[type=email]')).toHaveCount(0);
});
test('signup refuses to send a request when email confirmation is still enabled',async({page})=>{
 let signupCalls=0;
 await page.route('https://hrwlrzbjusplfxwkrend.supabase.co/**',async route=>{
  if(route.request().url().includes('/auth/v1/settings'))return route.fulfill({json:{mailer_autoconfirm:false}});
  if(route.request().url().includes('/auth/v1/signup'))signupCalls++;
  return route.fulfill({json:{}});
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Войти в аккаунт',exact:true}).click();
 await page.getByRole('button',{name:'Регистрация',exact:true}).click();
 await page.getByLabel('Логин',{exact:true}).fill('anna_test');
 await page.getByLabel('Пароль',{exact:true}).fill('fixture-password-only');
 await page.getByRole('button',{name:'Создать аккаунт',exact:true}).click();
 await expect(page.locator('#auth-message')).toContainText('отключите Confirm email');
 expect(signupCalls).toBe(0);
});
test('late public feed response cannot leak into local scope',async({page})=>{
 let release:()=>void=()=>{};
 const gate=new Promise<void>(r=>{release=r;});let requested=false;
 await page.route('https://hrwlrzbjusplfxwkrend.supabase.co/**',async route=>{
  if(route.request().url().includes('/rest/v1/todos')){requested=true;await gate;return route.fulfill({json:[row]});}
  return route.fulfill({json:{}});
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Общая лента',exact:true}).click();await expect.poll(()=>requested).toBe(true);
 await page.getByRole('button',{name:'На устройстве',exact:true}).click();release();
 await expect(page.getByRole('button',{name:'На устройстве',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByText(row.title,{exact:true})).toHaveCount(0);
});
test('explicit local default and anonymous public feed are isolated; foreign rows read-only',async({page})=>{
 await fixture(page);await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('button',{name:'На устройстве',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Общая лента',exact:true}).click();
 await expect(page.getByText('Публичная мысль',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Редактировать: Публичная мысль'})).toHaveCount(0);
 await expect(page.getByRole('checkbox',{name:'Выполнить: Публичная мысль'})).toHaveCount(0);
 await expect(page.getByText('Автор · имя не проверено',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'На устройстве',exact:true}).click();
 await expect(page.getByText('Публичная мысль',{exact:true})).toHaveCount(0);
});
