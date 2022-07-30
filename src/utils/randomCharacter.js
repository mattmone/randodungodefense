import { Character } from '../character.js';
import { oneOf } from './oneOf.js';

const names = [
  'Liam',
  'Olivia',
  'Noah',
  'Emma',
  'Oliver',
  'Ava',
  'Elijah',
  'Charlotte',
  'William',
  'Sophia',
  'James',
  'Amelia',
  'Benjamin',
  'Isabella',
  'Lucas',
  'Mia',
  'Henry',
  'Evelyn',
  'Alexander',
  'Harper',
  'Mason',
  'Camila',
  'Michael',
  'Gianna',
  'Ethan',
  'Abigail',
  'Daniel',
  'Luna',
  'Jacob',
  'Ella',
  'Logan',
  'Elizabeth',
  'Jackson',
  'Sofia',
  'Levi',
  'Emily',
  'Sebastian',
  'Avery',
  'Mateo',
  'Mila',
  'Jack',
  'Scarlett',
  'Owen',
  'Eleanor',
  'Theodore',
  'Madison',
  'Aiden',
  'Layla',
  'Samuel',
  'Penelope',
  'Joseph',
  'Aria',
  'John',
  'Chloe',
  'David',
  'Grace',
  'Wyatt',
  'Ellie',
  'Matthew',
  'Nora',
  'Luke',
  'Hazel',
  'Asher',
  'Zoey',
  'Carter',
  'Riley',
  'Julian',
  'Victoria',
  'Grayson',
  'Lily',
  'Leo',
  'Aurora',
  'Jayden',
  'Violet',
  'Gabriel',
  'Nova',
  'Isaac',
  'Hannah',
  'Lincoln',
  'Emilia',
  'Anthony',
  'Zoe',
  'Hudson',
  'Stella',
  'Dylan',
  'Everly',
  'Ezra',
  'Isla',
  'Thomas',
  'Leah',
  'Charles',
  'Lillian',
  'Christopher',
  'Addison',
  'Jaxon',
  'Willow',
  'Maverick',
  'Lucy',
  'Josiah',
  'Paisley',
];

/**
 * Randomizes the character
 * @param {Character} character
 * @returns {Character}
 */
export function randomCharacter(character) {
  character.name = oneOf(names);
  character.stats = {
    strength: { value: Math.ceil(Math.random() * 10), progression: Math.ceil(Math.random() * 100) },
    constitution: {
      value: Math.ceil(Math.random() * 10),
      progression: Math.ceil(Math.random() * 100),
    },
    dexterity: {
      value: Math.ceil(Math.random() * 10),
      progression: Math.ceil(Math.random() * 100),
    },
    speed: { value: Math.ceil(Math.random() * 10), progression: Math.ceil(Math.random() * 100) },
    intellect: {
      value: Math.ceil(Math.random() * 10),
      progression: Math.ceil(Math.random() * 100),
    },
    magic: { value: Math.ceil(Math.random() * 10), progression: Math.ceil(Math.random() * 100) },
  };
  character.setup();
  return character;
}
