// Каталог 50 локацій для великих карт (1024×1024): 10 типів × 5 варіантів.
export type Style = 'brick' | 'plaster' | 'concrete';
export interface Loc {
  id: number; name: string; arch: string; blurb: string;
  forest: number; // 0..1: густота лісу
  hill: number; // масштаб пагорбів
  water: number; // поріг води (частка карти)
  towns: number; // множник кількості населених пунктів
  radius: number; // радіус пункту
  fill: number; // щільність забудови
  w: [number, number]; d: [number, number]; floors: [number, number];
  styles: Style[]; gable: number; // частка двосхилих дахів
  damage: number; // руйнування
  weather?: string; aliens: number; crates: number;
}
type Arch = Omit<Loc, 'id' | 'name' | 'arch'> & { key: string };
const A: Arch[] = [
  { key: 'Лісове село', blurb: 'Хати серед густого лісу, вузькі стежки.', forest: 0.85, hill: 1, water: 0.06, towns: 1, radius: 13, fill: 0.55, w: [4, 5], d: [4, 5], floors: [1, 2], styles: ['plaster', 'brick'], gable: 0.95, damage: 0.15, aliens: 1, crates: 6 },
  { key: 'Передмістя', blurb: 'Квартали будинків, невеликі двори, рідкий ліс.', forest: 0.3, hill: 0.7, water: 0.04, towns: 1.1, radius: 20, fill: 0.7, w: [5, 6], d: [4, 5], floors: [2, 3], styles: ['brick', 'plaster'], gable: 0.5, damage: 0.2, aliens: 1.1, crates: 5 },
  { key: 'Промзона', blurb: 'Склади, цехи, контейнери. Багато бетону.', forest: 0.15, hill: 0.4, water: 0.02, towns: 0.9, radius: 19, fill: 0.6, w: [6, 8], d: [5, 6], floors: [1, 3], styles: ['concrete'], gable: 0.1, damage: 0.25, aliens: 1.2, crates: 14 },
  { key: 'Руїни міста', blurb: 'Щільна розбита забудова, обвалені верхні поверхи.', forest: 0.2, hill: 0.5, water: 0.02, towns: 1.2, radius: 22, fill: 0.78, w: [5, 7], d: [4, 6], floors: [2, 3], styles: ['brick', 'concrete', 'plaster'], gable: 0.15, damage: 0.8, aliens: 1.3, crates: 8 },
  { key: 'Ферма', blurb: 'Відкриті поля, хутори й стодоли. Далеко видно.', forest: 0.1, hill: 0.8, water: 0.05, towns: 0.8, radius: 12, fill: 0.4, w: [4, 7], d: [4, 5], floors: [1, 2], styles: ['plaster', 'brick'], gable: 1, damage: 0.1, aliens: 0.9, crates: 6 },
  { key: 'Озерне селище', blurb: 'Озера й болотяні береги, будинки на узвишшях.', forest: 0.5, hill: 1, water: 0.2, towns: 1, radius: 14, fill: 0.55, w: [4, 5], d: [4, 5], floors: [1, 2], styles: ['plaster', 'brick'], gable: 0.9, damage: 0.2, aliens: 1, crates: 5 },
  { key: 'Гірський перевал', blurb: 'Скелі, пагорби й кілька відлюдних будинків.', forest: 0.45, hill: 1.8, water: 0.03, towns: 0.6, radius: 10, fill: 0.5, w: [4, 5], d: [3, 5], floors: [1, 2], styles: ['plaster', 'concrete'], gable: 0.9, damage: 0.3, aliens: 1, crates: 4 },
  { key: 'Військова база', blurb: 'Бетонні казарми й склади, бочки й ящики.', forest: 0.2, hill: 0.4, water: 0.02, towns: 0.8, radius: 17, fill: 0.55, w: [6, 8], d: [4, 6], floors: [1, 2], styles: ['concrete'], gable: 0, damage: 0.45, aliens: 1.4, crates: 16 },
  { key: 'Болото', blurb: 'Багато води, пасток і напівзатоплених халуп.', forest: 0.6, hill: 0.5, water: 0.28, towns: 0.8, radius: 11, fill: 0.45, w: [3, 5], d: [3, 4], floors: [1, 1], styles: ['plaster'], gable: 0.9, damage: 0.4, aliens: 0.9, crates: 4 },
  { key: 'Нічне місто', blurb: 'Високі будинки, темно, видимість мала.', forest: 0.15, hill: 0.4, water: 0.02, towns: 1.3, radius: 23, fill: 0.82, w: [5, 7], d: [5, 6], floors: [3, 3], styles: ['concrete', 'brick'], gable: 0.05, damage: 0.35, weather: 'night', aliens: 1.3, crates: 8 },
];
const NAMES = [
  'Вільхівка', 'Берестове', 'Грабівка', 'Липівка', 'Дубровиця',
  'Новосілки', 'Затишне', 'Зарічне', 'Садове', 'Покровське',
  'Залізниця', 'Заводське', 'Сталеварів', 'Вузлове', 'Цегельня',
  'Уламки', 'Попелище', 'Пустир', 'Згарище', 'Мертвий центр',
  'Урожайне', 'Хутір Півнів', 'Колоски', 'Левада', 'Стодоли',
  'Тихе озеро', 'Лебедине', 'Очеретянка', 'Затока', 'Бобрівка',
  'Орлиний перевал', 'Кам’яна брама', 'Вітряна гора', 'Крижана', 'Скеляста',
  'Форпост Альфа', 'Склади-9', 'Казарми', 'Полігон', 'Бункерне',
  'Трясовина', 'Гнилі Верби', 'Мла', 'Жаб’яче', 'Багнюка',
  'Нічні вогні', 'Мегаполіс-0', 'Темряві', 'Східний квартал', 'Північна вежа',
];
const VAR: Partial<Arch>[] = [
  {},
  { fill: 0.1, damage: 0.15, forest: -0.1 },
  { weather: 'night', aliens: 0.1 },
  { weather: 'rain', forest: 0.1 },
  { weather: 'fog', radius: 3, towns: 0.15 },
];
export const LOCATIONS: Loc[] = Array.from({ length: 50 }, (_, i) => {
  const a = A[Math.floor(i / 5)], v = VAR[i % 5];
  const cl = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  return {
    ...a, id: i, name: NAMES[i], arch: a.key,
    forest: cl(a.forest + (v.forest ?? 0), 0.02, 1), fill: cl(a.fill + (v.fill ?? 0), 0.2, 0.9), damage: cl(a.damage + (v.damage ?? 0), 0, 1),
    weather: v.weather ?? a.weather, aliens: a.aliens + (v.aliens ?? 0), radius: a.radius + (v.radius ?? 0), towns: a.towns + (v.towns ?? 0),
    hill: a.hill * (1 + (i % 5) * 0.08), water: a.water,
  };
});
export const LOC_COUNT = LOCATIONS.length;
