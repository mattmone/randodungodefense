/**
 * @typedef {Object} Stats
 * @property {Number} strength
 * @property {Number} dexterity
 * @property {Number} consitution
 * @property {Number} speed
 * @property {Number} intellect
 * @property {Number} magic
 */
// import { DIRECTION } from '../constants/directions.js';

export class Character {
  /**
   * creates a Character instance
   * @param {String} name the name of the character
   * @param {Mesh} avatar the character's visual representation in the game
   */
  constructor(name, avatar) {
    this.name = name;
    this.avatar = avatar;
    /** @type {Stats} */
    this.stats = {};
    this.skills = {};
    this.position = false;
    this.effects = {};
    this.modifiers = {};
    // this.direction = DIRECTION.NORTH;
  }

  /**
   * @param {number} value
   */
  set nextMove(value) {
    this._nextMove = value;
  }

  get nextMove() {
    return this._nextMove || 0;
  }

  get tile() {
    return this.avatar.userData.childOf;
  }

  get move() {
    return 2 + 0.1 * this.stats.dexterity + (this.modifiers.move ?? 0);
  }

  /** @type {Number} */
  get maxhp() {
    return this.stats.constitution * 10 + this.stats.strength * 5 + (this.modifiers.hp ?? 0);
  }

  /** @type {Number} */
  get maxmana() {
    return this.stats.intellect * 10 + this.stats.magic * 5 + (this.modifiers.mana ?? 0);
  }

  get passable() {
    const { name, stats, skills, position, effects, modifiers, hp, mana, maxmana, maxhp, move } =
      this;
    return { name, stats, skills, position, effects, modifiers, hp, mana, maxmana, maxhp, move };
  }

  setup() {
    /** @type {Number} */
    this.hp = this.maxhp;
    /** @type {Number} */
    this.mana = this.maxmana;
  }
}
