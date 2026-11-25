import {expect,test,type Page} from '@playwright/test'

const region = (page:Page) => page.getByRole('region',{name:'Управление картой'})
const plot = (page:Page) => page.getByTestId('plot-readout')
const option = (page:Page,name:string) => page.getByRole('button',{name,exact:true})
const canvas = (page:Page) => page.getByTestId('city-canvas')
async function open(page:Page) {
  await page.goto('./')
  await expect(page.locator('.scene[data-ready=true]')).toBeVisible()
  await option(page,'Пауза').click()
}
async function fresh(page:Page) {
  await option(page,'Управление городом').click()
  await option(page,'Новый город').click()
  await option(page,'Начать').click()
}
async function chooseCenter(page:Page) {
  await region(page).focus()
  await region(page).press('Enter')
}
async function comparePixels(page:Page,action:()=>Promise<void>) {
  const before = await canvas(page).screenshot()
  await action()
  await page.waitForTimeout(450)
  const after = await canvas(page).screenshot()
  expect(after.equals(before)).toBe(false)
}

test('demo, camera, lighting, time, chart and tax',async({page,isMobile})=>{
  const errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  await open(page)
  await expect(page.getByText('Город в порядке')).toBeVisible()
  const map = page.getByRole('region',{name:'Карта города'})
  await comparePixels(page,()=>option(page,'Приблизить').click())
  await comparePixels(page,()=>option(page,'Повернуть камеру').click())
  await option(page,'Центрировать камеру').click()
  const bounds = (await canvas(page).boundingBox())!
  const cx = Math.round(bounds.x+bounds.width/2), cy = Math.round(bounds.y+bounds.height/2)
  if (isMobile) {
    const session = await page.context().newCDPSession(page)
    try {
      await comparePixels(page,async()=>{
        await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-22,y:cy,id:1},{x:cx+22,y:cy,id:2}]})
        await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-56,y:cy-16,id:1},{x:cx+58,y:cy-16,id:2}]})
        await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
      })
    } finally {await session.detach()}
  } else {
    await comparePixels(page,async()=>{
      await page.mouse.move(cx,cy)
      await page.mouse.down({button:'right'})
      await page.mouse.move(cx+95,cy+35,{steps:10})
      await page.mouse.up({button:'right'})
    })
  }
  await option(page,'Центрировать камеру').click()
  await option(page,'Сменить освещение').click()
  await expect(map).toHaveAttribute('data-night','true')
  await option(page,'Сменить освещение').click()
  await expect(map).toHaveAttribute('data-night','false')
  const clock=page.getByTestId('game-clock').locator('small')
  const day=await clock.innerText()
  await option(page,'Четверная скорость').click()
  await expect(clock).not.toHaveText(day,{timeout:8000})
  await option(page,'Пауза').click()
  const paused=await clock.innerText()
  await page.waitForTimeout(1750)
  await expect(clock).toHaveText(paused)
  await option(page,'Статистика').click()
  const dialog=page.getByRole('dialog')
  await expect(dialog.getByRole('img',{name:/График «Бюджет»/})).toBeVisible()
  await dialog.getByRole('button',{name:'Население',exact:true}).click()
  await expect(dialog.getByRole('img',{name:/График «Население»/})).toBeVisible()
  await dialog.getByRole('slider',{name:'Ход на графике'}).press('Home')
  await expect(dialog.locator('.chart-value span')).toHaveText('Ход 16')
  const tax=dialog.getByRole('slider',{name:'Налоговая ставка'})
  await tax.press('End')
  await expect(dialog.locator('output')).toHaveText('20%')
  await option(page,'Закрыть').click()
  if (isMobile) {
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await expect(page.locator('.build-grid')).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('build, diagnose missing road, reject occupied cell, demolish and undo',async({page,isMobile})=>{
  await open(page)
  await fresh(page)
  await page.getByRole('button',{name:/^Жильё/}).click()
  const box=(await canvas(page).boundingBox())!
  const x=box.x+box.width*.50
  const y=box.y+box.height*.50
  await canvas(page).scrollIntoViewIfNeeded()
  const current=(await canvas(page).boundingBox())!
  if(isMobile) await page.touchscreen.tap(current.x+box.width*.50,current.y+box.height*.50)
  else await page.mouse.click(x,y)
  await expect(plot(page)).toContainText('Жильё')
  await expect(plot(page)).toContainText('Без дороги')
  await expect(page.getByText('Участки без дороги')).toBeVisible()
  await region(page).focus()
  await region(page).press('Enter')
  await expect(page.getByRole('status')).toContainText('Клетка занята')
  await option(page,'Снести объект').click()
  await region(page).focus()
  await region(page).press('Enter')
  await expect(plot(page)).toContainText('Свободно')
  await option(page,'Отмена').click()
  await expect(plot(page)).toContainText('Жильё')
  await option(page,'Отмена').click()
  await expect(plot(page)).toContainText('Свободно')
  await expect(page.getByRole('button',{name:/Бюджет 18.*000 ₽/})).toBeVisible()
})

test('save, load, reload, exact shared city in a fresh browser context',async({page,browser})=>{
  await open(page)
  await fresh(page)
  await page.getByRole('button',{name:/^Парк/}).click()
  await chooseCenter(page)
  await expect(plot(page)).toContainText('Парк')
  await option(page,'Сохранить').click()
  await expect(page.getByRole('status')).toContainText('Город сохранён')
  const snapshot = await page.evaluate(()=>localStorage.getItem('mini-city-v1'))
  await option(page,'Поделиться городом').click()
  await page.context().grantPermissions(['clipboard-read','clipboard-write'])
  await option(page,'Копировать').click()
  await expect(option(page,'Скопировано')).toBeVisible()
  const share=await page.getByRole('textbox',{name:'Ссылка на город'}).inputValue()
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(share)
  expect(new URL(share).hash).toMatch(/^#city=/)
  await option(page,'Закрыть').click()
  await fresh(page)
  await option(page,'Управление городом').click()
  await option(page,'Загрузить сохранение').click()
  await option(page,'Загрузить').click()
  await chooseCenter(page)
  await expect(plot(page)).toContainText('Парк')
  await page.reload()
  await option(page,'Пауза').click()
  await chooseCenter(page)
  await expect(plot(page)).toContainText('Парк')
  const guest = await browser.newContext()
  try {
    const copy = await guest.newPage()
    await copy.goto(share)
    await expect(copy.locator('.scene[data-ready=true]')).toBeVisible()
    await expect(option(copy,'Пауза')).toHaveAttribute('aria-pressed','true')
    await chooseCenter(copy)
    await expect(plot(copy)).toContainText('Парк')
    await option(copy,'Сохранить').click()
    expect(await copy.evaluate(()=>localStorage.getItem('mini-city-v1'))).toBe(snapshot)
    await option(copy,'Снести объект').click()
    await chooseCenter(copy)
    await expect(plot(copy)).toContainText('Свободно')
    await option(copy,'Сохранить').click()
    expect(await copy.evaluate(()=>localStorage.getItem('mini-city-v1'))).not.toBe(snapshot)
    expect(await page.evaluate(()=>localStorage.getItem('mini-city-v1'))).toBe(snapshot)
    await copy.reload()
    await option(copy,'Пауза').click()
    await chooseCenter(copy)
    await expect(plot(copy)).toContainText('Свободно')
    await copy.evaluate(hash=>{location.hash=hash},new URL(share).hash)
    await expect(copy.getByRole('status')).toContainText('Открыта независимая копия города')
    await chooseCenter(copy)
    await expect(plot(copy)).toContainText('Парк')
  } finally {
    await guest.close()
  }
})

test('recover from malformed save and malformed shared city',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('mini-city-v1','invalid payload'))
  await page.goto('./')
  await expect(page.getByRole('status')).toContainText('Сохранение недоступно')
  await page.goto('./#city=broken_')
  await page.reload()
  await expect(page.getByRole('status')).toContainText('Ссылка повреждена')
  await expect(page.getByText('Город в порядке')).toBeVisible()
})
