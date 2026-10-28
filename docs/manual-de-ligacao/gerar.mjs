// Builds docs/manual-de-ligacao.pdf, the wiring manual of the station: `pnpm docs:manual`.
// The text and the drawings live here; Chromium (the dashboard's Playwright) prints the PDF.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const output = join(root, 'docs', 'manual-de-ligacao.pdf');
const require = createRequire(join(root, 'apps', 'dashboard', 'package.json'));
const { chromium } = require('@playwright/test');

// Archivo, the dashboard's typeface, embedded so the PDF looks the same anywhere.
const fontDir = join(
  dirname(require.resolve('@fontsource-variable/archivo/package.json')),
  'files',
);
const font = (file) => readFileSync(join(fontDir, file)).toString('base64');

// ---- drawing --------------------------------------------------------------------------------

/** Wire colours: each one is also named on the drawing, so a grey print still reads. */
const C = {
  v33: '#d62828',
  gnd: '#1f2933',
  scl: '#c99200',
  sda: '#1f6fd0',
  wind: '#178a46',
  rain: '#7a3cc2',
  bat: '#e0700b',
  sense: '#8a5a2b',
  jumper: '#6b7785',
  idle: '#a3adb8',
};

// D1 mini seen from above, antenna up and USB down: 8 pins on each side, 22 px apart.
const LEFT = ['RST', 'A0', 'D0', 'D5', 'D6', 'D7', 'D8', '3V3'];
const RIGHT = ['TX', 'RX', 'D1', 'D2', 'D3', 'D4', 'G', '5V'];
const FIRST_PIN = 44;
const PITCH = 22;

function pinAt(ox, oy, name) {
  const left = LEFT.indexOf(name);
  if (left >= 0) return [ox + 14, oy + FIRST_PIN + PITCH * left];
  return [ox + 156, oy + FIRST_PIN + PITCH * RIGHT.indexOf(name)];
}

function pad(x, y, dimmed = false) {
  return dimmed
    ? `<circle cx="${x}" cy="${y}" r="6.5" fill="#cfd5db" stroke="#9aa3ac"/><circle cx="${x}" cy="${y}" r="2.6" fill="#7d8791"/>`
    : `<circle cx="${x}" cy="${y}" r="6.5" fill="#d9b45a" stroke="#9a7a2e"/><circle cx="${x}" cy="${y}" r="2.6" fill="#3b2c12"/>`;
}

/** The board; `used` maps pin names to the colour of the ring drawn around them. */
function board(ox, oy, used = {}) {
  const pins = [
    ...LEFT.map((name, i) => [name, ox + 14, i, 'start', 12]),
    ...RIGHT.map((name, i) => [name, ox + 156, i, 'end', -12]),
  ]
    .map(([name, x, i, anchor, dx]) => {
      const y = oy + FIRST_PIN + PITCH * i;
      const ring = used[name]
        ? `<circle cx="${x}" cy="${y}" r="10.5" fill="none" stroke="${used[name]}" stroke-width="2.6"/>`
        : '';
      return `${ring}${pad(x, y)}<text x="${x + dx}" y="${y + 4}" text-anchor="${anchor}" class="pinname">${name}</text>`;
    })
    .join('');
  return `<g>
    <rect x="${ox}" y="${oy}" width="170" height="232" rx="9" fill="#24476d" stroke="#14304e" stroke-width="1.5"/>
    <path d="M${ox + 44} ${oy + 22}h10v-10h12v10h12v-10h12v10h12v-10h12v10h12" fill="none" stroke="#d9b45a" stroke-width="2"/>
    <rect x="${ox + 52}" y="${oy + 32}" width="66" height="86" rx="3" fill="#d6dce2" stroke="#97a1ab"/>
    <text x="${ox + 85}" y="${oy + 79}" text-anchor="middle" class="chip">ESP-12F</text>
    <rect x="${ox + 65}" y="${oy + 224}" width="40" height="20" rx="2" fill="#bcc3cb" stroke="#808b96"/>
    <text x="${ox + 85}" y="${oy + 238}" text-anchor="middle" class="tiny">USB</text>
    ${pins}
  </g>`;
}

function wire(points, color, { dashed = false } = {}) {
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  return wirePath(d, points[0], points[points.length - 1], color, { dashed });
}

/** A wire along any SVG path `d`, from `start` to `end` (a hop over another wire needs an arc). */
function wirePath(d, [sx, sy], [ex, ey], color, { dashed = false } = {}) {
  const dash = dashed ? ' stroke-dasharray="8 6"' : '';
  return `<path d="${d}" class="halo"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"${dash}/>
    <circle cx="${sx}" cy="${sy}" r="3.8" fill="${color}"/><circle cx="${ex}" cy="${ey}" r="3.8" fill="${color}"/>`;
}

/** Name of a wire, on a white pill outlined in its colour. */
function tag(x, y, text, color) {
  const width = Math.round(text.length * 6.6 + 18);
  return `<g><rect x="${x - width / 2}" y="${y - 9.5}" width="${width}" height="19" rx="9.5" fill="#fff" stroke="${color}" stroke-width="1.6"/>
    <text x="${x}" y="${y + 4}" text-anchor="middle" class="tag">${text}</text></g>`;
}

/** A breakout board with its pins along the left or right edge; returns where each pin is. */
function breakout({ x, y, w, h, fill, title, subtitle, pins, side, firstPinY, dimmed = [] }) {
  const px = side === 'left' ? x : x + w;
  const at = {};
  const pads = pins
    .map((name, i) => {
      const py = firstPinY + PITCH * i;
      at[name] = [px, py];
      const off = dimmed.includes(name);
      const tx = side === 'left' ? px + 13 : px - 13;
      const anchor = side === 'left' ? 'start' : 'end';
      return `${pad(px, py, off)}<text x="${tx}" y="${py + 4}" text-anchor="${anchor}" class="pinname${off ? ' off' : ''}">${name}</text>`;
    })
    .join('');
  const titleX = side === 'left' ? x + w - 12 : x + 12;
  const anchor = side === 'left' ? 'end' : 'start';
  const sub = subtitle
    ? `<text x="${titleX}" y="${y + 40}" text-anchor="${anchor}" class="modsub">${subtitle}</text>`
    : '';
  return {
    svg: `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${fill}" stroke="rgba(0,0,0,.3)"/>
      ${pads}<text x="${titleX}" y="${y + 24}" text-anchor="${anchor}" class="modtitle">${title}</text>${sub}</g>`,
    at,
  };
}

function svg(width, height, body, label, minX = 0) {
  return `<svg viewBox="${minX} 0 ${width} ${height}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

// ---- diagrams -------------------------------------------------------------------------------

function pinoutDiagram() {
  const ox = 235;
  const oy = 24;
  const left = {
    RST: ['Fio até o D0', C.jumper],
    A0: ['Bateria (+), resistor 100 kΩ', C.sense],
    D0: ['Fio até o RST', C.jumper],
    D5: ['Pluviômetro (sinal)', C.rain],
    D6: ['Anemômetro (sinal)', C.wind],
    D7: ['Livre', null],
    D8: ['Evite: decide o boot', null],
    '3V3': ['3,3 V dos sensores', C.v33],
  };
  const right = {
    TX: ['Serial do USB', null],
    RX: ['Serial do USB', null],
    D1: ['SCL do sensor de clima', C.scl],
    D2: ['SDA do sensor de clima', C.sda],
    D3: ['Evite: decide o boot', null],
    D4: ['LED da placa', null],
    G: ['GND comum', C.gnd],
    '5V': ['OUT+ do carregador', C.bat],
  };
  const used = Object.fromEntries(
    Object.entries({ ...left, ...right })
      .filter(([, [, color]]) => color)
      .map(([name, [, color]]) => [name, color]),
  );
  const leaders = [
    ...Object.entries(left).map(([name, [text, color]]) => {
      const [x, y] = pinAt(ox, oy, name);
      return [x - 11, y, 206, y, 200, 'end', text, color];
    }),
    ...Object.entries(right).map(([name, [text, color]]) => {
      const [x, y] = pinAt(ox, oy, name);
      return [x + 11, y, 434, y, 440, 'start', text, color];
    }),
  ]
    .map(([x1, y, x2, , tx, anchor, text, color]) => {
      const line = color
        ? `<path d="M${x1} ${y}H${x2}" stroke="${color}" stroke-width="3.4" stroke-linecap="round"/>`
        : `<path d="M${x1} ${y}H${x2}" stroke="${C.idle}" stroke-width="1.2" stroke-dasharray="3 4"/>`;
      return `${line}<text x="${tx}" y="${y + 4}" text-anchor="${anchor}" class="callout-label${color ? '' : ' idle'}">${text}</text>`;
    })
    .join('');
  const orientation = `<text x="${ox + 85}" y="${oy - 8}" text-anchor="middle" class="note">antena</text>
    <text x="${ox + 85}" y="${oy + 262}" text-anchor="middle" class="note">conector USB</text>`;
  return svg(
    556,
    296,
    board(ox, oy, used) + leaders + orientation,
    'Pinos do D1 mini e o que vai em cada um',
    30,
  );
}

function climateDiagram() {
  const ox = 60;
  const oy = 40;
  const sensor = breakout({
    x: 430,
    y: 62,
    w: 150,
    h: 154,
    fill: '#4b2f7a',
    title: 'BME280',
    subtitle: 'ou HTU21D (GY-21)',
    pins: ['VIN', 'GND', 'SCL', 'SDA', 'CSB', 'SDO'],
    side: 'left',
    firstPinY: 84,
    dimmed: ['CSB', 'SDO'],
  });
  const at = (name) => pinAt(ox, oy, name);
  const [d1x, d1y] = at('D1');
  const [d2x, d2y] = at('D2');
  const [gx, gy] = at('G');
  const [vx, vy] = at('3V3');
  const body = [
    board(ox, oy, { D1: C.scl, D2: C.sda, G: C.gnd, '3V3': C.v33 }),
    sensor.svg,
    wire([[vx, vy], [40, vy], [40, 22], [400, 22], [400, sensor.at.VIN[1]], sensor.at.VIN], C.v33),
    wire([[gx, gy], [300, gy], [300, sensor.at.GND[1]], sensor.at.GND], C.gnd),
    wire([[d1x, d1y], sensor.at.SCL], C.scl),
    wire([[d2x, d2y], sensor.at.SDA], C.sda),
    tag(230, 22, '3,3 V', C.v33),
    tag(258, gy, 'GND', C.gnd),
    tag(368, d1y, 'SCL', C.scl),
    tag(368, d2y, 'SDA', C.sda),
    `<text x="505" y="236" text-anchor="middle" class="note">CSB e SDO ficam soltos</text>`,
  ].join('');
  return svg(640, 300, body, 'Ligação do sensor de clima ao D1 mini');
}

/** Hall sensor wired to `signal` (D5 or D6); `scene` draws the part it watches. */
function hallDiagram(signal, color, subtitle, scene) {
  const ox = 380;
  const oy = 20;
  const [sx, sy] = pinAt(ox, oy, signal);
  const [vx, vy] = pinAt(ox, oy, '3V3');
  const [gx, gy] = pinAt(ox, oy, 'G');
  const hall = breakout({
    x: 110,
    y: sy - 24,
    w: 140,
    h: 92,
    fill: '#1f5d4a',
    title: 'Sensor Hall',
    subtitle,
    pins: ['OUT', 'VCC', 'GND'],
    side: 'right',
    firstPinY: sy,
  });
  const below = oy + 258;
  const body = [
    board(ox, oy, { [signal]: color, '3V3': C.v33, G: C.gnd }),
    hall.svg,
    scene(hall.at.OUT[1]),
    wire([[sx, sy], hall.at.OUT], color),
    wire([[vx, vy], [330, vy], [330, hall.at.VCC[1]], hall.at.VCC], C.v33),
    wire(
      [[gx, gy], [gx + 22, gy], [gx + 22, below], [300, below], [300, hall.at.GND[1]], hall.at.GND],
      C.gnd,
    ),
    tag(322, sy, 'sinal', color),
    tag(290, hall.at.VCC[1], '3,3 V', C.v33),
    tag(440, below, 'GND', C.gnd),
  ].join('');
  return svg(640, 296, body, `Ligação do sensor Hall ao pino ${signal}`);
}

/** Cup rotor with three magnets, next to the Hall sensor. */
function rotor(y) {
  const cx = 52;
  const cy = y + 20;
  const magnets = [0, 120, 240]
    .map(
      (angle) =>
        `<g transform="rotate(${angle} ${cx} ${cy})"><rect x="${cx - 5}" y="${cy - 40}" width="10" height="9" fill="${C.v33}"/><rect x="${cx - 5}" y="${cy - 31}" width="10" height="9" fill="${C.sda}"/></g>`,
    )
    .join('');
  return `<circle cx="${cx}" cy="${cy}" r="36" fill="#eef1f4" stroke="#9aa5b1" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="#9aa5b1"/>${magnets}
    <text x="${cx}" y="${cy + 54}" text-anchor="middle" class="note">rotor: 3 ímãs</text>`;
}

/** Tipping bucket: a seesaw with a magnet that passes the sensor on each tip. */
function bucket(y) {
  const cy = y + 26;
  return `<path d="M14 ${cy - 22}L96 ${cy}" stroke="#7d8791" stroke-width="3" stroke-linecap="round"/>
    <path d="M10 ${cy - 34}h22l-4 14h-14z" fill="#d6dce2" stroke="#7d8791" stroke-width="1.5" transform="rotate(15 21 ${cy - 27})"/>
    <path d="M78 ${cy - 12}h22l-4 14h-14z" fill="#d6dce2" stroke="#7d8791" stroke-width="1.5" transform="rotate(15 89 ${cy - 5})"/>
    <path d="M55 ${cy - 11}l-9 22h18z" fill="#9aa5b1"/>
    <rect x="${88}" y="${cy - 10}" width="10" height="7" fill="${C.v33}"/><rect x="${98}" y="${cy - 10}" width="10" height="7" fill="${C.sda}"/>
    <text x="56" y="${cy + 30}" text-anchor="middle" class="note">báscula com ímã</text>`;
}

/** KY-024 board (49E with an LM393 comparator) wired to `signal`, the rotor beside its sensor. */
function ky024Diagram(signal, color) {
  const ox = 380;
  const oy = 20;
  const [sx, sy] = pinAt(ox, oy, signal);
  const [vx, vy] = pinAt(ox, oy, '3V3');
  const [gx, gy] = pinAt(ox, oy, 'G');
  const ky = breakout({
    x: 110,
    y: sy - 24,
    w: 140,
    h: 114,
    fill: '#8f2430',
    title: 'KY-024',
    subtitle: '49E + comparador',
    pins: ['DO', '+', 'G', 'AO'],
    side: 'right',
    firstPinY: sy,
    dimmed: ['AO'],
  });
  const below = oy + 258;
  // The potentiometer that sets the switching point, and the 49E bent over the board's edge.
  const pot = `<rect x="124" y="${sy + 34}" width="22" height="22" rx="2" fill="#2f6db5" stroke="#1d4a80"/>
    <circle cx="135" cy="${sy + 45}" r="6.5" fill="#d6dce2"/>
    <path d="M131 ${sy + 45}h8M135 ${sy + 41}v8" stroke="#5c6773" stroke-width="1.6"/>
    <text x="152" y="${sy + 49}" class="modsub">ajuste</text>`;
  const cy = sy + 20;
  const head = `<path d="M104 ${cy - 7}h6M104 ${cy}h6M104 ${cy + 7}h6" stroke="#9aa3ac" stroke-width="2"/>
    <rect x="90" y="${cy - 12}" width="14" height="24" rx="3" fill="#2b2f36"/>`;
  const body = [
    board(ox, oy, { [signal]: color, '3V3': C.v33, G: C.gnd }),
    ky.svg,
    pot,
    rotor(sy),
    head,
    wire([[sx, sy], ky.at.DO], color),
    wire([[vx, vy], [330, vy], [330, ky.at['+'][1]], ky.at['+']], C.v33),
    wire(
      [[gx, gy], [gx + 22, gy], [gx + 22, below], [300, below], [300, ky.at.G[1]], ky.at.G],
      C.gnd,
    ),
    tag(322, sy, 'sinal', color),
    tag(290, ky.at['+'][1], '3,3 V', C.v33),
    tag(440, below, 'GND', C.gnd),
    `<text x="262" y="${ky.at.AO[1] + 4}" class="note">solto</text>`,
  ].join('');
  return svg(640, 296, body, `Ligação da placa KY-024 ao pino ${signal}`);
}

/**
 * The bare 49E powered from 5V, with a divider on its output (1 kΩ in series, 10 kΩ to ground): it
 * puts the pin's switching point between the resting level and the weakest magnet.
 */
function bare49eDiagram() {
  const ox = 380;
  const oy = 20;
  const [sx, sy] = pinAt(ox, oy, 'D6');
  const [gx, gy] = pinAt(ox, oy, 'G');
  const [fx, fy] = pinAt(ox, oy, '5V');
  // The flat face, with the text, toward the reader and the legs turned right: OUT, GND, VCC.
  const legs = [
    ['OUT', sy],
    ['GND', sy + 22],
    ['VCC', sy + 44],
  ];
  const top = sy - 14;
  const bottom = sy + 58;
  const sensor = `<path d="M144 ${top}H190V${bottom}H144L136 ${bottom - 8}V${top + 8}Z" fill="#2b2f36"/>
    <text transform="rotate(-90 151 ${sy + 22})" x="151" y="${sy + 26}" text-anchor="middle" class="ic">49E</text>
    ${legs.map(([name, y]) => `<path d="M190 ${y}H214" stroke="#9aa3ac" stroke-width="2.4"/>${pad(214, y)}<text x="187" y="${y + 3.5}" text-anchor="end" class="legname">${name}</text>`).join('')}`;
  const [, groundY] = legs[1];
  const [, supplyY] = legs[2];
  const series = `<rect x="258" y="${sy - 7}" width="40" height="14" rx="3" fill="#efe1c2" stroke="${C.sense}" stroke-width="1.4"/>
    <rect x="265" y="${sy - 7}" width="3" height="14" fill="#8a5a2b"/><rect x="271" y="${sy - 7}" width="3" height="14" fill="#1f2933"/>
    <rect x="277" y="${sy - 7}" width="3" height="14" fill="#c62828"/><rect x="289" y="${sy - 7}" width="3" height="14" fill="#c99200"/>
    <text x="278" y="${sy - 14}" text-anchor="middle" class="callout-label">1 kΩ</text>`;
  const node = 340;
  const pullDown = `<rect x="${node - 7}" y="${sy + 18}" width="14" height="40" rx="3" fill="#efe1c2" stroke="${C.sense}" stroke-width="1.4"/>
    <rect x="${node - 7}" y="${sy + 24}" width="14" height="3" fill="#8a5a2b"/><rect x="${node - 7}" y="${sy + 30}" width="14" height="3" fill="#1f2933"/>
    <rect x="${node - 7}" y="${sy + 36}" width="14" height="3" fill="#e0700b"/><rect x="${node - 7}" y="${sy + 49}" width="14" height="3" fill="#c99200"/>
    <text x="${node - 14}" y="${sy + 42}" text-anchor="end" class="callout-label">10 kΩ</text>`;
  const capX = 240;
  const capacitor = `<path d="M${capX} ${groundY}V${groundY + 6}M${capX} ${supplyY - 6}V${supplyY}" stroke="#7d8791" stroke-width="1.6"/>
    <ellipse cx="${capX}" cy="${groundY + 11}" rx="7" ry="5.5" fill="#e0a030" stroke="#9a6a12"/>
    <text x="${capX}" y="${sy + 14}" text-anchor="middle" class="note">100 nF</text>`;
  const groundBelow = oy + 258;
  const supplyBelow = oy + 276;
  const hop = gx + 22;
  const supplyPath = `M214 ${supplyY}H272V${supplyBelow}H590V${fy}H${hop + 6}A6 6 0 0 0 ${hop - 6} ${fy}H${fx}`;
  const body = [
    board(ox, oy, { D6: C.wind, G: C.gnd, '5V': C.bat }),
    sensor,
    wire(
      [
        [214, groundY],
        [290, groundY],
        [290, groundBelow],
        [hop, groundBelow],
        [hop, gy],
        [gx, gy],
      ],
      C.gnd,
    ),
    wirePath(supplyPath, [214, supplyY], [fx, fy], C.bat),
    capacitor,
    wire(
      [
        [214, sy],
        [sx, sy],
      ],
      C.wind,
    ),
    series,
    wire(
      [
        [node, sy],
        [node, sy + 18],
      ],
      C.wind,
    ),
    wire(
      [
        [node, sy + 58],
        [node, groundBelow],
      ],
      C.gnd,
    ),
    pullDown,
    tag(420, groundBelow, 'GND', C.gnd),
    tag(480, supplyBelow, '5 V', C.bat),
  ].join('');
  return svg(640, 316, body, 'Ligação do 49E solto, alimentado pelo 5V, ao pino D6, com o divisor');
}

/** The 49E's legs seen from the face with the text, and the magnet passing in front of it. */
function hallPinoutDiagram() {
  const legs = [
    ['VCC', 118, 92, C.bat],
    ['GND', 130, 130, C.gnd],
    ['OUT', 142, 168, C.wind],
  ];
  const front = `<text x="130" y="16" text-anchor="middle" class="note">face com o texto para você</text>
    <path d="M118 30H142L150 38V84H110V38Z" fill="#2b2f36"/>
    <text x="130" y="62" text-anchor="middle" class="ic">49E</text>
    ${legs.map(([name, x, end, color], i) => `<path d="M${x} 84V96L${end} 116V128" fill="none" stroke="#9aa3ac" stroke-width="2.4"/><circle cx="${end}" cy="132" r="5" fill="${color}"/><text x="${end}" y="152" text-anchor="middle" class="callout-label">${i + 1} ${name}</text>`).join('')}
`;
  const side = `<text x="470" y="16" text-anchor="middle" class="note">visto de lado</text>
    <rect x="392" y="52" width="24" height="26" fill="${C.sda}"/><rect x="416" y="52" width="24" height="26" fill="${C.v33}"/>
    <text x="404" y="70" text-anchor="middle" class="modtitle">S</text><text x="428" y="70" text-anchor="middle" class="modtitle">N</text>
    <text x="416" y="94" text-anchor="middle" class="note">ímã</text>
    <path d="M470 40H482A20 25 0 0 1 482 90H470Z" fill="#2b2f36"/>
    <path d="M478 90V132" stroke="#9aa3ac" stroke-width="2.4"/>
    <text x="474" y="33" text-anchor="end" class="note">face com o texto</text>
    <path d="M470 36V40" stroke="#5c6773" stroke-width="1.2"/>
    <path d="M442 104H468" stroke="#5c6773" stroke-width="1.2"/><path d="M442 100V108M468 100V108" stroke="#5c6773" stroke-width="1.2"/>
    <text x="455" y="122" text-anchor="middle" class="note">1 a 2 mm</text>
    <text x="470" y="152" text-anchor="middle" class="callout-label">polo norte voltado para o sensor</text>`;
  return svg(640, 160, front + side, 'Pernas do 49E e posição do ímã');
}

function powerDiagram() {
  const ox = 100;
  const oy = 30;
  const charger = { x: 360, y: 176, w: 170, h: 90 };
  const [rx, ry] = pinAt(ox, oy, 'RST');
  const [d0x, d0y] = pinAt(ox, oy, 'D0');
  const [ax, ay] = pinAt(ox, oy, 'A0');
  const [gx, gy] = pinAt(ox, oy, 'G');
  const [fx, fy] = pinAt(ox, oy, '5V');
  const bottom = charger.y + charger.h;
  const bPlus = [404, bottom];
  const bMinus = [486, bottom];
  const inPlus = [charger.x + charger.w, 196];
  const inMinus = [charger.x + charger.w, 236];
  const outMinus = [charger.x, gy];
  const outPlus = [charger.x, fy];
  const padLabel = (x, y, text, anchor) => {
    const tx = anchor === 'start' ? x + 13 : anchor === 'end' ? x - 13 : x;
    const ty = anchor === 'middle' ? y - 12 : y + 4;
    return `${pad(x, y)}<text x="${tx}" y="${ty}" text-anchor="${anchor}" class="pinname">${text}</text>`;
  };
  const chargerSvg = `<g>
    <rect x="${charger.x}" y="${charger.y}" width="${charger.w}" height="${charger.h}" rx="7" fill="#22528c" stroke="rgba(0,0,0,.3)"/>
    <rect x="478" y="${charger.y - 9}" width="36" height="11" rx="2" fill="#bcc3cb" stroke="#808b96"/>
    <text x="445" y="${charger.y + 30}" text-anchor="middle" class="modtitle">TP4056</text>
    <text x="445" y="${charger.y + 46}" text-anchor="middle" class="modsub">com proteção</text>
    ${padLabel(...outMinus, 'OUT−', 'start')}${padLabel(...outPlus, 'OUT+', 'start')}
    ${padLabel(...inPlus, 'IN+', 'end')}${padLabel(...inMinus, 'IN−', 'end')}
    ${padLabel(...bPlus, 'B+', 'middle')}${padLabel(...bMinus, 'B−', 'middle')}
  </g>`;
  const battery = `<g>
    <rect x="370" y="318" width="170" height="42" rx="12" fill="#2f6db5" stroke="#1d4a80"/>
    <rect x="364" y="330" width="7" height="18" rx="2" fill="#c3cad2"/>
    <text x="${bPlus[0]}" y="345" text-anchor="middle" class="modtitle">+</text>
    <text x="${bMinus[0]}" y="345" text-anchor="middle" class="modtitle">−</text>
    <text x="455" y="378" text-anchor="middle" class="note">célula 18650 (Li-ion, 3,7 V)</text>
  </g>`;
  const cells = Array.from({ length: 8 }, (_, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    return `<rect x="${571 + col * 30}" y="${168 + row * 24}" width="26" height="20" fill="#26375a" stroke="#4d6a96"/>`;
  }).join('');
  const panel = `<g>
    <rect x="566" y="160" width="70" height="112" rx="4" fill="#1a2740" stroke="#7d8791" stroke-dasharray="5 4"/>${cells}
    <text x="601" y="290" text-anchor="middle" class="note">painel solar</text>
    <text x="601" y="304" text-anchor="middle" class="note">5–6 V (opcional)</text>
  </g>`;
  const junction = [bPlus[0], 292];
  const resistor = `<g>
    <rect x="50" y="160" width="12" height="40" rx="3" fill="#efe1c2" stroke="${C.sense}" stroke-width="1.5"/>
    <rect x="50" y="168" width="12" height="4" fill="#8a5a2b"/><rect x="50" y="176" width="12" height="4" fill="#1f2933"/><rect x="50" y="184" width="12" height="4" fill="#e0700b"/>
    <text x="44" y="184" text-anchor="end" class="callout-label">100 kΩ</text>
  </g>`;
  const body = [
    board(ox, oy, { RST: C.jumper, D0: C.jumper, A0: C.sense, G: C.gnd, '5V': C.bat }),
    chargerSvg,
    battery,
    panel,
    wire(
      [
        [rx, ry],
        [92, ry],
        [92, d0y],
        [d0x, d0y],
      ],
      C.jumper,
    ),
    wire([[gx, gy], outMinus], C.gnd),
    wire([[fx, fy], outPlus], C.bat),
    wire([bPlus, [bPlus[0], 318]], C.bat),
    wire([bMinus, [bMinus[0], 318]], C.gnd),
    wire([[566, inPlus[1]], inPlus], C.bat, { dashed: true }),
    wire([[566, inMinus[1]], inMinus], C.gnd, { dashed: true }),
    wire([junction, [56, junction[1]], [56, ay], [ax, ay]], C.sense),
    resistor,
    tag(308, gy, 'GND', C.gnd),
    tag(308, fy, '5V', C.bat),
    tag(56, 46, 'fio D0–RST', C.jumper),
    tag(230, junction[1], 'medição da bateria', C.sense),
  ].join('');
  return svg(640, 384, body, 'Ligação da bateria, do carregador e da medição no A0');
}

/** The voltage divider on A0: the resistor you add and the two inside the board. */
function dividerDiagram() {
  const y = 112;
  const resistor = (
    x,
    value,
    note,
  ) => `<rect x="${x}" y="${y - 10}" width="64" height="20" rx="3" fill="#efe1c2" stroke="${C.sense}" stroke-width="1.6"/>
    <text x="${x + 32}" y="${y - 20}" text-anchor="middle" class="callout-label">${value}</text>
    <text x="${x + 32}" y="${y + 34}" text-anchor="middle" class="note">${note}</text>`;
  const node = (x, name, volts) => `<circle cx="${x}" cy="${y}" r="5" fill="${C.sense}"/>
    <text x="${x}" y="${y - 20}" text-anchor="middle" class="callout-label">${name}</text>
    <text x="${x}" y="${y + 34}" text-anchor="middle" class="note">${volts}</text>`;
  const line = (x1, x2) =>
    `<path d="M${x1} ${y}H${x2}" stroke="${C.sense}" stroke-width="3.4" stroke-linecap="round"/>`;
  const body = `
    <rect x="236" y="44" width="396" height="128" rx="10" fill="#f3f5f7" stroke="#b7c0c9" stroke-dasharray="6 5"/>
    <text x="620" y="62" text-anchor="end" class="note">dentro do D1 mini</text>
    <rect x="14" y="${y - 22}" width="58" height="44" rx="8" fill="#2f6db5" stroke="#1d4a80"/>
    <text x="43" y="${y + 5}" text-anchor="middle" class="modtitle">+</text>
    <text x="43" y="${y + 40}" text-anchor="middle" class="note">bateria</text>
    <text x="43" y="${y + 54}" text-anchor="middle" class="note">até 4,2 V</text>
    ${line(72, 120)}${resistor(120, '100 kΩ', 'você coloca')}${line(184, 266)}
    ${node(266, 'A0', 'até 3,2 V')}${line(266, 316)}${resistor(316, '220 kΩ', 'na placa')}${line(380, 440)}
    ${node(440, 'ADC', 'até 1,0 V')}${line(440, 490)}${resistor(490, '100 kΩ', 'na placa')}${line(554, 592)}
    <path d="M592 ${y - 12}V${y + 12}M600 ${y - 7}V${y + 7}M608 ${y - 3}V${y + 3}" stroke="#1f2933" stroke-width="2.4" stroke-linecap="round"/>
    <text x="600" y="${y + 34}" text-anchor="middle" class="note">GND</text>
    <text x="320" y="200" text-anchor="middle" class="note">Com a bateria cheia passam uns 10 µA: 4,2 V ÷ (100 + 220 + 100) kΩ.</text>`;
  return svg(640, 214, body, 'Divisor de tensão da medição da bateria');
}

// ---- document -------------------------------------------------------------------------------

const swatch = (color) => `<span class="sw" style="background:${color}"></span>`;

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Manual de ligação dos sensores</title>
<style>
@font-face {
  font-family: 'Archivo';
  font-weight: 100 900;
  font-stretch: 62% 125%;
  src: url(data:font/woff2;base64,${font('archivo-latin-wdth-normal.woff2')}) format('woff2-variations');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Archivo';
  font-weight: 100 900;
  font-stretch: 62% 125%;
  src: url(data:font/woff2;base64,${font('archivo-latin-ext-wdth-normal.woff2')}) format('woff2-variations');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
:root { --ink: #1f2933; --muted: #5c6773; --faint: #8a95a1; --line: #d6dde4; --panel: #f3f5f7; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Archivo', 'Noto Sans', sans-serif; font-size: 9.6pt; line-height: 1.45; color: var(--ink); }
section + section { break-before: page; }
h1 { font-size: 30pt; line-height: 1.02; font-weight: 760; font-stretch: 80%; letter-spacing: -0.01em; margin: 0 0 3mm; }
h2 { font-size: 17pt; line-height: 1.1; font-weight: 700; font-stretch: 84%; margin: 0 0 1.5mm; break-after: avoid; }
h3 { font-size: 10.5pt; font-weight: 680; margin: 5mm 0 1.5mm; break-after: avoid; }
p { margin: 0 0 2.2mm; }
.lead { font-size: 11.5pt; color: var(--muted); max-width: 150mm; margin-bottom: 1.5mm; }
.meta { font-size: 8.5pt; color: var(--faint); margin-bottom: 8mm; }
.intro { color: var(--muted); max-width: 165mm; margin-bottom: 4mm; }
ul, ol { margin: 0 0 2.5mm; padding-left: 5mm; }
li { margin-bottom: 1.2mm; }
table { width: 100%; border-collapse: collapse; margin: 1.5mm 0 3mm; font-size: 9pt; }
th, td { text-align: left; vertical-align: top; padding: 1.6mm 2mm; border-bottom: 0.6pt solid var(--line); }
th { font-weight: 640; color: var(--muted); border-bottom: 0.9pt solid #b7c0c9; }
td.pin { font-weight: 700; white-space: nowrap; font-feature-settings: 'tnum'; }
.sw { display: inline-block; width: 7mm; height: 1.7mm; border-radius: 1mm; vertical-align: 0.35mm; margin-right: 2mm; }
figure { margin: 2mm 0 3mm; break-inside: avoid; }
figure svg { width: 100%; height: auto; display: block; }
figcaption { font-size: 8.3pt; color: var(--muted); margin-top: 1mm; }
.box { border-radius: 2mm; padding: 2.6mm 3.6mm; margin: 2.5mm 0; background: var(--panel); break-inside: avoid; }
.box > :last-child { margin-bottom: 0; }
.box h3 { margin-top: 0; }
.warn { background: #fdf3e3; border-left: 1.2mm solid #d98a0b; }
.danger { background: #fdeceb; border-left: 1.2mm solid #c62828; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
.cols > * { min-width: 0; }
code { font-family: 'Noto Sans Mono', monospace; font-size: 8.4pt; background: var(--panel); padding: 0.2mm 1mm; border-radius: 1mm; }
.step-list li::marker { font-weight: 700; }
.formula { font-weight: 650; font-stretch: 92%; padding: 1.5mm 0; }
svg .halo { fill: none; stroke: #fff; stroke-width: 8.4; stroke-linejoin: round; stroke-linecap: round; }
svg text { font-family: 'Archivo', 'Noto Sans', sans-serif; }
svg .pinname { font-size: 11px; font-weight: 650; fill: #f3f6f9; }
svg .pinname.off { fill: #c3cad2; font-weight: 500; }
svg .chip { font-size: 10px; font-weight: 600; fill: #4a5563; }
svg .tiny { font-size: 8.5px; font-weight: 650; fill: #36414d; }
svg .modtitle { font-size: 14px; font-weight: 720; font-stretch: 85%; fill: #fff; }
svg .modsub { font-size: 10px; font-weight: 500; fill: rgba(255, 255, 255, 0.82); }
svg .tag { font-size: 10.5px; font-weight: 650; fill: #1f2933; }
svg .note { font-size: 10px; font-weight: 500; fill: #5c6773; }
svg .callout-label { font-size: 11px; font-weight: 620; fill: #1f2933; }
svg .callout-label.idle { fill: #8a95a1; font-weight: 500; }
svg .ic { font-size: 12px; font-weight: 700; fill: #e9edf1; }
svg .legname { font-size: 9px; font-weight: 650; fill: #e9edf1; }
</style>
</head>
<body>

<section>
  <h1>Manual de ligação<br>dos sensores</h1>
  <p class="lead">Estação Meteorológica com Wemos D1 mini (ESP8266). Vale para as duas versões: a completa, com BME280, e a com HTU21D.</p>
  <p class="meta">Revisão de 27 de outubro de 2026, para o firmware 1.0.0. Os desenhos mostram a placa vista de cima, com a antena para cima e o USB para baixo.</p>

  <div class="box">
    <h3>Antes de começar</h3>
    <ul>
      <li>Faça todas as ligações com a placa desligada: sem o cabo USB e sem a bateria.</li>
      <li>Tenha à mão ferro de solda, multímetro, fios finos (ou jumpers) e termo-retrátil.</li>
      <li>Todos os sensores funcionam em 3,3 V: alimente-os pelos pinos <b>3V3</b> e <b>G</b> do D1 mini. A exceção é o 49E solto, que vai no <b>5V</b>. Vários fios no mesmo pino podem ser unidos com um borne pequeno ou com solda.</li>
    </ul>
  </div>
  <div class="box danger">
    <p><b>Nunca ligue o USB do D1 mini com a bateria conectada ao pino 5V.</b> O USB alimentaria a bateria diretamente. Para gravar o firmware, desconecte a bateria (ou use um diodo Schottky na saída do carregador).</p>
  </div>

  <h2 style="margin-top:6mm">Resumo das ligações</h2>
  <table>
    <thead><tr><th>Componente</th><th>Fio do componente</th><th>Pino do D1 mini</th><th>GPIO</th></tr></thead>
    <tbody>
      <tr><td rowspan="4">Sensor de clima<br>(BME280 ou HTU21D)</td><td>${swatch(C.v33)}VIN (ou VCC)</td><td class="pin">3V3</td><td></td></tr>
      <tr><td>${swatch(C.gnd)}GND</td><td class="pin">G</td><td></td></tr>
      <tr><td>${swatch(C.scl)}SCL</td><td class="pin">D1</td><td>5</td></tr>
      <tr><td>${swatch(C.sda)}SDA</td><td class="pin">D2</td><td>4</td></tr>
      <tr><td rowspan="3">Anemômetro<br>(sensor Hall)</td><td>${swatch(C.v33)}VCC (ou +)</td><td class="pin">3V3</td><td></td></tr>
      <tr><td>${swatch(C.gnd)}GND (ou −, G)</td><td class="pin">G</td><td></td></tr>
      <tr><td>${swatch(C.wind)}OUT (ou S, DO)</td><td class="pin">D6</td><td>12</td></tr>
      <tr><td rowspan="3">Pluviômetro<br>(sensor Hall)</td><td>${swatch(C.v33)}VCC (ou +)</td><td class="pin">3V3</td><td></td></tr>
      <tr><td>${swatch(C.gnd)}GND (ou −, G)</td><td class="pin">G</td><td></td></tr>
      <tr><td>${swatch(C.rain)}OUT (ou S, DO)</td><td class="pin">D5</td><td>14</td></tr>
      <tr><td>49E solto</td><td>${swatch(C.bat)}VCC no 5V; OUT por 1 kΩ, e 10 kΩ para o G</td><td class="pin">D6 ou D5</td><td>12 ou 14</td></tr>
      <tr><td rowspan="2">Carregador TP4056</td><td>${swatch(C.bat)}OUT+</td><td class="pin">5V</td><td></td></tr>
      <tr><td>${swatch(C.gnd)}OUT−</td><td class="pin">G</td><td></td></tr>
      <tr><td>Medição da bateria</td><td>${swatch(C.sense)}+ da bateria, passando por um resistor de 100 kΩ</td><td class="pin">A0</td><td>ADC</td></tr>
      <tr><td>Acordar do deep sleep</td><td>${swatch(C.jumper)}um fio entre os dois pinos</td><td class="pin">D0 e RST</td><td>16</td></tr>
    </tbody>
  </table>
</section>

<section>
  <h2>Mapa de pinos do D1 mini</h2>
  <p class="intro">Cada pino em uso tem uma cor, a mesma do fio nos desenhos das próximas páginas. Os pinos em cinza ficam livres.</p>
  <figure>${pinoutDiagram()}<figcaption>Vista de cima. As cores dos fios seguem o resumo da página anterior.</figcaption></figure>
  <div class="cols">
    <div>
      <h3>Pinos que não devem ser usados</h3>
      <ul>
        <li><b>D3, D4 e D8</b> decidem como a placa liga. Um sensor ligado neles pode impedir o boot. O D4 também é o LED da placa, que pisca com o comando "Identificar".</li>
        <li><b>TX e RX</b> são a serial do USB, usada para gravar o firmware e ler o log.</li>
        <li><b>D0</b> fica reservado para o fio até o RST.</li>
      </ul>
    </div>
    <div>
      <h3>Alimentação</h3>
      <ul>
        <li><b>3V3</b> sai do regulador da placa e alimenta os sensores.</li>
        <li><b>5V</b> é a entrada do regulador: recebe a bateria pelo carregador (OUT+). Com o USB ligado, vem do USB. O 49E solto também é alimentado por ele.</li>
        <li><b>G</b> é o terra (GND) comum de tudo.</li>
      </ul>
    </div>
  </div>
</section>

<section>
  <h2>Sensor de clima: BME280 ou HTU21D</h2>
  <p class="intro">Temperatura e umidade nas duas versões; pressão só no BME280. Os dois usam o barramento I²C e a mesma ligação de quatro fios.</p>
  <figure>${climateDiagram()}<figcaption>O 3,3 V passa por cima da placa só para não cruzar os outros fios: na montagem, o caminho não importa.</figcaption></figure>
  <table>
    <thead><tr><th>Fio</th><th>No sensor</th><th>No D1 mini</th></tr></thead>
    <tbody>
      <tr><td>${swatch(C.v33)}3,3 V</td><td>VIN (ou VCC)</td><td class="pin">3V3</td></tr>
      <tr><td>${swatch(C.gnd)}GND</td><td>GND</td><td class="pin">G</td></tr>
      <tr><td>${swatch(C.scl)}Clock</td><td>SCL</td><td class="pin">D1</td></tr>
      <tr><td>${swatch(C.sda)}Dados</td><td>SDA</td><td class="pin">D2</td></tr>
    </tbody>
  </table>
  <div class="cols">
    <ul>
      <li><b>Ligue só um dos dois.</b> No boot, o firmware procura o BME280 (endereços 0x76 e 0x77) e, se não achar, o HTU21D (0x40). O log serial mostra qual encontrou.</li>
      <li><b>A versão no painel precisa bater</b> com o sensor ligado: "Versão completa (BME280)" ou "HTU21D", no cadastro da estação. Se não bater, os logs mostram o aviso <code>CLIMATE_SENSOR_MISMATCH</code>.</li>
      <li><b>Módulo BME280 de 6 pinos:</b> ligue só VIN, GND, SCL e SDA. O CSB e o SDO ficam soltos.</li>
    </ul>
    <ul>
      <li><b>HTU21D (módulo GY-21):</b> os mesmos quatro fios, VIN, GND, SCL e SDA.</li>
      <li><b>Cuidado com o BMP280:</b> é igual por fora, mas não mede umidade.</li>
      <li><b>Cabo curto:</b> o I²C foi feito para distâncias pequenas. Até 1 m funciona bem; mais longe, use cabo de par trançado (SDA junto com um GND, SCL junto com o 3,3 V).</li>
      <li>Instale o sensor no abrigo ventilado, à sombra e longe da caixa do D1 mini, que esquenta.</li>
    </ul>
  </div>
</section>

<section>
  <h2>Anemômetro: sensor Hall no D6</h2>
  <p class="intro">Cada ímã do rotor que passa pelo sensor gera um pulso. O firmware conta os pulsos e calcula a rajada de 3 s; o servidor converte em velocidade com a calibração da estação.</p>
  <figure>${hallDiagram('D6', C.wind, 'anemômetro', rotor)}<figcaption>Os pinos do módulo mudam de ordem conforme o fabricante: siga as marcações dele (VCC ou +, GND ou −, OUT, S ou DO).</figcaption></figure>
  <table>
    <thead><tr><th>Fio</th><th>No módulo Hall</th><th>No D1 mini</th></tr></thead>
    <tbody>
      <tr><td>${swatch(C.v33)}3,3 V</td><td>VCC (ou +)</td><td class="pin">3V3</td></tr>
      <tr><td>${swatch(C.gnd)}GND</td><td>GND (ou −)</td><td class="pin">G</td></tr>
      <tr><td>${swatch(C.wind)}Sinal</td><td>OUT (ou S, DO)</td><td class="pin">D6</td></tr>
    </tbody>
  </table>
  <h3>Sobre os sensores Hall (vale também para o pluviômetro)</h3>
  <div class="cols">
    <ul>
      <li><b>Use um sensor que só liga e desliga:</b> Hall digital, reed switch ou a placa KY-024 (49E com comparador, a dos modelos de referência). Num módulo de 4 pinos (AO, G, +, DO), ligue o <b>DO</b>.</li>
      <li><b>Alimente pelo 3V3, nunca pelo 5V:</b> no 5V a saída pode chegar a 5 V, acima do que o ESP8266 aceita. A exceção é o 49E solto, que tem página própria.</li>
      <li><b>A3144 (módulo KY-003):</b> é especificado a partir de 4,5 V. Muitas vezes funciona em 3,3 V, mas teste antes de instalar. Se falhar, use um Hall de 3,3 V e baixo consumo (como o DRV5032) ou um reed switch, que liga do mesmo jeito.</li>
    </ul>
    <ul>
      <li><b>Sem resistor:</b> o firmware liga o pull-up interno do pino.</li>
      <li><b>Filtro:</b> um pulso só conta depois de 10 ms sem nenhuma mudança no pino, como no ESPHome. Repiques e ruído não viram vento.</li>
      <li><b>Retire o LED do módulo:</b> ele gasta bateria e, em alguns módulos, inverte o sinal.</li>
      <li><b>Polo do ímã:</b> muitos Hall reagem a um polo só. Se não contar, vire o ímã. Deixe poucos milímetros entre ímã e sensor.</li>
      <li><b>Calibração:</b> o modelo de referência (3 ímãs, raio de 80 mm) dá 0,42 m/s por Hz, o padrão do painel. Para outros, use a calculadora do painel e o <code>docs/calibracao.md</code>.</li>
    </ul>
  </div>
</section>

<section>
  <h2>Pluviômetro: sensor Hall no D5</h2>
  <p class="intro">A cada basculada, o ímã da báscula passa pelo sensor. A chuva é um contador acumulado na estação; o servidor converte em milímetros com a calibração (0,64 mm por basculada no modelo de referência).</p>
  <figure>${hallDiagram('D5', C.rain, 'pluviômetro', bucket)}<figcaption>O 3,3 V e o GND são os mesmos do anemômetro e do sensor de clima: os fios se juntam no 3V3 e no G.</figcaption></figure>
  <table>
    <thead><tr><th>Fio</th><th>No módulo Hall</th><th>No D1 mini</th></tr></thead>
    <tbody>
      <tr><td>${swatch(C.v33)}3,3 V</td><td>VCC (ou +)</td><td class="pin">3V3</td></tr>
      <tr><td>${swatch(C.gnd)}GND</td><td>GND (ou −)</td><td class="pin">G</td></tr>
      <tr><td>${swatch(C.rain)}Sinal</td><td>OUT (ou S, DO)</td><td class="pin">D5</td></tr>
    </tbody>
  </table>
  <ul>
    <li>Valem as mesmas regras do sensor Hall do anemômetro: digital ou KY-024, alimentado pelo 3V3, sem LED e com o polo certo do ímã. Uma mudança do sensor só conta depois de durar 10 ms, como no pluviômetro de referência.</li>
    <li><b>Contagem da báscula:</b> o padrão conta cada mudança de estado do sensor, como nos modelos de referência. Se a chuva aparecer em dobro ou pela metade, troque para "só na borda de descida" em <b>Cadastro de estações → (estação) → Configuração remota</b>.</li>
    <li><b>Calibração:</b> despeje um volume conhecido de água devagar e compare com o total contado. O passo a passo está em <code>docs/calibracao.md</code>.</li>
    <li>Instale o pluviômetro nivelado, longe de árvores, paredes e do respingo do telhado.</li>
  </ul>
</section>

<section>
  <h2>Placa KY-024: o 49E com comparador</h2>
  <p class="intro">É a placa dos modelos de referência. O 49E sozinho é analógico: a tensão de saída muda aos poucos com o ímã. O comparador da placa (LM393) transforma essa tensão num sinal liga/desliga limpo, e o potenciômetro escolhe o ponto de virada. Serve para o anemômetro (D6) e para o pluviômetro (D5).</p>
  <figure>${ky024Diagram('D6', C.wind)}<figcaption>No pluviômetro, a ligação é a mesma, no D5. O AO, a saída analógica, fica solto.</figcaption></figure>
  <table>
    <thead><tr><th>Fio</th><th>Na KY-024</th><th>No D1 mini</th></tr></thead>
    <tbody>
      <tr><td>${swatch(C.v33)}3,3 V</td><td>+</td><td class="pin">3V3</td></tr>
      <tr><td>${swatch(C.gnd)}GND</td><td>G</td><td class="pin">G</td></tr>
      <tr><td>${swatch(C.wind)}Sinal</td><td>DO</td><td class="pin">D6 (vento) ou D5 (chuva)</td></tr>
      <tr><td></td><td>AO</td><td>solto</td></tr>
    </tbody>
  </table>
  <div class="cols">
    <ul>
      <li><b>Alimente pelo 3V3.</b> Assim a saída DO não passa de 3,3 V, e não precisa de resistor nem de diodo.</li>
      <li><b>Ajuste o potenciômetro</b> com a placa ligada: o LED da saída deve apagar sem ímã e acender só com o ímã bem na frente do sensor. Se ele acender com o ímã longe, a contagem fica instável.</li>
    </ul>
    <ul>
      <li><b>A face com o texto do 49E</b> fica voltada para os ímãs. Se o LED não acender, vire o ímã.</li>
      <li><b>Consumo:</b> o sensor, o comparador e os LEDs gastam alguns mA o tempo todo. Numa estação a bateria, prefira um reed switch ou um Hall digital de baixo consumo.</li>
      <li><b>Teste:</b> no log serial, 10 voltas do rotor dentro de um minuto devem dar 30 pulsos.</li>
    </ul>
  </div>
</section>

<section>
  <h2>49E solto, sem placa: no 5V, com divisor</h2>
  <p class="intro">Sem o comparador da KY-024, a saída do 49E vai direto no pino, e os ímãs mal chegam ao ponto em que o pino muda de estado (~1,65 V). Dois resistores põem esse ponto no meio do caminho. Prefira a KY-024, um reed switch ou um Hall digital.</p>
  <figure>${bare49eDiagram()}<figcaption>Desenho do anemômetro, no D6; no pluviômetro, a mesma ligação vai no D5. O fio do 5V passa por cima do GND sem se ligar a ele.</figcaption></figure>
  <figure>${hallPinoutDiagram()}<figcaption>O ímã passa na frente da face com o texto, a 1 ou 2 mm, com o polo norte voltado para ela. Se não contar, vire o ímã.</figcaption></figure>
  <table>
    <thead><tr><th style="width:20%">Perna do 49E</th><th style="width:18%">No D1 mini</th><th>Observação</th></tr></thead>
    <tbody>
      <tr><td>${swatch(C.bat)}1, VCC</td><td class="pin">5V</td><td>Capacitor de 100 nF entre VCC e GND, colado no sensor</td></tr>
      <tr><td>${swatch(C.gnd)}2, GND</td><td class="pin">G</td><td></td></tr>
      <tr><td>${swatch(C.wind)}3, OUT</td><td class="pin">D6 ou D5</td><td>Por um resistor de 1 kΩ (marrom, preto, vermelho), com outro de 10 kΩ (marrom, preto, laranja) do pino para o G</td></tr>
    </tbody>
  </table>
  <div class="box warn">
    <p><b>Ajuste na alimentação definitiva:</b> meça entre o pino e o G, sem ímã e com cada ímã parado na frente do sensor. Sem ímã, acima de ~1,95 V; com o ímã mais fraco, abaixo de ~1,5 V. Pelo USB (~4,4 V no pino 5V), a bancada deu 2,0 V e de 1,24 a 1,50 V. Numa fonte de 5,0 V, troque o 1 kΩ por uns 3,3 kΩ. Ímã fraco demais: aumente esse resistor; tensão sem ímã baixa demais: diminua.</p>
  </div>
  <ul>
    <li><b>Nunca em 3,3 V:</b> a placa reinicia sem parar (<code>Soft WDT reset</code>). <b>Teste no log:</b> 10 voltas dão 30 pulsos; rotor parado, 0.</li>
    <li><b>Proteção opcional:</b> diodo Schottky do pino para o 3V3, com a faixa no 3V3, contra um ímã com o polo sul. Com a faixa no pino, nada conta.</li>
  </ul>
</section>

<section>
  <h2>Alimentação</h2>
  <p class="intro">A célula 18650 alimenta tudo pelo carregador TP4056; o painel solar é opcional. O mesmo desenho mostra o fio da medição da bateria (A0) e o fio D0–RST.</p>
  <figure>${powerDiagram()}<figcaption>O painel solar (tracejado) é opcional. O resistor pode sair do B+ ou do OUT+ do carregador: os dois são o + da bateria.</figcaption></figure>
  <table>
    <thead><tr><th>De</th><th>Para</th><th>Observação</th></tr></thead>
    <tbody>
      <tr><td>${swatch(C.bat)}+ da 18650</td><td>B+ do TP4056</td><td>Respeite a polaridade</td></tr>
      <tr><td>${swatch(C.gnd)}− da 18650</td><td>B− do TP4056</td><td></td></tr>
      <tr><td>${swatch(C.bat)}OUT+ do TP4056</td><td class="pin">5V</td><td>Entrada do regulador do D1 mini</td></tr>
      <tr><td>${swatch(C.gnd)}OUT− do TP4056</td><td class="pin">G</td><td></td></tr>
      <tr><td>${swatch(C.sense)}+ da bateria</td><td class="pin">A0</td><td>Sempre pelo resistor de 100 kΩ (página seguinte)</td></tr>
      <tr><td>${swatch(C.jumper)}D0</td><td class="pin">RST</td><td>Sem ele a placa não acorda do deep sleep</td></tr>
      <tr><td>${swatch(C.bat)}Painel solar + e −</td><td>IN+ e IN− do TP4056</td><td>Opcional, painel de 5 a 6 V</td></tr>
    </tbody>
  </table>
  <div class="cols">
    <div class="box danger">
      <p><b>USB e bateria juntos, nunca.</b> Com a bateria no pino 5V, o USB do D1 mini a alimentaria diretamente. Desconecte a bateria para gravar, ou use um diodo Schottky na saída do carregador.</p>
    </div>
    <div>
      <div class="box warn"><p>Use um TP4056 <b>com proteção</b> (chip DW01): ele também corta a descarga profunda da célula.</p></div>
      <div class="box warn"><p>Se a gravação pelo USB falhar, desconecte o fio D0–RST durante a gravação e ligue de novo depois.</p></div>
    </div>
  </div>
</section>

<section>
  <h2>Medição da bateria</h2>
  <p class="intro">Não é um sensor: é um resistor de 100 kΩ entre o + da bateria e o pino A0. Ele completa o divisor de tensão que o D1 mini já tem por dentro.</p>
  <figure>${dividerDiagram()}<figcaption>O ESP8266 só lê até 1,0 V. O divisor da placa leva 3,2 V a 1,0 V; o resistor de fora estica a faixa até 4,2 V, a tensão de uma 18650 cheia.</figcaption></figure>
  <h3>O que o firmware faz com a medida</h3>
  <p>Mede a cada minuto (mediana de 5 leituras), envia a tensão no diagnóstico e escolhe o perfil de energia sozinho. A troca exige 3 medidas seguidas, para não ficar indo e voltando. Os limites mudam em <b>Configuração remota</b>; no painel, tensão e porcentagem aparecem em <b>Dispositivos</b> e em <b>Energia e sinal</b>, na tela da estação.</p>
  <table>
    <thead><tr><th style="width:24%">Bateria</th><th style="width:20%">Perfil</th><th>O que a estação faz</th></tr></thead>
    <tbody>
      <tr><td>a partir de 3,80 V</td><td>Normal</td><td>Wi-Fi ligado: envia cada leitura e mantém a página local</td></tr>
      <tr><td>abaixo de 3,65 V</td><td>Economia</td><td>Liga o Wi-Fi só a cada 10 minutos, para enviar o que mediu</td></tr>
      <tr><td>abaixo de 3,45 V</td><td>Sobrevivência</td><td>Deep sleep de 30 minutos; mede só clima e bateria ao acordar</td></tr>
      <tr><td>abaixo de 3,30 V</td><td></td><td>Nem liga o Wi-Fi e volta a dormir</td></tr>
    </tbody>
  </table>
  <div class="cols">
    <div class="box">
      <h3>Calibrar</h3>
      <p>Meça a bateria com o multímetro e compare com o valor do painel. Ajuste em <b>Configuração remota → Fundo de escala do divisor</b>:</p>
      <p class="formula">novo fundo de escala = fundo atual × tensão no multímetro ÷ tensão no painel</p>
      <p>Exemplo: padrão de 4200 mV, multímetro com 3,95 V e painel com 3,86 V dão 4298 mV.</p>
    </div>
    <div>
      <div class="box warn">
        <p><b>Sem o resistor</b>, a bateria aparece como "não medida" e o perfil automático não age. Numa estação a bateria, fixe "Sempre Normal" ou "Sempre Economia" na configuração remota.</p>
      </div>
      <div class="box danger"><p>Nunca ligue a bateria direto no A0, sem o resistor.</p></div>
    </div>
  </div>
</section>

<section>
  <h2>Depois de ligar: teste</h2>
  <p class="intro">Confira na bancada antes de instalar a estação no mastro.</p>
  <ol class="step-list">
    <li>Com a placa desligada, use o multímetro em continuidade: <b>3V3 e G não podem estar em curto</b>, nem 5V e G.</li>
    <li>Ligue só pelo USB, sem a bateria no 5V. No log serial (115200 baud), procure a linha <code>sensor de clima: bme280</code> (ou <code>htu21d</code>).</li>
    <li>No painel, a estação aparece online e a leitura de cada minuto traz temperatura e umidade, e também pressão na versão completa.</li>
    <li>Gire o anemômetro com a mão: o vento sobe na leitura do minuto seguinte. No log serial, 10 voltas dentro de um minuto dão 30 pulsos.</li>
    <li>Vire a báscula algumas vezes: a chuva soma a cada basculada.</li>
    <li>Com a bateria e o resistor ligados, e o USB desconectado, compare a tensão de <b>Energia e sinal</b> com o multímetro e calibre.</li>
  </ol>
  <p>Sem os sensores de pulso, dá para testar o caminho todo com um jumper: cada toque do <b>D6</b> (vento) ou do <b>D5</b> (chuva) no <b>G</b> vale um pulso.</p>

  <h2 style="margin-top:6mm">Problemas comuns</h2>
  <table>
    <thead><tr><th style="width:31%">Sintoma</th><th style="width:32%">Causa provável</th><th>O que fazer</th></tr></thead>
    <tbody>
      <tr><td>O log mostra <code>sensor de clima: none</code></td><td>SDA e SCL trocados, alimentação solta ou um BMP280 no lugar do BME280</td><td>Confira D1 = SCL e D2 = SDA e meça 3,3 V entre VIN e GND do sensor</td></tr>
      <tr><td>Vento ou chuva sempre em zero</td><td>Hall sem alimentação ou que não funciona em 3,3 V, ímã com o polo errado, fio no pino errado, potenciômetro da KY-024 desajustado</td><td>Meça a saída do Hall passando o ímã; vire o ímã; confira D6 e D5; na KY-024, ajuste até o LED acender com o ímã na frente</td></tr>
      <tr><td>Com o 49E solto, só um ou dois ímãs contam, ou eles contam a mais</td><td>O sinal mal chega ao ponto de virada do pino</td><td>Ajuste o divisor, como na página do 49E solto</td></tr>
      <tr><td>A placa reinicia sem parar (<code>Soft WDT reset</code>) e o sensor de clima some</td><td>49E solto alimentado em 3,3 V: a saída parada fica no ponto de virada do pino</td><td>Use a KY-024, ou ligue o 49E solto no 5V, como na página dele</td></tr>
      <tr><td>Chuva em dobro ou pela metade</td><td>Modo de contagem da báscula</td><td>Troque a "Contagem da báscula" na configuração remota</td></tr>
      <tr><td>Bateria "não medida" no painel</td><td>Falta o resistor no A0, ou ele está ligado no lugar errado</td><td>Ligue o + da bateria ao A0 pelo resistor de 100 kΩ</td></tr>
      <tr><td>A estação some e não volta no perfil Sobrevivência</td><td>Falta o fio D0–RST: o deep sleep nunca termina</td><td>Ligue o D0 ao RST; para acordar agora, aperte o RESET</td></tr>
      <tr><td>Aviso <code>CLIMATE_SENSOR_MISMATCH</code></td><td>A versão no cadastro não é a do sensor ligado</td><td>Corrija a versão no painel ou troque o sensor</td></tr>
      <tr><td>Leituras de temperatura altas demais</td><td>Sensor perto do D1 mini ou ao sol</td><td>Leve o sensor para o abrigo ventilado, longe da caixa</td></tr>
    </tbody>
  </table>
  <p style="color:var(--muted)">Mais detalhes: <code>docs/hardware.md</code> (montagem, portal e página local) e <code>docs/calibracao.md</code>.</p>
</section>

</body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: output,
    format: 'A4',
    printBackground: true,
    margin: { top: '15mm', right: '16mm', bottom: '18mm', left: '16mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;margin:0 16mm;display:flex;justify-content:space-between;font-family:'Noto Sans',sans-serif;font-size:7.5px;color:#8a95a1">
      <span>Estação Meteorológica: manual de ligação dos sensores</span>
      <span>página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
  });
} finally {
  await browser.close();
}
console.log(`PDF gerado: ${output}`);
