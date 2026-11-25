import {describe,expect,it} from 'vitest'
import {advance,at,BUILDINGS,demoCity,editCity,emptyCity,infrastructure,measure,undoEdit,type City,type Tool} from '../src/simulation'
import {deserialize,readShare,serialize,shareURL} from '../src/persistence'

function place(city:City,x:number,z:number,tool:Exclude<Tool,'inspect'>) {
  const result=editCity(city,at(x,z),tool)
  if ('error' in result) throw new Error(result.error)
  return result
}
function block() {
  let city=emptyCity()
  for(let x=0;x<7;x++) city=place(city,x,1,'road').city
  return city
}

describe('construction',()=>{
  it('charges once, rejects occupied/out-of-range plots and keeps source immutable',()=>{
    const source=emptyCity()
    const {city}=place(source,0,0,'house')
    expect(source.map[0]).toBeNull()
    expect(city.map[0]).toBe('house')
    expect(city.budget).toBe(source.budget-BUILDINGS.house.cost)
    expect(editCity(city,0,'park')).toHaveProperty('error')
    expect(editCity(city,400,'road')).toHaveProperty('error')
    expect(editCity(city,-1,'road')).toHaveProperty('error')
    expect(editCity(city,1.5,'road')).toHaveProperty('error')
  })
  it('rejects an unaffordable purchase and an empty demolition',()=>{
    const source={...emptyCity(),budget:89}
    expect(editCity(source,0,'road')).toHaveProperty('error')
    expect(editCity(source,0,'bulldoze')).toHaveProperty('error')
  })
  it('undoes construction and demolition without rewinding time, income or other cells',()=>{
    const start=emptyCity()
    const {city,edit}=place(start,0,0,'road')
    const after=advance(place(city,1,0,'road').city)
    const undone=undoEdit(after,edit)
    expect(undone.tick).toBe(after.tick)
    expect(undone.map.slice(0,2)).toEqual([null,'road'])
    expect(undone.budget).toBe(after.budget+90)
    const demolition=place(after,1,0,'bulldoze')
    expect(undoEdit(demolition.city,demolition.edit)).toEqual(after)
  })
})

describe('infrastructure',()=>{
  it('demands a cardinal path to the island edge and a power plant on the same network',()=>{
    let city=place(block(),1,2,'house').city
    city=place(city,2,2,'power').city
    expect(measure(city)).toMatchObject({capacity:32,demand:3,supply:112,disconnected:0})
    city=place(city,0,1,'bulldoze').city
    expect(measure(city)).toMatchObject({capacity:0,demand:0,supply:0,disconnected:2})
  })
  it('does not share electric capacity between disconnected coastal road networks',()=>{
    let city=place(block(),1,2,'power').city
    city=place(city,19,12,'road').city
    city=place(city,18,12,'house').city
    expect(measure(city)).toMatchObject({capacity:0,supply:112,demand:3,unpowered:1})
  })
  it('allocates scarce power to homes first and parks work without consuming power',()=>{
    let city=emptyCity()
    for(let x=0;x<20;x++) {
      city.map[at(x,1)] = 'road'
      city.map[at(x,2)] = x===0 ? 'power' : x===1 ? 'park' : 'factory'
      city.map[at(x,0)] = 'house'
    }
    const {online}=infrastructure(city.map)
    expect(online[at(1,2)]).toBe(true)
    expect(online.slice(0,20)).toEqual(Array(20).fill(true))
    expect(measure(city)).toMatchObject({capacity:640,supply:112,demand:258,unpowered:14})
  })
})

describe('economy',()=>{
  it('grows a connected residential block, with exact revenue and upkeep accounting',()=>{
    let city=place(block(),1,2,'power').city
    city=place(city,2,2,'house').city
    city=place(city,3,2,'shop').city
    const before=measure(city)
    const grown=advance(city)
    expect(grown.budget).toBe(city.budget+before.revenue-before.upkeep)
    expect(grown.population).toBeGreaterThan(0)
    expect(measure(grown).employed).toBeLessThanOrEqual(before.jobs)
  })
  it('connects taxes, employment and pollution to satisfaction',()=>{
    let city={...block(),population:34}
    city=place(city,1,2,'power').city
    city=place(city,2,2,'house').city
    const baseline=measure(city)
    city=place(city,3,2,'factory').city
    const industrial=measure(city)
    expect(industrial.unemployment).toBeLessThan(baseline.unemployment)
    expect(industrial.ecology).toBeLessThan(baseline.ecology)
    city=place(city,4,2,'park').city
    expect(measure(city).ecology).toBeGreaterThan(industrial.ecology)
    const taxes=measure({...city,tax:20})
    expect(taxes.revenue).toBeGreaterThan(measure(city).revenue)
    expect(taxes.happiness).toBeLessThan(measure(city).happiness)
  })
  it('is deterministic and bounds history to 48 days',()=>{
    const run=()=>Array.from({length:100}).reduce<City>(city=>advance(city),demoCity())
    const first=run()
    expect(first).toEqual(run())
    expect(first.history).toHaveLength(48)
    expect(first.history.at(-1)?.tick).toBe(first.tick)
  })
  it('starts the demonstration with all districts connected and adequately supplied',()=>{
    expect(measure(demoCity())).toMatchObject({unpowered:0,disconnected:0,unemployment:0})
  })
})

describe('persistence',()=>{
  it('round-trips the entire local state and validated share independent of source mutations',()=>{
    const city = demoCity()
    expect(deserialize(serialize(city))).toEqual(city)
    const url=new URL(shareURL(city,'https://example.org/game/?x=ignore#previous'))
    expect(url.pathname).toEqual('/game/')
    expect(url.search).toEqual('')
    const restored=readShare(url.hash)!
    expect(restored).toEqual(city)
    restored.map[0]='house'
    expect(restored.map).not.toEqual(city.map)
  })
  it('keeps long-running links compact and preserves negative balances',()=>{
    const city=Array.from({length:80}).reduce<City>(state=>advance(state),{...demoCity(),budget:-900_000_000})
    const url=new URL(shareURL(city,'https://example.com/mini-city-simulator/'))
    expect(url.href.length).toBeLessThan(2400)
    expect(readShare(url.hash)).toEqual(city)
  })
  it('rejects unsupported versions, malformed or oversize grids, unsafe numbers and unordered history',()=>{
    const city=demoCity()
    const fields=JSON.parse(serialize(city))
    for(const fieldsWithError of [[2,...fields.slice(1)],[1,'7'.repeat(400),...fields.slice(2)],[1,'0',...fields.slice(2)],
      [...fields.slice(0,2),1e10,...fields.slice(3)],[...fields.slice(0,5),0,fields[6]],[...fields.slice(0,6),[...city.history].reverse()]]) {
      expect(()=>deserialize(JSON.stringify(fieldsWithError))).toThrow()
    }
    expect(()=>deserialize('x'.repeat(24001))).toThrow()
    expect(()=>readShare('#city=%')).toThrow()
    expect(()=>readShare('#city=a'.padEnd(7000,'a'))).toThrow()
    expect(readShare('#other')).toBeUndefined()
  })
})
