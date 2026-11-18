// English word bank. Concrete, imageable nouns. Lists are position-aligned with words.pt.ts
// (tests/content.test.ts verifies the alignment), which gives every word a language-neutral id.
import { moreEn } from './words.more';

export const categories: Record<string, string[]> = {
  fruit: ['apple', 'banana', 'cherry', 'grape', 'lemon', 'mango', 'peach', 'pear', 'plum', 'melon', 'orange', 'strawberry'],
  animal: ['horse', 'tiger', 'rabbit', 'sheep', 'wolf', 'bear', 'camel', 'zebra', 'goat', 'monkey', 'lion', 'fox'],
  tool: ['hammer', 'saw', 'drill', 'shovel', 'pliers', 'chisel', 'axe', 'rake', 'stepladder', 'hoe', 'nail', 'screw'],
  furniture: ['chair', 'table', 'sofa', 'bed', 'wardrobe', 'shelf', 'desk', 'cradle', 'lamp', 'dresser', 'cupboard', 'armchair'],
  clothing: ['shirt', 'jacket', 'scarf', 'glove', 'sock', 'hat', 'skirt', 'overcoat', 'boot', 'belt', 'tie', 'sweater'],
  vehicle: ['train', 'bus', 'truck', 'boat', 'plane', 'tractor', 'tram', 'motorbike', 'van', 'ship', 'helicopter', 'taxi'],
  instrument: ['piano', 'violin', 'guitar', 'drum', 'flute', 'trumpet', 'harp', 'cello', 'accordion', 'clarinet', 'saxophone', 'organ'],
  kitchen: ['spoon', 'fork', 'knife', 'plate', 'cup', 'kettle', 'bowl', 'frying pan', 'pot', 'jug', 'oven', 'grater'],
  bird: ['eagle', 'owl', 'parrot', 'swan', 'pigeon', 'crow', 'duck', 'sparrow', 'stork', 'seagull', 'penguin', 'peacock'],
  vegetable: ['carrot', 'onion', 'potato', 'cabbage', 'lettuce', 'pepper', 'garlic', 'pumpkin', 'spinach', 'cucumber', 'tomato', 'turnip'],
};

/** Unrelated concrete nouns for training (word lists, paired associates). */
export const misc: string[] = [
  'anchor', 'balloon', 'barrel', 'basket', 'bell', 'blanket', 'bottle', 'bracelet', 'bridge', 'brush',
  'bucket', 'button', 'cabin', 'cage', 'candle', 'cannon', 'carpet', 'castle', 'cave', 'chain',
  'chimney', 'church', 'cliff', 'clock', 'cloud', 'coin', 'compass', 'cork', 'crown', 'curtain',
  'desert', 'diamond', 'door', 'dragon', 'envelope', 'fence', 'feather', 'flag', 'forest', 'fountain',
  'garden', 'glacier', 'helmet', 'island', 'jewel', 'key', 'lake', 'lantern', 'leaf', 'letter',
  'library', 'lighthouse', 'magnet', 'map', 'market', 'mask', 'meadow', 'medal', 'mirror', 'moon',
  'mountain', 'museum', 'necklace', 'needle', 'nest', 'newspaper', 'ocean', 'palace', 'parcel', 'pearl',
  'pencil', 'pillow', 'pipe', 'planet', 'pocket', 'prison', 'pyramid', 'rainbow', 'ribbon', 'ring',
  'river', 'robot', 'rocket', 'rope', 'saddle', 'school', 'shell', 'shield', 'skeleton', 'sled',
  'snow', 'soap', 'statue', 'stone', 'storm', 'suitcase', 'sword', 'telescope', 'tent', 'thread',
  'throne', 'ticket', 'tower', 'towel', 'treasure', 'tunnel', 'umbrella', 'valley', 'vase', 'volcano',
  'wagon', 'wall', 'wallet', 'wheel', 'whistle', 'window', 'wire', 'bone', 'brick', 'dune',
  'engine', 'farm', 'fire', 'globe', 'harbour', 'hospital', 'iceberg', 'jar', 'kitchen', 'lock',
  // + 914 more nouns (words.more.ts), aligned by position
  ...moreEn,
];

/**
 * Reserved for the assessment battery only (never shown in training), split into 4 alternate forms.
 * Each form: 12 list words followed by 6 cue–target pairs (12 words).
 */
export const assessment: string[] = [
  // form 1
  'marble', 'match', 'net', 'paper', 'pebble', 'queen', 'card', 'sun', 'star', 'temple', 'tooth', 'tree',
  'trophy', 'village', 'wave', 'well', 'wing', 'wool', 'garage', 'camera', 'circus', 'king', 'chess', 'coffin',
  // form 2
  'comet', 'doll', 'drawer', 'egg', 'fan', 'gate', 'glass', 'gold', 'hive', 'ink', 'mill', 'nut',
  'oar', 'path', 'pie', 'pin', 'puddle', 'radio', 'roof', 'rose', 'salt', 'scissors', 'silk', 'smoke',
  // form 3
  'spider', 'stamp', 'step', 'sugar', 'milk', 'tray', 'trunk', 'tulip', 'web', 'whale', 'worm', 'canvas',
  'perfume', 'bread', 'pillar', 'honey', 'jungle', 'anvil', 'lagoon', 'apron', 'cheese', 'badge', 'butter', 'tile',
  // form 4
  'barn', 'broom', 'cart', 'chalk', 'clover', 'crab', 'eraser', 'tap', 'frame', 'fridge', 'hourglass', 'igloo',
  'mattress', 'microscope', 'mushroom', 'oyster', 'padlock', 'parachute', 'pendulum', 'raft', 'scarecrow', 'sponge', 'submarine', 'swing',
];

/** Used only by the fixed-duration Encoding Efficiency check: two alternate 12-word lists. */
export const efficiency: string[] = [
  'thimble', 'torch', 'yacht', 'snail', 'saucer', 'postcard', 'chandelier', 'goblet', 'lever', 'tripod', 'kayak', 'bubble',
  'meteor', 'pinecone', 'acorn', 'lobster', 'cactus', 'kangaroo', 'wig', 'emerald', 'harmonica', 'scroll', 'tortoise', 'cauldron',
];

export const names: string[] = [
  'Oliver', 'Emma', 'James', 'Sophie', 'Daniel', 'Grace', 'Thomas', 'Chloe', 'Henry', 'Lucy',
  'Samuel', 'Hannah', 'George', 'Alice', 'Jack', 'Ella', 'Adam', 'Ruby', 'Peter', 'Clara',
  'Lewis', 'Megan', 'Owen', 'Isla', 'Martin', 'Julia', 'Victor', 'Laura', 'Simon', 'Naomi',
];

export const occupations: string[] = [
  'baker', 'pilot', 'teacher', 'nurse', 'carpenter', 'lawyer', 'gardener', 'pharmacist', 'painter', 'farmer', 'architect', 'librarian',
];
