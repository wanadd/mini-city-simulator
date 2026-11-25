import {useState} from 'react'
import type {Sample} from './simulation'

export const number = (value:number) => new Intl.NumberFormat('ru-RU').format(value)
export const signed = (value:number) => (value >= 0 ? '+' : '−') + number(Math.abs(value))
const series = {
  budget:{name:'Бюджет',unit:'₽',color:'#29977f'},
  population:{name:'Население',unit:'чел.',color:'#387fa0'},
  jobs:{name:'Рабочие места',unit:'мест',color:'#ad6238'},
  happiness:{name:'Довольство',unit:'%',color:'#8669af'},
}
type Metric = keyof typeof series

export function Chart({history,current}:{history:Sample[]; current:Sample}) {
  const [metric,setMetric] = useState<Metric>('budget')
  const [inspect,setInspect] = useState<number|null>(null)
  const data = history.at(-1)?.tick === current.tick ? [...history.slice(0,-1),current] : [...history,current]
  const key = series[metric]
  const values = data.map(item => item[metric])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const step = Math.max(1,Math.ceil((max-min) / 3))
  const floor = max === min ? min - step : min
  const ceil = floor + step*3
  const first = data[0].tick, last = current.tick
  const plot = {left:75,right:580,top:16,bottom:153}
  const x = (tick:number) => plot.left+(tick-first)/Math.max(1,last-first)*(plot.right-plot.left)
  const y = (value:number) => plot.bottom-(value-floor)/(ceil-floor)*(plot.bottom-plot.top)
  const line = data.map((sample,index) => `${index?'L':'M'}${x(sample.tick)},${y(sample[metric])}`).join(' ')
  const active = data[Math.min(inspect ?? data.length-1,data.length-1)]
  return <div className="chart">
    <div className="chart-tabs" aria-label="Показатель графика">
      {(Object.keys(series) as Metric[]).map(id => <button key={id} aria-pressed={id===metric} onClick={()=>{setMetric(id);setInspect(null)}}>{series[id].name}</button>)}
    </div>
    <div className="chart-value"><strong>{number(active[metric])} {key.unit}</strong><span>Ход {active.tick+1}</span></div>
    <svg viewBox="0 0 600 184" role="img" aria-label={`График «${key.name}», ${key.unit}, ходы ${first+1}–${last+1}`} preserveAspectRatio="none">
      <defs><linearGradient id="plot-fill" x2="0" y2="1"><stop stopColor={key.color} stopOpacity=".23"/><stop offset="1" stopColor={key.color} stopOpacity=".025"/></linearGradient></defs>
      {[0,1,2,3].map(index => {
        const value = floor+step*index
        return <g key={index}><line x1={plot.left} x2={plot.right} y1={y(value)} y2={y(value)} stroke="#e3e9e2"/><text x={plot.left-8} y={y(value)+4} textAnchor="end">{number(value)}</text></g>
      })}
      <text x={plot.left} y="176">Ход {first+1}</text>{first!==last && <text x={plot.right} y="176" textAnchor="end">{last+1}</text>}
      {data.length>1 && <path d={`${line} L${x(last)},${plot.bottom} L${x(first)},${plot.bottom} Z`} fill="url(#plot-fill)"/>}
      <path d={line} stroke={key.color} strokeWidth="3" strokeLinecap="round" fill="none"/>
      <line x1={x(active.tick)} x2={x(active.tick)} y1={plot.top} y2={plot.bottom} stroke={key.color} strokeDasharray="3 4"/>
      <circle cx={x(active.tick)} cy={y(active[metric])} r="5" fill={key.color} stroke="white" strokeWidth="2"/>
      {data.map((sample,index)=>{
        const left = index ? (x(data[index-1].tick)+x(sample.tick))/2 : plot.left-8
        const right = index === data.length-1 ? plot.right+8 : (x(sample.tick)+x(data[index+1].tick))/2
        return <rect key={sample.tick} x={left} width={right-left} y={plot.top} height={plot.bottom-plot.top} fill="transparent" onPointerMove={()=>setInspect(index)} onPointerDown={()=>setInspect(index)}/>
      })}
    </svg>
    <input type="range" aria-label="Ход на графике" min="0" max={Math.max(1,data.length-1)} value={Math.min(inspect??data.length-1,data.length-1)} disabled={data.length<2} onChange={event=>setInspect(Number(event.target.value))}/>
  </div>
}
