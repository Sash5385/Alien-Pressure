import type { TraitId } from './traits';

export type UnitKind = 'soldier' | 'trooper' | 'sniper' | 'psi' | 'heavy' | 'commander';
export type ClassId = 'assault' | 'sniper' | 'medic' | 'engineer';
export type WeaponId = 'rifle' | 'smg' | 'shotgun' | 'sniper' | 'launcher' | 'mortar' | 'ags';
export type LaunchKind = 'ugl' | 'launcher' | 'mortar' | 'ags';
export type ArmorId = 'none' | 'vest' | 'plate' | 'exo';
export const STEP = 0.55; // высота одного уровня рельефа, в клетках
export type Look = '' | 'tree' | 'bush' | 'rock' | 'house' | 'crate' | 'container' | 'bags' | 'wall' | 'window' | 'car';
export interface House { x: number; y: number; w: number; h: number; id: number; hp: number }
export type Stance = 'stand' | 'kneel' | 'prone';
export type Biome = 'ruins' | 'forest' | 'lake';
export type Terrain = 'ground' | 'water';
export type Objective = 'clear' | 'extract' | 'hold' | 'assassinate' | 'sabotage' | 'defend' | 'rescue' | 'storm' | 'holdbld' | 'hostage' | 'bomb' | 'counter' | 'escort' | 'ambush' | 'raid';
export type PerkId = 'aim' | 'hp' | 'nerve';
export type Difficulty = 'easy' | 'normal' | 'hard';
export interface Tech { armor: boolean; optics: boolean; kits: boolean; grenades: boolean }

/** Боец кампании: хранится между миссиями. */
export interface Soldier {
  id: number;
  name: string;
  bio: string;
  traits: TraitId[];
  hpLoss: number;
  fracture: boolean;
  kills: number;
  missions: number;
  xp: number;
  rank: number;
  perks: PerkId[];
  perkPoints: number;
  weapon: WeaponId;
  armor: ArmorId;
  cls: ClassId;
  att?: ('optic' | 'supp' | 'mag' | 'nvg')[]; // обвес оружия
}

export type Team = 'human' | 'alien';
export type Cover = 'none' | 'half' | 'full';

export interface Unit {
  id: number;
  team: Team;
  kind: UnitKind;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
  move: number; // клеток за 1 AP
  aim: number; // базовая меткость, %
  ammo: number;
  maxAmmo: number;
  weapon: WeaponId;
  armor: ArmorId;
  burst: number;
  falloffFrom: number;
  falloff: number;
  cut: number; // снижение урона от попадания (броня)
  stance: Stance; // стоя / на колене / лёжа
  cls: ClassId;
  abilityUsed: number; // применений умения за миссию
  suppressed: boolean; // подавлен: −25% меткости и −1 AP в свой ход
  alert: boolean; // пришелец знает о бойцах (иначе патрулирует)
  homeX: number;
  homeY: number;
  grenades: number;
  facing: number; // радианы: 0 — на юг (+Z), π — на север
  mags: number; // запасные магазины (у пришельцев не ограничены)
  dmg: [number, number];
  range: number;
  overwatch: boolean;
  bleeding: boolean; // −1 HP в начале хода, пока не перевязан
  fracture: boolean; // −20% меткости, −2 к ходу
  morale: number; // 0–100; <50 — штраф к меткости, <30 — паника
  panic: boolean;
  traits: TraitId[];
  perks: PerkId[];
  bio: string;
  kills: number;
  grp?: number; // тактическая группа пришельцев
  retreatUntil?: number; // до какого хода держит оборону после отхода
  ugl?: number; // выстрелов подствольника
  cd?: number; // реальное время: секунд до следующего действия
  march?: { x: number; y: number }; // колонна идёт к этой точке, пока не заметит бойцов
  static?: boolean; // турель: не ходит
  stuck?: number; // сколько раз подряд путь был перекрыт (союзники в проходе)
  optic?: boolean; extMag?: boolean; // обвес для отрисовки
  nvg?: boolean; // ночное видение
  supp?: boolean; // глушитель: выстрелы почти не слышны
  fl?: number; // этаж здания (0 — земля)
  dest?: { x: number; y: number; fl?: number };
  queue?: { x: number; y: number; fl?: number }[]; // следующие точки маршрута (Shift+клик) // приказ «идти» (реальное время)
  atk?: number; // приказ «атаковать» (id цели)
  busyRt?: boolean;
  route?: [number, number][]; // кэш маршрута к далёкой цели (огромные карты)
  dormant?: boolean; // чекає засады: не действует, пока рядом нет бойцов
  hidden?: boolean; // прячется в яме: невидим, пока бойцы не подойдут вплотную
  looted?: boolean; // трофей с этого пришельца уже разыгран // выполняет действие (анимация)
  down?: boolean; // тяжело ранен: лежит, можно поднять
  bleedOut?: number; // ходов до смерти
  revived?: boolean; // уже падал в этой миссии
}

export interface GameState {
  size: number;
  cover: Cover[][]; // cover[y][x]
  height: number[][]; // уровень рельефа 0–3: подъём на 1 проходим, обрыв (2+) — нет
  look: Look[][]; // вид укрытия (дерево, камень, дом…)
  houses: House[];
  scn?: 'storm' | 'holdbld' | 'hostage' | 'bomb' | 'counter' | 'escort' | 'ambush' | 'raid';
  fuse?: { x: number; y: number; fl: number; at: number }; // запал заряда («Підрив»)
  exitPt?: { x: number; y: number }; // точка выхода колонны («Засідка»)
  raidUntil?: number; // время, к которому надо вынести добычу («Наліт») // сценарий «квартал»: штурм, удержание здания, заложник
  target?: number; // номер здания-цели
  captives?: { x: number; y: number; fl?: number; saved: boolean }[]; // полонённые (задание «Порятунок»)
  upKills?: number; breaches?: number; // статистика для достижений
  locId?: number; // номер локации каталога
  roads?: { x: number; y: number; w: number; h: number }[]; // улицы населённых пунктов
  roadm?: Uint8Array; // карта асфальта (мини-карта)
  bidx?: Int16Array; // клетка → номер здания + 1
  bldgs?: import('../render/buildings').BuildingSpec[]; // будівлі з поверхами (великі карти)
  locName?: string;
  trenches: { x: number; y: number }[]; // окопы
  terrain: Terrain[][]; // вода непроходима, но не мешает видеть и стрелять
  biome: Biome;
  units: Unit[];
  selectedId: number | null;
  targetId: number | null;
  turn: Team;
  turnNo: number;
  status: 'playing' | 'won' | 'lost';
  medkits: number;
  vis: boolean[][]; // что видят бойцы сейчас
  seen: boolean[][]; // что исследовано
  revealed: number[]; // пришельцы, выдавшие себя выстрелом
  missionNo: number;
  difficulty: Difficulty;
  objective: Objective;
  markId: number | null; // помеченная цель (командир) видна всегда
  beacons: { x: number; y: number; done: boolean; fl?: number }[];
  holdTurns: number;
  zone: { x: number; y: number; w: number; h: number } | null;
  aiming: 'grenade' | 'roll' | 'bags' | 'drone' | null; // режим прицеливания гранаты или выбора клетки для переката
  mines: { x: number; y: number; owner: number }[];
  barrels: { x: number; y: number }[]; // взрывоопасные бочки (половинное укрытие)
  fires: { x: number; y: number; ttl: number }[]; // горящие клетки: непроходимы, жгут стоящих
  scorched: boolean[][]; // выжженное не загорается снова
  bridges: { x: number; y: number }[]; // мосты (визуально) на бродах
  targetBarrel: { x: number; y: number } | null;
  turning: boolean; // режим «повернуть бойца» (тач)
  busy: boolean; // идёт анимация/ход ИИ — ввод заблокирован
  log: string[];
  rng: number; // состояние генератора (сид миссии)
  boss?: boolean; // миссия с боссом (ликвидация)
  rt?: { speed: 0.5 | 1; paused: boolean; clock: number; pulseAt: number; planAt: number; auto: boolean }; // режим реального времени
  smokes?: { x: number; y: number; ttl: number }[]; // дым: закрывает обзор
  drone?: { x: number; y: number; until: number }; // разведдрон: видит всё вокруг точки, пока не истечёт время
  droneAt?: number; // дрон снова готов
  radioAt?: number; // реальное время, с которого рация снова готова
  noise?: { x: number; y: number; r?: number }[]; // выстрелы бойцов с последней проверки (будят спящих)
  pits?: { x: number; y: number }[]; // ямы, в которых прячутся пришельцы (огромная карта)
  huge?: boolean; // огромная карта (лес): кусочная отрисовка, засады
  mats?: number; // стройматериалы: окоп и мешки с песком стоят по 1; пополняются за волны и трофеи
  loot?: { x: number; y: number; kind: 'mag' | 'gren' | 'mat'; n: number; raid?: boolean }[]; // трофеи с убитых пришельцев
  wavePlan?: { x: number; y: number; kind: UnitKind }[]; // следующая волна: откуда и кто придёт (видно заранее)
  smokeMode?: boolean; // прицел дымовой гранаты
  lookMode?: boolean; // режим «Осмотр»: подсветка зоны обзора выбранного бойца
  launch?: LaunchKind; // прицел гранатомёта/миномёта/подствольника (вместе с aiming 'grenade')
  weather?: string; // принудительная погода миссии
  sides?: 'all' | 'ns'; // откуда идут волны обороны
  waveBoost?: number; // добавка к размеру волн
  defendName?: string; // название варианта обороны
  undo?: { id: number; x: number; y: number; ap: number; stance: Stance; overwatch: boolean; facing: number; fp: string; vis: number }; // отмена последнего хода
}
