import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Feather structure follows the perched and flight photographs: overlapping
// vanes rooted along the forearm/carpus, with a small camber rather than padded
// wing-shaped solids. The two open surfaces give gulls a pale underwing without
// painting the same gray upperwing on both sides.
const lerp = THREE.MathUtils.lerp;
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const v3 = (a) => new THREE.Vector3(...a);
const rows = [0, .14, .33, .53, .72, .86, .95, 1];

function surface(uSamples, vSamples, pointAt, colorAt, outward) {
  const positions = [], colors = [], indices = [];
  for (const u of uSamples) for (const v of vSamples) {
    const p = pointAt(u, v);
    positions.push(p.x, p.y, p.z);
    const c = new THREE.Color(colorAt(u, v));
    colors.push(c.r, c.g, c.b);
  }
  const width = vSamples.length;
  for (let i = 0; i < uSamples.length - 1; i++) for (let j = 0; j < width - 1; j++) {
    const a = i * width + j, b = a + width;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Orient the faces consistently with their feathered side, retaining smooth
  // camber normals before flattening the index for the rig's geometry merger.
  const pa = v3(positions.slice(indices[0] * 3, indices[0] * 3 + 3));
  const pb = v3(positions.slice(indices[1] * 3, indices[1] * 3 + 3));
  const pc = v3(positions.slice(indices[2] * 3, indices[2] * 3 + 3));
  if (pb.sub(pa).cross(pc.sub(pa)).dot(outward) < 0) {
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  g.setIndex(indices);
  g.computeVertexNormals();
  const result = g.toNonIndexed();
  g.dispose();
  return result;
}

function combine(parts) {
  const result = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return result;
}

function feather(from, to, width, normal, fill, { bow = .0025, edge = .035, tipRows = false } = {}) {
  const a = v3(from), b = v3(to), direction = b.clone().sub(a).normalize();
  const across = normal.clone().cross(direction).normalize();
  // The narrow outer vane, broad inner vane, slightly off-center rachis and
  // rounded terminal portion keep feathers from reading as triangular blades.
  const points = tipRows ? [0, .18, .4, .62, .76, .84, .90, .96, 1] : rows;
  return surface(points, [-1, -.15, .45, 1], (u, v) => {
    const taper = Math.pow(Math.max(0, Math.sin(Math.PI * (.10 + .90 * u))), .63);
    const breadth = width * taper * (v < 0 ? .86 : 1);
    return a.clone().lerp(b, u)
      .addScaledVector(across, v * breadth)
      .addScaledVector(normal, bow * Math.sin(Math.PI * u) * (1 - v * v) + .0007);
  }, (u, v) => {
    const base = typeof fill === 'function' ? fill(u, v) : fill;
    // Feather margins are soft changes in tone, never high-contrast outlines.
    return mix(base, Math.abs(v) > .8 ? '#c0bbb0' : '#202523', Math.abs(v) > .8 ? edge : .012);
  }, normal);
}

// Match the same horizontal loft used by the torso so the folded coverts hug
// its surface. Detached tips keep their own thin profile beyond the rump.
function torsoSide(a, x, y) {
  if (!a.rows || y < a.rows[0][0] || y > a.rows.at(-1)[0]) return 0;
  const rows = a.rows;
  let i = rows.findIndex((row) => row[0] >= y) - 1;
  i = Math.max(0, Math.min(rows.length - 2, i));
  const t = THREE.MathUtils.clamp((y - rows[i][0]) / (rows[i + 1][0] - rows[i][0]), 0, 1);
  const sample = (j) => {
    const aa = rows[Math.max(0, i - 1)][j], b = rows[i][j];
    const c = rows[i + 1][j], d = rows[Math.min(rows.length - 1, i + 2)][j];
    return b + .5 * t * (c - aa + t * (2 * aa - 5 * b + 4 * c - d + t * (3 * (b - c) + d - aa)));
  };
  const rear = sample(1), front = sample(2), width = sample(3);
  const dx = (x - (rear + front) / 2) / Math.max(.001, (front - rear) / 2);
  return Math.abs(dx) < 1 ? width * Math.sqrt(1 - dx * dx) : 0;
}

function foldedWing(id, sp, a) {
  const wing = a.wing;
  const root = v3(wing.root), tip = v3(wing.tip);
  const direction = tip.clone().sub(root);
  const across = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
  const out = new THREE.Vector3(0, 0, 1);
  const chord = wing.chord;
  const at = (u, v, lift = 0) => {
    // The scapular end closes to a point and quickly rounds out behind it.
    // Starting with a full-width section leaves a visible straight badge edge.
    const breadth = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, .63))), .65);
    const point = root.clone().lerp(tip, u);
    point.x += .035 * (1 - u) ** 3;
    point.y += .024 * (1 - u) ** 3;
    point.addScaledVector(across, v * chord * .5 * breadth);
    // The upper/front edge vanishes into the scapular plumage, while the lower
    // wing edge and stacked primaries remain thin against the flank.
    point.z = lerp(root.z, tip.z, Math.pow(u, 1.65))
      + wing.depth * Math.sin(Math.PI * u) * (1 - .78 * v * v);
    const torso = torsoSide(a, point.x, point.y);
    point.z = Math.max(point.z, torso + .0015 * Math.sin(Math.PI * u));
    const shoulderBlend = THREE.MathUtils.smoothstep(u, 0, .18);
    if (a.rows && torso > 0) point.z = lerp(torso - .004, point.z, shoulderBlend);
    point.z += lift * shoulderBlend;
    return point;
  };
  const foldedFeather = (startT, endT, startV, endV, width, lift, fill, edge = .035) => surface(
    id === 'gull' ? [0, .18, .4, .62, .76, .84, .90, .96, 1] : rows,
    [-1, -.15, .45, 1], (u, v) => {
      const taper = Math.pow(Math.max(0, Math.sin(Math.PI * u)), .63);
      return at(lerp(startT, endT, u), lerp(startV, endV, u) + v * width * taper,
        lift + .002 * Math.sin(Math.PI * u) * (1 - v * v));
    }, (u, v) => {
      const base = typeof fill === 'function' ? fill(u, v) : fill;
      return mix(base, Math.abs(v) > .8 ? '#c0bbb0' : '#202523', Math.abs(v) > .8 ? edge : .012);
    }, out);
  const parts = [surface([0, .018, .045, .08, .13, .21, .32, .46, .62, .78, .90, .965, 1], [-1, -.5, 0, .5, 1],
    (u, v) => at(u, v), (u, v) => {
      if (id === 'gull' && u > .77) return sp.tip;
      if (u < .22 && v < -.15) return mix(sp.wing, sp.back, .6);
      return u > .72 ? mix(sp.wing, sp.tip, .65) : sp.wing;
    }, out)];

  // The longest closed primaries lie together toward the rump. Their quills
  // converge around the folded wrist instead of radiating from a side badge.
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const fill = (u) => {
      if (id === 'gull') {
        if (u > .94 || (i > 5 && u > .82 && u < .89)) return sp.primarySpot;
        return u > .55 ? sp.tip : sp.wing;
      }
      return mix(sp.wing, sp.tip, .35 + .45 * u);
    };
    parts.push(foldedFeather(.16 + t * .045, .78 + t * .22, .36 - t * .65, .52 - t * .48,
      .15, .0025 + i * .00015, fill, id === 'chickadee' ? .16 : id === 'sparrow' ? .12 : .035));
  }
  // Greater coverts/secondaries overlap along the diagonal lower margin; the
  // broad shoulder itself stays continuous with the back above these vanes.
  for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
    const acrossWing = -.68 + i * .24;
    const startT = .07 + row * .14 + i * .012;
    const endT = startT + .30 + row * .07;
    const fill = (u) => {
      let base = sp.wing;
      if (id === 'sparrow') base = i % 2 ? sp.wing : mix(sp.wing, sp.tip, .43);
      if (id === 'starling' && i % 3 === 1 && u > .90) base = mix(sp.wing, sp.speckle, .5);
      const bars = sp.wingBars ?? (sp.wingbar ? 1 : 0);
      if (bars && u > (id === 'pigeon' ? .68 : .84) && (row === 1 || bars > 1)) base = sp.wingbar;
      return base;
    };
    parts.push(foldedFeather(startT, endT, acrossWing, acrossWing + .025, .22,
      .0055 - row * .001, fill, id === 'sparrow' ? .13 : id === 'crow' ? .045 : .035));
  }
  return combine(parts);
}

export function createWings(id, sp, a, span) {
  const innerSpan = span * (a.pointed ? .42 : .45);
  const outerSpan = span - innerSpan;
  const chord = a.wing.openChord || a.wing.chord;
  const jointChord = chord * .88;
  const top = new THREE.Vector3(0, 1, 0);
  const bottom = new THREE.Vector3(0, -1, 0);
  const under = id === 'gull' ? sp.belly : mix(sp.wing, sp.belly, id === 'crow' ? .06 : .14);
  const innerLeading = (t) => .045 * (1 - t) + .019 * Math.sin(Math.PI * t);
  const innerTrailing = (t) => -lerp(chord * .73, jointChord, t) - chord * .22 * Math.sin(Math.PI * t);
  const innerAt = (t, v, side) => new THREE.Vector3(
    lerp(innerLeading(t), innerTrailing(t), v),
    .014 * Math.sin(Math.PI * v) * (1 - .35 * t) + side * .001,
    innerSpan * t,
  );
  const innerParts = [];
  const spanSamples = Array.from({ length: 13 }, (_, i) => i / 12);
  const wingCrossSections = sp.wingbar && sp.wingBars !== 0 ? [0, .22, .38, .42, .50, .54, .66, .70, .76, .80, 1] : [0, .2, .45, .7, 1];
  for (const side of [1, -1]) innerParts.push(surface(spanSamples, wingCrossSections,
    (t, v) => innerAt(t, v, side), (t, v) => {
      if (side < 0) return under;
      const bars = sp.wingBars ?? (sp.wingbar ? 1 : 0);
      if (bars && ((v > .41 && v < .52) || (bars > 1 && v > .68 && v < .78))) return sp.wingbar;
      return v > .80 ? mix(sp.wing, sp.tip, id === 'gull' ? .03 : .2) : sp.wing;
    }, side > 0 ? top : bottom));

  // Broad rounded secondaries make the trailing edge of the arm wing. Their
  // outer ends overlap; these are not the separated fingers of a crow's hand.
  for (let i = 0; i < 9; i++) {
    const t = (i + .5) / 9;
    const start = innerAt(t, .55, 1);
    const end = innerAt(Math.min(1, t + .018), 1, 1);
    start.y += .004;
    end.y += .003;
    const width = innerSpan / 9 * .65;
    innerParts.push(feather(start.toArray(), end.toArray(), width, top,
      mix(sp.wing, sp.tip, id === 'gull' ? .035 : .14), { bow: .014, edge: .025 }));
    if (id === 'gull') {
      const belowStart = innerAt(t, .55, -1), belowEnd = innerAt(Math.min(1, t + .018), 1, -1);
      belowStart.y -= .004; belowEnd.y -= .003;
      innerParts.push(feather(belowStart.toArray(), belowEnd.toArray(), width, bottom,
        sp.belly, { bow: .009, edge: .018 }));
    }
  }

  const sweep = chord * (a.pointed ? .66 : .36);
  const leading = (t) => -sweep * Math.pow(t, 1.48);
  const trailing = (t) => leading(t) - jointChord * Math.pow(1 - t, .73);
  const outerAt = (t, v, side) => new THREE.Vector3(
    lerp(leading(t), trailing(t), v),
    .011 * Math.sin(Math.PI * v) * (1 - t) + side * .001,
    outerSpan * t,
  );
  const outerParts = [];
  const crow = id === 'crow' && a.fingers;
  const extent = crow ? .64 : 1;
  const handSamples = [0, .13, .29, .46, .64, .79, .91, .97, 1].map((t) => t * extent);
  for (const side of [1, -1]) outerParts.push(surface(handSamples, [0, .22, .48, .73, 1],
    (t, v) => outerAt(t, v, side), (t, v) => {
      if (id === 'gull') return t > .67 ? sp.tip : side > 0 ? sp.wing : sp.belly;
      return side > 0 ? mix(sp.wing, sp.tip, .38 + .45 * t) : under;
    }, side > 0 ? top : bottom));

  if (crow) {
    // Six slotted distal primaries, with the longest in the middle of the hand.
    // Only their outer portions separate; broad overlapping bases close the fan.
    const ends = [[-1.06, .60], [-.97, .76], [-.79, .90], [-.55, 1], [-.29, .98], [-.04, .88]];
    for (let i = 0; i < ends.length; i++) {
      const start = [-.026 - (5 - i) * .014, .001, outerSpan * (.13 + i * .035)];
      const end = [ends[i][0] * chord, -.009 + i * .001, ends[i][1] * outerSpan];
      outerParts.push(feather(start, end, chord * .083, top, sp.tip, { bow: .005, edge: .025 }));
    }
  } else {
    // Pointed primaries overlap into a swept continuous hand, rather than a
    // rectangle with decorative strips. The last vane reaches the measured tip.
    for (let i = 0; i < 9; i++) {
      const t = .28 + i * .09;
      const start = outerAt(.015 + i * .012, .28 + (8 - i) * .055, 1);
      const end = outerAt(Math.min(1, t), i === 8 ? .2 : .99, 1);
      const width = outerSpan * .063;
      const fill = (u) => {
        if (id === 'gull') {
          if (i >= 5 && (u > .965 || (i >= 7 && u > .81 && u < .91))) return sp.primarySpot;
          return t > .67 && u > .64 ? sp.tip : sp.wing;
        }
        return mix(sp.wing, sp.tip, .42 + .40 * u);
      };
      outerParts.push(feather(start.toArray(), end.toArray(), width, top, fill,
        { bow: .0025, edge: id === 'chickadee' ? .10 : .025, tipRows: id === 'gull' }));
      if (id === 'gull') {
        const belowStart = start.clone(); belowStart.y -= .0028;
        const belowEnd = end.clone(); belowEnd.y -= .0028;
        const underFill = (u) => t > .67 && u > .64 ? fill(u) : sp.belly;
        outerParts.push(feather(belowStart.toArray(), belowEnd.toArray(), width, bottom, underFill,
          { bow: .001, edge: .018, tipRows: true }));
      }
    }
  }

  return {
    foldedG: foldedWing(id, sp, a),
    innerG: combine(innerParts),
    outerG: combine(outerParts),
    innerSpan,
  };
}
