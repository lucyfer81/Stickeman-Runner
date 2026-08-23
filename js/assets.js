/* Stickman Parkour — SVG asset factory.
   Every sprite in the game is generated as an inline SVG and drawn through
   Canvas. No bitmap images are used anywhere. */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, children) {
    let out = `<${name}`;
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value !== undefined && value !== null && value !== false) {
        out += ` ${key}="${String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
      }
    }
    if (children === undefined || children === null || children === false) return `${out}/>`;
    if (typeof children === 'string') return `${out}>${children}</${name}>`;
    if (!children.length) return `${out}/>`;
    return `${out}>${children.join('')}</${name}>`;
  }

  function linearGradient(id, stops, x1 = 0, y1 = 0, x2 = 1, y2 = 1) {
    return el('linearGradient', { id, x1, y1, x2, y2 }, stops.map(([offset, color, opacity]) =>
      el('stop', { offset: `${offset}%`, 'stop-color': color, 'stop-opacity': opacity === undefined ? 1 : opacity })
    ));
  }

  function svgWrap(viewBox, width, height, defs, content) {
    return `<svg xmlns="${NS}" viewBox="${viewBox}" width="${width}" height="${height}">` +
      (defs || []) .join('') + content.join('') + '</svg>';
  }

  // ---------------------------------------------------------------------------
  // Stickman sprites
  // ---------------------------------------------------------------------------
  const SKIN = '#f7fbff';
  const GLO = '#4df3e0';

  function glowDef(id, color = GLO) {
    return [
      el('filter', { id, x: '-40%', y: '-40%', width: '180%', height: '180%' }, [
        el('feGaussianBlur', { 'stdDeviation': '3.2', 'result': 'blur' }),
        el('feMerge', {}, [
          el('feMergeNode', { 'in': 'blur' }),
          el('feMergeNode', { 'in': 'SourceGraphic' })
        ])
      ])
    ];
  }

  function limbPath(x1, y1, x2, y2, bend = 0, bendY = 0) {
    const mx = (x1 + x2) / 2 + bend;
    const my = (y1 + y2) / 2 + (bendY || -Math.abs(bend) * 0.4);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  function runPose(phase, opts = {}) {
    const cx = opts.cx || 80;
    const hipY = opts.hipY || 103;
    const headY = opts.headY || 28;
    const bob = opts.bob || 0;
    const shoulderY = hipY - 42 + bob;
    const neckY = headY + 18;
    const lean = opts.lean || 0;
    const p = phase * Math.PI * 2;

    const paths = [];
    // legs, opposite phase
    for (let side = -1; side <= 1; side += 2) {
      const swing = Math.sin(p + (side < 0 ? 0 : Math.PI));
      const lift = Math.max(0, Math.sin(p + (side < 0 ? 0 : Math.PI) + Math.PI / 2));
      const footX = cx + side * (15 + 7 * Math.cos(p * 2 + (side < 0 ? 0 : 2.2))) + lean;
      const footY = hipY + 58 + 26 * swing + 8 * lift - bob;
      const kneeX = (cx + footX) / 2 + side * 7 + lean;
      const kneeY = (hipY + footY) / 2 - 5;
      paths.push(limbPath(cx + lean, hipY, kneeX, kneeY));
      paths.push(limbPath(kneeX, kneeY, footX, footY));
    }

    // arms, swinging opposite to the legs
    for (let side = -1; side <= 1; side += 2) {
      const swing = Math.sin(p + (side < 0 ? Math.PI : 0));
      const handX = cx + side * (20 + 9 * Math.sin(p * 2 + side)) + lean;
      const handY = shoulderY + 36 + 20 * swing - bob * 0.6;
      const elbowX = (cx + handX) / 2 + side * 8 + lean;
      const elbowY = (shoulderY + handY) / 2 - 3;
      paths.push(limbPath(cx + lean, shoulderY, elbowX, elbowY));
      paths.push(limbPath(elbowX, elbowY, handX, handY));
    }

    return { paths, cx: cx + lean, headY: headY + bob, neckY, shoulderY, hipY };
  }

  function buildStickman(pose, accent = '#4df3e0') {
    const defs = [];
    const uid = 'g' + Math.random().toString(36).slice(2, 8);
    defs.push(linearGradient(uid + 'a', [[0, SKIN], [100, accent]], 0, 0, 1, 1));
    defs.push(...glowDef(uid + 'f', accent));

    const body = [];
    // soft glow pass
    body.push(el('g', { stroke: accent, 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.20, fill: 'none' }, [
      el('path', { d: pose.paths.join('') })
    ]));
    body.push(el('g', { stroke: `url(#${uid}a)`, 'stroke-width': 6.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none', filter: `url(#${uid}f)` }, [
      el('path', { d: pose.paths.join('') })
    ]));
    body.push(el('circle', { cx: pose.cx, cy: pose.headY, r: 14.5, fill: `url(#${uid}a)`, filter: `url(#${uid}f)` }));
    // face accent: tiny confident slash
    body.push(el('path', { d: `M${pose.cx + 7} ${pose.headY - 3} l7 5`, stroke: accent, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none', opacity: 0.9 }));
    return svgWrap('0 0 160 215', 160, 215, defs, body);
  }

  function jumpPose(style) {
    const rising = style === 'rise';
    const cx = 80;
    const headY = rising ? 26 : 34;
    const hipY = rising ? 108 : 102;
    const shoulderY = hipY - 40;
    const lean = 3;
    const legLift = rising ? 40 : 58;
    const footY = hipY + legLift;
    const paths = [];

    // tucked legs
    for (let side = -1; side <= 1; side += 2) {
      const footX = cx + side * (rising ? 24 : 22) + lean;
      const kneeX = (cx + footX) / 2 + side * 12 + lean;
      const kneeY = (hipY + footY) / 2 - (rising ? 12 : 2);
      paths.push(limbPath(cx + lean, hipY, kneeX, kneeY));
      paths.push(limbPath(kneeX, kneeY, footX, footY));
    }
    // arms up on rise, wide on fall
    for (let side = -1; side <= 1; side += 2) {
      const handX = cx + side * (rising ? 24 : 34) + lean;
      const handY = rising ? shoulderY - 34 : shoulderY + 8;
      const elbowX = (cx + handX) / 2 + side * (rising ? 8 : 13) + lean;
      const elbowY = (shoulderY + handY) / 2 - 6;
      paths.push(limbPath(cx + lean, shoulderY, elbowX, elbowY));
      paths.push(limbPath(elbowX, elbowY, handX, handY));
    }

    return { paths, cx: cx + lean, headY, neckY: headY + 17, shoulderY, hipY };
  }

  function slidePose() {
    const cx = 80;
    const headY = 70;
    const hipY = 116;
    const shoulderY = 84;
    const lean = 4;
    const paths = [];
    // crouched, legs swept sideways as if sliding under a bar
    const feet = [
      [cx - 30, hipY + 46],
      [cx + 34, hipY + 52]
    ];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const kneeX = cx + side * 22 + lean;
      const kneeY = hipY + 16;
      paths.push(limbPath(cx + lean, hipY, kneeX, kneeY));
      paths.push(limbPath(kneeX, kneeY, feet[i][0], feet[i][1]));
    }
    // arms braced back
    const hands = [[cx - 32, hipY + 34], [cx + 36, hipY + 28]];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const elbowX = cx + side * 20 + lean;
      const elbowY = shoulderY + 24;
      paths.push(limbPath(cx + lean, shoulderY, elbowX, elbowY));
      paths.push(limbPath(elbowX, elbowY, hands[i][0], hands[i][1]));
    }
    return { paths, cx: cx + lean, headY, neckY: headY + 17, shoulderY, hipY };
  }

  function dodgePose(phase, direction) {
    const p = runPose(phase, { lean: direction * 12 });
    return p;
  }

  function defeatedPose() {
    const cx = 80;
    const paths = [];
    paths.push(limbPath(cx, 52, cx, 94, 0, 0));
    for (let side = -1; side <= 1; side += 2) {
      paths.push(limbPath(cx, 60, cx + side * 32, 82, side * 8));
      paths.push(limbPath(cx, 94, cx + side * 30, 132, side * 6));
    }
    return { paths, cx, headY: 30, neckY: 48, shoulderY: 60, hipY: 94 };
  }

  // ---------------------------------------------------------------------------
  // Obstacles and pickups
  // ---------------------------------------------------------------------------
  function warningStripe(x, y, w, h, color, id) {
    return [
      el('rect', { x, y, width: w, height: h, rx: 7, fill: '#141a2c', stroke: color, 'stroke-width': 4 }),
      el('path', { d: `M${x + 6} ${y + h - 6} l${w - 14} ${-h + 12}`, stroke: color, 'stroke-width': 7, opacity: 0.85 })
    ];
  }

  function hurdleSVG() {
    const defs = [];
    const id = 'hur';
    defs.push(linearGradient(id + 'a', [[0, '#ff5d8f'], [100, '#ffb347']], 0, 0, 1, 1));
    defs.push(...glowDef(id + 'f', '#ff5d8f'));
    const c = [];
    c.push(el('g', { filter: `url(#${id}f)` }, [
      el('path', { d: 'M22 34 Q22 20 36 20 L144 20 Q158 20 158 34 L158 52 Q158 66 144 66 L36 66 Q22 66 22 52 Z', fill: `url(#${id}a)`, stroke: '#fff1f5', 'stroke-width': 3 }),
      el('path', { d: 'M36 28 L144 44', stroke: '#fff', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.9 }),
      el('path', { d: 'M36 58 L144 42', stroke: '#fff', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.7 }),
      el('path', { d: 'M34 56 L18 158', stroke: '#ff5d8f', 'stroke-width': 11, 'stroke-linecap': 'round' }),
      el('path', { d: 'M146 56 L162 158', stroke: '#ffb347', 'stroke-width': 11, 'stroke-linecap': 'round' }),
      el('path', { d: 'M14 160 L166 160', stroke: '#ff5d8f', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.7 })
    ]));
    return svgWrap('0 0 180 175', 180, 175, defs, c);
  }

  function slideGateSVG() {
    const defs = [];
    const id = 'sg';
    defs.push(linearGradient(id + 'a', [[0, '#ffd166'], [100, '#ff9f43']], 0, 0, 1, 1));
    defs.push(...glowDef(id + 'f', '#ffd166'));
    const c = [];
    c.push(el('g', { filter: `url(#${id}f)` }, [
      el('path', { d: 'M16 18 L164 18 L164 94 Q164 106 152 106 L28 106 Q16 106 16 94 Z', fill: '#151b31', stroke: `url(#${id}a)`, 'stroke-width': 5 }),
      el('path', { d: 'M28 30 L152 92 M42 30 L164 88 M28 56 L146 92 M28 80 L108 92', stroke: `url(#${id}a)`, 'stroke-width': 8, opacity: 0.92 }),
      el('path', { d: 'M22 104 L22 170', stroke: '#ffd166', 'stroke-width': 10, 'stroke-linecap': 'round' }),
      el('path', { d: 'M158 104 L158 170', stroke: '#ff9f43', 'stroke-width': 10, 'stroke-linecap': 'round' }),
      el('path', { d: 'M14 172 L166 172', stroke: '#ffd166', 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.75 })
    ]));
    c.push(el('text', { x: 90, y: 68, 'text-anchor': 'middle', fill: '#fff7e6', 'font-family': 'system-ui, sans-serif', 'font-size': '25', 'font-weight': '900', 'letter-spacing': '2' }, 'SLIDE'));
    return svgWrap('0 0 180 185', 180, 185, defs, c);
  }

  function dodgeWallSVG() {
    // Tall full-lane blocker: it must read as impossible to jump so players
    // dodge sideways instead of leaping into a lethal lane-check.
    const defs = [];
    const id = 'dw';
    defs.push(linearGradient(id + 'a', [[0, '#8c5bff'], [100, '#ff5d8f']], 0, 0, 1, 1));
    defs.push(linearGradient(id + 'b', [[0, '#ff5d8f'], [50, '#8c5bff'], [100, '#ff5d8f']], 0, 0, 1, 0));
    defs.push(...glowDef(id + 'f', '#8c5bff'));
    const c = [];
    const chev = (cx, cy, dir) =>
      el('path', {
        d: `M${cx + dir * 14} ${cy - 20} L${cx - dir * 10} ${cy} L${cx + dir * 14} ${cy + 20}`,
        stroke: '#ffd166', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none', opacity: 0.95
      });
    c.push(el('g', { filter: `url(#${id}f)` }, [
      // ground plinth
      el('rect', { x: 12, y: 384, width: 126, height: 28, rx: 9, fill: '#10152b', stroke: `url(#${id}a)`, 'stroke-width': 5 }),
      // main pillar
      el('rect', { x: 30, y: 26, width: 90, height: 362, rx: 12, fill: '#171d36', stroke: `url(#${id}a)`, 'stroke-width': 7 }),
      // hazard band: sideways chevrons — "go around"
      el('rect', { x: 36, y: 168, width: 78, height: 96, rx: 8, fill: '#0e1326', opacity: 0.9 }),
      chev(62, 190, -1), chev(62, 222, -1), chev(62, 254, -1),
      chev(88, 190, 1), chev(88, 222, 1), chev(88, 254, 1),
      // no-entry slash near the top
      el('circle', { cx: 75, cy: 96, r: 30, fill: 'none', stroke: '#ff5d8f', 'stroke-width': 7 }),
      el('path', { d: 'M54 75 L96 117', stroke: '#fff', 'stroke-width': 9, 'stroke-linecap': 'round' }),
      // beacon cap
      el('rect', { x: 34, y: 16, width: 82, height: 14, rx: 6, fill: `url(#${id}b)`, 'stroke-width': 0 }),
      el('circle', { cx: 75, cy: 12, r: 8, fill: '#ff5d8f', stroke: '#ffd166', 'stroke-width': 3 })
    ]));
    return svgWrap('0 0 150 420', 150, 420, defs, c);
  }

  function coinSVG() {
    const defs = [];
    const id = 'coin';
    defs.push(linearGradient(id + 'a', [[0, '#fff2b3'], [45, '#ffd166'], [100, '#ff9f43']], 0, 0, 1, 1));
    defs.push(...glowDef(id + 'f', '#ffd166'));
    const c = [];
    c.push(el('g', { filter: `url(#${id}f)` }, [
      el('circle', { cx: 45, cy: 45, r: 32, fill: `url(#${id}a)`, stroke: '#fff7df', 'stroke-width': 5 }),
      el('circle', { cx: 45, cy: 45, r: 22, fill: 'none', stroke: '#b97913', 'stroke-width': 3, opacity: 0.7 }),
      el('path', { d: 'M45 27 L52 38 L64 39 L56 48 L59 60 L45 53 L31 60 L34 48 L26 39 L38 38 Z', fill: '#fff7df', stroke: '#b97913', 'stroke-width': 2.4, 'stroke-linejoin': 'round' })
    ]));
    return svgWrap('0 0 90 90', 90, 90, defs, c);
  }

  function sneakerSVG() {
    const defs = [];
    const id = 'sneak';
    defs.push(linearGradient(id + 'a', [[0, '#fff2b3'], [50, '#ffd166'], [100, '#ff9f43']], 0, 0, 1, 1));
    defs.push(...glowDef(id + 'f', '#ffd166'));
    const c = [];
    c.push(el('g', { filter: `url(#${id}f)` }, [
      el('path', { d: 'M10 48 Q8 24 30 18 L96 14 Q116 13 118 30 L122 44 Q124 56 110 58 L34 62 Q10 62 10 48 Z', fill: `url(#${id}a)`, stroke: '#fff7df', 'stroke-width': 5 }),
      el('path', { d: 'M30 20 L72 18', stroke: '#fff7df', 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0.9 }),
      el('path', { d: 'M38 16 Q24 -4 54 -8 Q42 8 48 17', fill: '#eaf6ff', stroke: '#4df3e0', 'stroke-width': 3.4, 'stroke-linejoin': 'round' }),
      el('path', { d: 'M18 52 L112 58', stroke: '#b97913', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      el('circle', { cx: 30, cy: 61, r: 9, fill: '#fff7df' }),
      el('circle', { cx: 98, cy: 63, r: 9, fill: '#fff7df' })
    ]));
    c.push(el('text', { x: 70, y: 88, 'text-anchor': 'middle', fill: '#fff2b3', 'font-family': 'system-ui, sans-serif', 'font-size': '16', 'font-weight': '800', 'letter-spacing': '2' }, 'GOLD KICKS'));
    return svgWrap('0 0 140 100', 140, 100, defs, c);
  }

  function birdSVG(frame) {
    const wingUp = frame === 1;
    const body = '#b9cdf2';
    return svgWrap('0 0 90 60', 90, 60, [], [
      el('g', { fill: body, stroke: '#eaf6ff', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, [
        el('ellipse', { cx: 42, cy: 34, rx: 26, ry: 13 }),
        el('circle', { cx: 67, cy: 24, r: 9, fill: body, stroke: 'none' }),
        el('path', { d: wingUp ? 'M36 28 Q20 6 6 10 Q20 20 36 28' : 'M34 28 Q18 44 6 52 Q20 42 34 28', fill: '#eaf6ff', stroke: '#4df3e0', 'stroke-width': 2 }),
        el('path', { d: 'M72 22 L82 18 L80 25 Z', fill: '#ff9f43', stroke: 'none' })
      ])
    ]);
  }

  function cloudSVG() {
    const defs = [];
    defs.push(linearGradient('cloudA', [[0, '#ffffff'], [100, '#aac8ff']], 0, 0, 1, 1));
    return svgWrap('0 0 260 100', 260, 100, defs, [
      el('g', { fill: 'url(#cloudA)', opacity: 0.22 }, [
        el('ellipse', { cx: 70, cy: 62, rx: 52, ry: 24 }),
        el('ellipse', { cx: 140, cy: 46, rx: 66, ry: 32 }),
        el('ellipse', { cx: 205, cy: 64, rx: 46, ry: 22 })
      ])
    ]);
  }

  function sunSVG() {
    const defs = [];
    defs.push(linearGradient('sunA', [[0, '#ffe29b'], [100, '#ff5d8f']], 0, 0, 1, 1));
    defs.push(...glowDef('sunF', '#ffb347'));
    return svgWrap('0 0 260 220', 260, 220, defs, [
      el('circle', { cx: 130, cy: 125, r: 72, fill: 'url(#sunA)', filter: 'url(#sunF)' }),
      el('circle', { cx: 130, cy: 125, r: 46, fill: '#fff2b3', opacity: 0.9 })
    ]);
  }

  function skylineSVG() {
    const defs = [];
    defs.push(linearGradient('cityA', [[0, '#101832'], [55, '#0c1226'], [100, '#070b18']], 0, 0, 0, 1));
    const buildings = [];
    let x = 0;
    let i = 0;
    const heights = [120, 210, 160, 260, 150, 230, 190, 300, 170, 240, 140, 220, 180, 275, 155, 200, 245, 130, 210, 165];
    while (x < 1600) {
      const h = heights[i % heights.length];
      const w = 62 + ((i * 37) % 46);
      buildings.push(el('rect', { x, y: 330 - h, width: w, height: h, fill: 'url(#cityA)', stroke: '#1b2b4d', 'stroke-width': 1.5 }));
      if (i % 2 === 0) {
        buildings.push(el('rect', { x: x + 12, y: 330 - h + 22, width: 10, height: 14, fill: '#4df3e0', opacity: 0.75 }));
        buildings.push(el('rect', { x: x + 34, y: 330 - h + 52, width: 10, height: 14, fill: '#ffd166', opacity: 0.7 }));
      } else {
        buildings.push(el('rect', { x: x + 20, y: 330 - h + 30, width: 12, height: 18, fill: '#ff5d8f', opacity: 0.65 }));
        buildings.push(el('rect', { x: x + w - 22, y: 330 - h + 70, width: 10, height: 14, fill: '#4df3e0', opacity: 0.7 }));
      }
      if (i % 3 === 1) {
        buildings.push(el('path', { d: `M${x + w * 0.4} ${330 - h} L${x + w * 0.55} ${330 - h - 38} L${x + w * 0.7} ${330 - h}`, fill: 'none', stroke: '#ff5d8f', 'stroke-width': 4, opacity: 0.55 }));
      }
      x += w;
      i++;
    }
    return svgWrap('0 0 1600 340', 1600, 340, defs, [
      el('rect', { width: 1600, height: 340, fill: 'none' }),
      ...buildings
    ]);
  }

  // ---------------------------------------------------------------------------
  // Loading / caching
  // ---------------------------------------------------------------------------
  const cache = new Map();

  function svgToUrl(svg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function load(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  function makeSprites() {
    const defs = {};
    defs.stickman = {
      run: [],
      jumpRise: null,
      jumpFall: null,
      slide: null,
      dodgeL: [],
      dodgeR: [],
      defeated: null
    };
    for (let i = 0; i < 8; i++) {
      defs.stickman.run.push(svgToUrl(buildStickman(runPose(i / 8))));
      defs.stickman.dodgeL.push(svgToUrl(buildStickman(dodgePose(i / 8, -1), '#4df3e0')));
      defs.stickman.dodgeR.push(svgToUrl(buildStickman(dodgePose(i / 8, 1), '#4df3e0')));
    }
    defs.stickman.jumpRise = svgToUrl(buildStickman(jumpPose('rise')));
    defs.stickman.jumpFall = svgToUrl(buildStickman(jumpPose('fall')));
    defs.stickman.slide = svgToUrl(buildStickman(slidePose(), '#ffd166'));
    defs.stickman.defeated = svgToUrl(buildStickman(defeatedPose(), '#ff5d8f'));

    defs.hurdle = svgToUrl(hurdleSVG());
    defs.slideGate = svgToUrl(slideGateSVG());
    defs.dodgeWall = svgToUrl(dodgeWallSVG());
    defs.coin = svgToUrl(coinSVG());
    defs.sneaker = svgToUrl(sneakerSVG());
    defs.bird = [svgToUrl(birdSVG(0)), svgToUrl(birdSVG(1))];
    defs.cloud = svgToUrl(cloudSVG());
    defs.sun = svgToUrl(sunSVG());
    defs.skyline = svgToUrl(skylineSVG());
    return defs;
  }

  async function preload(defs) {
    const urls = [];
    const collect = (value) => {
      if (typeof value === 'string') urls.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    Object.values(defs).forEach(collect);
    const unique = [...new Set(urls)];
    const images = await Promise.all(unique.map((url) => {
      if (cache.has(url)) return cache.get(url);
      return load(url).then((img) => {
        cache.set(url, img);
        return img;
      });
    }));
    return images;
  }

  function get(def, key, subkey, frame) {
    const val = def[key];
    if (Array.isArray(val)) {
      return cache.get(val[Math.min(subkey || 0, val.length - 1)]);
    }
    if (val && typeof val === 'object') {
      const nested = val[subkey] !== undefined ? val[subkey] : val.run;
      if (Array.isArray(nested)) {
        return cache.get(nested[Math.min(frame || 0, nested.length - 1)]);
      }
      return cache.get(nested);
    }
    return cache.get(val);
  }

  global.Assets = { makeSprites, preload, get, svgWrap, el };
})(window);
