// tutorial.js — обучение шагами, прямо на доске.
//
// Правила у игры написаны, и кнопка «Правила» никуда не делась. Но читать их
// до первой партии сядет не всякий, а тот, кто сядет, всё равно не поймёт,
// какая из тридцати шести клеток — «удел», пока не увидит её. Поэтому здесь не
// текст о поле, а показ на поле: доска поворачивается, кости падают, фишка
// идёт по клеткам, постройка встаёт, карта вылетает из колоды. Каждый шаг
// говорит одну мысль и показывает ровно её.
//
// Обучение не удерживает: «Пропустить» есть на каждом шаге и кончает его
// сразу. Второй раз само оно не заводится — только кнопкой на первом экране.

window.PromisedLandTutorial = (() => {
  'use strict';

  const B = window.PromisedLandBoard;
  const SEEN = 'promised-land-tutorial-seen';

  /** Первая клетка нужного вида — шаги говорят про виды, а не про номера. */
  const firstOf = (kind) => (B.BOARD.find((cell) => cell.kind === kind) || B.BOARD[0]).n;

  /**
   * Шаги. Порядок не случаен: сперва что это вообще и как ходят, потом откуда
   * берутся и куда уходят деньги, потом чем рискуют, и в конце — чем всё
   * кончится. У каждого шага может быть показ: `act` получает сцену и картинки
   * и возвращает обещание, которое кончается вместе с движением.
   */
  function steps({ scene, art, mode }) {
    const cheap = B.BOARD.find((cell) => cell.kind === 'plot' && cell.price <= 140) || B.BOARD[1];
    const dear = B.BOARD.filter((cell) => cell.kind === 'plot').slice(-1)[0];
    const ladder = B.ladderOf(dear);

    return [
      {
        title: 'Круг земли',
        text: 'Тридцать шесть клеток по краю доски — это круг. Один круг по нему — год пути, '
          + `и за каждый пройденный «Исход» вам отсыпают ${B.HARVEST} сиклей урожая.`,
        wide: true,
        act: () => (scene ? scene.orbit(2.8) : null),
      },
      {
        title: 'Жребий',
        text: 'Ход начинается с двух костей. Сколько выпало — на столько клеток вперёд. '
          + 'Выпал дубль — бросаете ещё раз, но три дубля подряд ведут в темницу.',
        wide: true,
        act: () => (scene ? scene.roll(3, 4) : null),
      },
      {
        title: 'Фишка идёт',
        text: 'Фишка не перескакивает, а идёт по клеткам — мимо всех, что между. '
          + 'Важно не только куда пришли, но и что прошли: «Исход» считает круги.',
        wide: true,
        act: () => (scene ? scene.demoWalk(0, 0, 7) : null),
      },
      {
        cell: cheap.n,
        title: 'Удел',
        text: `«${cheap.name}» пока ничей. Встали на свободный удел — можете взять его за `
          + `${cheap.price} сиклей. Откажетесь — он останется свободным до следующего раза.`,
      },
      {
        cell: cheap.n,
        title: 'Поселение',
        text: 'Свой удел обживают: колодец, шатёр, дом, ограда, башня. Каждая ступень '
          + `поднимает плату за проход — у «${dear.name}» с ${ladder[0]} сиклей на пустой земле `
          + `до ${ladder[ladder.length - 1]} под башней. Строить можно, только собрав весь `
          + 'удел целиком.',
        act: () => (scene ? scene.demoBuild(cheap.n, 'house') : null),
      },
      {
        cell: cheap.n,
        title: 'Плата за проход',
        text: 'Встали на чужую землю — платите хозяину. Игра не берёт сама: она выставляет '
          + 'счёт, а вы решаете, чем его закрыть.',
      },
      {
        cell: dear.n,
        title: 'Чем платить',
        text: 'Из кошелька, если есть. Нет — заложите удел: он уйдёт кредитору, а выкупите '
          + 'вы его потом за ту же сумму. Нечего закладывать — идёте в наём и '
          + 'продолжаете ходить: из-за стола здесь не выбывает никто.',
      },
      {
        cell: firstOf('tithe'),
        title: 'Десятина',
        text: 'Часть нажитого уходит в казну — и возвращается наследием. Наследие, а не '
          + 'серебро, считают в конце.',
      },
      {
        title: 'Две колоды',
        text: 'Провидение и Милость — тридцать карт со словами Писания. Встали на такую '
          + 'клетку — верхняя карта вылетает из колоды. Одна даст, другая спросит.',
        wide: true,
        act: () => (scene && art
          ? scene.dealCard('providence', art('cards', 'providence-raven'))
          : null),
        leave: () => (scene ? scene.returnCard() : null),
      },
      {
        cell: firstOf('prison'),
        title: 'Темница',
        text: 'Отсюда выходят по дублю или за выкуп. Пока сидите — ходов нет, но земля '
          + 'остаётся вашей, и плату за неё вам платят.',
      },
      {
        cell: firstOf('tent'),
        title: 'Шатёр Авраама',
        text: 'Угол гостеприимства: всё, что скопилось в казне, достаётся тому, кто сюда '
          + 'дошёл. Чем дольше никто не доходил, тем больше там лежит.',
      },
      {
        title: mode === 'last' ? 'До последнего' : 'Юбилей',
        text: mode === 'last'
          ? 'Срока нет: играете, пока за столом не останется один, кому есть чем платить. '
            + 'С каждым годом земля просит всё больше подати — тянуть вечно не выйдет.'
          : 'В последний год земля отдыхает: платы нет вовсе. А в юбилей всё возвращается '
            + 'хозяевам, и побеждает не богатейший, а тот, у кого больше наследия.',
        wide: true,
      },
    ];
  }

  /**
   * Провести обучение.
   * @param {object} deps scene — сцена доски (может не быть), art — путь к
   *   картинкам, mode — чем кончится партия, узлы окна и onEnd.
   */
  function run({ scene, art, mode, box, title, text, counter, next, skip, onEnd }) {
    const plan = steps({ scene, art, mode });
    let at = 0;
    let closed = false;
    let leaving = null;

    function finish() {
      if (closed) return;
      closed = true;
      try { localStorage.setItem(SEEN, '1'); } catch { /* приватный режим */ }
      box.hidden = true;
      if (leaving) leaving();
      if (scene) { scene.highlight(null); scene.home(); }
      if (onEnd) onEnd();
    }

    function show() {
      const step = plan[at];
      title.textContent = step.title;
      text.textContent = step.text;
      counter.textContent = `${at + 1} из ${plan.length}`;
      next.textContent = at === plan.length - 1 ? 'Понятно' : 'Дальше';
      box.hidden = false;
      if (!scene) return;
      // Шаг «про всю партию» смотрит на неё целиком; шаг про клетку — на клетку.
      if (step.wide) { scene.highlight(null); scene.home(); } else {
        scene.focus(step.cell);
        scene.highlight(step.cell);
      }
      if (step.act) step.act();
      leaving = step.leave || null;
    }

    next.onclick = () => {
      if (leaving) { leaving(); leaving = null; }
      at += 1;
      if (at >= plan.length) { finish(); return; }
      show();
    };
    skip.onclick = finish;
    show();
    return { finish };
  }

  const seen = () => {
    try { return localStorage.getItem(SEEN) === '1'; } catch { return true; }
  };

  return { run, seen, steps };
})();
