import {test,expect} from '@playwright/test';
test('первая задача сохраняется после перезагрузки',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Новая задача',exact:true}).click();
 await page.getByLabel('Название задачи').fill('Подготовить письмо');
 await page.getByRole('button',{name:'Добавить задачу',exact:true}).click();
 await expect(page.getByText('Подготовить письмо',{exact:true})).toBeVisible();
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.getByText('Подготовить письмо',{exact:true})).toBeVisible();
});
test('редактирование, поиск, выполнение и удаление',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Новая задача',exact:true}).click();
 await page.getByLabel('Название задачи').fill('Проверить макет');
 await page.getByLabel('Проект',{exact:true}).selectOption('Работа');
 await page.getByLabel('Приоритет',{exact:true}).selectOption('high');
 await page.getByRole('button',{name:'Добавить задачу',exact:true}).click();
 await page.getByRole('button',{name:'Редактировать: Проверить макет'}).click();
 await page.getByLabel('Название задачи').fill('Готовый макет');
 await page.getByRole('button',{name:'Сохранить изменения'}).click();
 await page.getByLabel('Поиск задач').fill('нет совпадений');
 await expect(page.getByText('Ничего не найдено',{exact:true})).toBeVisible();
 await page.getByLabel('Поиск задач').fill('');
 await page.getByRole('checkbox',{name:'Выполнить: Готовый макет'}).click();
 await page.getByRole('button',{name:/Завершённые/}).click();
 await expect(page.getByText('Готовый макет',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Удалить: Готовый макет'}).click();
 await expect(page.getByText('Готовый макет',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Отменить удаление'}).click();
 await expect(page.getByText('Готовый макет',{exact:true})).toBeVisible();
});
test('мобильный экран не имеет горизонтального скролла',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('heading',{name:'Все задачи',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Открыть меню'}).click();
 await expect(page.getByRole('button',{name:/Предстоящие/})).toBeVisible();
});
