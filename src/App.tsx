import {useCallback,useEffect,useMemo,useRef,useState,type KeyboardEvent,type ReactNode,type RefObject} from 'react'
import {Activity,ArrowDownToLine,ArrowUpRight,BarChart3,BriefcaseBusiness,Building2,Camera,Check,ChevronDown,CircleHelp,Coins,Compass,Copy,Factory,Focus,FolderOpen,House,Leaf,Map,MapPin,Minus,Moon,MousePointer2,Pause,Play,Plus,Redo2,Save,Share2,Smile,Sun,Trees,TriangleAlert,Undo2,Users,X,Zap,Construction,Signpost,Globe2} from 'lucide-react'
import {advance,at,BUILDINGS,coords,demoCity,editCity,emptyCity,measure,SIZE,undoEdit,type Building,type City,type Edit,type Tool} from './simulation'
import {deserialize,readShare,SAVE_KEY,serialize,shareURL} from './persistence'
import {Chart,number,signed} from './Chart'
import {CityScene,type CameraCommand,type SceneSettings} from './scene'

const toolsList = [
  {id:'house',icon:House,color:'mint',detail:'До 32 жителей'},
  {id:'shop',icon:Building2,color:'blue',detail:'34 рабочих места'},
  {id:'factory',icon:Factory,color:'amber',detail:'50 рабочих мест'},
  {id:'road',icon:Signpost,color:'slate',detail:'Связь и электросеть'},
  {id:'park',icon:Trees,color:'green',detail:'Зелень и отдых'},
  {id:'power',icon:Zap,color:'yellow',detail:'112 ед. мощности'},
] as const
type Modal = 'stats' | 'share' | 'screenshot' | 'help' | 'demo' | 'new' | 'load'
type Lighting = 'auto'|'day'|'night'
const clearSharedAddress = () => {
  if (location.hash.startsWith('#city=')) history.replaceState(null,'',location.pathname+location.search)
}
const rate = (current:number) => current===0?'Пауза':current===1?'Обычная скорость':current===2?'Двойная скорость':'Четверная скорость'

function initialCity() {
  try {
    const imported = readShare(location.hash)
    if (imported) return {city:imported,imported:true}
  } catch {
    return {city:demoCity(),notice:'Ссылка повреждена. Открыт демогород.'}
  }
  try {
    const saved=localStorage.getItem(SAVE_KEY)
    if (saved) return {city:deserialize(saved)}
  } catch {
    return {city:demoCity(),notice:'Сохранение недоступно. Открыт демогород.'}
  }
  return {city:demoCity()}
}

function SceneView({settings,onPick,command,app}:{settings:SceneSettings;onPick:(index:number)=>void;command:{type:CameraCommand;seq:number}|null;app:RefObject<CityScene|null>}) {
  const container = useRef<HTMLDivElement>(null)
  const latest = useRef({settings,onPick})
  latest.current = {settings,onPick}
  const [failure,setFailure] = useState(false)
  const [attempt,setAttempt] = useState(0)
  useEffect(()=>{
    const host = container.current!
    const lost = (event:Event) => {event.preventDefault();setFailure(true)}
    try {
      app.current = new CityScene(host,latest.current.settings,index=>latest.current.onPick(index))
      host.addEventListener('webglcontextlost',lost,true)
    } catch (error) {
      console.error('WebGL initialization failed',error)
      setFailure(true)
    }
    return ()=>{
      host.removeEventListener('webglcontextlost',lost,true)
      app.current?.destroy()
      app.current = null
      delete host.dataset.ready
    }
  },[attempt,app])
  useEffect(()=>app.current?.update(settings),[settings,app])
  useEffect(()=>{if(command) app.current?.command(command.type)},[command,app])
  return <><div className="scene" ref={container}/>{failure && <div className="scene-error"><TriangleAlert/><strong>3D-карта недоступна</strong><span>Проверьте поддержку WebGL 2 и аппаратное ускорение.</span><button onClick={()=>{setFailure(false);setAttempt(value=>value+1)}}>Перезапустить карту</button></div>}</>
}

function ModalBox({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
  const element = useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    const dialog = element.current!
    dialog.showModal()
    return ()=>dialog.close()
  },[])
  return <dialog ref={element} className="dialog" onCancel={event=>{event.preventDefault();onClose()}} onClick={event=>{if(event.target===element.current) onClose()}} aria-labelledby="dialog-title">
    <div className="dialog-body"><header><h2 id="dialog-title">{title}</h2><button aria-label="Закрыть" className="icon-button" onClick={onClose}><X size={20}/></button></header>{children}</div>
  </dialog>
}

function Screenshot({file}:{file:File}) {
  const [url,setUrl] = useState('')
  const [message,setMessage] = useState('')
  const [sharing,setSharing] = useState(false)
  const payload = {files:[file]}
  const canShare = typeof navigator.share === 'function' && navigator.canShare?.(payload) === true

  useEffect(()=>{
    const preview = URL.createObjectURL(file)
    setUrl(preview)
    return ()=>URL.revokeObjectURL(preview)
  },[file])

  async function send() {
    setMessage('')
    setSharing(true)
    try {
      await navigator.share(payload)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setMessage('Не удалось открыть отправку. Скачайте PNG и прикрепите его к сообщению.')
      }
    } finally {
      setSharing(false)
    }
  }

  return <>
    {url && <img className="screenshot-preview" alt="Снимок города" src={url}/>}
    <div className="screenshot-actions">
      {url && <a className={canShare?'top-button':'primary'} href={url} download={file.name}><ArrowDownToLine size={17}/> Скачать PNG</a>}
      {canShare && <button className="primary" disabled={sharing} onClick={send}><Share2 size={17}/> Поделиться снимком</button>}
    </div>
    {message && <p role="status">{message}</p>}
  </>
}

export function App() {
  const [initial] = useState(initialCity)
  const [city,setCity] = useState(initial.city)
  const [tool,setTool] = useState<Tool>('inspect')
  const [selected,setSelected] = useState(-1)
  const [edits,setEdits] = useState<Edit[]>([])
  const [speed,setSpeed] = useState(initial.imported ? 0 : 1)
  const [lighting,setLighting] = useState<Lighting>('auto')
  const [modal,setModal] = useState<Modal|null>(null)
  const [screenshot,setScreenshot] = useState<File|null>(null)
  const [capturing,setCapturing] = useState(false)
  const scene = useRef<CityScene|null>(null)
  const [menu,setMenu] = useState(false)
  const [notice,setNotice] = useState(initial.notice ?? (initial.imported ? 'Открыта независимая копия города.' : ''))
  const [link,setLink] = useState('')
  const [copied,setCopied] = useState(false)
  const [command,setCommand] = useState<{type:CameraCommand;seq:number}|null>(null)
  const shareField = useRef<HTMLInputElement>(null)
  const stateRef = useRef(city)
  stateRef.current = city
  const stats = useMemo(()=>measure(city),[city])
  const cityHours = 9 + city.tick * 2
  const utc = cityHours % 24
  const sun = Math.max(0,Math.min(1,(utc-5)/3,(21-utc)/3))
  const light = lighting === 'auto' ? sun : lighting === 'day' ? 1 : 0
  const settings = useMemo<SceneSettings>(()=>({
    map:city.map,online:stats.online,selected,tool,light,speed,
    canBuild:tool==='inspect'||tool==='bulldoze'||city.budget>=BUILDINGS[tool].cost,
  }),[city.map,city.budget,stats.online,selected,tool,light,speed])
  const close = useCallback(()=>{setModal(null);setScreenshot(null)},[])

  useEffect(()=>{
    const importLink = () => {
      try {
        const imported = readShare(location.hash)
        if (!imported) return
        setCity(imported)
        setSelected(-1)
        setTool('inspect')
        setEdits([])
        setSpeed(0)
        setLighting('auto')
        setModal(null)
        setScreenshot(null)
        setMenu(false)
        setCommand(previous=>({type:'reset',seq:(previous?.seq ?? 0)+1}))
        setNotice('Открыта независимая копия города.')
      } catch {
        setNotice('Не удалось открыть город по этой ссылке.')
      }
    }
    window.addEventListener('hashchange',importLink)
    return ()=>window.removeEventListener('hashchange',importLink)
  },[])

  useEffect(()=>{
    if (!speed || modal==='load'||modal==='new'||modal==='demo') return
    const timer = window.setInterval(()=>setCity(current=>advance(current)),6500/speed)
    return ()=>clearInterval(timer)
  },[speed,modal])

  useEffect(()=>{
    if (!notice) return
    const timer = window.setTimeout(()=>setNotice(''),4200)
    return ()=>clearTimeout(timer)
  },[notice])

  useEffect(()=>{
    if (!menu) return
    const closeMenu = (event:PointerEvent) => {
      if (!(event.target as HTMLElement).closest('.menu-wrap')) setMenu(false)
    }
    const escape = (event:globalThis.KeyboardEvent) => {if (event.key === 'Escape') setMenu(false)}
    window.addEventListener('pointerdown',closeMenu)
    window.addEventListener('keydown',escape)
    return ()=>{
      window.removeEventListener('pointerdown',closeMenu)
      window.removeEventListener('keydown',escape)
    }
  },[menu])

  function pick(index:number) {
    setSelected(index)
    if (tool==='inspect') return
    const result = editCity(stateRef.current,index,tool)
    if ('error' in result) return setNotice(result.error)
    stateRef.current = result.city
    setCity(result.city)
    setEdits(list=>[...list,result.edit].slice(-100))
    setNotice(tool==='bulldoze'?'Участок освобождён.':`Построено · ${BUILDINGS[tool].label}`)
  }

  function undo() {
    const last = edits.at(-1)
    if (!last) return
    setCity(current=>undoEdit(current,last))
    setEdits(edits.slice(0,-1))
    setSelected(last.index)
    setNotice('Последнее действие отменено.')
  }

  function moveCamera(type:CameraCommand) {
    setCommand(previous=>({type,seq:(previous?.seq ?? 0)+1}))
  }

  function keys(event:KeyboardEvent) {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Escape') {setTool('inspect');return}
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      pick(selected < 0 ? at(9,9) : selected)
      return
    }
    const [x,z] = coords(selected < 0 ? at(9,9) : selected)
    const steps:Record<string,number[]> = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}
    if (event.key === '+' || event.key === '-') {
      moveCamera(event.key==='+'?'in':'out')
      event.preventDefault()
    }
    const step = steps[event.key]
    if (!step) return
    event.preventDefault()
    const bound = (n:number) => Math.max(0,Math.min(SIZE-1,n))
    setSelected(at(bound(x+step[0]),bound(z+step[1])))
  }

  function save() {
    setMenu(false)
    try {
      localStorage.setItem(SAVE_KEY,serialize(city))
      clearSharedAddress()
      setNotice('Город сохранён в этом браузере.')
    } catch {
      setNotice('Браузер не разрешил сохранить город.')
    }
  }

  function restore(kind:'load'|'demo'|'new') {
    setModal(null)
    try {
      let next:City
      if (kind==='load') {
        const data = localStorage.getItem(SAVE_KEY)
        if (!data) return setNotice('В этом браузере ещё нет сохранения.')
        next = deserialize(data)
      } else next = kind==='demo' ? demoCity() : emptyCity()
      setCity(next)
      setEdits([])
      setTool('inspect')
      setSelected(-1)
      setLighting('auto')
      clearSharedAddress()
      moveCamera('reset')
      setNotice(kind==='demo'?'Демогород открыт.':kind==='load'?'Сохранение загружено.':'Новый город готов к строительству.')
    } catch {
      setNotice('Не удалось прочитать сохранение.')
    }
  }

  async function capture() {
    if (!scene.current) {
      setNotice('Снимок будет доступен после загрузки карты.')
      return
    }
    setCapturing(true)
    try {
      const blob = await scene.current.capture()
      setScreenshot(new File([blob],'mini-city.png',{type:'image/png'}))
      setModal('screenshot')
    } catch {
      setNotice('Не удалось сделать снимок. Попробуйте ещё раз после загрузки карты.')
    } finally {
      setCapturing(false)
    }
  }

  function openShare() {
    setLink(shareURL(city,location.href))
    setCopied(false)
    setModal('share')
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      shareField.current?.select()
      if (document.execCommand('copy')) setCopied(true)
      else setNotice('Ссылка выделена для ручного копирования.')
    }
  }

  const [x,z] = coords(selected)
  const tile = city.map[selected]
  const issues = [
    stats.unpowered > 0 && {title:'Не хватает электричества',text:`Без питания · ${stats.unpowered}. Добавьте электростанцию в нужном районе.`,icon:Zap},
    stats.disconnected > 0 && {title:'Участки без дороги',text:`Участков без доступа · ${stats.disconnected}. Соедините их с краем острова.`,icon:Signpost},
    stats.unemployment > 15 && {title:'Высокая безработица',text:`Безработица ${stats.unemployment}%. Откройте магазины или предприятия.`,icon:BriefcaseBusiness},
    stats.ecology < 65 && {title:'Загрязнение воздуха',text:`Экология ${stats.ecology}%. Новые парки снизят загрязнение.`,icon:Leaf},
    stats.net < 0 && {title:'Расходы превышают доходы',text:`Баланс за ход ${signed(stats.net)} ₽. Проверьте налоги и расходы.`,icon:Coins},
  ].filter(item=>item!==false)
  const activeTool = toolsList.find(item=>item.id===tool)
  const Metric = ({label,value,foot,icon:Icon,color}:{label:string;value:string;foot:ReactNode;icon:typeof Coins;color:string}) =>
    <button className="metric-card" onClick={()=>setModal('stats')} aria-label={`${label} ${value}, открыть статистику`}>
      <span className={`metric-icon ${color}`}><Icon size={20} strokeWidth={1.9}/></span>
      <span className="metric-text"><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-foot">{foot}</span></span>
    </button>

  return <div className="app">
    <header className="topbar">
      <a className="brand" href={location.pathname} onClick={event=>{event.preventDefault();moveCamera('reset')}} aria-label="Mini City Simulator, центрировать карту">
        <span className="brand-mark"><Building2 size={24} strokeWidth={2.35}/></span><span><b>Mini City</b><small>SIMULATOR</small></span>
      </a>
      <nav className="top-nav" aria-label="Режимы игры">
        <button className={modal!=='stats'?'current':''} onClick={()=>{close();setTool('inspect')}}><Map size={16}/> Город</button>
        <button className={modal==='stats'?'current':''} onClick={()=>setModal('stats')}><BarChart3 size={16}/> Статистика</button>
      </nav>
      <div className="top-actions">
        <button className="icon-button help-top" title="Как играть" aria-label="Как играть" onClick={()=>setModal('help')}><CircleHelp size={20}/></button>
        <button className="top-button save-top" aria-label="Сохранить" onClick={save}><Save size={17}/><span>Сохранить</span></button>
        <button className="primary share-top" aria-label="Поделиться городом" onClick={openShare}><Share2 size={17}/><span>Поделиться<span className="share-extra"> городом</span></span></button>
      </div>
    </header>

    <main className="layout">
      <section className="heading" aria-label="Обзор города">
        <div><div className="location"><MapPin size={13}/> ОСТРОВНОЙ РЕГИОН</div><h1>Лазурная бухта</h1></div>
        <div className="menu-wrap">
          <button className="top-button menu-trigger" aria-label="Управление городом" aria-expanded={menu} onClick={()=>setMenu(!menu)}><FolderOpen size={17}/><span>Управление городом</span><ChevronDown size={15}/></button>
          {menu && <div className="dropdown">
            <button onClick={()=>{setMenu(false);setModal('load')}}><ArrowDownToLine size={16}/> Загрузить сохранение</button>
            <button onClick={()=>{setMenu(false);setModal('demo')}}><Globe2 size={16}/> Открыть демогород</button>
            <button onClick={()=>{setMenu(false);setModal('new')}}><Plus size={16}/> Новый город</button>
            <button onClick={()=>{setMenu(false);setModal('help')}}><CircleHelp size={16}/> Как играть</button>
          </div>}
        </div>
      </section>

      <section className="metrics" aria-label="Показатели города">
        <Metric label="Бюджет" value={`${number(city.budget)} ₽`} icon={Coins} color="mint" foot={<span className={stats.net<0?'negative':'positive'}>{stats.net>=0&&<ArrowUpRight size={13}/>} {signed(stats.net)} ₽ / ход</span>}/>
        <Metric label="Население" value={number(city.population)} icon={Users} color="blue" foot={`${number(stats.jobs)} рабочих мест`}/>
        <Metric label="Электричество" value={`${stats.demand} / ${stats.supply}`} icon={Zap} color="yellow" foot={stats.unpowered?<span className="negative">Дефицит в сети</span>:'Нагрузка сети'}/>
        <Metric label="Довольство" value={`${stats.happiness}%`} icon={Smile} color="peach" foot={`Экология ${stats.ecology}%`}/>
      </section>

      <div className="workspace">
        <section className="map-panel" data-night={light<.5} aria-label="Карта города">
          <div className="map-focus" tabIndex={0} role="region" aria-label="Управление картой" aria-describedby="map-help" onKeyDown={keys}>
            <SceneView settings={settings} onPick={pick} command={command} app={scene}/>
          </div>
          <div className="map-heading"><span className="compass-tile"><Compass size={21}/></span><div><strong>Карта города</strong><span>20 × 20 клеток</span></div></div>
          <div className="map-light">
            <button className="snapshot-button" title="Снимок города" aria-label="Снимок города" disabled={capturing} onClick={capture}><Camera size={18}/><span>Снимок</span></button>
            <button title="Сменить освещение" aria-label="Сменить освещение" onClick={()=>setLighting(current=>current==='auto'?'night':current==='night'?'day':'auto')}>
              {light<.5?<Moon size={16}/>:<Sun size={17}/>}<span>{lighting==='auto'?'Авто':lighting==='night'?'Ночь':'День'}</span>
            </button>
          </div>
          <div className="camera-tools" aria-label="Камера">
            <button title="Приблизить" aria-label="Приблизить" onClick={()=>moveCamera('in')}><Plus size={19}/></button>
            <button title="Отдалить" aria-label="Отдалить" onClick={()=>moveCamera('out')}><Minus size={19}/></button>
            <button title="Повернуть камеру" aria-label="Повернуть камеру" onClick={()=>moveCamera('rotate')}><Redo2 size={19}/></button>
            <button title="Центрировать камеру" aria-label="Центрировать камеру" onClick={()=>moveCamera('reset')}><Focus size={19}/></button>
          </div>
          <div className="map-bottom">
            <div className="time-control">
              <span className="date" data-testid="game-clock"><strong>День {1+Math.floor(cityHours/24)}</strong><small>{String(utc).padStart(2,'0')}:00</small></span>
              <div className="speeds" aria-label="Скорость симуляции">
                {[0,1,2,4].map(value=><button key={value} title={rate(value)} aria-label={rate(value)} aria-pressed={speed===value} onClick={()=>setSpeed(value)}>{value===0?<Pause size={15}/>:value===1?<Play size={15}/>:<>{value}×</>}</button>)}
              </div>
            </div>
            <span className="map-caption"><span className="live-dot"/>{speed?'Симуляция идёт':'Симуляция на паузе'}</span>
          </div>
        </section>

        <aside className="sidebar">
          <section className="panel build-panel" aria-label="Строительство">
            <div className="panel-heading"><span className="panel-heading-icon"><Construction size={20}/></span><div><h2>Строительство</h2><p>Выберите объект и клетку на карте</p></div></div>
            <div className="build-grid">
              {toolsList.map(({id,icon:Icon,color,detail})=><button key={id} className="build-card" title={detail} aria-pressed={tool===id} onClick={()=>setTool(tool===id?'inspect':id)}>
                <span className={`build-icon ${color}`}><Icon size={23} strokeWidth={1.8}/></span><b>{BUILDINGS[id].label}</b><small>{number(BUILDINGS[id].cost)} ₽</small>
              </button>)}
            </div>
            <div className="build-actions">
              <button title="Осмотр участка" aria-label="Осмотр участка" aria-pressed={tool==='inspect'} onClick={()=>setTool('inspect')}><MousePointer2 size={17}/></button>
              <button title="Снести объект" aria-label="Снести объект" aria-pressed={tool==='bulldoze'} onClick={()=>setTool(tool==='bulldoze'?'inspect':'bulldoze')}><Construction size={16}/> Снос</button>
              <button disabled={!edits.length} onClick={undo}><Undo2 size={16}/> Отмена</button>
            </div>
          </section>

          <section className="panel events" aria-label="Состояние города">
            <div className="panel-heading"><span className="panel-heading-icon spark"><Activity size={19}/></span><div><h2>Состояние города</h2></div><span className={`count ${issues.length ? 'has-issues':''}`}>{issues.length}</span></div>
            {issues.length ? <ul>{issues.map(({title,text,icon:Icon})=><li key={title}><Icon size={16}/><div><b>{title}</b><span>{text}</span></div></li>)}</ul>
              : <div className="all-good"><Check size={16}/><div><b>{stats.buildings?'Город в порядке':'Остров готов к застройке'}</b><span>{stats.buildings?'Серьёзных проблем нет':'Начните с дороги от берега'}</span></div></div>}
          </section>
          <section className="panel economy" aria-label="Доходы и расходы">
            <div className="panel-heading"><span className="panel-heading-icon"><Coins size={19}/></span><div><h2>Городская казна</h2><p>За ход · налог {city.tax}%</p></div><button className="icon-button open-economy" aria-label="Открыть графики казны" onClick={()=>setModal('stats')}><BarChart3 size={16}/></button></div>
            <div className="ledger"><span>Доходы</span><b className="positive">{signed(stats.revenue)} ₽</b></div>
            <div className="ledger"><span>Содержание</span><b>{stats.upkeep ? '−' : ''}{number(stats.upkeep)} ₽</b></div>
          </section>
        </aside>
      </div>
      <footer className="bottom-strip">
        <div className="plot-readout" aria-live="polite" data-testid="plot-readout">
          <MapPin size={15}/>{selected<0?<span>{activeTool?`${BUILDINGS[activeTool.id].label} · ${activeTool.detail}`:tool==='bulldoze'?'Укажите объект для сноса':'Участок не выбран'}</span>:<span><b>Клетка {x+1}:{z+1}</b> · {tile?BUILDINGS[tile].label:'Свободно'}{tile&&<span className={stats.online[selected]?'positive':'negative'}> · {stats.network[selected]<0?'Без дороги':stats.online[selected]?'Подключено':'Без питания'}</span>}</span>}
        </div>
        <div className="desktop-hint" id="map-help">Перетаскивание — поворот <span>·</span> Колесо — масштаб <span>·</span> Правая кнопка — сдвиг <span>·</span> Стрелки и Enter — выбор</div>
        <button className="mobile-hint" onClick={()=>setModal('help')}><CircleHelp size={15}/> Управление</button>
      </footer>
    </main>

    {notice && <div className="toast" role="status"><span className="live-dot"/>{notice}<button aria-label="Скрыть уведомление" onClick={()=>setNotice('')}><X size={16}/></button></div>}
    {modal==='stats' && <ModalBox title="Статистика города" onClose={close}>
      <div className="stats-mosaic">
        <div><span>Доход / ход</span><b>{number(stats.revenue)} ₽</b></div><div><span>Расход / ход</span><b>{number(stats.upkeep)} ₽</b></div><div><span>Занято / мест</span><b>{stats.employed} / {stats.jobs}</b></div><div><span>Жильё</span><b>{city.population} / {stats.capacity}</b></div>
      </div>
      <Chart history={city.history} current={{tick:city.tick,budget:city.budget,population:city.population,jobs:stats.jobs,happiness:stats.happiness}}/>
      <label className="tax"><span><b>Налоговая ставка</b><small>Высокий налог увеличивает доход и снижает довольство</small></span><output>{city.tax}%</output><input aria-label="Налоговая ставка" type="range" min="1" max="20" value={city.tax} onChange={event=>{const tax=Number(event.target.value);setCity(current=>({...current,tax}))}}/></label>
    </ModalBox>}
    {modal==='share' && <ModalBox title="Поделиться городом" onClose={close}>
      <p>Ссылка хранит карту, бюджет и историю города. Получатель откроет свою копию с симуляцией на паузе.</p>
      <label className="share-label" htmlFor="share-url">Ссылка на город</label>
      <div className="share-field"><input id="share-url" ref={shareField} readOnly value={link} onFocus={event=>event.target.select()}/><button className="primary" onClick={copy}>{copied?<Check size={17}/>:<Copy size={17}/>} {copied?'Скопировано':'Копировать'}</button></div>
    </ModalBox>}
    {modal==='screenshot' && screenshot && <ModalBox title="Снимок города" onClose={close}>
      <Screenshot file={screenshot}/>
    </ModalBox>}
    {modal==='help' && <ModalBox title="Как играть" onClose={close}>
      <ol className="help-list"><li><b>Подключите район.</b> Проложите дороги от края острова. Здания должны примыкать к этой сети.</li><li><b>Дайте энергию.</b> Подключите электростанцию к дороге района. Жильё получает энергию первым, затем торговля и заводы. Паркам питание не требуется.</li><li><b>Развивайте город.</b> Рабочие места и парки помогают росту. Заводы загрязняют воздух, а высокий налог снижает довольство.</li><li><b>Управляйте камерой.</b> Потяните карту для поворота. На компьютере используйте колесо и правую кнопку, на телефоне — щипок и сдвиг двумя пальцами. С клавиатуры выбирайте клетку стрелками и применяйте инструмент клавишей Enter.</li><li><b>Сделайте снимок.</b> Кнопка с камерой над картой сохраняет текущий вид города в PNG.</li></ol>
    </ModalBox>}
    {(modal==='new'||modal==='demo'||modal==='load') && <ModalBox title={modal==='new'?'Начать новый город?':modal==='demo'?'Открыть демогород?':'Загрузить сохранение?'} onClose={close}>
      <p>Текущий город будет заменён. Чтобы сохранить его, сначала нажмите «Сохранить».</p>
      <div className="dialog-actions"><button className="top-button" onClick={close}>Отмена</button><button className="primary" onClick={()=>restore(modal)}>{modal==='new'?'Начать':modal==='demo'?'Открыть':'Загрузить'}</button></div>
    </ModalBox>}
  </div>
}
