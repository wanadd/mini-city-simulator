import * as T from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {Batch,car,landscape,origin,seeded,tileModel,windows} from './models'
import {coords,neighbors,SIZE,type Tile,type Tool} from './simulation'

export type CameraCommand = 'in' | 'out' | 'rotate' | 'reset'
export type SceneSettings = {map:Tile[]; online:boolean[]; selected:number; tool:Tool; light:number; speed:number; canBuild:boolean}
type Drive = {model:T.Group; from:number; to:number; progress:number; speed:number}
const ground = new T.Plane(new T.Vector3(0,1,0),0)
const clear = (group:T.Object3D) => {
  group.traverse(object => {if (object instanceof T.Mesh) object.geometry.dispose()})
  group.removeFromParent()
}
const point = (index:number) => {
  const [x,z] = coords(index)
  return new T.Vector3(origin(x),0,origin(z))
}

export class CityScene {
  private scene = new T.Scene()
  private renderer:T.WebGLRenderer
  private camera = new T.OrthographicCamera(-20,20,15,-15,.1,160)
  private controls:OrbitControls
  private terrain = landscape()
  private city = new T.Group()
  private transient:T.Group | null = null
  private selection = new T.Mesh(new T.PlaneGeometry(.97,.97),new T.MeshBasicMaterial({color:0xfecc72,transparent:true,opacity:.45,depthWrite:false}))
  private grid = new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:0x68946d,transparent:true,opacity:.4}))
  private hitboxes:{box:T.Box3; index:number}[] = []
  private ray = new T.Raycaster()
  private cursor = new T.Mesh(new T.PlaneGeometry(.96,.96),new T.MeshBasicMaterial({color:0xfff1b4,transparent:true,opacity:.45,depthWrite:false}))
  private sun = new T.DirectionalLight(0xffe3b8,2.55)
  private fill = new T.HemisphereLight(0xdff7ff,0x909777,2.15)
  private observer:ResizeObserver
  private frame = 0
  private settings:SceneSettings
  private drives:Drive[] = []
  private random = seeded(500)
  private hovered = -1
  private pressed:{x:number;y:number;id:number} | null = null
  private pointerIds = new Set<number>()
  private time = 0
  private last = 0
  private rise = 0
  private activeLight:number
  private water = new T.Mesh(new T.PlaneGeometry(170,170),new T.ShaderMaterial({
    uniforms:{clock:{value:0},day:{value:1}},
    vertexShader:`
      varying vec2 world;
      void main() { world = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
    `,
    fragmentShader:`
      varying vec2 world;
      uniform float clock;
      uniform float day;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main() {
        vec2 p=world;
        vec2 q=abs(p)-vec2(10.05);
        float edge=length(max(q,0.))+min(max(q.x,q.y),0.);
        float rip=sin(p.x*.45+p.y*.32+clock*.25)*.15+sin(p.y*1.7-p.x*.64)*.07;
        vec3 ocean=mix(vec3(.36,.71,.75),vec3(.58,.81,.81),smoothstep(-21.,22.,p.y+p.x*.21));
        vec3 water=mix(vec3(.54,.80,.73),ocean,smoothstep(.15,3.4,edge+rip));
        water=mix(water,vec3(.87,.95,.81),.51*(1.-smoothstep(.02,.126,abs(edge-.46+rip))));
        water=mix(water,vec3(.81,.95,.88),.29*(1.-smoothstep(.02,.102,abs(edge-.94+rip))));
        vec2 shifted=vec2(p.x+clock*.09,p.y+p.x*.12);
        vec2 tile=vec2(shifted.x/2.25,shifted.y/.72);
        vec2 cell=floor(tile);
        vec2 local=fract(tile);
        float n=hash(cell);
        float aa=min(.045,fwidth(tile.y));
        float stripe=(1.-smoothstep(.015,.036+aa,abs(local.y-.48-n*.2)))
          *(1.-smoothstep(.21,.47,abs(local.x-.5)))*step(.66,n);
        water=mix(water,vec3(.91,.98,.94),stripe*.32);
        vec3 night=water*vec3(.12,.24,.34)+vec3(.017,.048,.081);
        gl_FragColor=vec4(mix(night,water,day),1.);
      }
    `,
  }))
  private boat:T.Group
  private smoke:T.InstancedMesh
  private factories:number[] = []
  private dummy = new T.Object3D()

  constructor(private host:HTMLDivElement, settings:SceneSettings, private onSelect:(index:number)=>void) {
    this.settings = settings
    this.activeLight = settings.light
    this.renderer = new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'})
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.65))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = T.PCFShadowMap
    this.renderer.toneMapping = T.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    const canvas = this.renderer.domElement
    canvas.setAttribute('aria-label','Трёхмерная карта города')
    canvas.dataset.testid = 'city-canvas'
    host.appendChild(canvas)
    this.water.rotation.x = -Math.PI/2
    this.water.position.y = -.76
    this.sun.position.set(-13,25,13)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1536,1536)
    Object.assign(this.sun.shadow.camera,{left:-17,right:17,top:17,bottom:-17,near:.2,far:65})
    this.sun.shadow.normalBias = .026
    this.sun.shadow.bias = -.00015
    this.sun.shadow.autoUpdate = false
    this.sun.shadow.needsUpdate = true
    this.sun.shadow.intensity = .74
    this.scene.add(this.terrain,this.water,this.fill,this.sun)
    const boat = new Batch()
    boat.add(0x3e6875,0,.05,0,.34,.21,.75,undefined)
    boat.add(0xf7e2ba,0,.136,.025,.365,.075,.69)
    boat.add(0xd47b5b,0,.222,-.13,.24,.13,.3)
    boat.add(0xf0dba9,0,.302,-.13,.27,.042,.32)
    boat.add(0x597b7f,0,.235,.025,.22,.052,.023)
    boat.add(0xe9e6c6,.06,.51,-.13,.02,.41,.021)
    boat.add(0xf5df9d,.14,.645,-.13,.17,.081,.016)
    this.boat = boat.mesh()
    this.scene.add(this.boat)
    this.smoke = new T.InstancedMesh(new T.IcosahedronGeometry(1,0),new T.MeshStandardMaterial({
      color:0xe7ddd0,transparent:true,opacity:.53,depthWrite:false,roughness:1,
    }), SIZE * SIZE * 3)
    this.smoke.count = 0
    this.smoke.frustumCulled = false
    this.scene.add(this.smoke)

    for (const mesh of [this.selection,this.cursor]) {
      mesh.rotation.x = -Math.PI/2
      mesh.visible = false
      mesh.renderOrder = 2
      this.scene.add(mesh)
    }
    this.controls = new OrbitControls(this.camera,canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = .115
    this.controls.minPolarAngle = .32
    this.controls.maxPolarAngle = 1.19
    this.controls.minZoom = .58
    this.controls.maxZoom = 2.65
    this.controls.screenSpacePanning = false
    this.controls.touches.ONE = T.TOUCH.ROTATE
    this.controls.touches.TWO = T.TOUCH.DOLLY_PAN
    const gridSegments:number[] = []
    for (let i = -SIZE/2; i <= SIZE/2; i++) {
      gridSegments.push(i,.008,-SIZE/2,i,.008,SIZE/2,-SIZE/2,.008,i,SIZE/2,.008,i)
    }
    this.grid.geometry.setAttribute('position',new T.Float32BufferAttribute(gridSegments,3))
    this.scene.add(this.grid)
    this.reset()
    this.rebuild()
    this.updateSelection()
    this.observer = new ResizeObserver(this.resize)
    this.observer.observe(host)
    this.resize()
    canvas.addEventListener('pointerdown',this.down)
    canvas.addEventListener('pointermove',this.move)
    canvas.addEventListener('pointerup',this.up)
    canvas.addEventListener('pointercancel',this.cancel)
    canvas.addEventListener('pointerleave',this.leave)
    this.frame = requestAnimationFrame(this.animate)
    host.dataset.ready = 'true'
  }

  private reset() {
    this.camera.position.set(20,28,25)
    this.controls.target.set(0,-.2,0)
    this.camera.zoom = 1
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  command(command:CameraCommand) {
    if (command === 'reset') return this.reset()
    if (command === 'rotate') {
      const offset = this.camera.position.clone().sub(this.controls.target)
      offset.applyAxisAngle(new T.Vector3(0,1,0),Math.PI/4)
      this.camera.position.copy(this.controls.target).add(offset)
      this.controls.update()
      return
    }
    this.camera.zoom = T.MathUtils.clamp(this.camera.zoom*(command==='in'?1.2:1/1.2),.58,2.65)
    this.camera.updateProjectionMatrix()
  }

  private resize = () => {
    const width = this.host.clientWidth, height = this.host.clientHeight
    if (!width || !height) return
    const aspect = width / height
    const half = Math.max(12.7,15.55 / aspect)
    this.camera.left = -half*aspect
    this.camera.right = half*aspect
    this.camera.top = half
    this.camera.bottom = -half
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width,height)
  }

  private rebuild(newIndex = -1) {
    clear(this.city)
    if (this.transient) clear(this.transient)
    this.transient = null
    const batch = new Batch()
    const {map,online} = this.settings
    this.hitboxes = []
    map.forEach((tile,index) => {
      const model = tileModel(tile,index,map,online[index])
      const [x,z] = coords(index)
      if (tile === 'shop' || tile === 'house' || tile === 'factory' || tile === 'power') {
        const r = seeded(index+910)
        const height = tile === 'shop' ? (3+Math.floor(r()*6))*.205+.18
          : tile === 'house' ? .61+r()*.18 : tile === 'factory' ? .51 : .39
        this.hitboxes.push({index,box:new T.Box3(
          new T.Vector3(origin(x)-.37,0,origin(z)-.34),
          new T.Vector3(origin(x)+.37,height,origin(z)+.34),
        )})
      }
      if (index === newIndex && tile && tile !== 'road' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.transient = model.mesh()
        this.transient.position.set(origin(x),-.7,origin(z))
        this.transient.scale.y = .15
        this.rise = 0
        this.scene.add(this.transient)
      } else batch.append(model,origin(x),origin(z))
    })
    this.city = batch.mesh()
    this.scene.add(this.city)
    this.renderer.shadowMap.needsUpdate = true
    this.sun.shadow.needsUpdate = true
    this.factories = map.flatMap((tile,index) => tile==='factory' && online[index] ? [index] : [])
    if (!this.drives.length || this.drives.some(drive => !online[drive.from] || !online[drive.to])) {
      this.drives.forEach(drive => clear(drive.model))
      const roads = map.flatMap((tile,index) => tile === 'road' && online[index] && neighbors(index).some(next => map[next] === 'road') ? [index] : [])
      this.drives = Array.from({length:Math.min(16,Math.ceil(roads.length/4))},(_,index) => {
        const from = roads[Math.floor(this.random()*roads.length)]
        const to = neighbors(from).find(next => map[next] === 'road')!
        const model = car(index)
        this.scene.add(model)
        return {model,from,to,progress:this.random(),speed:1.05+this.random()*.46}
      })
    }
  }

  update(settings:SceneSettings) {
    const before = this.settings
    this.settings = settings
    if (before.map !== settings.map) {
      const changes = settings.map.flatMap((tile,index) => before.map[index] === tile ? [] : [index])
      this.rebuild(changes.length === 1 && !before.map[changes[0]] ? changes[0] : -1)
    }
    this.updateSelection()
  }

  private updateSelection() {
    const {selected,tool,map,canBuild} = this.settings
    this.grid.visible = tool !== 'inspect'
    this.selection.position.copy(point(selected)).setY(.061)
    this.selection.visible = selected >= 0
    this.cursor.visible = this.hovered >= 0 && this.hovered !== selected
    if (this.cursor.visible) this.cursor.position.copy(point(this.hovered)).setY(.063)
    const highlight = (index:number) => tool === 'inspect' ? 0xfce49b :
      ((tool==='bulldoze' && map[index]) || (tool!=='bulldoze' && !map[index] && canBuild)) ? 0xcff4ab : 0xf19079
    this.selection.material.color.setHex(highlight(selected))
    this.cursor.material.color.setHex(highlight(this.hovered))
  }

  private pick(event:PointerEvent) {
    const bounds = this.renderer.domElement.getBoundingClientRect()
    this.ray.setFromCamera(new T.Vector2((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1),this.camera)
    const hit = this.ray.ray.intersectPlane(ground,new T.Vector3())
    if (!hit) return -1
    if (this.settings.tool === 'inspect' || this.settings.tool === 'bulldoze') {
      let nearest = this.ray.ray.origin.distanceToSquared(hit)
      let building = -1
      const intersection = new T.Vector3()
      for (const {box,index} of this.hitboxes) {
        if (!this.ray.ray.intersectBox(box,intersection)) continue
        const distance = this.ray.ray.origin.distanceToSquared(intersection)
        if (distance >= nearest) continue
        nearest = distance
        building = index
      }
      if (building >= 0) return building
    }
    const x = Math.floor(hit.x+SIZE/2), z = Math.floor(hit.z+SIZE/2)
    return x>=0 && z>=0 && x<SIZE && z<SIZE ? z*SIZE+x : -1
  }
  private down = (event:PointerEvent) => {
    this.pointerIds.add(event.pointerId)
    this.pressed = this.pointerIds.size === 1 && event.button === 0 ? {x:event.clientX,y:event.clientY,id:event.pointerId} : null
  }
  private move = (event:PointerEvent) => {
    if (this.pressed && Math.hypot(event.clientX-this.pressed.x,event.clientY-this.pressed.y)>5) this.pressed = null
    if (event.pointerType === 'mouse') {
      this.hovered = this.pick(event)
      this.updateSelection()
    }
  }
  private up = (event:PointerEvent) => {
    const index = this.pick(event)
    if (this.pressed?.id === event.pointerId && index >= 0) this.onSelect(index)
    this.cancel(event)
  }
  private cancel = (event:PointerEvent) => {
    this.pointerIds.delete(event.pointerId)
    this.pressed = null
  }
  private leave = (event:PointerEvent) => {
    this.hovered = -1
    this.updateSelection()
    this.cancel(event)
  }

  private animate = (stamp:number) => {
    const dt = this.last ? Math.min((stamp-this.last)/1000,.05) : 0
    this.last = stamp
    const {map,speed,light} = this.settings
    const live = dt * Math.sqrt(speed)
    this.time += live
    const daylight = this.activeLight = T.MathUtils.damp(this.activeLight,light,4,dt)
    this.fill.intensity = .73 + daylight*1.28
    this.fill.color.setHex(0x9fb7fc).lerp(new T.Color(0xe2f5ff),daylight)
    this.sun.color.setHex(0x8ca9ea).lerp(new T.Color(0xffe3b8),daylight)
    this.sun.intensity = .35 + daylight*2.05
    windows.emissiveIntensity = (1-daylight)*.84
    this.water.material.uniforms.day.value = daylight
    this.water.material.uniforms.clock.value = this.time
    this.boat.position.set(-12.2+Math.sin(this.time*.18)*.19,-.59+Math.sin(this.time*2)*.026,2.32+Math.sin(this.time*.15)*1.15)
    this.boat.rotation.y = .26 + Math.sin(this.time*.48)*.05
    this.smoke.count = this.factories.length*3
    this.factories.forEach((index,i) => {
      const [x,z] = coords(index)
      for (let puff = 0; puff < 3; puff++) {
        const phase = (this.time*.32+puff/3+i*.23)%1
        this.dummy.position.set(origin(x)+.26+phase*.54,.99+phase*.63,origin(z)-.28+phase*.21)
        this.dummy.scale.setScalar(.029 + Math.sin(phase*Math.PI)*.105)
        this.dummy.updateMatrix()
        this.smoke.setMatrixAt(i*3+puff,this.dummy.matrix)
      }
    })
    if (this.smoke.count) this.smoke.instanceMatrix.needsUpdate = true

    for (const drive of this.drives) {
      drive.progress += live*drive.speed
      if (drive.progress >= 1) {
        drive.progress -= 1
        const back = drive.from
        drive.from = drive.to
        const choices = neighbors(drive.from).filter(index => map[index] === 'road' && index !== back)
        drive.to = choices[Math.floor(this.random()*choices.length)] ?? back
      }
      const start = point(drive.from)
      const end = point(drive.to)
      const vector = end.clone().sub(start)
      drive.model.position.copy(start.lerp(end,drive.progress)).add(new T.Vector3(vector.z*.13,.083,-vector.x*.13))
      drive.model.rotation.y = Math.atan2(vector.x,vector.z)
    }
    if (this.transient && this.rise < 1) {
      this.rise = Math.min(1,this.rise+dt*2.2)
      const ease = 1-(1-this.rise)**3
      this.transient.position.y = -.7*(1-ease)
      this.transient.scale.y = .15+.85*ease
      this.sun.shadow.needsUpdate = true
      this.renderer.shadowMap.needsUpdate = true
    }
    this.controls.update()
    this.renderer.render(this.scene,this.camera)
    this.frame = requestAnimationFrame(this.animate)
  }

  destroy() {
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.controls.dispose()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointerdown',this.down)
    canvas.removeEventListener('pointermove',this.move)
    canvas.removeEventListener('pointerup',this.up)
    canvas.removeEventListener('pointercancel',this.cancel)
    canvas.removeEventListener('pointerleave',this.leave)
    this.scene.traverse(object => {
      if (!(object instanceof T.Mesh)) return
      object.geometry.dispose()
      if (object === this.selection || object === this.cursor || object === this.water || object === this.smoke) object.material.dispose()
    })
    this.grid.geometry.dispose()
    this.grid.material.dispose()
    this.sun.shadow.dispose()
    this.renderer.dispose()
    canvas.remove()
  }
}
