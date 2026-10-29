const FIRST = [
  'Hana', 'Kiri', 'Mizu', 'Sakura', 'Yama', 'Kaze', 'Hotaru', 'Tsuki', 'Momiji', 'Ao', 'Kawa', 'Hoshi',
  'Matsu', 'Take', 'Yuki', 'Asa', 'Mori', 'Shiro', 'Fuji', 'Tanuki', 'Kitsune', 'Usagi', 'Suzu', 'Nagi',
  'Kumo', 'Ame', 'Niji', 'Sora', 'Umi', 'Kaede', 'Tsubaki', 'Ume', 'Hinata', 'Kotori', 'Akari', 'Midori',
];
const SECOND = ['zawa', 'gaoka', 'no-ura', 'mura', 'zaka', 'dani', 'machi', 'gawa', 'hara', 'shima', 'no-mori', 'bashi', 'ta', 'kubo', 'no', 'oka'];
const SUFFIX = {
  country: ['', '', ' Halt', ''],
  village: ['', ' Town', '', ''],
  lakeside: [' Pier', ' Shore', '', ' Landing'],
  alpine: [' Pass', ' Heights', '', ' Summit'],
  forest: [' Woods', ' Sawmill', '', ' Glade'],
  grand: [' Central', ' Terminal', ' Junction'],
};

export function stationName(rng, style, taken) {
  for (let i = 0; i < 60; i++) {
    const base = rng.pick(FIRST) + rng.pick(SECOND);
    const name = base + rng.pick(SUFFIX[style] || SUFFIX.country);
    if (!taken.has(name)) return name;
  }
  return 'Station ' + (taken.size + 1);
}
