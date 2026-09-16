// tutorial.js — обучение шагами, прямо на доске.
//
// Правила у игры написаны, и кнопка «Правила» никуда не делась. Но читать их
// до первой партии сядет не всякий, а тот, кто сядет, всё равно не поймёт,
// какая из тридцати шести клеток — «удел», пока не увидит её. Поэтому здесь
// не текст о поле, а показ на поле: камера подлетает к клетке, о которой идёт
// речь, кольцо обводит её, и подпись говорит одну мысль.
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
   * Шаги. У каждого — клетка, к которой летит камера, заголовок и одна мысль.
   * Порядок не случаен: сначала что это вообще, потом как ходят, потом откуда
   * берутся и куда уходят деньги, и в конце — чем всё кончится.
   */
  function steps() {
    const plot = B.BOARD.find((cell) => cell.kind === 'plot' && cell.price <= 140) || B.BOARD[1];
    return [
      {
        cell: 0,
        title: 'Исход',
        text: 'Отсюда выходят все. Круг по земле — год пути; прошли круг — получили ' +
          `${B.HARVEST} сиклей урожая.`,
      },
      {
        cell: plot.n,
        title: 'Удел',
        text: `«${plot.name}» свободен. Встали на него — можете взять за ${plot.price} ` +
          'сиклей; откажетесь — он останется ничьим до следующего раза.',
      },
      {
        cell: plot.n,
        title: 'Плата за проход',
        text: 'Чужой удел берёт плату с того, кто на него встал. Чем больше построено, ' +
          'тем она выше — и тем дороже соседям ходить рядом.',
      },
      {
        cell: firstOf('tithe'),
        title: 'Десятина',
        text: 'Часть урожая уходит в казну — и возвращается наследием. Платите вы сами: ' +
          'игра только выставляет счёт.',
      },
      {
        cell: firstOf('providence'),
        title: 'Две колоды',
        text: 'Провидение и Милость — тридцать карт со словами Писания. Одна даст, ' +
          'другая спросит, и обе двигают партию.',
      },
      {
        cell: firstOf('prison'),
        title: 'Темница',
        text: 'Отсюда выходят по дублю или за выкуп. Из-за стола не выбывает никто: ' +
          'оставшийся без серебра идёт в наём и продолжает ходить.',
      },
      {
        cell: 0,
        title: 'Юбилей',
        text: 'В последний год земля отдыхает, платы нет. А в юбилей всё возвращается, ' +
          'и побеждает не богатейший, а тот, у кого больше наследия.',
        wide: true,
      },
    ];
  }

  /**
   * Провести обучение.
   * @param {object} deps scene — сцена доски (может не быть), nodes — узлы окна,
   *   onEnd — что сделать в конце.
   */
  function run({ scene, box, title, text, counter, next, skip, onEnd }) {
    const plan = steps();
    let at = 0;
    let closed = false;

    function finish() {
      if (closed) return;
      closed = true;
      try { localStorage.setItem(SEEN, '1'); } catch { /* приватный режим */ }
      box.hidden = true;
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
      // Последний шаг — про всю партию: и смотреть на неё надо целиком.
      if (step.wide) { scene.highlight(null); scene.home(); return; }
      scene.focus(step.cell);
      scene.highlight(step.cell);
    }

    next.onclick = () => {
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
