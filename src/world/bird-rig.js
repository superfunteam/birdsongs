import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SPECIES } from './species.js';
import { ANATOMY } from './bird-anatomy.js';
import { createWings } from './bird-wings.js';

// The pixel pass supplies the style. The source models use continuous light
// and anatomically shaped surfaces, without a second cartoon shading pass.
export const birdMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true, side: THREE.DoubleSide,
});
export const SILHOUETTE = new THREE.Color('#0b0a11');
export function setBirdSilhouette(on) {
  birdMaterial.vertexColors = !on;
  birdMaterial.color.set(on ? SILHOUETTE : '#ffffff');
  birdMaterial.needsUpdate = true;
}

const color = new THREE.Color();
function paint(g, fn) {
  g.deleteAttribute('uv');
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    color.set(typeof fn === 'function' ? fn(p.getX(i), p.getY(i), p.getZ(i)) : fn);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
function combine(parts) {
  const plain = parts.map(g => g.index ? g.toNonIndexed() : g);
  const result = mergeGeometries(plain);
  for (let i = 0; i < parts.length; i++) {
    parts[i].dispose();
    if (plain[i] !== parts[i]) plain[i].dispose();
  }
  return result;
}
function ellipsoid(size, at, fill) {
  const g = new THREE.SphereGeometry(1, 12, 8);
  g.scale(...size).translate(...at);
  return paint(g, fill);
}
function rod(from, to, radius, fill) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(radius * .76, radius, d.length(), 5);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(...a.add(b).multiplyScalar(.5).toArray());
  return paint(g, fill);
}
const mix = THREE.MathUtils.lerp;
const ease = THREE.MathUtils.smoothstep;
const cubic = (a, b, c, d, t) => b + .5 * t * (c - a + t * (2*a - 5*b + 4*c - d + t * (3*(b-c) + d-a)));

function sectionAt(a, y) {
  const rows = a.rows;
  let i = rows.findIndex(row => row[0] >= y) - 1;
  if (i < 0) i = y <= rows[0][0] ? 0 : rows.length - 2;
  const t = THREE.MathUtils.clamp((y - rows[i][0]) / (rows[i+1][0] - rows[i][0]), 0, 1);
  return rows[i].map((v, j) => j ? cubic(rows[Math.max(0,i-1)][j], v, rows[i+1][j], rows[Math.min(rows.length-1,i+2)][j], t) : y);
}

function plumage(id, sp, a, x, y, z) {
  const [hx, hy] = a.head;
  const front = x > hx - .010;
  const skull = y > a.headStart;
  if (skull) {
    if (id === 'cardinal') {
      const mask = x > hx + .015 && y < hy + .038 && y > hy - .095;
      return mask ? sp.mask : sp.cap;
    }
    if (id === 'chickadee') {
      if (y > a.eye[1] - .003) return sp.cap;
      if (y < hy - .045 && front) return sp.throat;
      return sp.cheek;
    }
    if (id === 'sparrow') {
      if (y > hy + .055) return sp.cap;
      if (x < hx - .037 && y > hy - .04) return sp.nape;
      if (x > hx + .053 && y < hy + .017) return sp.throat;
      if (Math.abs(y-a.eye[1]) < .017 && front) return sp.throat;
      return sp.cheek;
    }
    if (id === 'goldfinch') return x > hx + .012 && y > hy + .026 ? sp.cap : sp.face;
    if (id === 'swallow') {
      if (x > hx + .060 && y > hy + .022 && y < hy + .06) return sp.forehead;
      return y < hy - .014 && front ? sp.throat : sp.cap;
    }
    if (id === 'robin') {
      if (y < hy - .053 && front) return sp.throat;
      return sp.cap;
    }
    if (id === 'bluebird') return y < hy - .064 && front ? sp.throat : sp.cap;
    return sp.cap;
  }
  if (id === 'gull') return x < -.02 && y > .2 ? sp.back : sp.belly;
  if (id === 'bluebird' || id === 'robin') {
    // The pale vent rises toward the rump; the colored breast wraps around
    // the flank underneath the folded wing rather than ending in a square bib.
    if (y < (id === 'bluebird' ? .085 : .065) - .34*x) return sp.belly;
    if (x < -.035 && y > .23) return sp.back;
    if (y > a.neckStart && x < .10) return sp.back;
    return sp.breast;
  }
  if (id === 'pigeon' && y > .31) return Math.abs(z) > .045 ? sp.throat : sp.neckSheen;
  if (id === 'sparrow' && y > a.head[1]-.13 && x > a.head[0]-.025) return sp.throat;
  if (id === 'chickadee' && y > .276 && x > .13) return sp.throat;
  if (id === 'starling' && y > .30) return sp.throat;
  const row = sectionAt(a, y);
  const relative = (x - (row[1] + row[2]) / 2) / Math.max(.001, (row[2]-row[1]) / 2);
  if (relative < -.12 && y > .14) return sp.back;
  if (id === 'chickadee' && Math.abs(z) > .064 && y < .20) return sp.flank;
  if (id === 'goldfinch' && x < -.095 && y < .09) return sp.undertail;
  if (y < .075) return sp.belly;
  return relative > .15 ? sp.breast : y > .24 ? sp.back : sp.belly;
}

function bodyGeometry(id, sp, a) {
  const positions = [], indices = [], skin = [], weights = [];
  const around = 24;
  const rows = [];
  for (let i = 0; i < a.rows.length - 1; i++) {
    for (let j = 0; j < 3; j++) rows.push(sectionAt(a, mix(a.rows[i][0], a.rows[i+1][0], j/3)));
  }
  rows.push(a.rows.at(-1));
  rows.forEach(([y, rear, front, width], r) => {
    for (let i = 0; i < around; i++) {
      const theta = i / around * Math.PI * 2;
      const x = (rear+front)/2 + Math.cos(theta)*(front-rear)/2;
      const z = Math.sin(theta)*Math.max(.0001,width);
      positions.push(x, y, z);
      const headWeight = ease(y, a.neckStart, a.headStart);
      skin.push(0,1,0,0);
      weights.push(1-headWeight,headWeight,0,0);
      if (r < rows.length-1) {
        const n = r*around+i, next = r*around+(i+1)%around;
        indices.push(n,n+around,next, next,n+around,next+around);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  g.setIndex(indices);
  g.computeVertexNormals();
  paint(g,(x,y,z) => plumage(id,sp,a,x,y,z));
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skin,4));
  g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  return g;
}

function billGeometry(a, sp) {
  const [bx, by, length, depth, width, kind] = a.bill;
  const positions = [], indices = [];
  const seed = kind === 'seed';
  const crow = kind === 'crow';
  const gull = kind === 'gull';
  const n = 9;
  for (let i = 0; i <= 8; i++) {
    const t = i/8;
    const taper = Math.max(.005, 1-t);
    const upper = depth*(seed ? .70 : .62)*Math.pow(taper,seed ? .85 : .45);
    const lower = depth*.48*Math.pow(taper,.85);
    const curve = (crow || gull) ? depth*.26*Math.sin(t*Math.PI)-depth*.23*t*t : -depth*.17*t;
    for (let j = 0; j < n; j++) {
      const theta=j/n*Math.PI*2;
      const c=Math.cos(theta);
      positions.push(bx+length*t, by+curve+c*(c>0?upper:lower), Math.sin(theta)*width*Math.pow(taper,.72));
      if(i<8){const k=i*n+j, next=i*n+(j+1)%n;indices.push(k,next,k+n,next,next+n,k+n);}
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setIndex(indices);g.computeVertexNormals();
  return paint(g,(x,y) => {
    const t=(x-bx)/length;
    if(sp.billBand && t>.60 && t<.82) return sp.billBand;
    return sp.beak;
  });
}

function featureGeometry(id, sp, a) {
  const parts=[billGeometry(a,sp)];
  const [ex,ey,er]=a.eye;
  const row=sectionAt(a,ey);
  const frac=(ex-(row[1]+row[2])/2)/((row[2]-row[1])/2);
  const ez=row[3]*Math.sqrt(Math.max(0,1-frac*frac));
  for(const side of [-1,1]) {
    if(sp.eyeRing) parts.push(ellipsoid([er*1.15,er*1.15,.0015],[ex,ey,side*(ez+.0008)],sp.eyeRing));
    parts.push(ellipsoid([er,er,.0023],[ex,ey,side*(ez+.0018)],sp.iris || '#111513'));
    if(sp.iris) parts.push(ellipsoid([er*.50,er*.59,.0008],[ex+.0005,ey,side*(ez+.004)],'#121713'));
    // Fine dark upper eyelid sits flush with the crown feathers.
    parts.push(rod([ex-er*.80,ey+er*.78,side*(ez+.0016)],[ex+er*.83,ey+er*.62,side*(ez+.0015)],.0013,sp.cap));
    if(id==='robin') for(let j=0;j<4;j++) {
      const x=a.head[0]+.044+j*.012;
      const y=a.head[1]-.063;
      const r=sectionAt(a,y);
      const f=(x-(r[1]+r[2])/2)/((r[2]-r[1])/2);
      const z=r[3]*Math.sqrt(Math.max(.05,1-f*f));
      parts.push(rod([x,y,side*(z+.001)],[x-.010,y-.025,side*(z+.001)],.0016,sp.throatStreak));
    }
  }
  if(sp.cere) parts.push(ellipsoid([.018,.010,.014],[a.bill[0]+.009,a.bill[1]+.012,0],sp.cere));
  if(a.crest) {
    const base=a.rows.at(-1)[0]-.035;
    // A solid feather ridge with several unequal tips, not a cone or a hat.
    for(let i=0;i<5;i++) {
      const x=.042+i*.022, z=(i-2)*.009;
      const tipY=base+.138-Math.abs(i-1)*.012;
      const vertices=[x-.037,base,z-.012, x+.028,base,z+.012, x-.031,tipY,z,
        x+.028,base,z+.012,x-.037,base,z-.012,x-.031,tipY,z+.005];
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();parts.push(paint(g,sp.cap));
    }
  }
  const result=combine(parts);
  result.translate(-a.head[0],-a.head[1],0);
  return result;
}

function tailGeometry(id,sp,a) {
  const parts=[];
  for(let i=0;i<10;i++) {
    const t=(i/9)*2-1;
    const length=a.tail-(a.fork || 0)*(1-Math.abs(t))-(a.fork ? 0 : .009*Math.abs(t));
    const width=a.tailWidth*.24;
    const z=t*a.tailWidth*.72;
    const vertices=[],indices=[];
    for(let j=0;j<=6;j++) {
      const u=j/6, x=-length*u;
      const half=width*Math.sin(Math.PI*(u*.92+.04))*.5;
      const cy=.006*Math.sin(u*Math.PI)+i*.0014;
      vertices.push(x,cy,z*u-half,x,cy+.0015,z*u,x,cy,z*u+half);
      if(j<6){const n=j*3;indices.push(n,n+3,n+1,n+1,n+3,n+4,n+1,n+4,n+2,n+2,n+4,n+5);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
    parts.push(paint(g,(x) => {
      const u=-x/length;
      if(id==='pigeon' && u>.72 && u<.96) return sp.tailBand;
      if(id==='swallow' && Math.abs(t)<.8 && u>.45 && u<.61) return sp.tailSpot;
      return sp.tail;
    }));
  }
  return combine(parts);
}

function footGeometry(id,sp,a) {
  const parts=[];
  for(const spread of [-1,0,1]) {
    const z=spread*(id==='gull'?.027:.017);
    parts.push(rod([0,.023,0],[.031,.008,z],.0035,sp.legs));
    parts.push(rod([.031,.008,z],[.043,-.004,z],.0028,sp.legs));
    parts.push(rod([.043,-.004,z],[.030,-.018,z],.0018,sp.beak));
  }
  const rear=id==='gull'?-.014:-.032;
  parts.push(rod([0,.022,0],[rear,.002,0],.003,sp.legs));
  parts.push(rod([rear,.002,0],[rear+.004,-.012,0],.0017,sp.beak));
  if(id==='gull') {
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute([0,.018,0,.04,0,-.026,.03,.004,0,0,.018,0,.03,.004,0,.04,0,.026],3));
    g.computeVertexNormals();parts.push(paint(g,sp.legs));
  }
  const geometry=combine(parts);
  // Shared unit segments let each leg connect its feathered hip to a planted
  // foot, including when the bird faces along rather than across the wire.
  geometry.userData.legGeometry=paint(new THREE.CylinderGeometry(.78,1,1,6),sp.legs);
  return geometry;
}

const cache=new Map();
function speciesGeometry(id) {
  if(cache.has(id)) return cache.get(id);
  const sp=SPECIES[id], a=ANATOMY[id];
  const shoulderZ=a.wing.root[2];
  const span=(.85*sp.wingspanCm/sp.lengthCm/a.k)/2-shoulderZ;
  const wings=createWings(id,sp,a,span);
  const out={a,k:a.k,bodyG:bodyGeometry(id,sp,a),headG:featureGeometry(id,sp,a),
    tailG:tailGeometry(id,sp,a),footG:footGeometry(id,sp,a),shoulderZ,...wings};
  cache.set(id,out);return out;
}

export class BirdRig {
  constructor(speciesId,worldScale) {
    const sp=SPECIES[speciesId], g=speciesGeometry(speciesId), a=g.a;
    this.sp=sp;this.geometry=g;
    this.root=new THREE.Group();this.root.rotation.order='YZX';this.root.scale.setScalar(sp.scale*worldScale);
    const model=new THREE.Group();model.scale.setScalar(g.k);this.root.add(model);
    this.feet=[];this.legs=[];
    for(const side of [-1,1]) {
      const foot=new THREE.Mesh(g.footG,birdMaterial);model.add(foot);this.feet.push(foot);
      const upper=new THREE.Mesh(g.footG.userData.legGeometry,birdMaterial);
      const lower=new THREE.Mesh(g.footG.userData.legGeometry,birdMaterial);
      model.add(upper,lower);this.legs.push({upper,lower});
    }
    this.footPose={hip:new THREE.Vector3(),ankle:new THREE.Vector3(),knee:new THREE.Vector3(),
      clutch:new THREE.Vector3(),offset:new THREE.Vector3(),direction:new THREE.Vector3(),up:new THREE.Vector3(0,1,0)};
    this.tilt=new THREE.Group();this.tilt.position.y=a.leg;model.add(this.tilt);
    this.body=new THREE.Group();this.tilt.add(this.body);
    const skin=new THREE.SkinnedMesh(g.bodyG,birdMaterial);
    const base=new THREE.Bone();this.neck=new THREE.Bone();this.neck.position.set(...a.head,0);
    base.add(this.neck);skin.add(base);this.body.add(skin);
    skin.bind(new THREE.Skeleton([base,this.neck]));
    skin.frustumCulled=false;
    this.skin=skin;
    this.neck.add(new THREE.Mesh(g.headG,birdMaterial));
    this.tail=new THREE.Group();this.tail.position.set(...a.tailBase,0);this.tail.add(new THREE.Mesh(g.tailG,birdMaterial));this.body.add(this.tail);
    this.wings=[];
    for(const side of [-1,1]) {
      const folded=new THREE.Mesh(g.foldedG,birdMaterial);folded.scale.z=side;this.body.add(folded);
      const shoulder=new THREE.Group();shoulder.position.set(a.wing.root[0],a.wing.root[1],g.shoulderZ*side);shoulder.scale.z=side;shoulder.rotation.order='YXZ';
      shoulder.add(new THREE.Mesh(g.innerG,birdMaterial));
      const elbow=new THREE.Group();elbow.position.set(0,0,g.innerSpan);elbow.rotation.order='YXZ';elbow.add(new THREE.Mesh(g.outerG,birdMaterial));shoulder.add(elbow);this.body.add(shoulder);
      this.wings.push({shoulder,elbow,folded});
    }
  }

  pose(p) {
    const a=this.geometry.a, m=this.sp.motion;
    const fold=THREE.MathUtils.clamp(p.fold,0,1);
    const flying=THREE.MathUtils.clamp(1-p.legs,0,1);
    const longNeck=['Rock Pigeon','American Crow','Ring-billed Gull'].includes(this.sp.fullName);
    const pitch=p.pitch-m.perchPitch-flying*(longNeck?.20:.07);
    this.tilt.rotation.z=pitch;
    this.tilt.position.y=a.leg-p.crouch*a.leg*.23;
    this.body.scale.set(1+(p.fluff-1)*.12,1+(p.fluff-1)*.5,1+(p.fluff-1)*.55);
    // The crow already rests with a low neck; applying the gull's full drop
    // would fold its throat back through its breast during flight.
    const headDrop=this.sp.fullName==='American Crow'?.080:longNeck?.190:.065;
    this.neck.position.set(a.head[0]+(p.headBob || 0)+flying*(longNeck?.110:.045),a.head[1]-flying*headDrop,0);
    // The skull's resting axis is level; raising the chest does not tip the
    // beak skyward. Skin weights spread this articulation through the neck.
    this.neck.rotation.set(p.headRoll || 0,p.headYaw,p.headPitch-pitch,'YZX');
    this.tail.rotation.z=a.tailDrop+p.tail-m.tailAngle;
    this.tail.scale.z=p.tailSpread;
    for(let i=0;i<2;i++) {
      const {shoulder,elbow,folded}=this.wings[i];
      const lift=i===0?p.wingLift || 0:0;
      const f=Math.max(0,fold-lift*.8), side=i===0?-1:1;
      shoulder.visible=f<.995;folded.visible=f>.65;
      folded.scale.y=ease(f,.65,1);
      folded.position.y=a.wing.root[1]*(1-folded.scale.y);
      shoulder.rotation.set((p.flap*(1-f)-.1*f-lift)*side,(-1.32*f-(p.sweep || 0)*(1-f))*side,.02*f);
      shoulder.scale.z=side*(1-.8*f);elbow.rotation.set(p.flapOuter*(1-f),-.4*f,0);elbow.scale.z=1-.67*f;
    }
    const legs=THREE.MathUtils.clamp(p.legs,0,2);
    const joints=this.footPose, hipRow=a.rows[1], hipSpread=hipRow[3]*.60;
    const yaw=this.root.rotation.y, c=Math.cos(yaw), s=Math.sin(yaw);
    const plantYaw=Math.PI/2-yaw;
    const relativeYaw=THREE.MathUtils.euclideanModulo(plantYaw+Math.PI,Math.PI*2)-Math.PI;
    const bodyPitch=this.tilt.rotation.z, cp=Math.cos(bodyPitch), sp=Math.sin(bodyPitch);
    for(let i=0;i<2;i++) {
      const foot=this.feet[i], side=i===0?-1:1;
      const step=(p.step || 0)*-side, tuck=ease(Math.max(0,1-legs),0,1);
      const hx=(hipRow[1]+hipRow[2])*.5*this.body.scale.x;
      const hy=hipRow[0]*this.body.scale.y;
      joints.hip.set(cp*hx-sp*hy,this.tilt.position.y+sp*hx+cp*hy,side*hipSpread*this.body.scale.z);
      // Perched toe clutches are separated along world X, centered on Z=0.
      // Their local X curls across the cable, independent of the body's yaw.
      const along=side*hipSpread+step*a.leg*.20;
      joints.clutch.set(c*along,Math.max(0,step)*a.leg*.20,s*along);
      joints.offset.set(joints.hip.x-a.leg*.62,joints.hip.y+a.leg*.06,joints.hip.z*.85);
      joints.clutch.lerp(joints.offset,tuck);
      foot.rotation.set(0,relativeYaw*(1-tuck),-1.3*tuck,'YXZ');
      // The gripping point lies between the front knuckles, with claws below
      // the cable; it is not the ankle or the origin of the old leg mesh.
      joints.offset.set(.022,.008,0).applyQuaternion(foot.quaternion);
      foot.position.copy(joints.clutch).sub(joints.offset);
      foot.updateMatrix();
      joints.ankle.set(0,.023,0).applyMatrix4(foot.matrix);
      joints.knee.copy(joints.hip).lerp(joints.ankle,.46);
      joints.knee.x+=a.leg*(-.14+.28*tuck);
      joints.knee.y-=a.leg*.30*tuck;
      const {upper,lower}=this.legs[i];
      for(const [segment,from,to,radius] of [
        [upper,joints.hip,joints.knee,a.leg*.055],
        [lower,joints.knee,joints.ankle,a.leg*.032],
      ]) {
        joints.direction.copy(to).sub(from);
        const length=joints.direction.length();
        segment.position.copy(from).add(to).multiplyScalar(.5);
        segment.quaternion.setFromUnitVectors(joints.up,joints.direction.divideScalar(Math.max(length,1e-8)));
        segment.scale.set(radius,length,radius);
      }
    }
  }

  dispose() { this.skin.skeleton.dispose();this.root.removeFromParent(); }
}
