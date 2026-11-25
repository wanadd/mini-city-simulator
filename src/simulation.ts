export const SIZE = 20
export const CELL_COUNT = SIZE * SIZE
export const HISTORY_LIMIT = 48
export const BUILDINGS = {
  house:   {label:'Жильё',     cost:650,  upkeep:5,  demand:3,  supply:0,   capacity:32, jobs:0},
  shop:    {label:'Торговля',  cost:950,  upkeep:9,  demand:6,  supply:0,   capacity:0,  jobs:34},
  factory: {label:'Завод',     cost:1550, upkeep:18, demand:11, supply:0,   capacity:0,  jobs:50},
  road:    {label:'Дорога',    cost:90,   upkeep:1,  demand:0,  supply:0,   capacity:0,  jobs:0},
  park:    {label:'Парк',      cost:380,  upkeep:4,  demand:0,  supply:0,   capacity:0,  jobs:0},
  power:   {label:'Энергия',   cost:2400, upkeep:38, demand:0,  supply:112, capacity:0,  jobs:0},
} as const

export type Building = keyof typeof BUILDINGS
export type Tile = Building | null
export type Tool = Building | 'inspect' | 'bulldoze'
export type Sample = {tick:number; budget:number; population:number; happiness:number; jobs:number}
export type City = {version:1; map:Tile[]; budget:number; population:number; tick:number; tax:number; history:Sample[]}
export type Edit = {index:number; before:Tile; after:Tile; amount:number}
type Result = {city:City; edit:Edit} | {error:string}

export const at = (x:number, z:number) => x + z * SIZE
export const coords = (index:number) => [index % SIZE, Math.floor(index / SIZE)] as const
const validIndex = (value:number) => Number.isInteger(value) && value >= 0 && value < CELL_COUNT
const clamp = (value:number, low:number, high:number) => Math.min(high, Math.max(low, value))

export function neighbors(index:number) {
  const [x,z] = coords(index)
  const result:number[] = []
  if (x > 0) result.push(index - 1)
  if (x < SIZE - 1) result.push(index + 1)
  if (z > 0) result.push(index - SIZE)
  if (z < SIZE - 1) result.push(index + SIZE)
  return result
}

export function infrastructure(map:Tile[]) {
  const network = new Int16Array(CELL_COUNT).fill(-1)
  const online = new Array<boolean>(CELL_COUNT).fill(false)
  const grids:{supply:number; demand:number; spare:number}[] = []
  map.forEach((tile,index) => {
    const [x,z] = coords(index)
    if (tile !== 'road' || network[index] >= 0 || (x && z && x !== SIZE - 1 && z !== SIZE - 1)) return
    const queue = [index]
    const id = grids.length
    grids.push({supply:0,demand:0,spare:0})
    network[index] = id
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const next of neighbors(queue[cursor])) {
        if (map[next] !== 'road' || network[next] >= 0) continue
        network[next] = id
        queue.push(next)
      }
    }
  })
  map.forEach((tile,index) => {
    if (!tile || tile === 'road') return
    const adjacent = neighbors(index).map(next => network[next]).filter(id => id >= 0)
    if (!adjacent.length) return
    const id = Math.min(...adjacent)
    network[index] = id
    grids[id].supply += BUILDINGS[tile].supply
    grids[id].demand += BUILDINGS[tile].demand
    grids[id].spare += BUILDINGS[tile].supply
  })

  for (const type of ['road','power','park','house','shop','factory'] as const) {
    map.forEach((tile,index) => {
      if (tile !== type || network[index] < 0) return
      const grid = grids[network[index]]
      const demand = BUILDINGS[tile].demand
      if (demand > grid.spare) return
      grid.spare -= demand
      online[index] = true
    })
  }
  return {network, online, grids}
}

export function measure(city:City) {
  const {network,online,grids} = infrastructure(city.map)
  let capacity = 0, jobs = 0, disconnected = 0, unpowered = 0, parks = 0, factories = 0
  let upkeep = 0, shops = 0
  const buildings = city.map.filter(tile => tile && tile !== 'road').length
  city.map.forEach((tile,index) => {
    if (!tile) return
    upkeep += BUILDINGS[tile].upkeep
    if (tile !== 'road' && network[index] < 0) disconnected++
    if (network[index] >= 0 && !online[index]) unpowered++
    if (!online[index]) return
    capacity += BUILDINGS[tile].capacity
    jobs += BUILDINGS[tile].jobs
    parks += Number(tile === 'park')
    shops += Number(tile === 'shop')
    factories += Number(tile === 'factory')
  })
  const pollution = clamp(Math.round(factories * 8 - parks * 4), 0, 100)
  const workforce = Math.floor(city.population * .56)
  const employed = Math.min(workforce, jobs)
  const unemployment = workforce ? Math.round((1 - employed / workforce) * 100) : 0
  const ecology = 100 - pollution
  const happiness = clamp(Math.round(75 + Math.min(parks,10) * 2 - pollution * .36 -
    (disconnected + unpowered) / Math.max(1,buildings) * 40 - unemployment * .3 - (city.tax - 8) * 1.6), 0, 100)
  const revenue = Math.floor((city.population * 24 + employed * 19 + Math.min(employed, shops * 34) * 6) * city.tax / 100)
  const net = revenue - upkeep
  const supply = grids.reduce((total,grid) => total + grid.supply, 0)
  const demand = grids.reduce((total,grid) => total + grid.demand, 0)
  return {online, network, supply, demand, capacity, jobs, employed, unemployment, ecology, happiness,
    upkeep, revenue, net, disconnected, unpowered, buildings}
}

export function advance(city:City):City {
  if (city.tick >= 1_000_000) return city
  const before = measure(city)
  const target = Math.round(Math.min(before.capacity, Math.max(0,before.jobs * 2 + 48)) * before.happiness / 100)
  const difference = target - city.population
  const population = city.population + Math.sign(difference) * Math.ceil(Math.abs(difference) / 9)
  const next = {...city, tick:city.tick + 1, population, budget:clamp(city.budget + before.net, -1e9, 1e9)}
  const stats = measure(next)
  return {...next, history:[...city.history,{tick:next.tick,budget:next.budget,population,happiness:stats.happiness,jobs:stats.jobs}].slice(-HISTORY_LIMIT)}
}

export function editCity(city:City, index:number, tool:Exclude<Tool,'inspect'>):Result {
  if (!validIndex(index)) return {error:'Выберите клетку на острове.'}
  const before = city.map[index]
  if (tool === 'bulldoze' && !before) return {error:'На этой клетке нечего сносить.'}
  if (tool !== 'bulldoze' && before) return {error:'Клетка занята. Сначала освободите участок.'}
  const after = tool === 'bulldoze' ? null : tool
  const amount = after ? BUILDINGS[after].cost : 0
  if (amount && city.budget < amount) return {error:'В казне недостаточно средств.'}
  const map = [...city.map]
  map[index] = after
  return {city:{...city,map,budget:city.budget - amount},edit:{index,before,after,amount}}
}

export function undoEdit(city:City, edit:Edit):City {
  if (city.map[edit.index] !== edit.after) return city
  const map = [...city.map]
  map[edit.index] = edit.before
  return {...city,map,budget:Math.min(1e9,city.budget + edit.amount)}
}

export function emptyCity():City {
  return {version:1,map:Array<Tile>(CELL_COUNT).fill(null),budget:18000,population:0,tick:0,tax:9,history:[]}
}

export function demoCity():City {
  const city = emptyCity()
  const put = (type:Building, positions:number[][]) => positions.forEach(([x,z]) => {city.map[at(x,z)] = type})
  for (let x = 0; x <= 17; x++) city.map[at(x,10)] = 'road'
  for (let x = 4; x <= 16; x++) city.map[at(x,5)] = 'road'
  for (let x = 4; x <= 13; x++) city.map[at(x,15)] = 'road'
  for (let z = 3; z <= 17; z++) city.map[at(4,z)] = 'road'
  for (let z = 5; z <= 16; z++) city.map[at(9,z)] = 'road'
  for (let z = 4; z <= 15; z++) city.map[at(13,z)] = 'road'
  for (let z = 5; z <= 10; z++) city.map[at(16,z)] = 'road'
  put('house', [[5,6],[6,6],[7,6],[8,7],[6,9],[7,9],[3,6],[3,8],[3,9],[5,11],[6,11],[7,11],[8,12],[5,14],[6,14],[7,14],[3,12],[3,14],[5,16],[7,16],[8,16],[10,14],[11,14],[10,16],[12,16],[4,18],[4,2],[5,4],[6,4],[7,4],[8,4]])
  put('shop', [[8,9],[10,9],[11,9],[12,9],[10,6],[11,6],[12,6],[12,7],[14,9],[11,11],[12,11],[10,11],[14,11],[12,4],[13,3]])
  put('factory', [[14,6],[15,6],[17,6],[17,8],[15,9]])
  put('power', [[16,4],[17,9],[3,16]])
  put('park', [[8,6],[11,4],[3,4],[5,8],[8,11],[12,14],[14,13],[13,16],[6,16],[2,9],[8,14],[14,4]])
  let result = {...city,budget:34150,population:650,tick:14}
  for (let i = 0; i < 12; i++) result = advance(result)
  const correction = 42850 - result.budget
  return {...result,budget:42850,history:result.history.map(sample=>({...sample,budget:sample.budget+correction}))}
}
