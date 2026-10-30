/** Static overhead office renderer: warm materials, distinct zones and readable furniture. */
export const PALETTE = {
  floor: '#e9ece5',
  floorAlt: '#e1e6df',
  grid: 'rgba(54, 73, 61, 0.045)',
  gridMajor: 'rgba(54, 73, 61, 0.075)',
  border: '#77867b',
  borderGlow: 'rgba(77, 126, 99, 0.2)',
  text: '#52645a',
  wall: '#58665e',
  wallEdge: '#435149',
  desk: '#c3a17b',
  deskEdge: '#9d7b59',
  plant: '#5b8a6a',
  plantEdge: '#3e694c',
  pillar: '#aab4ad',
  pillarEdge: '#7b8980',
  screen: '#283e44',
  screenEdge: '#526b6d',
  cluster: 'rgba(49, 147, 105, 0.12)',
};

const TYPE_STYLE = {
  wall: { fill: PALETTE.wall, edge: PALETTE.wallEdge },
  desk: { fill: PALETTE.desk, edge: PALETTE.deskEdge },
  plant: { fill: PALETTE.plant, edge: PALETTE.plantEdge },
  pillar: { fill: PALETTE.pillar, edge: PALETTE.pillarEdge },
  screen: { fill: PALETTE.screen, edge: PALETTE.screenEdge },
};

/** Letterbox the world into a viewport; both canvas layers share this transform. */
export function computeView(viewport, room) {
  const scale = Math.min(viewport.width / room.width, viewport.height / room.height);
  return {
    scale,
    offsetX: (viewport.width - room.width * scale) / 2,
    offsetY: (viewport.height - room.height * scale) / 2,
  };
}

/** Paint the floor and permanent furniture once per room/resize. */
export function renderStaticLayer(context, { room, viewport, view, dpr = 1 }) {
  const { width, height } = room;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);
  context.translate(view.offsetX, view.offsetY);
  context.scale(view.scale, view.scale);

  const floor = context.createLinearGradient(0, 0, width, height);
  floor.addColorStop(0, '#f0f0e9');
  floor.addColorStop(0.52, PALETTE.floor);
  floor.addColorStop(1, '#e1e7df');
  context.fillStyle = floor;
  context.fillRect(0, 0, width, height);

  drawOfficeZones(context, width, height);
  drawFloorGrid(context, width, height);
  drawMeetingArea(context, width, height);
  drawLoungeArea(context, width, height);

  for (const obstacle of room.obstacles ?? []) drawObstacle(context, obstacle);

  // Room boundary, with a soft inset line like a built-out floor plan.
  context.save();
  context.strokeStyle = PALETTE.border;
  context.lineWidth = 6;
  context.strokeRect(3, 3, width - 6, height - 6);
  context.strokeStyle = PALETTE.borderGlow;
  context.lineWidth = 2;
  context.strokeRect(11, 11, width - 22, height - 22);
  context.restore();
}

function drawOfficeZones(context, width, height) {
  const scaleX = width / 1920;
  const scaleY = height / 1080;
  const zones = [
    { x: 55, y: 55, w: 580, h: 335, label: 'MEETING SUITE', fill: 'rgba(198, 179, 143, 0.14)' },
    { x: 1265, y: 60, w: 590, h: 430, label: 'FOCUS WORKSTATIONS', fill: 'rgba(155, 190, 169, 0.18)' },
    { x: 65, y: 665, w: 590, h: 350, label: 'TEAM STUDIO', fill: 'rgba(159, 187, 201, 0.14)' },
    { x: 1260, y: 640, w: 600, h: 370, label: 'LOUNGE', fill: 'rgba(199, 174, 152, 0.15)' },
  ];

  for (const zone of zones) {
    const x = zone.x * scaleX;
    const y = zone.y * scaleY;
    const w = Math.min(zone.w * scaleX, width - x - 28);
    const h = Math.min(zone.h * scaleY, height - y - 28);
    context.save();
    context.fillStyle = zone.fill;
    roundRect(context, x, y, w, h, 24);
    context.fill();
    context.strokeStyle = 'rgba(79, 101, 85, 0.12)';
    context.lineWidth = 1.5;
    context.setLineDash([9, 8]);
    roundRect(context, x + 5, y + 5, w - 10, h - 10, 20);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = 'rgba(57, 78, 65, 0.64)';
    context.font = '700 20px ui-sans-serif, system-ui, sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.fillText(zone.label, x + 22, y + 18);
    context.restore();
  }
}

function drawFloorGrid(context, width, height) {
  context.save();
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += 48) {
    context.strokeStyle = x % 240 === 0 ? PALETTE.gridMajor : PALETTE.grid;
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 48) {
    context.strokeStyle = y % 240 === 0 ? PALETTE.gridMajor : PALETTE.grid;
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }
  context.restore();
}

function drawMeetingArea(context, width, height) {
  const sx = width / 1920;
  const sy = height / 1080;
  const x = 145 * sx;
  const y = 132 * sy;
  const w = 300 * sx;
  const h = 132 * sy;
  context.save();
  context.shadowColor = 'rgba(52, 61, 54, 0.14)';
  context.shadowBlur = 15;
  context.shadowOffsetY = 6;
  context.fillStyle = '#c7a982';
  roundRect(context, x, y, w, h, 34);
  context.fill();
  context.shadowColor = 'transparent';
  context.strokeStyle = 'rgba(112, 83, 53, 0.38)';
  context.lineWidth = 2;
  roundRect(context, x + 4, y + 4, w - 8, h - 8, 30);
  context.stroke();
  context.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x + 28, y + h * 0.35);
  context.lineTo(x + w - 28, y + h * 0.35);
  context.stroke();
  // Seats around the conference table.
  for (let i = 0; i < 5; i += 1) {
    const cx = x + w * (0.18 + i * 0.16);
    drawChair(context, cx, y - 21 * sy, 31 * sx, 22 * sy);
    drawChair(context, cx, y + h + 21 * sy, 31 * sx, 22 * sy);
  }
  context.restore();
}

function drawLoungeArea(context, width, height) {
  const sx = width / 1920;
  const sy = height / 1080;
  const x = 1375 * sx;
  const y = 765 * sy;
  context.save();
  context.fillStyle = 'rgba(174, 145, 121, 0.17)';
  roundRect(context, x - 65 * sx, y - 55 * sy, 345 * sx, 205 * sy, 34);
  context.fill();

  // Soft sofa with seat cushions.
  context.shadowColor = 'rgba(39, 53, 45, 0.14)';
  context.shadowBlur = 12;
  context.shadowOffsetY = 5;
  context.fillStyle = '#768b7e';
  roundRect(context, x, y, 218 * sx, 72 * sy, 20);
  context.fill();
  context.shadowColor = 'transparent';
  context.fillStyle = '#93a697';
  roundRect(context, x + 14 * sx, y + 12 * sy, 86 * sx, 47 * sy, 13);
  context.fill();
  roundRect(context, x + 112 * sx, y + 12 * sy, 92 * sx, 47 * sy, 13);
  context.fill();
  context.fillStyle = '#b98f6d';
  context.beginPath();
  context.ellipse(x + 115 * sx, y + 133 * sy, 53 * sx, 30 * sy, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(118, 79, 53, 0.28)';
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

function drawChair(context, x, y, width, height) {
  context.save();
  context.fillStyle = 'rgba(45, 58, 51, 0.17)';
  context.beginPath();
  context.ellipse(x, y + height * 0.25, width * 0.58, height * 0.52, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#82948a';
  roundRect(context, x - width / 2, y - height / 2, width, height, height / 2);
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,.56)';
  context.lineWidth = 1.5;
  context.stroke();
  context.restore();
}

function drawObstacle(context, obstacle) {
  const style = TYPE_STYLE[obstacle.type] ?? TYPE_STYLE.wall;
  const { x, y, w, h } = obstacle;
  context.save();

  if (obstacle.type === 'plant') {
    drawPlant(context, x, y, w, h);
  } else if (obstacle.type === 'pillar') {
    drawPillar(context, x, y, w, h, style);
  } else if (obstacle.type === 'desk') {
    drawDesk(context, x, y, w, h, style);
  } else if (obstacle.type === 'screen') {
    drawScreen(context, x, y, w, h, style);
  } else {
    drawWall(context, x, y, w, h, style);
  }

  // Subtle dashed outline indicates that sound is attenuated by this object.
  if (obstacle.blocksAudio !== false && obstacle.attenuation <= 0.3) {
    context.setLineDash([8, 7]);
    context.strokeStyle = 'rgba(191, 104, 81, 0.34)';
    context.lineWidth = 2;
    roundRect(context, x - 7, y - 7, w + 14, h + 14, 10);
    context.stroke();
    context.setLineDash([]);
  }
  context.restore();
}

function drawDesk(context, x, y, w, h, style) {
  drawChair(context, x + w / 2, y + h + 17, Math.min(30, w * 0.2), 17);
  context.shadowColor = 'rgba(51, 60, 51, 0.22)';
  context.shadowBlur = 13;
  context.shadowOffsetY = 5;
  context.fillStyle = style.fill;
  roundRect(context, x, y, w, h, 10);
  context.fill();
  context.shadowColor = 'transparent';
  context.strokeStyle = style.edge;
  context.lineWidth = 2;
  roundRect(context, x + 1, y + 1, w - 2, h - 2, 9);
  context.stroke();
  context.strokeStyle = 'rgba(255, 255, 255, 0.26)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x + 10, y + 5);
  context.lineTo(x + w - 10, y + 5);
  context.stroke();

  // Monitor, stand and keyboard make the desk read as a workstation.
  const screenW = Math.min(44, w * 0.34);
  const screenH = Math.min(22, h * 0.34);
  context.fillStyle = '#495e5d';
  roundRect(context, x + (w - screenW) / 2, y + 8, screenW, screenH, 4);
  context.fill();
  context.fillStyle = '#a9c7bd';
  roundRect(context, x + (w - screenW + 6) / 2, y + 11, screenW - 6, screenH - 7, 2);
  context.fill();
  context.strokeStyle = 'rgba(73, 89, 78, .65)';
  context.beginPath();
  context.moveTo(x + w / 2, y + 8 + screenH);
  context.lineTo(x + w / 2, y + 8 + screenH + 5);
  context.stroke();
  context.fillStyle = '#806b55';
  roundRect(context, x + w / 2 - 17, y + h - 14, 34, 7, 3);
  context.fill();
}

function drawScreen(context, x, y, w, h, style) {
  context.shadowColor = 'rgba(33, 46, 42, .18)';
  context.shadowBlur = 7;
  context.shadowOffsetY = 2;
  context.fillStyle = style.fill;
  roundRect(context, x, y, w, h, Math.min(6, h / 2));
  context.fill();
  context.shadowColor = 'transparent';
  context.fillStyle = '#9fc1b6';
  roundRect(context, x + 5, y + 3, Math.max(1, w - 10), Math.max(1, h - 6), Math.min(3, h / 3));
  context.fill();
  context.strokeStyle = style.edge;
  context.lineWidth = 1.5;
  roundRect(context, x, y, w, h, Math.min(6, h / 2));
  context.stroke();
}

function drawWall(context, x, y, w, h, style) {
  context.shadowColor = 'rgba(25, 39, 32, 0.19)';
  context.shadowBlur = 14;
  context.shadowOffsetY = 5;
  context.fillStyle = style.fill;
  roundRect(context, x, y, w, h, 6);
  context.fill();
  context.shadowColor = 'transparent';
  context.strokeStyle = style.edge;
  context.lineWidth = 2;
  roundRect(context, x + 1, y + 1, w - 2, h - 2, 5);
  context.stroke();
  context.strokeStyle = 'rgba(255,255,255,.18)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + 6, y + 5);
  context.lineTo(x + w - 6, y + 5);
  context.stroke();
}

function drawPillar(context, x, y, w, h, style) {
  const radius = Math.min(w, h) / 2;
  const gradient = context.createRadialGradient(x + w * 0.34, y + h * 0.3, 1, x + w / 2, y + h / 2, radius);
  gradient.addColorStop(0, '#f1f3ed');
  gradient.addColorStop(0.68, style.fill);
  gradient.addColorStop(1, style.edge);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x + w / 2, y + h / 2, radius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = style.edge;
  context.lineWidth = 2;
  context.stroke();
}

function drawPlant(context, x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const radius = Math.min(w, h) / 2;
  context.fillStyle = 'rgba(39, 68, 48, .15)';
  context.beginPath();
  context.ellipse(cx, cy + 4, radius * 0.95, radius * 0.8, 0, 0, Math.PI * 2);
  context.fill();
  for (let i = 0; i < 7; i += 1) {
    const angle = (Math.PI * 2 * i) / 7;
    context.save();
    context.translate(cx, cy);
    context.rotate(angle);
    context.fillStyle = i % 2 ? '#6f9a72' : PALETTE.plant;
    context.beginPath();
    context.ellipse(0, -radius * 0.42, radius * 0.23, radius * 0.53, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  context.fillStyle = '#a47d5d';
  context.beginPath();
  context.arc(cx, cy, radius * 0.33, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = PALETTE.plantEdge;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(cx, cy, radius * 0.33, 0, Math.PI * 2);
  context.stroke();
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

export default renderStaticLayer;
