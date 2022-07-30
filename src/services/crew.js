import { Character } from '../character.js';
import { oneOf } from '../utils/oneOf.js';
import { get, set, del } from '../../libs/idb-keyval.js';
import { rollDice } from '../utils/rollDice.js';
import { Initializeable } from '../utils/baseClasses/initializable.js';

export class Crew extends Initializeable {
  /** @type {Character[]} */
  #members = [];
  #saveCrewTimeout = null;

  constructor(id = 'player', clean) {
    super();
    this.id = id;
    if (clean) {
      del(`crew/${id}`);
      this._initialized = true;
    } else
      get(`crew/${id}`).then(async crew => {
        if (crew) this.#members = crew.map(member => new Character({ id: member }));
        await Promise.all(this.#members.map(member => member.initialized));
        this._initialized = true;
      });
  }

  get members() {
    return this.#members;
  }

  get membersById() {
    return Array.from(new Set(this.#members.map(member => member.id)));
  }

  set members(_) {
    throw Error('Crew.members is read-only, interact with `add` or `remove` instead.');
  }

  get allDead() {
    return this.#members.every(member => member.dead);
  }

  get loot() {
    return this.#members.filter(member => member.dead).map(member => member.equipement.values());
  }

  #saveCrew() {
    clearTimeout(this.#saveCrewTimeout);
    this.#saveCrewTimeout = setTimeout(() => {
      set(`crew/${this.id}`, this.membersById);
    }, 100);
  }

  memberById(id) {
    return this.#members.find(member => member.id === id);
  }

  destroy() {
    this.#members = [];
    return del(`crew/${this.id}`);
  }

  add(member = {}) {
    const newMember = member instanceof Character ? member : new Character(member);
    this.#members = [...this.members, newMember];
    this.#saveCrew();
    return newMember;
  }

  remove(removedMember, nonDestructive) {
    this.#members = this.members.filter(member => member.id !== removedMember.id);
    if (!nonDestructive) removedMember.destroy();
    this.#saveCrew();
  }

  disband() {
    this.#members.forEach(member => member.destroy());
    this.#members = [];
    this.#saveCrew();
  }

  async random(params = {}) {
    const { quantity = 1, level = 1, withEquipment = false } = params;
    const distributePoints = (points, possibilities, max = 10, favored) => {
      while (points > 0) {
        const choices = Array.from(points % 2 === 0 && favored ? favored : possibilities.keys());
        const chosen = oneOf(choices);
        const currentLevel = possibilities.get(chosen).level;
        possibilities.set(chosen, {
          ...possibilities.get(chosen),
          level: currentLevel + 1,
        });
        points--;
      }
    };
    return Promise.all(
      new Array(quantity).fill(0).map(async () => {
        const characterOptions = {};
        const { names } = await import('../constants/names.js');
        characterOptions.name = oneOf(names);
        // Math.random() over rollDice for more variation
        characterOptions.colorOffset = {
          pupils: {
            set: true,
            h: Math.random(),
            s: 0.3 + Math.random() * 0.5,
            l: 0.2 + Math.random() * 0.6,
          },
          eyes: {
            set: true,
            h: 0,
            s: 0,
            l: rollDice(2) === 1 ? 0.7 + Math.random() * 0.3 : Math.random() * 0.3,
          },
          hair: {
            set: true,
            h: Math.random(),
            s: Math.random(),
            l: Math.random(),
          },
          eyebrows: {
            set: true,
            h: Math.random(),
            s: Math.random(),
            l: Math.random(),
          },
          head: {
            h: 0,
            s: -0.3 + Math.random() * 0.3,
            l: -0.4 + Math.random() * 0.7,
          },
          boots: {
            h: Math.random(),
            s: -0.5 + Math.random() * 0.3,
            l: -0.6 + Math.random() * 1.2,
          },
          body: {
            h: Math.random(),
            s: -0.5 + Math.random() * 0.3,
            l: -0.6 + Math.random() * 1.2,
          },
          hands: {
            h: Math.random(),
            s: -0.5 + Math.random() * 0.3,
            l: -0.6 + Math.random() * 1.2,
          },
        };
        characterOptions.stats = new Map([
          ['strength', { level: 1, progression: 0 }],
          [
            'constitution',
            {
              level: 1,
              progression: 0,
            },
          ],
          [
            'dexterity',
            {
              level: 1,
              progression: 0,
            },
          ],
          ['speed', { level: 1, progression: 0 }],
          [
            'intellect',
            {
              level: 1,
              progression: 0,
            },
          ],
          ['magic', { level: 1, progression: 0 }],
        ]);
        const focus = oneOf(['support', 'destruction', 'crossbow', 'longbow', 'shortbow']);
        const favoredStats = [];
        if (focus === 'support') {
          favoredStats.push('magic', 'intellect', 'dexterity');
        } else if(focus === 'destruction') {
          favoredStats.push('magic', 'intellect', 'constitution')
        } else if (focus === 'crossbow') {
          favoredStats.push('strength', 'constitution', 'dexterity');
        } else if (focus === 'longbow') {
          favoredStats.push('dexterity', 'speed', 'strength');
        } else if (focus === 'shortbow') {
          favoredStats.push('dexterity', 'strength', 'intellect')
        }
        const skills = [];
        if (focus === 'support') {
          skills.push(
            ['arcana: support', { level: 0, progression: 0 }]
          );
        } else if (focus === 'destruction') {
          skills.push(
            ['arcana: destruction', { level: 0, progression: 0 }],
          );
        } else if (focus === 'crossbow') {
          skills.push(
            ['crossbow', { level: 0, progression: 0 }]
          );
        } else if (focus === 'longbow') {
          skills.push(
            ['longbow', { level: 0, progression: 0 }]
          );
        } else if (focus === 'shortbow') {
          skills.push(
            ['shortbow', { level: 0, progression: 0 }]
          );
        }

        characterOptions.skills = new Map(skills);
        let statPoints = 4 * 6 * level;
        let skillPoints = 4 * 6 * level;
        distributePoints(statPoints, characterOptions.stats, level * 10, favoredStats);
        distributePoints(skillPoints, characterOptions.skills, level * 10);

        const character = this.add(characterOptions);

        if (!withEquipment) return character;
        const {
          randomHead,
          randomBody,
          randomBoots,
          randomSword,
          randomAxe,
          // randomPolearm,
          randomKnife,
          randomShortbow,
          randomLongbow,
          randomCrossbow,
          // randomStaff,
          randomHands,
        } = await import('../utils/randomItem.js');
        const possibilities = [];
        if (character.skills.has('sword')) possibilities.push(randomSword);
        if (character.skills.has('axe')) possibilities.push(randomAxe);
        // if (character.skills.has("polearm")) possibilities.push(randomPolearm);
        if (character.skills.has('knife')) possibilities.push(randomKnife);
        if (character.skills.has('shortbow')) possibilities.push(randomShortbow);
        if (character.skills.has('longbow')) possibilities.push(randomLongbow);
        if (character.skills.has('crossbow')) possibilities.push(randomCrossbow);
        // if (character.skills.has("staff")) possibilities.push(randomStaff);
        if (possibilities.length) character.equip('primary hand', await oneOf(possibilities)());
        if (rollDice(6) >= 3) character.equip('body', await randomBody());
        if (rollDice(6) >= 4) character.equip('head', await randomHead());
        if (rollDice(6) >= 5) character.equip('boots', await randomBoots());
        if (rollDice(6) >= 6) character.equip('hands', await randomHands());
        return character;
      }),
    );
  }
}
