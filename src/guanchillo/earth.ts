import { newSphere, type Pattern } from './model.js';
import { sphereLayout, sphereSizes } from './sphere.js';

// Ocean, land and ice from the supplied Earth chart, ordered from the first round.
const chart = [
  'O O O O O O',
  'OO OO OO OO OO II',
  'IOO OOO OOO OLO OOO OOI',
  'IOOI IILL LOLL LLLL LLLO LOOI',
  'IIOOI ILLLO LOLLL LLLLL LLLLL LOOOO',
  'IILIII LLLLLO LOOLLO OLLLLL LLLLLL LOLOOO',
  'ILLLILO LLLLOOO OOOOOOO OLLLLLL LLLLLLL LLLLOOO',
  'OOLLLLLL LLLLOOOO OOOOOOOO LOLLLLLL LLLLLLOO LOOLLOOO',
  'OOLOOOLL LLLOOOOO OOOLOOOO LOLLLLLL LLLLLLLO LLOOOOOO',
  'OOOOLOOL LOOOOOOO OOOOOOOO OOOOOLLO LLLLOLLO LLLLLLOO',
  'OOOOOOLL OOOOOOOO OOOOOOOO LLOOOLLO OLOOOOOL LLLLLLLO',
  'OOOOLLLO OOOOOOOO OOOOOOOO OOOOOOLL OOOOOOOL LLLLLLLO',
  'OOOLLLLL OOOOOOOO OOOOOOOO LLLLLOLO OOOOOOOO LLLLLLOO',
  'OOLLLLLO OOOOOOOO OOOOOOOL LLLLLOOO OOOOOOLO LLLLLOOO',
  'OOLLLLO OOOOOOO OOOOOOL LLOLLOO OOOOOLO LLLOOOO',
  'OOLLLO OOOOOO OOLOOO LOOOOO OOOOOO LLOOOO',
  'OOLLO OOOOO OOOOO OOOOO OOOOO OOOOO',
  'OOLO OOOO OOOO OOOO OOOO OOOO',
  'OOO III OOO IOO OOO IIO',
  'II II II OO II IO',
  'I I I I I I',
].map(round => round.split(' '));

const earthColors = [
  { name: 'Ocean blue', hex: '#3a9dc7' },
  { name: 'Leaf green', hex: '#80b951' },
  { name: 'Polar ice', hex: '#f7f2e3' },
];

export function earthPattern(rounds = sphereSizes.example, name = 'Earth'): Pattern {
  const pattern = newSphere(rounds, name);
  pattern.palette = structuredClone(earthColors);
  const layout = sphereLayout(rounds);
  for (const round of layout.rounds) {
    const source = chart[Math.floor((round.number - 0.5) * chart.length / rounds)];
    const start = layout.stitches - round.offset - round.stitches;
    for (let stitch = 0; stitch < round.stitches; stitch++) {
      const gore = source[Math.floor(stitch / round.perGore)];
      const letter = gore[Math.floor((stitch % round.perGore + 0.5) * gore.length / round.perGore)];
      pattern.cells[start + stitch] = 'OLI'.indexOf(letter);
    }
  }
  return pattern;
}
