import * as T from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
import {coords,neighbors,SIZE,type Tile} from './simulation'

export const origin = (value:number) => value - (SIZE - 1) / 2
const box = new T.BoxGeometry()
const ball = new T.IcosahedronGeometry(1,0)
const tree = new T.ConeGeometry(1,1,5)
const cylinder = new T.CylinderGeometry(1,1,1,12)
const roof = new T.CylinderGeometry(.68,.68,1,3,1,false,Math.PI / 2).rotateZ(Math.PI/2)
const color = new T.Color()
export const solid = new T.MeshStandardMaterial({vertexColors:true,roughness:.83})
export const windows = new T.MeshStandardMaterial({vertexColors:true,roughness:.37,emissive:0xffc576,emissiveIntensity:0})
export const seeded = (seed:number) => {
  let value = Math.imul(seed ^ 0xa3c59ac3,0x9e3779b1) >>> 0
  return () => {
    value = (Math.imul(value,1664525) + 1013904223) >>> 0
    return value / 4294967296
  }
}
type Shape = {geometry:T.BufferGeometry; pos:T.Vector3; hue:number; scale:T.Vector3; angle:number; lit:boolean}
export class Batch {
  parts:Shape[] = []
  add(hue:number,x:number,y:number,z:number,w:number,h:number,d:number,geometry:T.BufferGeometry = box,angle = 0,lit = false) {
    this.parts.push({geometry,pos:new T.Vector3(x,y,z),hue,scale:new T.Vector3(w,h,d),angle,lit})
  }
  append(batch:Batch,x:number,z:number) {
    for (const part of batch.parts) this.parts.push({...part,pos:part.pos.clone().add(new T.Vector3(x,0,z))})
  }
  mesh() {
    const group = new T.Group()
    for (const lit of [false,true]) {
      const geometries = this.parts.filter(part => part.lit === lit).map(part => {
        const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone()
        geometry.scale(part.scale.x,part.scale.y,part.scale.z).rotateY(part.angle).translate(part.pos.x,part.pos.y,part.pos.z)
        const colors = new Float32Array(geometry.getAttribute('position').count * 3)
        color.setHex(part.hue)
        for (let i = 0; i < colors.length; i += 3) color.toArray(colors,i)
        geometry.setAttribute('color',new T.BufferAttribute(colors,3))
        return geometry
      })
      if (!geometries.length) continue
      const mesh = new T.Mesh(mergeGeometries(geometries),lit ? windows : solid)
      mesh.castShadow = !lit
      mesh.receiveShadow = !lit
      group.add(mesh)
      geometries.forEach(geometry => geometry.dispose())
    }
    return group
  }
}

function plant(batch:Batch,x:number,z:number,size:number,hue:number,pine = false,y = 0) {
  batch.add(0x7b563d,x,y+size*.23,z,size*.11,size*.46,size*.11,cylinder)
  if (pine) {
    batch.add(hue,x,y+size*.56,z,size*.34,size*.67,size*.34,tree)
    batch.add(hue,x,y+size*.83,z,size*.25,size*.55,size*.25,tree,.48)
  } else {
    batch.add(hue,x,y+size*.57,z,size*.37,size*.49,size*.37,ball,.35)
    batch.add(hue,x+size*.16,y+size*.49,z,size*.25,size*.31,size*.27,ball)
  }
}

function facade(batch:Batch,x:number,z:number,w:number,d:number,floors:number,h:number,dark:number,lit:boolean,y0=.09) {
  const glass = lit ? dark : 0x505e65
  for (let floor = 0; floor < floors; floor++) {
    const y = y0 + (floor + .5)*h
    for (const side of [-1,1]) {
      for (const offset of [-.25,0,.25]) {
        batch.add(glass,x+offset*w,y,z+side*d*.503,w*.135,h*.47,.014,box,0,lit)
        batch.add(glass,x+side*w*.503,y,z+offset*d,.014,h*.47,d*.135,box,0,lit)
      }
    }
  }
}

function house(batch:Batch,r:()=>number,lit:boolean,index:number) {
  const walls=[0xf6e0b5,0xffedd1,0xe6f0d5,0xf4c8ab,0xf3e9cf]
  const roofs=[0xc96848,0xdc854e,0x316e79,0xa4494e,0x4c847c]
  const hue = walls[index % walls.length]
  const top = roofs[(index + Math.floor(index / SIZE)) % roofs.length]
  const height = .31 + r() * .18
  const w = .64, d = .56
  batch.add(0xccbda1,0,.05,0,.83,.096,.75)
  batch.add(hue,0,.095+height/2,0,w,height,d)
  batch.add(top,0,.13+height+.115,0,w+.08,.47,d+.09,roof)
  batch.add(0x966a58,-.19,height+.25,-.065,.082,.25,.08)
  batch.add(0xc2a08b,-.19,height+.38,-.065,.111,.035,.107)
  facade(batch,0,0,w,d,height>.39?2:1,height/(height>.39?2:1),0x547883,lit)
  batch.add(0x695b4f,0,.175,d*.51,.1,.17,.016)
  batch.add(0xe7cb9e,0,.025,.375,.14,.032,.28)
  plant(batch,.34,-.32,.34+r()*.21,0x589452)
  if (r()>.45) plant(batch,-.36,.28,.27,0x7cab54)
}

function shop(batch:Batch,r:()=>number,lit:boolean,index:number) {
  const palette = [0xdedac7,0xeddbb2,0xc8eae7,0xf0c7a7,0xc6dae3]
  const floors = 3 + Math.floor(r() * 6)
  const w = .55+r()*.2, d = .59+r()*.12, level = .205
  const h = floors*level
  const tone = palette[index % palette.length]
  batch.add(0xbec4b4,0,.049,0,.92,.095,.91)
  batch.add(tone,0,h*.5+.095,0,w,h,d)
  facade(batch,0,0,w,d,floors,level,0x477c88,lit)
  for (let floor = 1; floor < floors; floor += 2) batch.add(tone,0,.09+floor*level,0,w+.029,.035,d+.029)
  batch.add(0xf6e7cd,0,h+.11,0,w+.064,.074,d+.062)
  batch.add(0xa3a49b,0,h+.16,0,w-.055,.026,d-.06)
  batch.add(tone,.09,h+.22,-.105,w*.47,.16,d*.41)
  batch.add(0x6f96a2,.09,h+.306,-.105,w*.52,.03,d*.46)
  batch.add(0x486573,-.15,h+.26,.11,.022,.25,.022)
  batch.add(0xe07050,-.15,h+.389,.11,.049,.029,.043,ball)
  if (index%3 === 0) {
    batch.add(0xcd6447,0,.309,d*.54,w+.04,.057,.159)
    batch.add(0xf4d0a5,0,.279,d*.63,w+.04,.032,.024)
  }
}

function industry(batch:Batch,lit:boolean,power:boolean,index:number) {
  batch.add(0xb6ad91,0,.049,0,.93,.096,.91)
  if (power) {
    batch.add(0x73b6ad,0,.18,.04,.76,.27,.66)
    batch.add(0xc8e2ce,0,.34,.04,.8,.067,.7)
    batch.add(0x506b71,.05,.382,-.10,.57,.028,.31)
    for (let i = -2; i <= 2; i++) {
      batch.add(0x408b9d,.05+i*.11,.4,-.1,.1,.012,.285)
      batch.add(0x86b9bd,.05+i*.11,.409,-.1,.1,.01,.018)
    }
    batch.add(0x33998d,-.27,.28,-.28,.132,.48,.132,cylinder)
    batch.add(0xf3d894,-.27,.53,-.28,.139,.041,.139,cylinder)
    batch.add(0x316760,.27,.18,.32,.1,.23,.1)
    for (let i = -2; i <= 2; i++) batch.add(0xf5e0a2,i*.11,.197,.378,.067,.079,.012,box,0,lit)
  } else {
    batch.add(0xcb895e,-.06,.23,.07,.69,.34,.59)
    batch.add(0xe7b976,-.06,.441,.07,.74,.091,.654)
    for (let i = -1; i <= 1; i++) batch.add(0x997457,-.06+i*.21,.479,.07,.028,.031,.59)
    for (const x of [.26,.4]) {
      const h = x === .26 ? .82 : .59
      batch.add(0xa15d45,x,.09+h*.5,-.28,.073,h,.073,cylinder)
      batch.add(0xe2d0aa,x,h-.045,-.28,.077,.1,.077,cylinder)
      batch.add(0x594e4b,x,h+.091,-.28,.085,.041,.085,cylinder)
    }
    facade(batch,-.06,.07,.69,.59,1,.33,0x52686b,lit)
    batch.add(index%2 ? 0x729497 : 0xeca449,.3,.15,.27,.29,.19,.19)
  }
}

export function tileModel(tile:Tile,index:number,map:Tile[],lit:boolean) {
  const batch = new Batch()
  const r = seeded(index+910)
  if (tile === 'road') {
    const links = neighbors(index).filter(next => map[next] === 'road')
    const [x,z] = coords(index)
    const directions = links.map(next => {
      const [nx,nz] = coords(next)
      return [nx-x,nz-z]
    })
    if (x===0) directions.push([-1,0])
    if (z===0) directions.push([0,-1])
    if (x===SIZE-1) directions.push([1,0])
    if (z===SIZE-1) directions.push([0,1])
    batch.add(0xc7cbb0,0,.021,0,.89,.04,.89)
    batch.add(0x52646a,0,.039,0,.71,.027,.71)
    for (const [dx,dz] of directions) {
      batch.add(0x52646a,dx*.39,.039,dz*.39,dx ? .225 : .71,.027,dz ? .225 : .71)
      batch.add(0xe3d5a2,dx*.34,.055,dz*.34,dx ? .18 : .025,.007,dz ? .18 : .025)
    }
    if (directions.length>=3 || index%7===0) {
      batch.add(0x637270,.39,.2,.39,.024,.36,.024)
      batch.add(0xffe9ad,.36,.375,.39,.098,.029,.05,box,0,true)
    }
  } else if (tile === 'house') house(batch,r,lit,index)
  else if (tile === 'shop') shop(batch,r,lit,index)
  else if (tile === 'factory' || tile === 'power') industry(batch,lit, tile === 'power',index)
  else if (tile === 'park') {
    batch.add(0x79af5e,0,.02,0,.94,.045,.94)
    batch.add(0xe9d3a6,0,.047,0,.17,.017,.94)
    batch.add(0xe9d3a6,0,.047,0,.94,.017,.16)
    for (const x of [-.27,.28]) for (const z of [-.28,.27]) plant(batch,x,z,.44+r()*.4,r()>.45?0x4a985d:0x73a64f,r()>.58)
    batch.add(0xa6ac8b,0,.074,0,.165,.073,.165,cylinder)
    batch.add(0x72cdd0,0,.12,0,.136,.02,.136,cylinder)
  } else {
    const [x,z] = coords(index)
    const forest = x < 3 || z < 3 || x > 16 || z > 16
    if (r() < (forest ? .72 : .16)) {
      const count = forest ? 2 + Math.floor(r()*3) : 1
      for (let i = 0; i < count; i++) {
        plant(batch,(r()-.5)*.68,(r()-.5)*.65,.32+r()*.65,[0x559953,0x69a65b,0x427f50,0x83ad59][Math.floor(r()*4)],r()>.4)
      }
    } else if (r() > .85) batch.add(0xc4caa4,.17,.036,-.12,.11,.07,.11,ball)
  }
  return batch
}

export function landscape() {
  const batch = new Batch()
  const r = seeded(150)
  batch.add(0x7f9c7a,0,-.77,0,20.18,1.38,20.22)
  batch.add(0xb6aa83,0,-.49,0,20.38,.6,20.39)
  batch.add(0xd9ca9e,0,-.24,0,20.43,.25,20.42)
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
    const grass = [0xa7c67e,0xa3c47d,0xabc885,0x9dc278,0xa9c981,0xa5c681]
    batch.add(grass[Math.floor(r()*grass.length)],origin(x),-.067,origin(z),1,.131,1)
  }
  for (let i = 0; i < 146; i++) {
    const side = i % 4
    const along = (r()-.5)*20.8
    const edge = 10.05 + r()*.31
    const x = side < 2 ? (side ? -edge : edge) : along
    const z = side < 2 ? along : (side===2 ? -edge : edge)
    const h = .16+r()*.41
    batch.add([0x9b9e88,0xb8af98,0xc5baa0,0x849689][i%4],x,-.39-r()*.24,z,.24+r()*.49,h,.24+r()*.4,ball,r()*6)
  }
  // Timber landing beside the road into town.
  for (let i = 0; i < 14; i++) batch.add(i%3 ? 0xb38b61 : 0xc9a275,-10.04-i*.132,-.08,.51,.125,.105,.86)
  for (const x of [-10.34,-11.12,-11.73]) for (const z of [.13,.87]) {
    batch.add(0x775f50,x,-.42,z,.08,.73,.08,cylinder)
    batch.add(0xeed9ae,x,-.04,z,.12,.056,.12,cylinder)
  }
  return batch.mesh()
}

export function car(index:number) {
  const batch = new Batch()
  const paint = [0xf1a350,0xe47459,0xf1d8aa,0x6da4bf,0xf5ead1,0x4b847e][index%6]
  batch.add(paint,0,.032,0,.144,.079,.27)
  batch.add(0x344f5b,0,.091,-.019,.124,.058,.139)
  batch.add(paint,0,.126,-.018,.12,.017,.116)
  for (const x of [-.065,.065]) {
    for (const z of [-.086,.086]) batch.add(0x283b45,x,.011,z,.033,.053,.057)
    batch.add(0xffe3ac,x*.74,.052,.137,.033,.023,.011,box,0,true)
    batch.add(0xf05d47,x*.74,.052,-.137,.029,.019,.011,box,0,true)
  }
  return batch.mesh()
}
