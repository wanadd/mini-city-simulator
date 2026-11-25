import {BUILDINGS,CELL_COUNT,HISTORY_LIMIT, type City,type Sample,type Tile} from './simulation'

export const SAVE_KEY = 'mini-city-v1'
const tiles:Tile[] = [null,...Object.keys(BUILDINGS) as Exclude<Tile,null>[]]
const integer = (value:unknown, min:number, max:number):value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
const validSample = (item:unknown, tick:number):item is Sample => {
  if (!item || typeof item !== 'object') return false
  const sample = item as Partial<Sample>
  return integer(sample.tick,0,tick) && integer(sample.budget,-1e9,1e9)
    && integer(sample.population,0,CELL_COUNT * 32) && integer(sample.happiness,0,100)
    && integer(sample.jobs,0,CELL_COUNT * 50)
}

export function serialize(city:City) {
  return JSON.stringify([city.version,city.map.map(tile => tiles.indexOf(tile)).join(''),city.budget,city.population,city.tick,city.tax,city.history])
}

export function deserialize(data:string):City {
  if (data.length > 24000) throw new Error('Сохранение слишком большое.')
  const parsed:unknown = JSON.parse(data)
  if (!Array.isArray(parsed) || parsed.length !== 7) throw new Error('Неверный формат сохранения.')
  const [version,grid,budget,population,tick,tax,history] = parsed
  if (version !== 1 || typeof grid !== 'string' || grid.length !== CELL_COUNT || /[^0-6]/.test(grid)
    || !integer(budget,-1e9,1e9) || !integer(population,0,CELL_COUNT * 32)
    || !integer(tick,0,1_000_000) || !integer(tax,1,20)
    || !Array.isArray(history) || history.length > HISTORY_LIMIT
    || !history.every((item,index) => validSample(item,tick) && (!index || history[index - 1].tick < item.tick))) {
    throw new Error('Сохранение повреждено или создано в другой версии.')
  }
  const samples = history.map(({tick,budget,population,happiness,jobs}) => ({tick,budget,population,happiness,jobs}))
  return {version,map:Array.from(grid,digit => tiles[Number(digit)]),budget,population,tick,tax,history:samples}
}

export function shareURL(city:City, href:string) {
  const url = new URL(href)
  url.search = ''
  let previous = city.tick
  const history = [...city.history].reverse().map(sample => {
    const entry = [previous - sample.tick,sample.budget,sample.population,sample.happiness,sample.jobs]
    previous = sample.tick
    return entry.map(number => number.toString(36)).join(',')
  }).join(';')
  const data = JSON.parse(serialize(city)).slice(0,6).join('|')
  url.hash = 'city=' + btoa(data + '|' + history).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
  return url.href
}

export function readShare(hash:string):City | undefined {
  if (!hash.startsWith('#city=')) return
  const token = hash.slice(6)
  if (token.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('Ссылка на город повреждена.')
  const fields = atob(token.replaceAll('-','+').replaceAll('_','/')).split('|')
  if (fields.length !== 7) throw new Error('Неверный формат ссылки.')
  const [version,grid,budget,population,tick,tax,encoded] = fields
  let previous = Number(tick)
  const history = encoded ? encoded.split(';').map(entry => {
    if (!/^-?[0-9a-z]+(,-?[0-9a-z]+){4}$/.test(entry)) throw new Error('История города повреждена.')
    const [distance,budget,population,happiness,jobs] = entry.split(',').map(number => parseInt(number,36))
    previous -= distance
    return {tick:previous,budget,population,happiness,jobs}
  }).reverse() : []
  return deserialize(JSON.stringify([Number(version),grid,Number(budget),Number(population),Number(tick),Number(tax),history]))
}
