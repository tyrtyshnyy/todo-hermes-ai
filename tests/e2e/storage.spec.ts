import {test,expect,type Page} from '@playwright/test';

const warning='Не удалось сохранить задачи. Не закрывайте страницу: изменения пока только в памяти.';
async function blockTaskStorage(page:Page){
 await page.evaluate(()=>{
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
   if(key==='tikho.tasks.v1')throw new DOMException('Storage unavailable','QuotaExceededError');
   return original.call(this,key,value);
  };
 });
}

test.describe('storage',()=>{
 test('demo retains the save failure warning',async({page})=>{
  await page.goto('/');
  await blockTaskStorage(page);
  await page.locator('#demo').click();
  await expect(page.locator('.task-row')).toHaveCount(3);
  await expect(page.locator('#notification')).toBeVisible();
  await expect(page.locator('#notification-text')).toHaveText(warning);
 });

 test('failed delete retains the warning and allows undo',async({page})=>{
  await page.goto('/');
  await page.locator('#demo').click();
  const title=await page.locator('.task-title').first().innerText();
  await blockTaskStorage(page);
  await page.getByRole('button',{name:`Удалить: ${title}`,exact:true}).click();
  await expect(page.locator('.task-row')).toHaveCount(2);
  await expect(page.locator('#notification-text')).toHaveText(warning);
  await expect(page.locator('#undo')).toBeVisible();
  await page.locator('#undo').click();
  await expect(page.getByText(title,{exact:true})).toBeVisible();
 });

 test('failed undo retains the save failure warning',async({page})=>{
  await page.goto('/');
  await page.locator('#demo').click();
  const title=await page.locator('.task-title').first().innerText();
  await page.getByRole('button',{name:`Удалить: ${title}`,exact:true}).click();
  await blockTaskStorage(page);
  await page.locator('#undo').click();
  await expect(page.getByText(title,{exact:true})).toBeVisible();
  await expect(page.locator('#notification')).toBeVisible();
  await expect(page.locator('#notification-text')).toHaveText(warning);
  await expect(page.locator('#undo')).toBeHidden();
 });

 test('successful demo delete and undo keep their default notifications',async({page})=>{
  await page.goto('/');
  await page.locator('#demo').click();
  await expect(page.locator('#notification-text')).toHaveText('Добавлены 4 примера. Их можно изменить или удалить.');
  const title=await page.locator('.task-title').first().innerText();
  await page.getByRole('button',{name:`Удалить: ${title}`,exact:true}).click();
  await expect(page.locator('#notification-text')).toHaveText('Задача удалена');
  await expect(page.locator('#undo')).toBeVisible();
  await page.locator('#undo').click();
  await expect(page.locator('#notification')).toBeHidden();
  await page.reload();
  await expect(page.getByText(title,{exact:true})).toBeVisible();
  await expect(page.locator('.task-row')).toHaveCount(3);
 });
});
