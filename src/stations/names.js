const FIRST = [
  'Willow', 'Thistle', 'Bramble', 'Fern', 'Heron', 'Otter', 'Elder', 'Kestrel', 'Moss', 'Larch',
  'Hazel', 'Rowan', 'Foxglove', 'Badger', 'Wren', 'Clover', 'Meadow', 'Oak', 'Ash', 'Linden',
  'Sorrel', 'Puffin', 'Lark', 'Briar', 'Juniper', 'Marigold', 'Teasel', 'Nettle', 'Holly', 'Pebble',
  'Amber', 'Saffron', 'Cobble', 'Duck', 'Plover', 'Mallow', 'Hollow', 'Gorse', 'Yarrow', 'Bluebell',
];
const SECOND = [
  'ford', 'brook', 'wick', 'dale', 'mere', 'by', 'ton', 'field', 'combe', 'stead',
  'hollow', 'bridge', 'cross', 'well', 'haven', 'thorpe', 'moor', 'bury', 'leigh', 'gate',
];
const SUFFIX = {
  country: ['', '', ' Halt', ' Green', ' End'],
  village: ['', ' Road', ' Central', ' Town', ''],
  lakeside: [' Pier', ' Quay', ' Landing', '-on-Water', ' Shore'],
  alpine: [' Pass', ' Summit', ' Heights', ' Fell', ' Peak'],
  forest: [' Sawmill', ' Wood', ' Timber Halt', ' Glade', ' Forest'],
  grand: [' Grand Central', ' Junction', ' Terminus', ' Union', ' Central'],
};

export function stationName(rng, style, taken) {
  for (let i = 0; i < 40; i++) {
    const base = rng.pick(FIRST) + rng.pick(SECOND);
    const name = base + rng.pick(SUFFIX[style] || SUFFIX.country);
    if (!taken.has(name)) return name;
  }
  return 'Station ' + (taken.size + 1);
}
