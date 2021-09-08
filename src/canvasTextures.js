import { rollDice } from './utils/rollDice.js';

class TerrainColor {
  constructor(base) {
    this.base = base;
    this.lighter = this.lighten(this.base);
    this.lightest = this.lighten(this.lighter);
    this.darker = this.darken(this.base);
    this.darkest = this.darken(this.darker);
  }
  get baseColor() {
    return `rgb(${this.base.join(',')})`;
  }
  get lighterColor() {
    return `rgb(${this.lighter.join(',')})`;
  }
  get lightestColor() {
    return `rgb(${this.lightest.join(',')})`;
  }
  get darkerColor() {
    return `rgb(${this.darker.join(',')})`;
  }
  get darkestColor() {
    return `rgb(${this.darkest.join(',')})`;
  }
  get accentColors() {
    return [this.lighterColor, this.lightestColor, this.darkerColor, this.darkestColor];
  }
  lighten(color) {
    return color.map(value => Math.min(255, value + 30));
  }
  darken(color) {
    return color.map(value => Math.max(0, value - 30));
  }
}
const terrain = {
  plains: new TerrainColor([20, 100, 20]),
  road: new TerrainColor([70, 70, 70]),
  smallroad: new TerrainColor([80, 70, 30]),

  rock: new TerrainColor([40, 40, 40]),
  tree: new TerrainColor([20, 60, 10]),
  stump: new TerrainColor([60, 60, 20]),
};

const createdCanvii = {};

export const createTerrainSide = type => {
  // if (createdCanvii[type]) return createdCanvii[type];
  const [textureWidth, textureHeight] = [256, 256];
  const canvas = new OffscreenCanvas(textureWidth, textureHeight);
  const context = canvas.getContext('2d');
  const { baseColor, accentColors } = terrain[type];
  context.fillStyle = baseColor;
  context.fillRect(0, 0, textureWidth, textureHeight);
  const textureRectangles = Array(rollDice(2, 4))
    .fill(0)
    .map(() => Math.ceil((Math.random() * textureWidth) / 10) + textureWidth / 20);
  for (let rectangle of textureRectangles) {
    context.save();
    const [x, y] = [
      Math.min(textureWidth - rectangle, Math.max(rectangle, Math.random() * textureWidth)),
      Math.min(textureHeight - rectangle, Math.max(rectangle, Math.random() * textureHeight)),
    ];
    context.translate(x, y);
    context.rotate((Math.random() * 89 * Math.PI) / 180);

    context.fillStyle = accentColors[Math.ceil(Math.random() * accentColors.length)];
    context.fillRect(0, 0, rectangle, rectangle);
    context.restore();
  }
  // createdCanvii[type] = canvas;
  return canvas;
};
