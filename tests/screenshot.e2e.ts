import {readFile} from 'node:fs/promises'
import {expect,test,type Locator} from '@playwright/test'

async function luminance(image:Locator) {
  return image.evaluate(async (element:HTMLImageElement)=>{
    await element.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 24
    const context = canvas.getContext('2d')!
    context.drawImage(element,0,0,24,24)
    const pixels = context.getImageData(0,0,24,24).data
    let total = 0
    for (let index=0;index<pixels.length;index+=4) total += pixels[index]+pixels[index+1]+pixels[index+2]
    return total / (24*24*3)
  })
}

test('captures the current 3D view and downloads a valid night PNG',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'canShare',{value:()=>false}))
  await page.goto('./')
  await expect(page.locator('.scene[data-ready=true]')).toBeVisible()
  await page.getByRole('button',{name:'Пауза',exact:true}).click()
  await page.getByRole('button',{name:'Приблизить',exact:true}).click()
  const camera=page.getByRole('button',{name:'Снимок города',exact:true})
  const dialog=page.getByRole('dialog',{name:'Снимок города'})
  const image=dialog.getByRole('img',{name:'Снимок города'})
  await camera.click()
  const day=await luminance(image)
  expect(day).toBeGreaterThan(100)
  await dialog.getByRole('button',{name:'Закрыть',exact:true}).click()
  const lighting=page.getByRole('button',{name:'Сменить освещение'})
  await lighting.click()
  await expect(lighting).toContainText('Ночь')
  await expect.poll(async()=>{
    await camera.click()
    const value=await luminance(image)
    await dialog.getByRole('button',{name:'Закрыть',exact:true}).click()
    return value
  }).toBeLessThan(day*.62)
  await camera.click()
  await expect(dialog.getByRole('button',{name:'Поделиться снимком'})).toHaveCount(0)
  const dimensions=await page.getByTestId('city-canvas').evaluate((canvas:HTMLCanvasElement)=>[canvas.width,canvas.height])
  const [download]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('link',{name:'Скачать PNG'}).click()])
  expect(download.suggestedFilename()).toBe('mini-city.png')
  const png=await readFile((await download.path())!)
  expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]))
  expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual(dimensions)
})

test('hands the actual PNG to Web Share and keeps download available after a refusal',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'canShare',{value:(data:ShareData)=>data.files?.[0]?.type==='image/png'})
    Object.defineProperty(navigator,'share',{value:async (data:ShareData)=>{
      const file=data.files?.[0]
      document.body.dataset.shareActivation=String(navigator.userActivation.isActive)
      document.body.dataset.sharedFile=file?.name
      document.body.dataset.sharedBytes=String(file?.size)
      throw new DOMException('Share unavailable','NotAllowedError')
    }})
  })
  await page.goto('./')
  await expect(page.locator('.scene[data-ready=true]')).toBeVisible()
  await page.getByRole('button',{name:'Снимок города',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Снимок города'})
  await dialog.getByRole('button',{name:'Поделиться снимком'}).click()
  await expect(page.locator('body')).toHaveAttribute('data-share-activation','true')
  await expect(page.locator('body')).toHaveAttribute('data-shared-file','mini-city.png')
  expect(Number(await page.locator('body').getAttribute('data-shared-bytes'))).toBeGreaterThan(1000)
  await expect(dialog.getByRole('status')).toContainText('Скачайте PNG')
  await expect(dialog.getByRole('link',{name:'Скачать PNG'})).toBeVisible()
})
